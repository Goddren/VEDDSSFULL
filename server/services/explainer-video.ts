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
 * Jobs are DURABLE: all state needed to finish lives in the job row, a
 * watchdog resumes runs killed by a server restart (see "Durability"
 * below), and the page is a viewer — leaving it never stops a render.
 *
 * DAILY ADS (opts.dailyAd — the ambassador Today flow): the script is an
 * info-ad (hook → subject → VEDD → CTA, writeAdScript) and the joined
 * scenes are muted and re-voiced by the shared audio stage
 * (video-audio.ts: Yusuf Hakeem Kiser narration + music bed). If the
 * narration can't be produced the native-voice join ships instead and the
 * job record says so.
 * Model is swappable with EXPLAINER_VIDEO_MODEL (default google/veo-3.1-fast;
 * Replicate's google/veo-3-fast began 404ing on 2026-10-31 — Google retired
 * veo-3.0-fast-generate-001 behind it).
 *
 * PROVIDERS (changed 2026-11-11): scenes render via OpenRouter FIRST
 * (generateExplainerSceneViaOpenRouter — the funded provider; same Veo 3.1
 * Fast model, native narration audio, 8s scenes), with the original
 * Replicate path kept per-scene as the fallback. Before this, explainers
 * were Replicate-only, so with no Replicate credit every explainer died on
 * its first scene while clips (which had the OpenRouter chain) worked.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pool } from '../db';
import { runFfmpeg, probe } from './ffmpeg';
import { findLogo } from './video-branding';
import { persistBuffer } from './content-asset-store';
import { applyVideoAudio, videoAudioEnabled, type VideoAudioMeta } from './video-audio';
import { PATTERNS, PATTERN_KEYS, chartFilter } from './chart-overlay';
import { APP_SCREEN_IDS, screenCatalogForPrompt, screenImagePath, screenCardGeometry } from './app-screens';

export type ExplainerAspect = '9:16' | '4:5' | '1:1' | '16:9';
const FRAME: Record<ExplainerAspect, [number, number]> = { '9:16': [720, 1280], '4:5': [864, 1080], '1:1': [720, 720], '16:9': [1280, 720] };
const MODEL = () => process.env.EXPLAINER_VIDEO_MODEL || 'google/veo-3.1-fast';
const CLIP_SECONDS = 8;
const END_CARD_SECONDS = 2;
const POLL_MS = 5000;
const MAX_WAIT_MS = 8 * 60 * 1000;

/** chart: a PATTERNS key from chart-overlay.ts; when set, the real pattern is drawn over the scene.
 *  screen: an APP_SCREENS id from app-screens.ts; when set, the REAL veddbuild.com page is composited
 *  into the scene as a phone card (never an AI-invented app background). A scene gets one or the other. */
export interface ExplainerScene { narration: string; visual: string; chart?: string | null; screen?: string | null }
/** presenter + setting are reused word for word in every scene so it is one person, one place. */
export interface ExplainerScript { title: string; caption: string; presenter: string; setting: string; scenes: ExplainerScene[] }

// VEDD's audience and look: Black presenters, urban street settings.
const DEFAULT_PRESENTER = 'a young Black man in his mid-20s with short twists, wearing a black hoodie, a thin gold chain and a fitted cap';
const DEFAULT_SETTING = 'a city rooftop at golden hour with brick buildings, fire escapes and the skyline behind him';

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
  // `meta` MERGES (jsonb ||) instead of replacing: several writers own
  // different keys (runner: sceneUrls/audio/result; watchdog: resumeCount;
  // failure paths: error_detail) and a replace from any one of them would
  // silently erase the others — including the durability state the watchdog
  // needs to resume the job.
  const { meta, ...rest } = patch as Record<string, any>;
  const keys = Object.keys(rest);
  const params: unknown[] = [id];
  const sets = keys.map((k) => {
    params.push(k === 'script' ? JSON.stringify(rest[k]) : rest[k]);
    return `${k}=$${params.length}`;
  });
  if (meta !== undefined) {
    params.push(JSON.stringify(meta));
    sets.push(`meta = COALESCE(meta, '{}'::jsonb) || $${params.length}::jsonb`);
  }
  if (!sets.length) return;
  await pool.query(`UPDATE content_video_jobs SET ${sets.join(', ')}, updated_at=now() WHERE id=$1`, params);
}

/* ── Durability: jobs finish server-side, independent of any page ──────────
 * A render used to live only as an in-process promise plus a job id held in
 * React state: a server restart killed the render mid-flight, the row sat
 * at "running" forever, and once the user left the page the id was gone —
 * no video, no error, nothing in Saved. Now:
 *   - every job carries its resume state in its own row (script, per-scene
 *     URLs in meta, post link, attempt count);
 *   - runners register in `inFlightJobs` for the life of the run;
 *   - a watchdog timer (never a client request) rescans for jobs whose
 *     runner is gone, resumes them from the row, and — after the attempt
 *     cap — fails them with an error the user can actually see.
 * The page is a viewer: it reads job rows, it never drives a step. */
