/**
 * Explainer videos: a 25-40s video that actually teaches the subject.
 *
 *   idea/lesson -> AI script (hook, 2-3 teaching scenes, VEDD call to action;
 *   each scene = what the narrator says + what the camera shows)
 *   -> one Veo 3 Fast clip per scene with native narration + sound
 *   -> ffmpeg (ffmpeg-static): crop to the social size, join scenes,
 *      VEDD logo watermark, VEDD end card -> one MP4 in the durable store.
 *
 * Runs as a background job (content_video_jobs): several minutes per video,
 * longer than an HTTP request may stay open. The client polls the job.
 * Model is swappable with EXPLAINER_VIDEO_MODEL (default google/veo-3-fast).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pool } from '../db';
import { runFfmpeg, probe } from './ffmpeg';
import { findLogo } from './video-branding';
import { persistBuffer } from './content-asset-store';

export type ExplainerAspect = '9:16' | '4:5' | '1:1' | '16:9';
const FRAME: Record<ExplainerAspect, [number, number]> = { '9:16': [720, 1280], '4:5': [864, 1080], '1:1': [720, 720], '16:9': [1280, 720] };
const MODEL = () => process.env.EXPLAINER_VIDEO_MODEL || 'google/veo-3-fast';
const CLIP_SECONDS = 8;
const END_CARD_SECONDS = 2;
const POLL_MS = 5000;
const MAX_WAIT_MS = 8 * 60 * 1000;

export interface ExplainerScene { narration: string; visual: string }
export interface ExplainerScript { title: string; caption: string; scenes: ExplainerScene[] }

// ─── Jobs ────────────────────────────────────────────────────────────────────
let tableReady: Promise<void> | null = null;
export function ensureJobTable(): Promise<void> {
  return (tableReady ??= pool.query(`CREATE TABLE IF NOT EXISTS content_video_jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'explainer',
      input TEXT NOT NULL,
      aspect TEXT NOT NULL DEFAULT '9:16',
      status TEXT NOT NULL DEFAULT 'queued',
      step TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      script JSONB,
      result_url TEXT,
      error TEXT,
      meta JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).then(() => undefined).catch((e) => { tableReady = null; throw e; }));
}

async function update(id: number, patch: Record<string, unknown>) {
  const keys = Object.keys(patch);
  const sets = keys.map((k, i) => `${k}=$${i + 2}`).join(', ');
  await pool.query(`UPDATE content_video_jobs SET ${sets}, updated_at=now() WHERE id=$1`,
    [id, ...keys.map((k) => (k === 'script' || k === 'meta') ? JSON.stringify(patch[k]) : patch[k])]);
}

export async function getJob(id: number, userId: number) {
  await ensureJobTable();
  // A job left "running" by a server restart will never finish.
  await pool.query(`UPDATE content_video_jobs SET status='failed', error='Interrupted by a server restart — please try again.'
                     WHERE id=$1 AND status IN ('queued','running') AND updated_at < now() - interval '15 minutes'`, [id]);
  const { rows } = await pool.query(`SELECT * FROM content_video_jobs WHERE id=$1 AND user_id=$2`, [id, userId]);
  return rows[0] ?? null;
}

/** Explainer renders started by this user in the last 24h (cost guard). */
export async function rendersToday(userId: number): Promise<number> {
  await ensureJobTable();
  const { rows } = await pool.query(
    `SELECT count(*)::int n FROM content_video_jobs WHERE user_id=$1 AND created_at > now() - interval '24 hours' AND status <> 'failed'`, [userId]);
  return rows[0]?.n ?? 0;
}

export async function startExplainerJob(
  userId: number, input: string, aspect: ExplainerAspect,
  opts: { sceneCount?: number; onDone?: (url: string, script: ExplainerScript) => Promise<void> } = {},
): Promise<number> {
  await ensureJobTable();
  const { rows } = await pool.query(
    `INSERT INTO content_video_jobs (user_id, input, aspect, status, step) VALUES ($1,$2,$3,'running','Writing the script') RETURNING id`,
    [userId, input.slice(0, 8000), aspect]);
  const id = rows[0].id as number;
  runJob(id, userId, input, aspect, opts).catch(async (e) => {
    console.error(`[explainer] job ${id} failed:`, e?.message || e);
    await update(id, { status: 'failed', error: friendlyError(e) }).catch(() => {});
  });
  return id;
}

function friendlyError(e: any): string {
  const m = String(e?.message || e);
  if (/REPLICATE_API_TOKEN/.test(m)) return 'Video service is not configured.';
  if (/402|insufficient|credit/i.test(m)) return 'The video service is out of credit. Ask VEDD to top it up.';
  if (/timed out/i.test(m)) return 'The video took too long to make. Please try again.';
  return 'The video could not be made right now. Please try again in a few minutes.';
}

