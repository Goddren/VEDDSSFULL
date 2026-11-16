/**
 * AI Clipper — the job pipeline (kind 'viral-clip' on the shared Content
 * Studio job system). Paste a link → download → transcribe (word timings)
 * → AI picks the viral moments (virality score + reason) → cut + reframe
 * + burn word-highlight captions and a hook headline → each clip lands in
 * the Saved library like any other generated video.
 *
 * Built on the Studio's existing rails: content_video_jobs +
 * useContentJob polling, the Postgres asset store (25MB cap), the
 * platform AI clients (OpenRouter-first chat; Whisper via the platform
 * OpenAI client), and the bundled ffmpeg (ffmpeg-static, has libass).
 * Pure logic lives in clipper-core.ts.
 *
 * YouTube ingestion runs through yt-dlp (services/ytdlp.ts, pinned
 * binary) with a multi-client fallback — the @distube/ytdl-core path it
 * replaced could never work server-side: YouTube's web player answers
 * datacenter IPs with LOGIN_REQUIRED and no formats. yt-dlp can still
 * be blocked on some videos/IPs; when it is, the job fails with the
 * specific reason (bot block, private, age-restricted, …) and points at
 * the upload path, which always works. Uploads ride the asset store
 * (25MB cap) and are probed with the same 60-minute cap as links.
 * Direct .mp4/.webm/.mov/.m4v/.mkv links remain a verified path.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { pool } from '../db';
import { storage } from '../storage';
import { ensureJobTable, updateContentJob } from './explainer-video';
import { runFfmpeg, probe } from './ffmpeg';
import { persistBuffer, getPersistedAsset } from './content-asset-store';
import { downloadYouTubeVideo } from './ytdlp';
import { getPlatformOpenAIClient, getUniversalAIClientForUser, extractFirstJsonObject } from '../openai';
import {
  classifySourceUrl, finalizeMoments, buildCaptionCues,
  buildAssDocument, buildReframeFilter, frameForAspect, parseSilenceDetect,
  clipperStepProgress, CLIPPER_STEPS, ytdlpErrorMessage, type YtdlpErrorCode,
  type ClipperSettings, type FinalMoment, type MomentSeed, type Transcript,
  type WordTiming, type TranscriptSegment,
} from './clipper-core';

const MAX_MINUTES = Math.max(5, Number(process.env.CLIPPER_MAX_MINUTES || 60) || 60);
const MAX_SOURCE_BYTES = Math.max(50, Number(process.env.CLIPPER_MAX_SOURCE_MB || 600) || 600) * 1024 * 1024;
const CHUNK_SEC = 900; // 15-min transcription chunks stay under Whisper's 25MB cap at 32kbps

export interface ClipperJobPayload {
  /** Link path: a YouTube or direct-file URL. */
  url?: string;
  /** Upload path: a video the user uploaded, persisted in the asset store. */
  uploadAssetId?: number;
  fileName?: string;
  settings: ClipperSettings;
}

// ─── job plumbing ───────────────────────────────────────────────────────────

async function insertJob(userId: number, payload: ClipperJobPayload): Promise<number> {
  await ensureJobTable();
  const r = await pool.query(
    `INSERT INTO content_video_jobs (user_id, kind, status, step, progress, aspect, input)
     VALUES ($1, 'viral-clip', 'running', $2, $3, $4, $5) RETURNING id`,
    [userId, CLIPPER_STEPS[0], clipperStepProgress(0), payload.settings.aspect, JSON.stringify(payload).slice(0, 8000)],
  );
  return r.rows[0].id as number;
}