const inFlightJobs = new Set<number>();
export function trackJobStart(id: number): void { inFlightJobs.add(id); ensureJobWatchdog(); }
export function trackJobEnd(id: number): void { inFlightJobs.delete(id); }
export function isJobInFlight(id: number): boolean { return inFlightJobs.has(id); }

export const RESUME_STALE_MINUTES = 3;
export const MAX_RESUME_ATTEMPTS = 2;
const INTERRUPTED_ERROR = 'The video was interrupted by a server restart and could not be finished — please try again.';

let watchdogStarted = false;
export function ensureJobWatchdog(): void {
  if (watchdogStarted) return;
  watchdogStarted = true;
  const scan = () => { resumeStaleJobs().catch((e) => console.error('[video-jobs] watchdog scan failed:', e?.message || e)); };
  setTimeout(scan, 30000).unref?.();
  setInterval(scan, 60000).unref?.();
}

/** Resume (or visibly fail) every job whose runner is no longer alive in
 *  this process. Driven by the watchdog timer and server boot — never by a
 *  status poll. Returns how many jobs it resumed. */
export async function resumeStaleJobs(): Promise<number> {
  await ensureJobTable();
  const { rows } = await pool.query(
    `SELECT * FROM content_video_jobs WHERE status IN ('queued','running') AND updated_at < now() - ($1 || ' minutes')::interval`,
    [String(RESUME_STALE_MINUTES)]);
  let resumed = 0;
  for (const job of rows) {
    if (inFlightJobs.has(job.id)) continue;
    const meta = (job.meta || {}) as Record<string, any>;
    const attempts = Number(meta.resumeCount || 0);
    if (attempts >= MAX_RESUME_ATTEMPTS) {
      await update(job.id, { status: 'failed', step: 'Failed', error: INTERRUPTED_ERROR }).catch(() => {});
      continue;
    }
    await update(job.id, { step: 'Restarting after an interruption', meta: { resumeCount: attempts + 1 } }).catch(() => {});
    resumed++;
    if (job.kind === 'explainer') {
      launchExplainerJob(job.id, job.user_id, job.input, job.aspect, {
        postId: meta.postId ?? undefined,
        dailyAd: !!meta.dailyAd,
        presenterImage: meta.presenterImage || undefined,
        backgroundScene: meta.backgroundScene || undefined,
      }, { script: job.script ?? undefined, sceneUrls: Array.isArray(meta.sceneUrls) ? meta.sceneUrls : undefined });
    } else if (job.kind === 'clip' || job.kind === 'reel') {
      const cj = await import('./content-clip-jobs');
      await cj.resumeContentJob(job).catch(async (e: any) => {
        console.error(`[video-jobs] resume of ${job.kind} job ${job.id} failed:`, e?.message || e);
        await update(job.id, { status: 'failed', error: 'The video was interrupted and could not be restarted — please try again.' }).catch(() => {});
      });
    }
  }
  return resumed;
}

export async function getJob(id: number, userId: number) {
  await ensureJobTable();
  const { rows } = await pool.query(`SELECT * FROM content_video_jobs WHERE id=$1 AND user_id=$2`, [id, userId]);
  const job = rows[0] ?? null;
  if (!job) return null;
  // Read-only: this never starts, advances or resumes a generation step.
  // A stale job the watchdog can still save is left for the watchdog; one
  // past the attempt cap is failed VISIBLY here so a returning viewer sees
  // the error instead of an eternal spinner.
  if ((job.status === 'queued' || job.status === 'running') && !inFlightJobs.has(id)) {
    ensureJobWatchdog();
    const staleMs = Date.now() - new Date(job.updated_at).getTime();
    if (staleMs > 15 * 60 * 1000 && Number(job.meta?.resumeCount || 0) >= MAX_RESUME_ATTEMPTS) {
      await update(id, { status: 'failed', step: 'Failed', error: INTERRUPTED_ERROR }).catch(() => {});
      job.status = 'failed';
      job.error = INTERRUPTED_ERROR;
    }
  }
  return job;
}

/** Explainer renders started by this user in the last 24h (cost guard). */
export async function rendersToday(userId: number): Promise<number> {
  return jobsToday(userId, 'explainer');
}

/** Jobs of one kind started by this user in the last 24h (cost guard).
 *  Kind-filtered: clips/reels/explainers share the jobs table but each
 *  carries its own daily cap. A job RESUMED from a failure (retryResume)
 *  never counts: the user already paid for that render once, so a retry
 *  must not eat a second daily-limit slot. */
export async function jobsToday(userId: number, kind: string): Promise<number> {
  await ensureJobTable();
  const { rows } = await pool.query(
    `SELECT count(*)::int n FROM content_video_jobs WHERE user_id=$1 AND kind=$2 AND created_at > now() - interval '24 hours' AND status <> 'failed' AND NOT COALESCE((meta->>'retryResume')::boolean, false)`, [userId, kind]);
  return rows[0]?.n ?? 0;
}

