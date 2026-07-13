/**
 * Shared on-brand image generation for VEDD content surfaces (blog posts,
 * devotionals, Ambassador Prime social content, Content Studio cards, etc).
 * Tries DALL-E 3 first, falls back to Replicate FLUX.1-schnell (cheaper,
 * no per-image OpenAI billing dependency) if DALL-E is unavailable/fails.
 */
import { OpenAI } from 'openai';

// Appended to every generated-image prompt so content stays visually on-brand
// regardless of what the caller's own prompt describes. Palette pulled from
// client/src/index.css: dark navy/charcoal background (hsl(220,15%,8%)),
// vivid orange-red primary accent (hsl(10,100%,55%)).
export const BRAND_STYLE_SUFFIX = ', in the visual style of a modern fintech trading platform: deep navy and charcoal background, vivid orange-red accent highlights, clean sharp UI elements, professional dark-mode dashboard aesthetic, high contrast, no clutter';

// VEDD's audience and representation direction: this platform speaks to
// inner-city communities building wealth through trading — the people shown
// should reflect that, not a generic stock-photo cast. Appended to every
// generated-image prompt alongside the brand suffix above.
export const HUMAN_STYLE_SUFFIX = '. If depicting people: they are Black, Brown, or Indigenous people of color with natural skin tones, styled in contemporary urban/hip-hop-inspired fashion (streetwear, fresh sneakers, gold chains, fitted caps), shown with smartphones and modern tech, in authentic inner-city settings — no generic stock-photo corporate look.';

export interface GeneratedImage {
  url: string;
  provider: 'dall-e-3' | 'replicate-flux-schnell';
}

// ── DALL-E image generation ───────────────────────────────────────────────────
async function generateDalleImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const openai = new OpenAI({ apiKey, maxRetries: 2, timeout: 60000 });
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    });
    return res.data?.[0]?.url ?? null;
  } catch (e: any) {
    const status = e?.status ?? e?.statusCode;
    if (status === 429 || /quota|insufficient_quota/i.test(e?.message || '')) {
      console.error('[image-generation] DALL-E quota exceeded — check OpenAI billing/plan:', e.message);
    } else {
      console.error('[image-generation] DALL-E error:', e.message);
    }
    return null;
  }
}

// ── Replicate (FLUX.1-schnell) image generation — cheaper fallback for DALL-E ──
// FLUX.1-schnell is fast (usually <1s) but the synchronous `Prefer: wait`
// response can still come back as "starting"/"processing" (202) rather than
// a finished result, especially for longer prompts — so we poll the
// prediction's own status URL until it settles instead of assuming the first
// response is final.
async function generateFluxImage(prompt: string, retriesLeft = 2): Promise<string | null> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify({ input: { prompt, aspect_ratio: '1:1', output_format: 'png' } }),
      // Replicate's own `Prefer: wait` window can run right up to ~60s
      // (observed 60.7s in testing) before it gives up and returns 202
      // "starting" instead of a finished result — a 60000ms client-side
      // abort loses that race and throws "aborted due to timeout" instead
      // of falling through to the poll loop below. Give it headroom.
      signal: AbortSignal.timeout(75000),
    });
    if (res.status === 429 && retriesLeft > 0) {
      // Low-credit Replicate accounts get throttled to a handful of
      // requests/minute with a burst of 1 — real when generating several
      // images back to back (e.g. one per carousel slide). Replicate tells
      // us how long to wait in the error body.
      const body = await res.text().catch(() => '');
      let retryAfterSeconds = 10;
      try { retryAfterSeconds = JSON.parse(body)?.retry_after ?? retryAfterSeconds; } catch { /* use default */ }
      console.warn(`[image-generation] Replicate FLUX rate-limited, retrying in ${retryAfterSeconds}s (${retriesLeft} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, (retryAfterSeconds + 1) * 1000));
      return generateFluxImage(prompt, retriesLeft - 1);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[image-generation] Replicate FLUX error:', res.status, body.slice(0, 300));
      return null;
    }
    let data = await res.json() as any;

    const getUrl = data?.urls?.get;
    for (let i = 0; i < 20 && getUrl && (data.status === 'starting' || data.status === 'processing'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const poll = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!poll.ok) break;
      data = await poll.json();
    }

    if (data.status !== 'succeeded') {
      console.error('[image-generation] Replicate FLUX did not complete in time:', data.status, data.error ?? '');
      return null;
    }
    const output = data?.output;
    const url = Array.isArray(output) ? output[0] : output;
    return url ?? null;
  } catch (e: any) {
    console.error('[image-generation] Replicate FLUX error:', e.message);
    return null;
  }
}

/**
 * Generate an on-brand image for the given prompt, trying DALL-E first and
 * falling back to Replicate FLUX. Returns null (never throws) if both fail
 * or neither API key is configured — callers should treat a missing image
 * as non-fatal.
 */
export async function generateContentImage(prompt: string): Promise<GeneratedImage | null> {
  const brandedPrompt = `${prompt}${BRAND_STYLE_SUFFIX}${HUMAN_STYLE_SUFFIX}`;

  const dalleUrl = await generateDalleImage(brandedPrompt);
  if (dalleUrl) return { url: dalleUrl, provider: 'dall-e-3' };

  const fluxUrl = await generateFluxImage(brandedPrompt);
  if (fluxUrl) return { url: fluxUrl, provider: 'replicate-flux-schnell' };

  return null;
}