function friendlyError(e: any): string {
  // yt-dlp failures arrive pre-classified into stable codes — a known
  // cause ALWAYS maps to its specific message, never the generic one.
  const ytCode = (e as any)?.ytdlpCode as YtdlpErrorCode | undefined;
  if (ytCode) return ytdlpErrorMessage(ytCode);
  const m = String(e?.message || e || '');
  if (/too long|exceeds the/i.test(m)) return `That video is longer than the ${MAX_MINUTES}-minute limit for clipping. Try a shorter video.`;
  if (/no audio/i.test(m)) return 'That video has no audio track, so there is nothing to transcribe or caption.';
  if (/too large/i.test(m)) return 'That video file is too large for the clipper to process.';
  if (/youtube|sign in|bot|login_required|403/i.test(m)) return 'YouTube blocked the download from our server. Upload the video file instead; uploads always work.';
  if (/transcri/i.test(m)) return 'Transcription was unavailable just now, so no clips could be made. Please try again in a bit.';
  if (/no speech/i.test(m)) return 'We could not hear any speech in that video, so there are no moments to clip.';
  if (/unsupported/i.test(m)) return m.replace(/^unsupported:\s*/i, '');
  return 'The clipper hit a problem processing that video. Please try again.';
}

async function failJob(id: number, e: any): Promise<void> {
  console.error(`[clipper] job ${id} failed:`, e?.message || e);
  await updateContentJob(id, {
    status: 'failed', error: friendlyError(e),
    meta: { error_detail: String(e?.message || e).slice(0, 1000) },
  }).catch(() => {});
}

async function setStep(id: number, stepIndex: number, progress?: number): Promise<void> {
  await updateContentJob(id, {
    step: CLIPPER_STEPS[stepIndex],
    progress: progress ?? clipperStepProgress(stepIndex),
  }).catch(() => {});
}

// ─── download ───────────────────────────────────────────────────────────────

async function downloadDirect(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(5 * 60_000),
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; VEDDClipper/1.0)' },
    redirect: 'follow',
  });
  if (!res.ok || !res.body) throw new Error(`Could not download that video (HTTP ${res.status}).`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_SOURCE_BYTES) throw new Error('Video file too large to process');
  // Pipe fetch body through the byte cap into the temp file.
  const body: any = Readable.fromWeb(res.body as any);
  let bytes = 0;
  const counter = new Transform({
    transform(chunk, _enc, cb) {
      bytes += chunk.length;
      if (bytes > MAX_SOURCE_BYTES) cb(new Error('too large'));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(body, counter, fs.createWriteStream(dest));
  } catch (e: any) {
    if (e?.message === 'too large') throw new Error('Video file too large to process');
    throw e;
  }
}

/**
 * Upload path: pull the user's uploaded video back out of the durable
 * asset store into the job's workdir. The route validated type + the
 * store's 25MB cap at upload time; duration is probed by the caller with
 * the same 60-minute cap as link sources.
 */
async function materializeUpload(assetId: number, workDir: string): Promise<string> {
  const asset = await getPersistedAsset(assetId);
  if (!asset) throw new Error('That uploaded file could not be found — please upload it again.');
  const ext = asset.mimeType.includes('webm') ? 'webm'
    : asset.mimeType.includes('quicktime') ? 'mov'
      : asset.mimeType.includes('matroska') ? 'mkv' : 'mp4';
  const dest = path.join(workDir, `source.${ext}`);
  await fs.promises.writeFile(dest, asset.data);
  return dest;
}

// ─── transcription ──────────────────────────────────────────────────────────

function synthesizeWords(segments: TranscriptSegment[]): WordTiming[] {
  const words: WordTiming[] = [];
  for (const seg of segments) {
    const parts = seg.text.split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const span = Math.max(0.1, seg.end - seg.start) / parts.length;
    parts.forEach((w, i) => words.push({ word: w, start: seg.start + i * span, end: seg.start + (i + 1) * span }));
  }
  return words;
}

function parseTranscriptResponse(resp: any, offset: number, chunkDur: number): { words: WordTiming[]; segments: TranscriptSegment[]; text: string } {
  const segments: TranscriptSegment[] = Array.isArray(resp?.segments)
    ? resp.segments.map((s: any) => ({
        start: offset + Number(s.start || 0), end: offset + Number(s.end || 0),
        text: String(s.text || '').trim(),
      })).filter((s: TranscriptSegment) => s.text)
    : [];
  let words: WordTiming[] = Array.isArray(resp?.words)
    ? resp.words.map((w: any) => ({
        word: String(w.word || '').trim(),
        start: offset + Number(w.start || 0), end: offset + Number(w.end || 0),
      })).filter((w: WordTiming) => w.word)
    : [];
  const text = String(resp?.text || segments.map((s) => s.text).join(' ')).trim();
  if (!segments.length && text) segments.push({ start: offset, end: offset + chunkDur, text });
  if (!words.length && segments.length) words = synthesizeWords(segments);
  return { words, segments, text };
}

async function transcribeChunkWhisper(file: string, offset: number, chunkDur: number) {
  const { toFile } = await import('openai/uploads');
  const buffer = await fs.promises.readFile(file);
  const client: any = getPlatformOpenAIClient();
  const upload = await toFile(buffer, 'chunk.mp3', { type: 'audio/mpeg' });
  const resp = await client.audio.transcriptions.create(
    {
      file: upload, model: process.env.CLIPPER_TRANSCRIBE_MODEL || 'whisper-1',
      response_format: 'verbose_json', timestamp_granularities: ['word', 'segment'],
    },
    { timeout: 240_000 },
  );
  return parseTranscriptResponse(resp, offset, chunkDur);
}

/** Best-effort fallback: OpenRouter's transcription endpoint (same key the
 *  chat traffic already uses). Response shape parsed defensively. */
async function transcribeChunkOpenRouter(file: string, offset: number, chunkDur: number) {
  const key = process.env.OPENROUTER_API_KEY || '';
  if (!key) throw new Error('transcription fallback not configured');
  const buffer = await fs.promises.readFile(file);
  const res = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    signal: AbortSignal.timeout(240_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.CLIPPER_TRANSCRIBE_MODEL_OR || 'openai/whisper-1',
      input_audio: { data: buffer.toString('base64'), format: 'mp3' },
      response_format: 'verbose_json',
    }),
  });
  if (!res.ok) throw new Error(`transcription fallback HTTP ${res.status}`);
  const resp: any = await res.json();
  return parseTranscriptResponse(resp, offset, chunkDur);
}