async function runJob(id: number, userId: number, input: string, aspect: ExplainerAspect,
  opts: { sceneCount?: number; onDone?: (url: string, script: ExplainerScript) => Promise<void> }) {
  const script = await writeScript(input, userId, opts.sceneCount ?? 4);
  await update(id, { script, step: `Filming ${script.scenes.length} scenes with voiceover`, progress: 10 });

  // Two clips at a time keeps within Replicate's rate limits.
  const urls: string[] = new Array(script.scenes.length);
  let done = 0;
  const predictions: string[] = [];
  const queue = script.scenes.map((s, i) => async () => {
    const r = await renderScene(s, aspect);
    urls[i] = r.url; predictions.push(r.predictionId);
    done++;
    await update(id, { progress: 10 + Math.round((done / script.scenes.length) * 70), step: `Filmed ${done} of ${script.scenes.length} scenes` });
  });
  const workers = Array.from({ length: Math.min(2, queue.length) }, async () => { while (queue.length) await queue.shift()!(); });
  await Promise.all(workers);

  await update(id, { step: 'Adding VEDD branding and joining scenes', progress: 85, meta: { predictions, model: MODEL() } });
  const video = await assemble(urls, aspect);
  const saved = await persistBuffer(video, 'video/mp4');
  if (!saved) throw new Error('could not save the finished video');

  await update(id, { status: 'done', step: 'Ready', progress: 100, result_url: saved.url });
  try {
    const { storage } = await import('../storage');
    await storage.createContentStudioGeneration({
      userId, contentType: 'video', prompt: input.slice(0, 2000), title: script.title, caption: script.caption, assetUrl: saved.url,
      metadata: { kind: 'explainer', aspect, model: MODEL(), script, predictions },
    } as any);
  } catch { /* library record is best-effort */ }
  if (opts.onDone) await opts.onDone(saved.url, script).catch((e) => console.error('[explainer] onDone failed:', e?.message));
}

// ─── Script ──────────────────────────────────────────────────────────────────
export async function writeScript(input: string, userId: number, sceneCount: number): Promise<ExplainerScript> {
  const n = Math.min(Math.max(sceneCount, 3), 5);
  const { getUniversalAIClientForUser } = await import('../openai');
  const ai: any = await getUniversalAIClientForUser(userId || 0);
  const completion = await ai.chat.completions.create({
    model: ai.defaultModel || 'gpt-4o',
    messages: [
      { role: 'system', content: 'You write short, clear trading-education explainer videos for VEDD AI. JSON only.' },
      { role: 'user', content: `Write a ${n}-scene vertical explainer video that TEACHES this subject to newer traders:

"""${input.slice(0, 4000)}"""

Scene 1 = a hook that names the problem. Middle scenes = the lesson in plain steps with one concrete example (real chart terms: candles, support, stop loss, etc.). Last scene = soft call to action: "Try VEDD AI free at veddbuild dot com".

Each scene is one continuous 8-second shot:
- "narration": what the narrator SAYS, 12-18 words (must fit in 7 seconds), plain spoken English, no hashtags or emojis.
- "visual": what the camera SEES while it is said, 30-50 words: subject, setting, action, camera move, lighting. Show the idea literally (e.g. a trader pointing at a candlestick breaking above a level on a monitor). Cinematic, realistic. No readable text, logos or brand names in the frame.
Keep one consistent setting and presenter style across scenes. No income or profit promises.

JSON: {"title":"...","caption":"one-line social caption with a question","scenes":[{"narration":"...","visual":"..."}]}` },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1500,
  });
  const raw = (completion.choices?.[0]?.message?.content || '{}').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  const out = JSON.parse(raw || '{}');
  const scenes: ExplainerScene[] = (Array.isArray(out.scenes) ? out.scenes : [])
    .map((s: any) => ({ narration: String(s?.narration || '').trim(), visual: String(s?.visual || '').trim() }))
    .filter((s: ExplainerScene) => s.narration && s.visual)
    .slice(0, n);
  if (scenes.length < 2) throw new Error('script generation returned too few scenes');
  return { title: String(out.title || 'VEDD lesson').slice(0, 120), caption: String(out.caption || '').slice(0, 300), scenes };
}

// ─── Scenes (Replicate) ──────────────────────────────────────────────────────
async function renderScene(scene: ExplainerScene, aspect: ExplainerAspect): Promise<{ url: string; predictionId: string }> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN not set');
  const prompt = `${scene.visual} Cinematic 35mm look, shallow depth of field, moody contrast with warm gold accent light, smooth slow dolly camera. `
    + `A calm, confident narrator voiceover says: "${scene.narration.replace(/"/g, "'")}" `
    + `Soft modern background music under the voice. No subtitles, no on-screen text, no logos.`;
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL()}/predictions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait=55' },
    body: JSON.stringify({ input: {
      prompt,
      aspect_ratio: aspect === '16:9' ? '16:9' : '9:16',
      duration: CLIP_SECONDS,
      resolution: '720p',
      generate_audio: true,
      negative_prompt: 'subtitles, captions, on-screen text, watermark, logo, distorted hands, extra fingers',
    } }),
    signal: AbortSignal.timeout(70000),
  });
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  let data: any = await res.json();
  const started = Date.now();
  while ((data.status === 'starting' || data.status === 'processing') && Date.now() - started < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const poll = await fetch(data.urls.get, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    if (poll.ok) data = await poll.json();
  }
  if (data.status !== 'succeeded') throw new Error(data.status === 'failed' ? `scene failed: ${String(data.error).slice(0, 200)}` : 'scene timed out');
  const url = Array.isArray(data.output) ? data.output[0] : data.output;
  if (!url) throw new Error('scene returned no video');
  return { url, predictionId: data.id };
}

