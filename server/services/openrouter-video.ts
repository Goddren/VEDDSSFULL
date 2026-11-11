/**
 * AI video generation via OpenRouter — the app's PRIMARY video provider
 * since 2026-11-11: all of Chris's video credit sits on OpenRouter, while
 * Replicate and fal have no credit, so every path that generates video
 * defaults here first (video-generation.ts for clips/reels, and
 * explainer-video.ts importing generateExplainerSceneViaOpenRouter for
 * narrated scenes). Rides the OpenRouter balance the app already pays for
 * its LLM/TTS traffic instead of a separate provider bill.
 *
 * Contract for video-generation.ts mirrors fal-video.ts exactly:
 *  - a `...Configured()` check, a never-throws generate that returns a
 *    GeneratedVideo or null, the same 5s x 60 poll budget, and a
 *    `provider: "<name>:<model>"` string on the result.
 *  - Default chain position: FIRST (OpenRouter -> Replicate -> fal);
 *    VIDEO_PROVIDER=replicate or =fal still promotes that provider.
 *
 * Auth: OPENROUTER_API_KEY — the SAME platform key server/openai.ts uses for
 * the LLM chain (and routes.ts for ABBA TTS via OpenRouter). No new key.
 *
 * API shape — re-verified 2026-11-11 against the OFFICIAL docs
 * (openrouter.ai/docs video-generation guide + the submit-a-video-generation
 * API reference) and the live GET /api/v1/videos/models catalog (33 models):
 *   POST /api/v1/videos            -> 202 { id, status, polling_url }
 *   GET  <polling_url>             -> poll until status "completed"
 *   GET  /api/v1/videos/{id}/content?index=0  (Bearer auth) -> MP4 bytes
 *
 * Contract details the first version of this module got WRONG (fixed
 * 2026-11-11; each was a live-render failure mode):
 *  - polling_url is a RELATIVE path ("/api/v1/videos/<id>"), not an
 *    absolute URL — it must be resolved against the API origin before
 *    fetching, or the poll dies on an invalid/relative URL and the render
 *    is reported as timed out. Fixed via resolvePollUrl().
 *  - The job status enum is pending / in_progress / completed / failed /
 *    cancelled / expired. "expired" (OpenRouter's stored copy lapsing) is
 *    terminal and is now handled + logged with the API's error text,
 *    instead of polling on until the budget runs out.
 *  - A non-OK poll response used to silently `break` and be misreported
 *    as a timeout; it now logs the HTTP status and keeps polling (a
 *    transient blip no longer kills a paid render).
 *
 * Two differences from the Replicate/fal paths, both forced by the API:
 *  1. Durations/resolutions are per-model DISCRETE sets (Veo: 4/6/8s), and
 *     an out-of-set value is a 400 — so the requested duration is mapped to
 *     the nearest value in the model's supported_durations from the live
 *     catalog (fetched once per process; Veo's known set is the offline
 *     fallback). generate_audio is only sent when the model's catalog
 *     entry says it supports native audio.
 *  2. The content download requires the Bearer key, but the pipeline
 *     (content-video.ts branding + persistRemoteAsset) fetches result URLs
 *     WITHOUT auth — so this module downloads the bytes itself and persists
 *     them via content-asset-store, returning the app-hosted asset URL. If
 *     persistence fails it returns the raw content URL as a last resort
 *     (same fall-back-to-provider-URL philosophy as content-asset-store).
 *
 * Clips are generated SILENT (generate_audio: false) when the caller asks
 * for silence: this pipeline adds voice/captions in post, and silent
 * output bills at the cheaper rate tier. Explainer scenes pass
 * withAudio: true — their narration IS the audio track.
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
  /** true = the model should generate the audio track (explainer scenes,
   *  whose narration is spoken by the model). Default false: silent clips
   *  for the clip/reel pipeline, which adds voice in post. Only sent to
   *  models whose catalog entry supports native audio. */
  withAudio?: boolean;
  /** Veo passthrough: lines the presenter must never render (the explainer
   *  Replicate path passes one; clips rely on the style lock instead). */
  negativePrompt?: string;
  /** Longer poll budget for callers that render several scenes serially
   *  (explainers allow up to 8 minutes per scene). Default 60 polls. */
  maxPolls?: number;
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
  /** Model supports native audio output (catalog `generate_audio` flag). */
  audio?: boolean;
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
            audio: typeof m.generate_audio === 'boolean' ? m.generate_audio : undefined,
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
  if (model.includes('veo')) return { durations: [4, 6, 8], resolutions: ['720p', '1080p', '4K'], aspects: ['9:16', '16:9'], frameImages: ['first_frame', 'last_frame'], audio: true };
  return {};
}