async function transcribe(workDir: string, srcFile: string, durationSec: number): Promise<{ transcript: Transcript; silences: { start: number; end: number }[] }> {
  const audioFile = path.join(workDir, 'audio.mp3');
  await runFfmpeg(['-i', srcFile, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', '-y', audioFile], 300_000);
  // Silence ranges for boundary snapping (fail-soft: none on error).
  const silences = await runFfmpeg(['-i', audioFile, '-af', 'silencedetect=noise=-35dB:d=0.4', '-f', 'null', '-'], 300_000)
    .then((stderr) => parseSilenceDetect(stderr)).catch(() => []);
  // Chunk the audio so each Whisper call stays well under its 25MB cap.
  const chunkPattern = path.join(workDir, 'chunk-%03d.mp3');
  await runFfmpeg(['-i', audioFile, '-f', 'segment', '-segment_time', String(CHUNK_SEC), '-reset_timestamps', '1', '-c', 'copy', '-y', chunkPattern], 120_000);
  const chunkFiles = fs.readdirSync(workDir).filter((f) => /^chunk-\d+\.mp3$/.test(f)).sort();
  if (!chunkFiles.length) throw new Error('transcription produced no audio');
  const words: WordTiming[] = [];
  const segments: TranscriptSegment[] = [];
  const texts: string[] = [];
  let source = 'whisper';
  for (let i = 0; i < chunkFiles.length; i++) {
    const file = path.join(workDir, chunkFiles[i]);
    const offset = i * CHUNK_SEC;
    const chunkDur = Math.max(1, Math.min(CHUNK_SEC, durationSec - offset));
    let part: { words: WordTiming[]; segments: TranscriptSegment[]; text: string };
    try {
      part = await transcribeChunkWhisper(file, offset, chunkDur);
    } catch (e) {
      console.warn('[clipper] whisper chunk failed, trying OpenRouter STT:', (e as Error)?.message);
      part = await transcribeChunkOpenRouter(file, offset, chunkDur);
      source = 'openrouter';
    }
    words.push(...part.words); segments.push(...part.segments); texts.push(part.text);
  }
  const text = texts.join(' ').trim();
  if (!text || !words.length) throw new Error('no speech detected');
  return { transcript: { words, segments, text, durationSec, source }, silences };
}

// ─── moment detection ───────────────────────────────────────────────────────

function momentPrompt(t: Transcript, settings: ClipperSettings): string {
  const preset = settings.lengthPreset;
  const lines = t.segments.map((s) => `[${s.start.toFixed(1)}s] ${s.text}`).join('\n').slice(0, 60000);
  return [
    'You are the moment picker inside a short-form clipping tool (the Opus Clip pattern).',
    'From the timestamped transcript below, pick the moments most likely to perform as standalone short vertical clips.',
    `Pick up to ${Math.min(20, settings.clipCount * 2)} candidates. Each moment should run about ${preset === 'short' ? '15–30' : preset === 'medium' ? '30–60' : '60–90'} seconds and must START on a hook — never mid-explanation.`,
    settings.topic ? `The creator's focus: "${settings.topic}" — prefer moments on that theme.` : '',
    'Score every moment 0–100 on four grades: hookScore (does the opening line stop a scroll?), flowScore (coherent start-to-finish?), valueScore (insight, story, emotion or payoff), trendScore (fits what performs in short-form now).',
    'For each moment also write: hook — a headline of at most 8 words for the clip\'s opening title; reason — ONE line on why it can travel; category — one or two words (story, hot-take, how-to, moment, qa, funny, emotional); caption — the post caption for social, with 3–5 relevant hashtags at the end.',
    'Return ONLY a JSON object: {"moments":[{"startSec":number,"endSec":number,"hook":"...","reason":"...","category":"...","caption":"...","hookScore":n,"flowScore":n,"valueScore":n,"trendScore":n}]}',
    '', 'TRANSCRIPT:', lines,
  ].filter(Boolean).join('\n');
}

async function detectMomentsAI(userId: number, t: Transcript, settings: ClipperSettings): Promise<MomentSeed[]> {
  const client: any = await getUniversalAIClientForUser(userId);
  const completion = await client.chat.completions.create({
    model: client.defaultModel || 'gpt-4o-mini',
    temperature: 0.4,
    max_tokens: 4000,
    messages: [{ role: 'user', content: momentPrompt(t, settings) }],
  });
  const raw = completion?.choices?.[0]?.message?.content || '';
  const jsonStr = extractFirstJsonObject(raw);
  let parsed: any = null;
  try { parsed = jsonStr ? JSON.parse(jsonStr) : null; } catch { parsed = null; }
  const list = Array.isArray(parsed?.moments) ? parsed.moments : [];
  return list.map((m: any) => ({
    startSec: Number(m.startSec), endSec: Number(m.endSec),
    hook: String(m.hook || ''), reason: String(m.reason || ''), category: String(m.category || ''),
    caption: String(m.caption || ''),
    subscores: { hook: m.hookScore, flow: m.flowScore, value: m.valueScore, trend: m.trendScore },
  })).filter((m: MomentSeed) => Number.isFinite(m.startSec) && Number.isFinite(m.endSec));
}

/** Deterministic fallback if the AI picker is unavailable: windows of
 *  dense, punchy speech (questions, exclamations, numbers). */
function detectMomentsHeuristic(t: Transcript, settings: ClipperSettings): MomentSeed[] {
  const target = settings.lengthPreset === 'short' ? 24 : settings.lengthPreset === 'medium' ? 45 : 75;
  const seeds: MomentSeed[] = [];
  let winStart = 0, buf: TranscriptSegment[] = [];
  const flush = () => {
    if (!buf.length) return;
    const start = buf[0].start, end = buf[buf.length - 1].end;
    const text = buf.map((s) => s.text).join(' ');
    const wps = text.split(/\s+/).length / Math.max(1, end - start);
    let score = Math.min(70, Math.round(wps * 22));
    if (/[?!]/.test(text)) score += 10;
    if (/\d/.test(text)) score += 5;
    seeds.push({
      startSec: start, endSec: end,
      hook: text.split(/(?<=[.!?])\s/)[0].slice(0, 60),
      reason: 'Picked by speech energy — the AI picker was unavailable for this video.',
      category: 'moment', caption: '',
      subscores: { hook: score, flow: score, value: score, trend: score },
    });
    buf = [];
  };
  for (const seg of t.segments) {
    if (buf.length && seg.end - winStart > target) flush();
    if (!buf.length) winStart = seg.start;
    buf.push(seg);
  }
  flush();
  return seeds.sort((a, b) => b.subscores.hook - a.subscores.hook).slice(0, settings.clipCount * 2);
}

// ─── rendering ──────────────────────────────────────────────────────────────

async function renderClip(
  workDir: string, srcFile: string, moment: FinalMoment, words: WordTiming[],
  settings: ClipperSettings, srcW: number, srcH: number,
): Promise<{ buffer: Buffer; frame: { w: number; h: number } }> {
  const frame = frameForAspect(settings.aspect, srcW, srcH);
  const localWords = words
    .filter((w) => w.end > moment.startSec && w.start < moment.endSec)
    .map((w) => ({ word: w.word, start: Math.max(0, w.start - moment.startSec), end: Math.min(moment.durationSec, w.end - moment.startSec) }))
    .filter((w) => w.end > w.start);
  const cues = buildCaptionCues(localWords, settings.captionStyle);
  const ass = buildAssDocument(cues, settings.captionStyle, { width: frame.w, height: frame.h, hookTitle: moment.hook });
  const assPath = path.join(workDir, `caps-${moment.rank}.ass`);
  await fs.promises.writeFile(assPath, ass, 'utf8');
  const fontsDir = path.join(process.cwd(), 'server', 'assets', 'fonts');
  const reframe = buildReframeFilter(srcW, srcH, settings.aspect);
  const out = path.join(workDir, `clip-${moment.rank}.mp4`);
  const render = async (crf: number) => {
    await runFfmpeg([
      '-ss', String(moment.startSec), '-i', srcFile, '-t', String(moment.durationSec),
      '-vf', `${reframe},ass=${assPath}:fontsdir=${fontsDir}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf),
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-y', out,
    ], 300_000);
    return fs.promises.readFile(out);
  };
  let buffer = await render(23);
  if (buffer.length > 24 * 1024 * 1024) buffer = await render(29); // asset-store cap discipline
  return { buffer, frame };
}

// ─── the job ────────────────────────────────────────────────────────────────

export async function startClipperJob(userId: number, payload: ClipperJobPayload): Promise<number> {
  const jobId = await insertJob(userId, payload);
  void runClipperJob(jobId, userId, payload).catch((e) => failJob(jobId, e));
  return jobId;
}

async function runClipperJob(jobId: number, userId: number, payload: ClipperJobPayload): Promise<void> {
  const { settings } = payload;
  const isUpload = !!payload.uploadAssetId;
  const cls = isUpload ? { kind: 'upload' as const } : classifySourceUrl(payload.url || '');
  if (cls.kind === 'unsupported') throw new Error(`unsupported: ${cls.reason}`);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedd-clipper-'));
  try {
    // 1 — get the source video (download or uploaded file)
    await setStep(jobId, 0);
    let srcFile: string;
    let sourceTitle: string | undefined;
    if (isUpload) {
      srcFile = await materializeUpload(payload.uploadAssetId!, workDir);
      sourceTitle = payload.fileName;
    } else if (cls.kind === 'youtube') {
      const dl = await downloadYouTubeVideo(payload.url!, workDir, { maxMinutes: MAX_MINUTES, maxBytes: MAX_SOURCE_BYTES });
      srcFile = dl.file;
      sourceTitle = dl.title;
    } else {
      srcFile = path.join(workDir, 'source.mp4');
      await downloadDirect(payload.url!, srcFile);
    }
    const meta = await probe(srcFile);
    if (!meta.hasAudio) throw new Error('no audio track');
    if (meta.duration > MAX_MINUTES * 60) throw new Error(`Video too long: exceeds the ${MAX_MINUTES} minute limit`);

    // 2 — transcribe
    await setStep(jobId, 1);
    const { transcript, silences } = await transcribe(workDir, srcFile, meta.duration);

    // 3 — moments
    await setStep(jobId, 2);
    let seeds: MomentSeed[] = [];
    try { seeds = await detectMomentsAI(userId, transcript, settings); } catch (e) {
      console.warn('[clipper] AI moment detection failed, heuristic fallback:', (e as Error)?.message);
    }
    if (!seeds.length) seeds = detectMomentsHeuristic(transcript, settings);
    const moments = finalizeMoments(seeds, {
      words: transcript.words, silences, durationSec: meta.duration, settings,
    });
    if (!moments.length) throw new Error('no speech moments found');

    // 4 — cut + caption + save
    await setStep(jobId, 3);
    const clips: any[] = [];
    for (let i = 0; i < moments.length; i++) {
      const moment = moments[i];
      try {
        const { buffer } = await renderClip(workDir, srcFile, moment, transcript.words, settings, meta.width, meta.height);
        const saved = await persistBuffer(buffer, 'video/mp4');
        if (!saved) throw new Error('rendered clip exceeded the storage size cap');
        const assetUrl = saved.url;
        const gen = await storage.createContentStudioGeneration({
          userId, contentType: 'video', prompt: (payload.url || payload.fileName || 'uploaded video').slice(0, 500),
          title: moment.hook, caption: moment.caption, assetUrl,
          metadata: {
            kind: 'viral-clip', jobId, rank: moment.rank,
            viralityScore: moment.viralityScore, subscores: moment.subscores,
            reason: moment.reason, category: moment.category,
            durationSec: moment.durationSec, startSec: moment.startSec, endSec: moment.endSec,
            sourceUrl: payload.url || '', captionStyle: settings.captionStyle,
            aspect: settings.aspect, platform: settings.platform,
            belowThreshold: moment.belowThreshold || undefined,
          } as any,
        });
        clips.push({
          generationId: gen.id, url: assetUrl, hook: moment.hook,
          viralityScore: moment.viralityScore, subscores: moment.subscores,
          reason: moment.reason, category: moment.category,
          durationSec: moment.durationSec, startSec: moment.startSec, endSec: moment.endSec,
          caption: moment.caption, rank: moment.rank,
          belowThreshold: moment.belowThreshold || undefined,
        });
      } catch (e) {
        console.error(`[clipper] clip ${moment.rank} failed:`, (e as Error)?.message);
      }
      await setStep(jobId, 3, clipperStepProgress(3) + Math.round(((i + 1) / moments.length) * 20));
    }
    if (!clips.length) throw new Error('Every clip failed to render. Please try again.');
    await setStep(jobId, 4, 100);
    await updateContentJob(jobId, {
      status: 'done', progress: 100, step: 'Done', result_url: clips[0].url,
      meta: {
        result: {
          clips,
          source: { url: payload.url || '', kind: cls.kind, title: sourceTitle, durationSec: Math.round(meta.duration) },
          transcriptSource: transcript.source,
        },
      },
    });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
