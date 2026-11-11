/**
 * Clip + reel jobs — Content Studio's short-form generators on the same
 * job system the explainers use (content_video_jobs, kind 'clip'/'reel').
 *
 * Before this, POST /generate-video and /generate-reel held the HTTP
 * request open for the whole render (up to ~5 minutes): a provider
 * throttle surfaced as a user-facing error even though the render could
 * still be charged, and there was no per-user daily cap on either kind.
 * Now the POST returns a job id immediately, the render runs server-side
 * with progress steps, the client polls, and each kind has an env-tuned
 * daily cap (CLIP_DAILY_LIMIT / REEL_DAILY_LIMIT, default 10, admins
 * exempt) enforced in the routes via jobsToday().
 *
 * The render itself is unchanged: renderContentVideo (plan → provider
 * render via video-generation.ts — OpenRouter primary since 2026-11-11,
 * then Replicate, then fal → branding → sound (video-audio.ts: narration
 * + music bed; reels pass their script as the narration text) → durable
 * store), and the generation-history record is written exactly as the
 * sync routes wrote it, so the Saved library sees the same data.
 */
import { pool } from '../db';
import { ensureJobTable, updateContentJob } from './explainer-video';
import { renderContentVideo, type RenderOptions } from './content-video';

export interface ClipJobPayload {
  prompt: string;
  shot?: string;
  exact?: boolean;
  aspect?: string;
  brand?: boolean;
  duration?: number;
  quality?: 'fast' | 'high';
  /** Resolved start image URL (presenter or upload), resolved by the route. */
  image?: string;
  backgroundScene?: string;
}

export interface ReelJobPayload {
  topic: string;
  duration?: number;
  quality?: 'fast' | 'high';
  aspect?: string;
  image?: string;
  backgroundScene?: string;
  format: 'standard' | 'product-ad' | 'got-milk';
  syncStyleNote?: string;
}

function friendlyError(e: any): string {
  const m = String(e?.message || e);
  if (/REPLICATE_API_TOKEN|FAL/.test(m) && /not configured|missing|no .* key/i.test(m)) return 'Video service is not configured.';
  if (/402/.test(m)) return 'The video service is out of credit. Ask VEDD to top it up.';
  if (/429/.test(m)) return 'The video service is busy right now. Please try again in a few minutes.';
  if (/timed out/i.test(m)) return 'The video took too long to make. Please try again.';
  return m.slice(0, 300) || 'The video could not be made right now. Please try again in a few minutes.';
}

async function insertJob(userId: number, kind: 'clip' | 'reel', aspect: string, payload: unknown, firstStep: string): Promise<number> {
  await ensureJobTable();
  const { rows } = await pool.query(
    `INSERT INTO content_video_jobs (user_id, kind, input, aspect, status, step) VALUES ($1,$2,$3,$4,'running',$5) RETURNING id`,
    [userId, kind, JSON.stringify(payload).slice(0, 8000), aspect, firstStep]);
  return rows[0].id as number;
}

async function failJob(id: number, e: any): Promise<void> {
  console.error(`[content-jobs] job ${id} failed:`, e?.message || e);
  await updateContentJob(id, {
    status: 'failed', error: friendlyError(e),
    meta: { error_detail: String(e?.message || e).slice(0, 1000) },
  }).catch(() => {});
}

async function saveGeneration(userId: number, rec: Record<string, unknown>): Promise<void> {
  try {
    const { storage } = await import('../storage');
    await (storage as any).createContentStudioGeneration({ userId, ...rec });
  } catch (e: any) {
    console.error('[content-jobs] failed to save generation record:', e?.message || e);
  }
}

export async function startClipJob(userId: number, payload: ClipJobPayload): Promise<number> {
  const id = await insertJob(userId, 'clip', payload.aspect || '9:16', payload, 'Planning the shot');
  (async () => {
    await updateContentJob(id, { step: 'Rendering the clip', progress: 25 });
    const video = await renderContentVideo(payload.prompt || payload.shot || '', {
      userId,
      shot: payload.shot,
      exact: payload.exact,
      aspect: payload.aspect as RenderOptions['aspect'],
      brand: payload.brand,
      duration: payload.duration,
      quality: payload.quality,
      image: payload.image,
      backgroundScene: payload.backgroundScene,
    });
    if (!video) throw new Error("The video couldn't be made right now. Please try again in a minute.");
    if (video.persisted) {
      await saveGeneration(userId, {
        contentType: 'video', prompt: payload.prompt || payload.shot, title: video.hook || null, assetUrl: video.url,
        metadata: { provider: video.provider, shot: video.shot, aspect: video.aspect, branded: video.branded, ...(video.audio ? { audio: video.audio } : {}) },
      });
    }
    await updateContentJob(id, {
      status: 'done', step: 'Ready', progress: 100, result_url: video.url,
      meta: { result: video },
    });
  })().catch((e) => failJob(id, e));
  return id;
}

export async function startReelJob(userId: number, payload: ReelJobPayload): Promise<number> {
  const id = await insertJob(userId, 'reel', payload.aspect || '9:16', payload, 'Writing the script');
  (async () => {
    const { generateReelScript } = await import('../openai');
    const script = await generateReelScript(payload.topic, userId, payload.format, payload.syncStyleNote);
    await updateContentJob(id, { step: 'Rendering the clip', progress: 40, script });
    // The reel script IS a voiceover script (hook + beats, written to be
    // read over the clip): hand it to the audio stage as the narration
    // instead of paying for a second, generated one.
    const narrationText = [script.hook, ...(script.script || [])].join(' ').trim();
    const video = await renderContentVideo(`Topic: ${payload.topic}\nScene idea: ${script.videoPrompt}`, {
      userId,
      aspect: payload.aspect as RenderOptions['aspect'],
      duration: payload.duration,
      quality: payload.quality,
      image: payload.image,
      backgroundScene: payload.backgroundScene,
      narrationText: narrationText || undefined,
    });
    if (!video) throw new Error("The video couldn't be made right now. Please try again in a minute.");
    if (video.persisted) {
      await saveGeneration(userId, {
        contentType: 'reel', prompt: payload.topic, title: script.hook ?? null, caption: script.caption ?? null,
        assetUrl: video.url,
        metadata: { provider: video.provider, script, shot: video.shot, aspect: video.aspect, branded: video.branded, ...(video.audio ? { audio: video.audio } : {}) },
      });
    }
    const result = { ...script, url: video.url, persisted: video.persisted, branded: video.branded, shot: video.shot, aspect: video.aspect, ...(video.audio ? { audio: video.audio } : {}) };
    await updateContentJob(id, {
      status: 'done', step: 'Ready', progress: 100, result_url: video.url,
      meta: { result },
    });
  })().catch((e) => failJob(id, e));
  return id;
}
