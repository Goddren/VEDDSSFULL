/**
 * AI video clip generation via OpenRouter — the app's third video provider,
 * added so Content Studio clips/reels have a fallback beyond Replicate and
 * fal.ai, riding the OpenRouter balance the app already pays for its LLM/TTS
 * traffic instead of a separate provider bill.
 *
 * Mirrors fal-video.ts exactly — same contract for video-generation.ts:
 *  - a `...Configured()` check, a never-throws generate that returns a
 *    GeneratedVideo or null, the same 5s x 60 poll budget, and a
 *    `provider: "<name>:<model>"` string on the result.
 *  - as the last fallback in the default chain (Replicate -> fal ->
 *    OpenRouter), and as the primary when VIDEO_PROVIDER=openrouter
 *    (Replicate and fal become the fallbacks).
 *
 * Auth: OPENROUTER_API_KEY — the SAME platform key server/openai.ts uses for
 * the LLM chain (and routes.ts for ABBA TTS via OpenRouter). No new key.
 *
 * API shape (OpenRouter video generation, verified live 2026-11-10 against
 * GET /api/v1/videos/models — 33 models):
 *   POST /api/v1/videos            -> { id, status, polling_url }
 *   GET  <polling_url>             -> poll until status "completed"
 *   GET  /api/v1/videos/{id}/content?index=0  (Bearer auth) -> MP4 bytes
 *
 * Two differences from the Replicate/fal paths, both forced by the API:
 *  1. Durations/resolutions are per-model DISCRETE sets (Veo: 4/6/8s), and an
 *     out-of-set value is a 400 — so the requested duration is mapped to the
 *     nearest value in the model's supported_durations from the live catalog
 *     (fetched once per process; Veo's known set is the offline fallback).
 *  2. The content download requires the Bearer key, but the pipeline
 *     (content-video.ts branding + persistRemoteAsset) fetches result URLs
 *     WITHOUT auth — so this module downloads the bytes itself and persists
 *     them via content-asset-store, returning the app-hosted asset URL. If
 *     persistence fails it returns the raw content URL as a last resort
 *     (same fall-back-to-provider-URL philosophy as content-asset-store).
 *
 * Clips are generated SILENT (generate_audio: false): this pipeline adds
 * voice/captions in post, and silent output bills at the cheaper rate tier.
 *
 * Models are env-swappable without a redeploy, same pattern as
 * VIDEO_HIGH_MODEL / FAL_VIDEO_MODEL:
 *   OPENROUTER_VIDEO_MODEL        (default: google/veo-3.1-fast)
 *   OPENROUTER_VIDEO_HIGH_MODEL   (default: same as OPENROUTER_VIDEO_MODEL)
 * One model serves both text-to-video and image-to-video (first frame via
 * frame_images), so there are no separate i2v model knobs.
 */

import type { GeneratedVideo, VideoQuality } from './video-generation';
import { persistBuffer } from './content-asset-store';

export interface OpenRouterVideoOpts {
  durationSeconds: number;
  numFrames: number;
  fps: number;
  quality: VideoQuality;
  image?: string; // optional start image (public URL or data URI) for image-to-video
  aspect: '9:16' | '16:9';
}

const FAST_MODEL = process.env.OPENROUTER_VIDEO_MODEL || 'google/veo-3.1-fast';
const HIGH_MODEL = process.env.OPENROUTER_VIDEO_HIGH_MODEL || FAST_MODEL;
const API_BASE = 'https://openrouter.ai/api/v1';
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 60; // 60 x 5s = 5 minutes max wait, same budget as the Replicate/fal paths

export function openrouterConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

function orKey(): string | null {
  return process.env.OPENROUTER_API_KEY || null;
}

function orHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    // House convention for OpenRouter calls (news-service.ts, routes.ts).
    'HTTP-Referer': 'https://veddbuild.com',
    'X-Title': 'VEDDBuild',
  };
}

// ── Per-model capability mapping ────────────────────────────────────────────
// The catalog is fetched once per process and cached; any failure falls back
// to the known Veo sets for veo models and pass-through for everything else,
// so a catalog outage never blocks a render.
interface ModelCaps {
  durations?: number[];
  resolutions?: string[];
  aspects?: string[];
  frameImages?: string[];
}

let catalogPromise: Promise<Map<string, ModelCaps>> | null = null;

function fetchCatalog(): Promise<Map<string, ModelCaps>> {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const map = new Map<string, ModelCaps>();
      try {
        const res = await fetch(`${API_BASE}/videos/models`, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return map;
        const data = await res.json() as any;
        for (const m of (Array.isArray(data?.data) ? data.data : [])) {
          if (!m?.id) continue;
          map.set(m.id, {
            durations: Array.isArray(m.supported_durations) ? m.supported_durations.map(Number).filter((n: number) => n > 0) : undefined,
            resolutions: Array.isArray(m.supported_resolutions) ? m.supported_resolutions : undefined,
            aspects: Array.isArray(m.supported_aspect_ratios) ? m.supported_aspect_ratios : undefined,
            frameImages: Array.isArray(m.supported_frame_images) ? m.supported_frame_images : undefined,
          });
        }
      } catch (e: any) {
        console.error('[openrouter-video] model catalog fetch failed:', e.message);
      }
      return map;
    })();
  }
  return catalogPromise;
}