/** The submit response's polling_url is a RELATIVE path per the official
 *  API reference ("/api/v1/videos/<id>") — resolve it against the API
 *  origin. Absolute URLs pass through unchanged. */
function resolvePollUrl(pollingUrl: string | undefined, jobId: string): string {
  if (!pollingUrl) return `${API_BASE}/videos/${jobId}`;
  try {
    return new URL(pollingUrl, 'https://openrouter.ai').toString();
  } catch {
    return `${API_BASE}/videos/${jobId}`;
  }
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
 * Shared submit/poll core for both public entry points below: submits one
 * job, polls to a terminal state (logging the API's own error text on
 * failure), downloads the MP4 bytes with auth, persists them to the app
 * asset store, and returns the same GeneratedVideo shape every other
 * provider returns. Returns null (never throws) on any failure.
 */
async function runOpenRouterVideoJob(args: {
  key: string;
  model: string;
  prompt: string;
  durationSeconds: number;
  resolution: string;
  aspect: '9:16' | '16:9';
  image?: string;
  withAudio: boolean;
  negativePrompt?: string;
  maxPolls: number;
  quality: VideoQuality;
  logTag: string;
}): Promise<GeneratedVideo | null> {
  const { key, model } = args;
  const caps = await capsFor(model);
  const duration = nearestDuration(args.durationSeconds, caps.durations);
  const resolution = pickResolution(args.resolution, caps.resolutions);

  const input: Record<string, any> = {
    model,
    prompt: args.prompt,
    duration,
    resolution,
  };
  // Only send generate_audio when the model actually supports native
  // audio — for models without it the flag is meaningless (and the API
  // reference ties it to the model's capability flag).
  if (caps.audio) input.generate_audio = args.withAudio;
  if (args.negativePrompt && model.includes('veo')) {
    // Veo-only passthrough, nested per the official guide ("Google Veo
    // models are the only video models that nest options in a parameters
    // object"); negativePrompt is in veo-3.1-fast's
    // allowed_passthrough_parameters.
    input.provider = { options: { 'google-vertex': { parameters: { negativePrompt: args.negativePrompt } } } };
  }
  if (!caps.aspects || caps.aspects.includes(args.aspect)) input.aspect_ratio = args.aspect;
  if (args.image) {
    // Image-to-video: animate FROM the supplied start image as the first
    // frame. Only sent when the model accepts a first frame (or its caps
    // are unknown); otherwise fall back to plain text-to-video below.
    if (!caps.frameImages || caps.frameImages.length === 0 || caps.frameImages.includes('first_frame')) {
      input.frame_images = [{ type: 'image_url', image_url: { url: args.image }, frame_type: 'first_frame' }];
    } else {
      console.log(`[openrouter-video] model ${model} does not accept a first frame — generating text-to-video instead`);
    }
  }

  try {
    console.log(`[openrouter-video] ${args.logTag} model=${model} mode=${input.frame_images ? 'image-to-video' : 'text-to-video'} duration=${duration}s resolution=${resolution} audio=${args.withAudio && !!caps.audio}`);
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
    const pollUrl = resolvePollUrl(queued?.polling_url, jobId);

    // Documented status enum: pending / in_progress / completed / failed /
    // cancelled / expired (the API reference also tolerates "error" from
    // some upstreams). Anything terminal-but-not-completed logs the API's
    // error field verbatim, per the official skill guidance.
    const TERMINAL_FAILURES = ['failed', 'error', 'cancelled', 'canceled', 'expired'];
    let status = String(queued?.status || 'pending');
    let lastError = '';
    for (let i = 0; i < args.maxPolls && status !== 'completed' && !TERMINAL_FAILURES.includes(status); i++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const poll = await fetch(pollUrl, {
        headers: orHeaders(key),
        signal: AbortSignal.timeout(15000),
      });
      if (!poll.ok) {
        // Transient poll failure (5xx / rate limit / network blip): log it
        // and keep polling — the previous build broke out here and
        // misreported a healthy paid render as a timeout.
        console.warn(`[openrouter-video] poll HTTP ${poll.status} for job ${jobId} — retrying`);
        continue;
      }
      const pj = await poll.json() as any;
      status = String(pj?.status || status);
      if (pj?.error) lastError = String(pj.error);
    }
    if (status !== 'completed') {
      console.error(`[openrouter-video] video ended as "${status}"${lastError ? `: ${lastError.slice(0, 300)}` : ' (poll budget exhausted or terminal failure)'}`);
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
      return { url: `${appBaseUrl()}${saved.url}`, provider: `openrouter:${model}`, quality: args.quality };
    }
    console.error('[openrouter-video] asset persistence failed — returning raw content URL (requires auth; last resort)');
    return { url: contentUrl, provider: `openrouter:${model}`, quality: args.quality };
  } catch (e: any) {
    console.error('[openrouter-video] error:', e.message);
    return null;
  }
}

/**
 * Generate a short AI video clip via OpenRouter (the clip/reel pipeline's
 * entry point). The prompt must already carry the VEDD style lock
 * (video-generation.ts builds it once for all providers). SILENT output —
 * clips get voice/captions in post. Returns null (never throws) if no key
 * is configured, generation fails, or it doesn't complete within the poll
 * budget.
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
  const model = opts.quality === 'high' ? HIGH_MODEL : FAST_MODEL;
  return runOpenRouterVideoJob({
    key,
    model,
    prompt: styledPrompt,
    durationSeconds: opts.durationSeconds,
    resolution: opts.quality === 'high' ? '1080p' : '720p',
    aspect: opts.aspect,
    image: opts.image,
    withAudio: opts.withAudio ?? false,
    negativePrompt: opts.negativePrompt,
    maxPolls: opts.maxPolls ?? MAX_POLLS,
    quality: opts.quality,
    logTag: `clip quality=${opts.quality}`,
  });
}

/**
 * Generate ONE narrated explainer scene via OpenRouter (explainer-video.ts
 * imports this; the scene pipeline needs audio — the presenter speaks the
 * narration line — and a longer wait budget than clips).
 *
 * Model selection mirrors the explainer's Replicate side: the SAME env var
 * (EXPLAINER_VIDEO_MODEL) wins when it names an OpenRouter-catalog model
 * (i.e. it contains "/"); a Replicate-style slug ("google/veo-3.1-fast" —
 * one segment, no provider namespace before the model family) falls back
 * to the OpenRouter default. Throws (instead of returning null) when no
 * key is configured so the explainer's caller can surface its existing
 * "not configured" error; generation failures return null so the caller
 * can fall back to Replicate.
 */
export async function generateExplainerSceneViaOpenRouter(args: {
  prompt: string;
  aspect: '9:16' | '16:9';
  durationSeconds: number;
  image?: string;
  negativePrompt?: string;
  maxWaitMs?: number;
}): Promise<{ url: string; predictionId: string } | null> {
  const key = orKey();
  if (!key) throw new Error('OPENROUTER_API_KEY not set');
  const envModel = (process.env.EXPLAINER_VIDEO_MODEL || '').trim();
  // EXPLAINER_VIDEO_MODEL defaults to the Replicate slug
  // "google/veo-3.1-fast"; OpenRouter's catalog id for the same model is
  // identical, so this is not theoretical — honor the env var only when
  // it names a real catalog id (checked against the live catalog), else
  // keep the OpenRouter default.
  let model = FAST_MODEL;
  if (envModel && envModel !== model) {
    if ((await fetchCatalog()).has(envModel)) model = envModel;
  }
  const maxPolls = Math.max(1, Math.floor((args.maxWaitMs ?? 8 * 60 * 1000) / POLL_INTERVAL_MS));
  const video = await runOpenRouterVideoJob({
    key,
    model,
    prompt: args.prompt,
    durationSeconds: args.durationSeconds,
    resolution: '720p',
    aspect: args.aspect,
    image: args.image,
    withAudio: true,
    negativePrompt: args.negativePrompt,
    maxPolls,
    quality: 'high',
    logTag: 'explainer scene',
  });
  if (!video) return null;
  // The persisted URL is the durable app asset URL; the "prediction id"
  // the explainer records for provenance carries the provider prefix the
  // job meta derives the rendering provider from.
  return { url: video.url, predictionId: `openrouter:${model}` };
}
