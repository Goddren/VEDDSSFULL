/**
 * AI video clip generation via Replicate (Wan 2.2 Fast) for Ambassador
 * content — a genuinely new capability, not a fix. Every "reel" component
 * in this app (vedd-reel-player.tsx, vedd-edu-reels.tsx, etc.) is a
 * pre-scripted canvas animation with no AI video generation behind it; this
 * service is the first real text-to-video path in the codebase.
 *
 * Video generation is much slower (30s-2min+) and pricier than image
 * generation, so this is an explicit opt-in action — never auto-triggered
 * by a background job the way image generation is.
 */

export type VideoQuality = 'fast' | 'high';

export interface GeneratedVideo {
  url: string;
  provider: string; // e.g. 'replicate:wan-video/wan-2.2-t2v-fast'
  quality: VideoQuality;
}

// VEDD's signature "REBIRTH" cinematic look — the master style lock from the
// campaign bible. Kept COMPACT and placed right after the user's scene so the
// scene the user typed stays primary. The old build appended a ~350-char
// representation directive LAST; on a small/fast video model the trailing block
// dominated attention and pulled every clip toward the same generic image
// regardless of the description. Order + brevity are the fix.
const VEDD_STYLE_LOCK = '. Shot as a grainy 35mm cinematic film still: heavy analog film grain, desaturated moody color grade with one warm gold light source, shallow depth of field, photorealistic. Slow, subtle ambient motion only — no fast or shaky camera movement.';

// AI video models frequently render garbled, nonsensical on-screen text when
// a prompt implies signage, captions, or UI overlays — since none of that
// text is ever legible or brand-correct, suppress it outright rather than
// let the model guess at words. Any captions/hooks are added separately as
// a real text overlay in post, not baked into the generated clip itself.
const NO_TEXT_SUFFIX = ' No on-screen text, captions, subtitles, signage, logos or readable words anywhere in the frame — pure visual scene only.';

// Brand representation note — deliberately short and conditional so it guides
// casting WITHOUT overriding the user's actual scene. (Was a long imperative
// block that dominated the model; trimmed to a single clause.)
const HUMAN_STYLE_SUFFIX = ' If people appear: young Black people, natural skin tones, contemporary streetwear, authentic inner-city/urban setting.';

// Fast tier — cheap/quick, the default. High tier — a real quality bump:
// defaults to the SAME Wan model at 720p (which the model already supports, so
// it works out of the box with zero risk), but can be pointed at a premium
// Replicate text-to-video model (e.g. a Kling model) via VIDEO_HIGH_MODEL
// without a redeploy. Kling-style slugs get a Kling input schema automatically.
const FAST_MODEL = 'wan-video/wan-2.2-t2v-fast';
const HIGH_MODEL = process.env.VIDEO_HIGH_MODEL || 'wan-video/wan-2.2-t2v-fast';
const DEFAULT_FPS = 16;
const MIN_NUM_FRAMES = 81; // hard floor enforced by the model's own API (~5s at 16fps)
const MAX_DURATION_SECONDS = 6; // keep clips short — cost and generation time both scale with length
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 60; // 60 x 5s = 5 minutes max wait

/**
 * Generate a short AI video clip for the given prompt. Returns null (never
 * throws) if REPLICATE_API_TOKEN is missing, generation fails, or it doesn't
 * complete within the poll budget — callers should treat this as non-fatal.
 */
// Build the model-specific input body. Wan family and Kling family expect
// different parameter names; anything else gets a best-effort minimal body.
function buildModelInput(
  model: string,
  quality: VideoQuality,
  styledPrompt: string,
  numFrames: number,
  durationSeconds: number,
): Record<string, any> {
  if (model.includes('kling')) {
    return {
      prompt: styledPrompt,
      negative_prompt: 'blurry, low quality, distorted, deformed, extra limbs, watermark, text, on-screen text, subtitles',
      aspect_ratio: '9:16',
      duration: durationSeconds <= 5 ? 5 : 10, // Kling only offers 5s or 10s
      cfg_scale: 0.5,
    };
  }
  if (model.includes('wan')) {
    return {
      prompt: styledPrompt,
      resolution: quality === 'high' ? '720p' : '480p', // 720p is the real quality bump the model already supports
      num_frames: numFrames,
      frames_per_second: DEFAULT_FPS,
      aspect_ratio: '9:16',
    };
  }
  // Unknown premium model — pass the essentials and let Replicate apply defaults.
  return { prompt: styledPrompt, aspect_ratio: '9:16' };
}

export async function generateContentVideo(
  prompt: string,
  opts?: { duration?: number; quality?: VideoQuality }
): Promise<GeneratedVideo | null> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) {
    console.error('[video-generation] REPLICATE_API_TOKEN not set — cannot generate video');
    return null;
  }

  const quality: VideoQuality = opts?.quality === 'high' ? 'high' : 'fast';
  const model = quality === 'high' ? HIGH_MODEL : FAST_MODEL;
  const durationSeconds = Math.min(Math.max(opts?.duration ?? 5, 1), MAX_DURATION_SECONDS);
  const numFrames = Math.max(MIN_NUM_FRAMES, Math.round(durationSeconds * DEFAULT_FPS));
  // User's scene FIRST (primary), then a compact style/representation tail.
  const styledPrompt = `${prompt.trim()}${VEDD_STYLE_LOCK}${NO_TEXT_SUFFIX}${HUMAN_STYLE_SUFFIX}`;
  const input = buildModelInput(model, quality, styledPrompt, numFrames, durationSeconds);

  try {
    console.log(`[video-generation] quality=${quality} model=${model}`);
    const res = await fetch(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({ input }),
      // Replicate's own `Prefer: wait` window can run right up to ~60s
      // before it gives up and returns 202 "starting" instead of a
      // finished result — a 60000ms client-side abort loses that race and
      // throws "aborted due to timeout" instead of falling through to the
      // poll loop below. Give it headroom.
      signal: AbortSignal.timeout(75000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[video-generation] Replicate error:', res.status, body.slice(0, 300));
      return null;
    }

    let data = await res.json() as any;
    const getUrl = data?.urls?.get;
    for (let i = 0; i < MAX_POLLS && getUrl && (data.status === 'starting' || data.status === 'processing'); i++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const poll = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!poll.ok) break;
      data = await poll.json();
    }

    if (data.status !== 'succeeded') {
      console.error('[video-generation] Replicate video did not complete in time:', data.status, data.error ?? '');
      return null;
    }

    const output = data?.output;
    const url = Array.isArray(output) ? output[0] : output;
    if (!url) return null;
    return { url, provider: `replicate:${model}`, quality };
  } catch (e: any) {
    console.error('[video-generation] Replicate error:', e.message);
    return null;
  }
}