// ─── Assembly (ffmpeg) ───────────────────────────────────────────────────────
export async function assemble(clipUrls: string[], aspect: ExplainerAspect): Promise<Buffer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedd-explainer-'));
  try {
    const files: string[] = [];
    for (let i = 0; i < clipUrls.length; i++) {
      const r = await fetch(clipUrls[i], { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`could not download scene ${i + 1}`);
      const f = path.join(dir, `s${i}.mp4`);
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      files.push(f);
    }
    return await assembleFiles(files, aspect, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Joins local scene files into one branded MP4 (exported for tests). */
export async function assembleFiles(files: string[], aspect: ExplainerAspect, dir: string): Promise<Buffer> {
  const [W, H] = FRAME[aspect];
  const logo = findLogo();
  {
    const info = await Promise.all(files.map((f) => probe(f)));
    const audio = info.map((x) => x.hasAudio);

    const args: string[] = ['-y'];
    files.forEach((f) => args.push('-i', f));
    const n = files.length;
    let next = n;
    const silent: number[] = [];
    files.forEach((_, i) => { if (!audio[i]) { args.push('-f', 'lavfi', '-t', String(info[i].duration || CLIP_SECONDS), '-i', 'anullsrc=r=44100:cl=stereo'); silent[i] = next++; } });
    const cardAudio = next++; args.push('-f', 'lavfi', '-t', String(END_CARD_SECONDS), '-i', 'anullsrc=r=44100:cl=stereo');
    let logoIdx = -1, cardIdx = -1;
    if (logo) { logoIdx = next++; args.push('-i', logo); cardIdx = next++; args.push('-loop', '1', '-t', String(END_CARD_SECONDS), '-i', logo); }

    const f: string[] = [];
    const parts: string[] = [];
    files.forEach((_, i) => {
      f.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=24,setsar=1,format=yuv420p[v${i}]`);
      f.push(`[${audio[i] ? i : silent[i]}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
      parts.push(`[v${i}][a${i}]`);
    });
    if (logo) {
      f.push(`[${cardIdx}:v]scale=${Math.round(W * 0.38 / 2) * 2}:-2,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0B0B0E,fps=24,setsar=1,format=yuv420p[vc]`);
    } else {
      f.push(`color=c=0x0B0B0E:s=${W}x${H}:d=${END_CARD_SECONDS}:r=24,format=yuv420p,setsar=1[vc]`);
    }
    f.push(`[${cardAudio}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[ac]`);
    parts.push('[vc][ac]');
    f.push(`${parts.join('')}concat=n=${n + 1}:v=1:a=1[cv][ca]`);
    if (logo) {
      const wm = Math.round(W * 0.14 / 2) * 2, m = Math.round(W * 0.04);
      f.push(`[${logoIdx}:v]scale=${wm}:-2,format=rgba,colorchannelmixer=aa=0.85[wm]`);
      f.push(`[cv][wm]overlay=W-w-${m}:H-h-${m}[outv]`);
    }
    const out = path.join(dir, 'out.mp4');
    args.push('-filter_complex', f.join(';'), '-map', logo ? '[outv]' : '[cv]', '-map', '[ca]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out);
    await runFfmpeg(args, 240000);
    return fs.readFileSync(out);
  }
}
