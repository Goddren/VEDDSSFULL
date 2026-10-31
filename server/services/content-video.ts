/**
 * One path for every Content Studio / ambassador video:
 *   user text -> one filmable shot (video-shot.ts) -> Replicate render
 *   -> VEDD branding + social-size crop (video-branding.ts) -> durable store.
 * Branding is best-effort: if ffmpeg is unavailable the unbranded clip ships
 * and `branded: false` tells the UI to show its logo overlay instead.
 */
import { planVideoShot } from './video-shot';
import { generateContentVideo, type VideoQuality } from './video-generation';
import { brandVideo, type AspectRatio } from './video-branding';
import { persistBuffer, persistRemoteAsset } from './content-asset-store';

export const SOCIAL_SIZES: Record<AspectRatio, string> = {
  '9:16': 'Reels / TikTok / Shorts / Stories',
  '1:1': 'Square feed post',
  '4:5': 'Instagram / Facebook feed (portrait)',
  '16:9': 'YouTube / landscape',
};

export interface RenderOptions {
  userId?: number;
  shot?: string;        // already-approved shot; skips planning
  exact?: boolean;      // send the prompt as-is (power users)
  aspect?: AspectRatio;
  quality?: VideoQuality;
  duration?: number;
  image?: string;
  brand?: boolean;      // default true
}

export interface RenderedVideo {
  url: string;          // app-hosted when persisted, provider URL otherwise
  persisted: boolean;
  branded: boolean;
  shot: string;
  hook: string;
  aspect: AspectRatio;
  provider: string;
}

export async function renderContentVideo(prompt: string, o: RenderOptions = {}): Promise<RenderedVideo | null> {
  const aspect: AspectRatio = o.aspect && o.aspect in SOCIAL_SIZES ? o.aspect : '9:16';
  let shot = (o.shot || '').trim();
  let hook = '';
  if (!shot) {
    if (o.exact) shot = prompt.trim();
    else ({ shot, hook } = await planVideoShot(prompt, o.userId));
  }

  const video = await generateContentVideo(shot, {
    duration: o.duration, quality: o.quality, image: o.image,
    aspect: aspect === '16:9' ? '16:9' : '9:16',
  });
  if (!video) return null;

  if (o.brand !== false) {
    try {
      const res = await fetch(video.url, { signal: AbortSignal.timeout(60000) });
      if (res.ok) {
        const branded = await brandVideo(Buffer.from(await res.arrayBuffer()), aspect);
        if (branded) {
          const saved = await persistBuffer(branded, 'video/mp4');
          if (saved) return { url: saved.url, persisted: true, branded: true, shot, hook, aspect, provider: video.provider };
        }
      }
    } catch (e: any) {
      console.warn('[content-video] branding step failed:', e?.message || e);
    }
  }
  const saved = await persistRemoteAsset(video.url);
  return { url: saved?.url ?? video.url, persisted: !!saved, branded: false, shot, hook, aspect, provider: video.provider };
}
