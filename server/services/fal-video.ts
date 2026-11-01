/**
 * AI video clip generation via fal.ai — the app's second video provider,
 * added so Content Studio clips/reels are not single-homed on Replicate.
 * That single-homing has already bitten once: on 2026-10-31 Google retired
 * the model behind Replicate's Veo endpoint and generations started 404ing.
 *
 * video-generation.ts uses this two ways:
 *  - as the fallback when a Replicate generation returns null, and
 *  - as the primary when VIDEO_PROVIDER=fal (Replicate becomes the fallback).
 *
 * Auth: FAL_AI_API (the name the key is stored under in the deployment env)
 * or FAL_KEY (fal's own convention). Queue API — submit, poll status_url,
 * fetch response_url — mirroring the submit/poll shape of the Replicate
 * path so callers see the same contract: a GeneratedVideo or null.
 *
 * Models are env-swappable without a redeploy, same pattern as
 * VIDEO_HIGH_MODEL on the Replicate side. fal's catalog changes often, so
 * no model id should ever be load-bearing:
 *   FAL_VIDEO_MODEL        text-to-video   (default: Wan 2.2 A14B)
 *   FAL_VIDEO_HIGH_MODEL   high tier t2v   (default: same as FAL_VIDEO_MODEL)
 *   FAL_VIDEO_I2V_MODEL    image-to-video  (default: Wan 2.2 A14B i2v)
 *   FAL_VIDEO_HIGH_I2V_MODEL               (default: same as FAL_VIDEO_I2V_MODEL)
 * Point them at Kling / Veo / Seedance endpoints on fal to change models.
 */

import type { GeneratedVideo, VideoQuality } from './video-generation';

export interface FalVideoOpts {
  durationSeconds: number;
  numFrames: number;
  fps: number;
  quality: VideoQuality;
  image?: string; // optional start image (public URL or data URI) for image-to-video
  aspect: '9:16' | '16:9';
}

const FAST_MODEL = process.env.FAL_VIDEO_MODEL || 'fal-ai/wan/v2.2-a14b/text-to-video';
const HIGH_MODEL = process.env.FAL_VIDEO_HIGH_MODEL || FAST_MODEL;
const FAST_I2V_MODEL = process.env.FAL_VIDEO_I2V_MODEL || 'fal-ai/wan/v2.2-a14b/image-to-video';
const HIGH_I2V_MODEL = process.env.FAL_VIDEO_HIGH_I2V_MODEL || FAST_I2V_MODEL;
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 60; // 60 x 5s = 5 minutes max wait, same budget as the Replicate path

export function falConfigured(): boolean {
  return !!(process.env.FAL_AI_API || process.env.FAL_KEY);
}

function falKey(): string | null {
  return process.env.FAL_AI_API || process.env.FAL_KEY || null;
}

/**
 * Generate a short AI video clip via fal.ai. The prompt must already carry
 * the VEDD style lock (video-generation.ts builds it once for both
 * providers). Returns null (never throws) if no key is configured,
 * generation fails, or it doesn't complete within the poll budget.
 */
export async function generateFalVideo(
  styledPrompt: string,
  opts: FalVideoOpts,
): Promise<GeneratedVideo | null> {
  const key = falKey();
  if (!key) {
    console.error('[fal-video] FAL_AI_API / FAL_KEY not set — cannot generate video');
    return null;
  }

  const { quality, image } = opts;
  // Image-to-video when a start image is supplied, otherwise text-to-video.
  const model = image
    ? (quality === 'high' ? HIGH_I2V_MODEL : FAST_I2V_MODEL)
    : (quality === 'high' ? HIGH_MODEL : FAST_MODEL);
  const input: Record<string, any> = {
    prompt: styledPrompt,
    num_frames: opts.numFrames,
    frames_per_second: opts.fps,
    // Wan family only offers 480p/580p/720p on fal; 720p is the quality bump,
    // matching the Replicate side (fast 480p / high 720p).
    resolution: quality === 'high' ? '720p' : '480p',
    // i2v derives aspect ratio from the start image; only set it for t2v.
    ...(image ? { image_url: image } : { aspect_ratio: opts.aspect }),
  };

  try {
    console.log(`[fal-video] quality=${quality} model=${model} mode=${image ? 'image-to-video' : 'text-to-video'}`);
    const submit = await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30000),
    });
    if (!submit.ok) {
      const body = await submit.text().catch(() => '');
      console.error('[fal-video] fal submit error:', submit.status, body.slice(0, 300));
      return null;
    }
    const queued = await submit.json() as any;
    const statusUrl = queued?.status_url;
    const responseUrl = queued?.response_url;
    if (!statusUrl || !responseUrl) {
      console.error('[fal-video] fal submit returned no queue URLs');
      return null;
    }

    let status = String(queued?.status || 'IN_QUEUE');
    for (let i = 0; i < MAX_POLLS && status !== 'COMPLETED'; i++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const poll = await fetch(statusUrl, {
        headers: { Authorization: `Key ${key}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!poll.ok) break;
      const pj = await poll.json() as any;
      status = String(pj?.status || '');
      if (status === 'ERROR') {
        console.error('[fal-video] fal generation errored:', JSON.stringify(pj).slice(0, 300));
        return null;
      }
    }
    if (status !== 'COMPLETED') {
      console.error('[fal-video] fal video did not complete in time:', status);
      return null;
    }

    const result = await fetch(responseUrl, {
      headers: { Authorization: `Key ${key}` },
      signal: AbortSignal.timeout(30000),
    });
    if (!result.ok) {
      console.error('[fal-video] fal result fetch error:', result.status);
      return null;
    }
    const data = await result.json() as any;
    const url = data?.video?.url || (Array.isArray(data?.output) ? data.output[0] : undefined);
    if (!url) {
      console.error('[fal-video] fal result had no video URL');
      return null;
    }
    return { url, provider: `fal:${model}`, quality };
  } catch (e: any) {
    console.error('[fal-video] fal error:', e.message);
    return null;
  }
}