// ─── Manual retry: reuse the scenes a failed job already paid for ──────────
// A render charges per scene as it goes. Before this, a manual retry from
// the UI inserted a brand-new job and paid for EVERY scene again, even
// though the failed job's row already holds its script and every finished
// scene URL. Now a retry of a FAILED job resumes that same row through the
// exact machinery the watchdog uses (RunResume: script + sceneUrls), so
// only the scenes that never finished are rendered. A failure during
// assembly/voiceover — after all scenes rendered — resumes with zero
// renderScene calls. Kill switch: VIDEO_RETRY_REUSE=off (always fresh job).
export function videoRetryReuseEnabled(): boolean {
  return process.env.VIDEO_RETRY_REUSE !== 'off';
}

/** The latest FAILED explainer job for this user that still holds paid
 *  work worth reusing (a saved script and/or at least one finished scene),
 *  matched by ambassador post when postId is given, else by exact input.
 *  Returns null when the kill switch is off or nothing resumable exists. */
export async function findResumableFailedExplainerJob(
  userId: number, match: { postId?: number | null; input?: string },
): Promise<any | null> {
  if (!videoRetryReuseEnabled()) return null;
  await ensureJobTable();
  const byPost = match.postId != null && Number.isFinite(Number(match.postId));
  const { rows } = await pool.query(
    `SELECT * FROM content_video_jobs
      WHERE user_id=$1 AND kind='explainer' AND status='failed'
        AND ${byPost ? `meta->>'postId' = $2` : `input = $2`}
        AND (script IS NOT NULL OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(meta->'sceneUrls', '[]'::jsonb)) v
          WHERE v IS NOT NULL AND v <> ''))
      ORDER BY id DESC LIMIT 1`,
    [userId, byPost ? String(Number(match.postId)) : String(match.input ?? '')]);
  return rows[0] ?? null;
}

/** Reset a failed job to running and relaunch it with its stored resume
 *  state. Same job id, same row — no INSERT, no second daily-limit slot. */
export async function resumeFailedExplainerJob(job: any): Promise<number> {
  const meta = (job.meta || {}) as Record<string, any>;
  const sceneUrls: (string | null)[] = Array.isArray(meta.sceneUrls) ? meta.sceneUrls : [];
  const doneScenes = sceneUrls.filter(Boolean).length;
  const totalScenes = (job.script?.scenes?.length as number) || sceneUrls.length;
  await update(job.id, {
    status: 'running', error: null,
    step: 'Resuming — reusing scenes already rendered',
    progress: totalScenes ? 10 + Math.round((doneScenes / totalScenes) * 70) : 10,
    meta: { resumeCount: Number(meta.resumeCount || 0) + 1, retryResume: true },
  });
  launchExplainerJob(job.id, job.user_id, job.input, job.aspect as ExplainerAspect, {
    postId: meta.postId ?? undefined,
    dailyAd: !!meta.dailyAd,
    presenterImage: meta.presenterImage || undefined,
    backgroundScene: meta.backgroundScene || undefined,
  }, { script: job.script ?? undefined, sceneUrls: Array.isArray(meta.sceneUrls) ? meta.sceneUrls : undefined });
  return job.id as number;
}

/** Owner-facing failure detail: the raw provider error, truncated and
 *  scrubbed of anything that looks like a credential before it can reach
 *  a poll response. The friendly headline stays the headline. */
export function scrubErrorDetail(raw: unknown): string {
  return String(raw ?? '')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .replace(/((?:api[_-]?key|access[_-]?token|token|secret|password)\s*[:=]\s*)\S+/gi, '$1[redacted]')
    .replace(/[A-Za-z0-9_-]{40,}/g, '[redacted]')
    .slice(0, 300)
    .trim();
}

/** Shared job-row updater for the other content job runners. */
export async function updateContentJob(id: number, patch: Record<string, unknown>): Promise<void> {
  await update(id, patch);
}

export interface ExplainerJobOpts {
  sceneCount?: number;
  presenterImage?: string;
  backgroundScene?: string;
  onDone?: (url: string, script: ExplainerScript) => Promise<void>;
  /** Ambassador daily-post link: when set, the finished URL is written to
   *  ambassador_post_queue from inside the runner (durably — an in-memory
   *  onDone closure alone dies with the process). */
  postId?: number;
  /** Daily-post mode: the script is an info-AD (hook → subject → VEDD →
   *  CTA) and the finished video gets Yusuf-narrated audio (video-audio.ts). */
  dailyAd?: boolean;
}

export interface RunResume {
  script?: ExplainerScript;
  sceneUrls?: (string | null)[];
}

/** Fire a run and own its terminal bookkeeping: any failure lands on the
 *  job row as a visible error; the in-flight registration always clears. */
function launchExplainerJob(id: number, userId: number, input: string, aspect: ExplainerAspect, opts: ExplainerJobOpts, resume: RunResume = {}): void {
  trackJobStart(id);
  runJob(id, userId, input, aspect, opts, resume).catch(async (e) => {
    console.error(`[explainer] job ${id} failed:`, e?.message || e);
    await update(id, { status: 'failed', error: friendlyError(e) }).catch(() => {});
    await update(id, { meta: { error_detail: String(e?.message || e).slice(0, 1000) } }).catch(() => {});
  }).finally(() => trackJobEnd(id));
}

