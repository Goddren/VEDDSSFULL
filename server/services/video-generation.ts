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

export interface GeneratedVideo {
  url: string;
  provider: 'replicate-wan-2.2-fast';
}

// VEDD's audience and representation direction: this platform speaks to
// inner-city communities building wealth through trading — the people shown
// should reflect that, not a generic stock-footage cast. Appended to every
// generated-video prompt, same directive used in image-generation.ts.
const HUMAN_STYLE_SUFFIX = '. If depicting people: they are Black, Brown, or Indigenous people of color with natural skin tones, styled in contemporary urban/hip-hop-inspired fashion (streetwear, fresh sneakers, gold chains, fitted caps), shown with smartphones and modern tech, in authentic inner-city settings — no generic stock-footage corporate look.';

const MODEL = 'wan-video/wan-2.2-t2v-fast';
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
export async function generateContentVideo(
  prompt: string,
  opts?: { duration?: number }
): Promise<GeneratedVideo | null> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) {
    console.error('[video-generation] REPLICATE_API_TOKEN not set — cannot generate video');
    return null;
  }

  const durationSeconds = Math.min(Math.max(opts?.duration ?? 5, 1), MAX_DURATION_SECONDS);
  const numFrames = Math.max(MIN_NUM_FRAMES, Math.round(durationSeconds * DEFAULT_FPS));
  const styledPrompt = `${prompt}${HUMAN_STYLE_SUFFIX}`;

  try {
    const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({
        input: {
          prompt: styledPrompt,
          resolution: '480p', // cheaper/faster than 720p — fine for social clips
          num_frames: numFrames,
          frames_per_second: DEFAULT_FPS,
          aspect_ratio: '9:16', // vertical — matches Reels/Stories/TikTok format
        },
      }),
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
    return { url, provider: 'replicate-wan-2.2-fast' };
  } catch (e: any) {
    console.error('[video-generation] Replicate error:', e.message);
    return null;
  }
}