async function capsFor(model: string): Promise<ModelCaps> {
  const fromCatalog = (await fetchCatalog()).get(model);
  if (fromCatalog) return fromCatalog;
  // Offline fallback: Veo's discrete sets are stable and known.
  if (model.includes('veo')) return { durations: [4, 6, 8], resolutions: ['720p', '1080p', '4K'], aspects: ['9:16', '16:9'], frameImages: ['first_frame', 'last_frame'] };
  return {};
}

function nearestDuration(requested: number, supported?: number[]): number {
  if (!supported || supported.length === 0) return requested;
  let best = supported[0];
  for (const d of supported) {
    const dist = Math.abs(d - requested);
    const bestDist = Math.abs(best - requested);
    if (dist < bestDist || (dist === bestDist && d > best)) best = d; // ties go to the longer clip
  }
  return best;
}

const RES_RANK = ['360p', '480p', '720p', '1080p', '2K', '4K'];
function pickResolution(want: string, supported?: string[]): string {
  if (!supported || supported.length === 0 || supported.includes(want)) return want;
  const wantRank = RES_RANK.indexOf(want);
  const atOrBelow = supported.filter((r) => RES_RANK.indexOf(r) >= 0 && RES_RANK.indexOf(r) <= wantRank);
  if (atOrBelow.length) return atOrBelow.sort((a, b) => RES_RANK.indexOf(b) - RES_RANK.indexOf(a))[0];
  return supported[0];
}

function appBaseUrl(): string {
  // Same base-URL convention as auth.ts / stripe.ts.
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'https://veddbuild.com').replace(/\/$/, '');
}

/**
 * Generate a short AI video clip via OpenRouter. The prompt must already
 * carry the VEDD style lock (video-generation.ts builds it once for all
 * providers). Returns null (never throws) if no key is configured,
 * generation fails, or it doesn't complete within the poll budget.
 */
export async function generateOpenRouterVideo(
  styledPrompt: string,
  opts: OpenRouterVideoOpts,
): Promise<GeneratedVideo | null> {
  const key = orKey();
  if (!key) {
    console.error('[openrouter-video] OPENROUTER_API_KEY not set — cannot generate video');
    return null;
  }

  const { quality, image } = opts;
  const model = quality === 'high' ? HIGH_MODEL : FAST_MODEL;
  const caps = await capsFor(model);
  const duration = nearestDuration(opts.durationSeconds, caps.durations);
  const resolution = pickResolution(quality === 'high' ? '1080p' : '720p', caps.resolutions);

  const input: Record<string, any> = {
    model,
    prompt: styledPrompt,
    duration,
    resolution,
    generate_audio: false, // silent clips — VO/captions are post-production in this pipeline
  };
  if (!caps.aspects || caps.aspects.includes(opts.aspect)) input.aspect_ratio = opts.aspect;
  if (image) {
    // Image-to-video: animate FROM the supplied start image as the first
    // frame. Only sent when the model accepts a first frame (or its caps
    // are unknown); otherwise fall back to plain text-to-video below.
    if (!caps.frameImages || caps.frameImages.length === 0 || caps.frameImages.includes('first_frame')) {
      input.frame_images = [{ type: 'image_url', image_url: { url: image }, frame_type: 'first_frame' }];
    } else {
      console.log(`[openrouter-video] model ${model} does not accept a first frame — generating text-to-video instead`);
    }
  }

  try {
    console.log(`[openrouter-video] quality=${quality} model=${model} mode=${input.frame_images ? 'image-to-video' : 'text-to-video'} duration=${duration}s resolution=${resolution}`);
    const submit = await fetch(`${API_BASE}/videos`, {
      method: 'POST',
      headers: orHeaders(key),
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30000),
    });
    if (!submit.ok) {
      const body = await submit.text().catch(() => '');
      console.error('[openrouter-video] submit error:', submit.status, body.slice(0, 300));
      return null;
    }
    const queued = await submit.json() as any;
    const jobId = queued?.id;
    if (!jobId) {
      console.error('[openrouter-video] submit returned no job id');
      return null;
    }
    const pollUrl = queued?.polling_url || `${API_BASE}/videos/${jobId}`;

    let status = String(queued?.status || 'pending');
    for (let i = 0; i < MAX_POLLS && status !== 'completed'; i++) {
      if (status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled') break;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const poll = await fetch(pollUrl, {
        headers: orHeaders(key),
        signal: AbortSignal.timeout(15000),
      });
      if (!poll.ok) break;
      const pj = await poll.json() as any;
      status = String(pj?.status || '');
    }
    if (status !== 'completed') {
      console.error('[openrouter-video] video did not complete in time:', status);
      return null;
    }

    // Download the bytes with auth (the content endpoint 401s without it),
    // then persist into the app's asset store so the rest of the pipeline
    // can fetch/brand the result without the key, like every other provider.
    const contentUrl = `${API_BASE}/videos/${jobId}/content?index=0`;
    const download = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(60000),
    });
    if (!download.ok) {
      console.error('[openrouter-video] content download error:', download.status);
      return null;
    }
    const mimeType = download.headers.get('content-type') || 'video/mp4';
    const buf = Buffer.from(await download.arrayBuffer());
    const saved = await persistBuffer(buf, mimeType);
    if (saved) {
      return { url: `${appBaseUrl()}${saved.url}`, provider: `openrouter:${model}`, quality };
    }
    console.error('[openrouter-video] asset persistence failed — returning raw content URL (requires auth; last resort)');
    return { url: contentUrl, provider: `openrouter:${model}`, quality };
  } catch (e: any) {
    console.error('[openrouter-video] error:', e.message);
    return null;
  }
}