export async function startExplainerJob(
  userId: number, input: string, aspect: ExplainerAspect,
  opts: ExplainerJobOpts = {},
): Promise<number> {
  await ensureJobTable();
  // Manual retry of a FAILED job resumes that job (reusing its paid
  // scenes/script) instead of inserting — and charging for — a new one.
  if (videoRetryReuseEnabled()) {
    const failed = await findResumableFailedExplainerJob(userId, { postId: opts.postId ?? null, input });
    if (failed) return resumeFailedExplainerJob(failed);
  }
  // The resume state lives in the row from the first second, so a restart
  // at ANY point leaves the watchdog everything it needs.
  const meta = {
    postId: opts.postId ?? null,
    dailyAd: !!opts.dailyAd,
    presenterImage: opts.presenterImage ?? null,
    backgroundScene: opts.backgroundScene ?? null,
    resumeCount: 0,
    sceneUrls: [] as (string | null)[],
  };
  const { rows } = await pool.query(
    `INSERT INTO content_video_jobs (user_id, input, aspect, status, step, meta) VALUES ($1,$2,$3,'running','Writing the script',$4) RETURNING id`,
    [userId, input.slice(0, 8000), aspect, JSON.stringify(meta)]);
  const id = rows[0].id as number;
  launchExplainerJob(id, userId, input, aspect, opts);
  return id;
}

function friendlyError(e: any): string {
  const m = String(e?.message || e);
  if (/REPLICATE_API_TOKEN|OPENROUTER_API_KEY/.test(m) && /not set/.test(m)) return 'Video service is not configured.';
  // Check the status code first: Replicate's 429 text also mentions "credit".
  if (/Replicate 402/.test(m)) return 'The video service is out of credit. Ask VEDD to top it up.';
  if (/Replicate 429/.test(m)) return 'The video service is busy right now. Please try again in a few minutes.';
  if (/timed out/i.test(m)) return 'The video took too long to make. Please try again.';
  return 'The video could not be made right now. Please try again in a few minutes.';
}

async function runJob(id: number, userId: number, input: string, aspect: ExplainerAspect,
  opts: ExplainerJobOpts, resume: RunResume = {}) {
  const dailyAd = !!opts.dailyAd;
  const script = resume.script
    ?? (dailyAd ? await writeAdScript(input, userId, opts.backgroundScene)
                : await writeScript(input, userId, opts.sceneCount ?? 4, opts.backgroundScene));
  await update(id, { script, step: `Filming ${script.scenes.length} scenes with voiceover`, progress: 10 });

  // One scene at a time by default: the original reason was Replicate's
  // burst-of-1 throttle on low-credit accounts; serial rendering is also
  // the polite default for OpenRouter. EXPLAINER_CONCURRENCY raises it.
  // Every finished scene URL is written to the job row immediately — a
  // resumed run reuses them instead of paying to re-render.
  const urls: (string | null)[] = script.scenes.map((_, i) => resume.sceneUrls?.[i] ?? null);
  let done = 0;
  const predictions: string[] = [];
  const sceneProviders: string[] = [];
  const queue = script.scenes.map((s, i) => async () => {
    if (!urls[i]) {
      const r = await renderScene(s, script, aspect, opts.presenterImage);
      urls[i] = r.url; predictions.push(r.predictionId); sceneProviders.push(r.predictionId.split(':')[0]);
      await update(id, { meta: { sceneUrls: urls } });
    }
    done++;
    await update(id, { progress: 10 + Math.round((done / script.scenes.length) * 70), step: `Filmed ${done} of ${script.scenes.length} scenes` });
  });
  const workers = Array.from({ length: Math.min(Math.max(1, Number(process.env.EXPLAINER_CONCURRENCY ?? 1)), queue.length) }, async () => { while (queue.length) await queue.shift()!(); });
  await Promise.all(workers);
  const sceneUrls = urls.map((u) => {
    if (!u) throw new Error('a scene finished without a video URL');
    return u;
  });
  // Record the provider(s) that ACTUALLY rendered (scene prediction ids are
  // provider-prefixed) — this used to hardcode the Replicate model slug.
  const providersUsed = Array.from(new Set(sceneProviders.filter(Boolean)));
  const modelLabel = providersUsed.length ? providersUsed.join('+') : MODEL();

  await update(id, { step: 'Adding VEDD branding and joining scenes', progress: 85, meta: { predictions, model: modelLabel, presenter: opts.presenterImage ? 'custom' : 'ai', background: opts.backgroundScene ? 'preset' : 'ai' } });
  const chartArgs = script.scenes.map((s) => (s.screen ? null : (s.chart ?? null)));
  const screenArgs = script.scenes.map((s) => (s.screen ? screenImagePath(s.screen) : null));

  // Daily info-ads get their sound from the shared audio stage
  // (video-audio.ts): the scenes are joined MUTED and Yusuf Hakeem Kiser
  // narrates the ad script over a music bed. If that narration cannot be
  // produced, the video still ships — re-joined with the presenter's
  // native voice — and the job record SAYS the narration failed.
  let video: Buffer;
  let audioMeta: VideoAudioMeta | undefined;
  if (dailyAd && videoAudioEnabled()) {
    await update(id, { step: 'Adding the voiceover and music', progress: 90 });
    const muted = await assemble(sceneUrls, aspect, chartArgs, screenArgs, { muteScenes: true });
    const mixed = await applyVideoAudio(muted, {
      narrationText: adNarrationText(script), userId, narrationMaxWords: AD_NARRATION_MAX_WORDS,
    }).catch(() => null);
    if (mixed && mixed.audio.narration !== 'none') {
      video = mixed.buffer;
      audioMeta = mixed.audio;
    } else {
      video = await assemble(sceneUrls, aspect, chartArgs, screenArgs);
      audioMeta = {
        narration: 'none',
        musicBed: mixed?.audio.musicBed ?? 'none',
        reason: "Yusuf's voiceover could not be added — this video uses the presenter's built-in voice instead.",
      };
    }
  } else {
    video = await assemble(sceneUrls, aspect, chartArgs, screenArgs);
  }
  const saved = await persistBuffer(video, 'video/mp4');
  if (!saved) throw new Error('could not save the finished video');

  await update(id, {
    status: 'done', step: 'Ready', progress: 100, result_url: saved.url,
    ...(audioMeta ? { meta: { audio: audioMeta } } : {}),
  });

  // Saved-library record: a success that never lands in Saved reads to the
  // user as a vanished video, so a failure here is retried once, logged,
  // and recorded on the job (meta.libraryError) — never swallowed.
  let libraryError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { storage } = await import('../storage');
      await storage.createContentStudioGeneration({
        userId, contentType: 'video', prompt: input.slice(0, 2000), title: script.title, caption: script.caption, assetUrl: saved.url,
        metadata: { kind: 'explainer', ...(dailyAd ? { format: 'daily-ad' } : {}), aspect, model: modelLabel, script, predictions, presenter: opts.presenterImage ? 'custom' : 'ai', ...(audioMeta ? { audio: audioMeta } : {}) },
      } as any);
      libraryError = null;
      break;
    } catch (e: any) {
      libraryError = String(e?.message || e).slice(0, 300);
      console.error(`[explainer] job ${id} library save failed (attempt ${attempt + 1}/2):`, libraryError);
    }
  }
  if (libraryError) await update(id, { meta: { libraryError } }).catch(() => {});

  // The daily-post link is written HERE, from the job's durable postId —
  // not only from an in-memory callback — so it lands even when the run
  // was resumed by the watchdog in a later process.
  if (opts.postId) {
    await pool.query(`UPDATE ambassador_post_queue SET video_url=$2, video_shot=NULL, video_aspect=$3 WHERE id=$1`,
      [opts.postId, saved.url, aspect])
      .catch((e: any) => console.error(`[explainer] job ${id} post link update failed:`, e?.message || e));
  }
  if (opts.onDone) await opts.onDone(saved.url, script).catch((e) => console.error('[explainer] onDone failed:', e?.message));
}

// ─── Script ──────────────────────────────────────────────────────────────────
export async function writeScript(input: string, userId: number, sceneCount: number, settingOverride?: string): Promise<ExplainerScript> {
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

Cast ONE presenter and ONE setting for the whole video:
- "presenter": a young Black person (man or woman), described precisely so every scene shows the same person: age, hair, outfit (streetwear: hoodie, puffer, fitted cap, sneakers, chains). 15-30 words.
- "setting": an urban street location in a US city (rooftop, corner store front, brownstone stoop, basketball court, subway platform, graffiti wall at night, barbershop). 15-30 words.

Each scene is one continuous 8-second shot:
- "narration": what the presenter SAYS to camera, 12-18 words (must fit in 7 seconds), plain spoken English with natural street energy, no slang that hides the meaning, no hashtags or emojis.
- "visual": what the camera sees, 20-40 words: the presenter's action and the camera move. Do NOT re-describe the presenter or setting (they are added automatically).
- "chart": when the narration explains a candlestick pattern or level, set it to exactly one of: ${PATTERN_KEYS.join(', ')}. The real pattern is drawn on screen in the lower part of the frame, so in that scene the presenter stands in the upper half and points or gestures down toward it. Otherwise null.
Use a chart in at least one middle scene when the subject involves a pattern, level or breakout. No income or profit promises.
- "screen": when the narration talks about the VEDD app itself — a page, a feature, the plans — set it to exactly one of these REAL pages (the actual screenshot is composited into the lower half of the frame, the presenter in the upper half gesturing down toward it):
${screenCatalogForPrompt()}
Never invent or describe a fake app screen, page or button in "visual": when the app needs to be shown, it is shown with a screen id or not at all. A scene gets a chart OR a screen, never both. Use a screen in at least one scene when the subject is the app itself.

JSON: {"title":"...","caption":"one-line social caption with a question","presenter":"...","setting":"...","scenes":[{"narration":"...","visual":"...","chart":null,"screen":null}]}` },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1500,
  });
  const raw = (completion.choices?.[0]?.message?.content || '{}').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  const out = JSON.parse(raw || '{}');
  const scenes: ExplainerScene[] = (Array.isArray(out.scenes) ? out.scenes : [])
    .map((s: any) => ({
      narration: String(s?.narration || '').trim(), visual: String(s?.visual || '').trim(),
      chart: PATTERN_KEYS.includes(String(s?.chart)) ? String(s.chart) : null,
      screen: APP_SCREEN_IDS.includes(String(s?.screen)) ? String(s.screen) : null,
    }))
    .map((s: ExplainerScene) => (s.screen ? { ...s, chart: null } : s))
    .filter((s: ExplainerScene) => s.narration && s.visual)
    .slice(0, n);
  if (scenes.length < 2) throw new Error('script generation returned too few scenes');
  const presenter = String(out.presenter || '').trim().slice(0, 300) || DEFAULT_PRESENTER;
  const setting = (settingOverride || '').trim().slice(0, 300) || String(out.setting || '').trim().slice(0, 300) || DEFAULT_SETTING;
  return { title: String(out.title || 'VEDD lesson').slice(0, 120), caption: String(out.caption || '').slice(0, 300), presenter, setting, scenes };
}

/* ── Daily info-ad script (the Today flow) ─────────────────────────────────
 * Same ExplainerScript shape as a lesson, but structured as an ad whose
 * only job is to bring a new viewer to VEDD: HOOK → the day's SUBJECT made
 * interesting → what VEDD does about it → CTA. The scene narrations, read
 * in order, ARE the voiceover script the audio stage narrates. */
export const AD_SCENE_ROLES = ['hook', 'subject', 'vedd', 'cta'] as const;
/** 4 scenes × 12–18 spoken words ≈ 70 words — the cap that lets the whole
 *  ad (CTA included) be narrated instead of truncated at the clip cap. */
export const AD_NARRATION_MAX_WORDS = 90;

export function adNarrationText(script: ExplainerScript): string {
  return script.scenes.map((s) => s.narration).join(' ').replace(/\s+/g, ' ').trim();
}

export function buildAdScriptPrompt(input: string): string {
  return `Write a 4-scene vertical INFO-AD about the subject of the day below. This is an ad, not a lesson: its one goal is to catch a new viewer's interest and bring them to VEDD.

"""${input.slice(0, 4000)}"""

Exactly 4 scenes, in this order:
- Scene 1 — HOOK: a pattern-interrupt opening that names the viewer's pain or the surprising question inside today's subject. Spoken straight to camera, high energy. No teaching yet.
- Scene 2 — SUBJECT: today's subject made interesting in plain steps, with ONE concrete example (real chart terms: candles, support, stop loss, etc.).
- Scene 3 — VEDD: what VEDD AI does about this exact problem — it watches the charts, explains setups in plain language, and helps plan trades with risk controls. When this scene talks about the app itself, set "screen" (below).
- Scene 4 — CTA: a clear invitation to try VEDD AI free at veddbuild dot com. Join/try language only — never earnings language.

Cast ONE presenter and ONE setting for the whole video:
- "presenter": a young Black person (man or woman), described precisely so every scene shows the same person: age, hair, outfit (streetwear: hoodie, puffer, fitted cap, sneakers, chains). 15-30 words.
- "setting": an urban street location in a US city (rooftop, corner store front, brownstone stoop, basketball court, subway platform, graffiti wall at night, barbershop). 15-30 words.

Each scene is one continuous 8-second shot:
- "narration": what the presenter SAYS to camera, 12-18 words (must fit in 7 seconds), plain spoken English with natural street energy, no slang that hides the meaning, no hashtags or emojis. Read in order, the four narrations form one smooth ad script.
- "visual": what the camera sees, 20-40 words: the presenter's action and the camera move. Do NOT re-describe the presenter or setting (they are added automatically).
- "chart": when the narration explains a candlestick pattern or level, set it to exactly one of: ${PATTERN_KEYS.join(', ')}. The real pattern is drawn on screen in the lower part of the frame, so in that scene the presenter stands in the upper half and points or gestures down toward it. Otherwise null.
- "screen": when the narration talks about the VEDD app itself — a page, a feature, the plans — set it to exactly one of these REAL pages (the actual screenshot is composited into the lower half of the frame, the presenter in the upper half gesturing down toward it):
${screenCatalogForPrompt()}
Never invent or describe a fake app screen, page or button in "visual": when the app needs to be shown, it is shown with a screen id or not at all. A scene gets a chart OR a screen, never both. Scene 3 should use a screen when it fits the subject.

Hard rules: No income or profit promises. No win-rate or return claims. No "guaranteed" language. No fake results or testimonials. The CTA invites the viewer to LEARN and try the tool free — nothing more.

"title": a short hook-style title for the video. "caption": one-line social caption that ends by inviting the viewer to try VEDD AI free at veddbuild.com.

JSON: {"title":"...","caption":"...","presenter":"...","setting":"...","scenes":[{"narration":"...","visual":"...","chart":null,"screen":null}]}`;
}

export async function writeAdScript(input: string, userId: number, settingOverride?: string): Promise<ExplainerScript> {
  const { getUniversalAIClientForUser } = await import('../openai');
  const ai: any = await getUniversalAIClientForUser(userId || 0);
  const completion = await ai.chat.completions.create({
    model: ai.defaultModel || 'gpt-4o',
    messages: [
      { role: 'system', content: 'You write short, interest-catching info-ads for VEDD AI, a trading-education platform. JSON only.' },
      { role: 'user', content: buildAdScriptPrompt(input) },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1500,
  });
  const raw = (completion.choices?.[0]?.message?.content || '{}').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  const out = JSON.parse(raw || '{}');
  const scenes: ExplainerScene[] = (Array.isArray(out.scenes) ? out.scenes : [])
    .map((s: any) => ({
      narration: String(s?.narration || '').trim(), visual: String(s?.visual || '').trim(),
      chart: PATTERN_KEYS.includes(String(s?.chart)) ? String(s.chart) : null,
      screen: APP_SCREEN_IDS.includes(String(s?.screen)) ? String(s.screen) : null,
    }))
    .map((s: ExplainerScene) => (s.screen ? { ...s, chart: null } : s))
    .filter((s: ExplainerScene) => s.narration && s.visual)
    .slice(0, 4);
  if (scenes.length < 3) throw new Error('ad script generation returned too few scenes');
  const presenter = String(out.presenter || '').trim().slice(0, 300) || DEFAULT_PRESENTER;
  const setting = (settingOverride || '').trim().slice(0, 300) || String(out.setting || '').trim().slice(0, 300) || DEFAULT_SETTING;
  return { title: String(out.title || 'VEDD — today').slice(0, 120), caption: String(out.caption || '').slice(0, 300), presenter, setting, scenes };
}

const SCENE_NEGATIVE_PROMPT = 'subtitles, captions, on-screen text, watermark, logo, distorted hands, extra fingers, office, corporate suit, business attire, different person';

// ─── Scenes (OpenRouter primary, Replicate fallback) ─────────────────────────
/**
 * Renders one scene: OpenRouter first (the funded provider), Replicate as
 * the per-scene fallback. Neither configured -> throws the same
 * "not configured" class of error the job's friendlyError() maps.
 *
 * Presenter-image caveat, mirroring the old Replicate behavior: if the
 * OpenRouter render fails WITH a presenter image, retry OpenRouter once
 * WITHOUT it (a model/provider refusing the photo shouldn't kill the
 * video) before falling back to Replicate-with-image.
 */
async function renderScene(scene: ExplainerScene, script: ExplainerScript, aspect: ExplainerAspect, presenterImage?: string): Promise<{ url: string; predictionId: string }> {
  const framing = scene.chart || scene.screen
    ? 'Medium shot with the presenter in the upper half of the frame, pointing down toward the lower half, which is a plain darker area of the scene.'
    : 'Medium close-up, presenter talking straight to camera.';
  const prompt = presenterImage
    ? `The person in the starting image is the presenter — keep their exact face, hair and appearance in every frame. Setting: ${script.setting}. ${scene.visual} ${framing} `
      + `Authentic urban street style, cinematic 35mm look, natural skin tones, warm gold light, shallow depth of field, handheld-smooth camera. `
      + `The presenter speaks directly to the camera and says: "${scene.narration.replace(/"/g, "'")}" `
      + `Light hip-hop beat under the voice. No subtitles, no on-screen text, no logos.`
    : `Presenter: ${script.presenter}. Setting: ${script.setting}. ${scene.visual} ${framing} `
      + `Authentic urban street style, cinematic 35mm look, natural skin tones, warm gold light, shallow depth of field, handheld-smooth camera. `
      + `The presenter speaks directly to the camera and says: "${scene.narration.replace(/"/g, "'")}" `
      + `Light hip-hop beat under the voice. No subtitles, no on-screen text, no logos.`;
  const orAspect: '9:16' | '16:9' = aspect === '16:9' ? '16:9' : '9:16';

  const { generateExplainerSceneViaOpenRouter, openrouterConfigured } = await import('./openrouter-video');
  if (openrouterConfigured()) {
    const tryOr = (image?: string) => generateExplainerSceneViaOpenRouter({
      prompt, aspect: orAspect, durationSeconds: CLIP_SECONDS, image,
      negativePrompt: SCENE_NEGATIVE_PROMPT, maxWaitMs: MAX_WAIT_MS,
    });
    let or = await tryOr(presenterImage);
    if (!or && presenterImage) {
      console.warn('[explainer] OpenRouter scene failed with presenter image — retrying without it');
      or = await tryOr(undefined);
    }
    if (or) return or;
    console.warn('[explainer] OpenRouter scene render failed — falling back to Replicate');
  }
  return renderSceneViaReplicate(scene, script, aspect, presenterImage, prompt);
}

async function renderSceneViaReplicate(scene: ExplainerScene, script: ExplainerScript, aspect: ExplainerAspect, presenterImage: string | undefined, prompt: string): Promise<{ url: string; predictionId: string }> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN not set');
  const create = (withImage: boolean) => fetch(`https://api.replicate.com/v1/models/${MODEL()}/predictions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'wait=55' },
    body: JSON.stringify({ input: {
      prompt,
      ...(withImage && presenterImage ? { image: presenterImage } : {}),
      aspect_ratio: aspect === '16:9' ? '16:9' : '9:16',
      duration: CLIP_SECONDS,
      resolution: '720p',
      generate_audio: true,
      negative_prompt: SCENE_NEGATIVE_PROMPT,
    } }),
    signal: AbortSignal.timeout(70000),
  });
  // 429 = rate limited (Replicate tells us how long to wait): retry, don't fail.
  const createWithRetry = async (withImage: boolean) => {
    let r = await create(withImage);
    for (let attempt = 0; r.status === 429 && attempt < 8; attempt++) {
      const body: any = await r.json().catch(() => ({}));
      await new Promise((resolve) => setTimeout(resolve, (Number(body?.retry_after) || 10) * 1000 + 1000));
      r = await create(withImage);
    }
    return r;
  };
  let res = await createWithRetry(!!presenterImage);
  // If the model rejected the start image (a swapped-in model without an
  // image input, or a photo it refuses), fall back to the text-described
  // presenter instead of failing the whole video.
  if (!res.ok && presenterImage) {
    console.warn('[explainer] scene create failed with presenter image — retrying without it');
    res = await createWithRetry(false);
  }
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
/** Which scenes keep their native audio in the join. The daily info-ad
 *  mutes every scene (muteScenes) because its sound comes from the shared
 *  narration stage afterwards; everything else keeps native scene audio. */
export function sceneAudioPlan(hasAudio: boolean[], muteScenes: boolean): boolean[] {
  return hasAudio.map((h) => (muteScenes ? false : h));
}

export async function assemble(clipUrls: string[], aspect: ExplainerAspect, charts: (string | null)[] = [], screens: (string | null)[] = [], opts: { muteScenes?: boolean } = {}): Promise<Buffer> {
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
    return await assembleFiles(files, aspect, dir, charts, screens, opts);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Joins local scene files into one branded MP4 (exported for tests). */
export async function assembleFiles(files: string[], aspect: ExplainerAspect, dir: string, charts: (string | null)[] = [], screens: (string | null)[] = [], opts: { muteScenes?: boolean } = {}): Promise<Buffer> {
  const [W, H] = FRAME[aspect];
  const logo = findLogo();
  {
    const info = await Promise.all(files.map((f) => probe(f)));
    const audio = sceneAudioPlan(info.map((x) => x.hasAudio), !!opts.muteScenes);

    const args: string[] = ['-y'];
    files.forEach((f) => args.push('-i', f));
    const n = files.length;
    let next = n;
    const silent: number[] = [];
    files.forEach((_, i) => { if (!audio[i]) { args.push('-f', 'lavfi', '-t', String(info[i].duration || CLIP_SECONDS), '-i', 'anullsrc=r=44100:cl=stereo'); silent[i] = next++; } });
    const cardAudio = next++; args.push('-f', 'lavfi', '-t', String(END_CARD_SECONDS), '-i', 'anullsrc=r=44100:cl=stereo');
    let logoIdx = -1, cardIdx = -1;
    if (logo) { logoIdx = next++; args.push('-i', logo); cardIdx = next++; args.push('-loop', '1', '-t', String(END_CARD_SECONDS), '-i', logo); }
    // Real app screens (app-screens.ts) ride along as extra image inputs.
    const screenIdx: number[] = [];
    files.forEach((_, i) => { if (screens[i]) { screenIdx[i] = next++; args.push('-i', screens[i]!); } });

    const f: string[] = [];
    const parts: string[] = [];
    files.forEach((_, i) => {
      // Pattern scenes get the real candles drawn over the lower part (chart-overlay.ts).
      const spec = charts[i] ? PATTERNS[charts[i]!] : undefined;
      const overlay = spec ? `,${chartFilter(spec, W, H, info[i].duration || CLIP_SECONDS)}` : '';
      // Screen scenes: a dark gold-edged panel in the lower half, then the
      // REAL app screenshot composited over it as a phone card.
      const scr = screens[i] ? screenCardGeometry(W, H) : null;
      const panel = scr ? `,drawbox=x=${scr.x - scr.panelPad}:y=${scr.y - scr.panelPad}:w=${scr.cardW + scr.panelPad * 2}:h=${scr.cardH + scr.panelPad * 2}:color=0x0B0B0E@0.92:t=fill,drawbox=x=${scr.x - scr.panelPad}:y=${scr.y - scr.panelPad}:w=${scr.cardW + scr.panelPad * 2}:h=${scr.cardH + scr.panelPad * 2}:color=0xF5C451@0.55:t=3` : '';
      f.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=24,setsar=1${overlay}${panel},format=yuv420p[base${i}]`);
      if (scr) {
        f.push(`[${screenIdx[i]}:v]scale=${scr.cardW}:${scr.cardH}:force_original_aspect_ratio=increase,crop=${scr.cardW}:${scr.cardH}[scr${i}]`);
        f.push(`[base${i}][scr${i}]overlay=${scr.x}:${scr.y},format=yuv420p[v${i}]`);
      } else {
        f.push(`[base${i}]null[v${i}]`);
      }
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
