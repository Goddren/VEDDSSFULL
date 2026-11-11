/**
 * One path for every Content Studio / ambassador video:
 *   user text -> one filmable shot (video-shot.ts) -> provider render
 *   (video-generation.ts chain: OpenRouter first since 2026-11-11, then
 *   Replicate, then fal) -> VEDD branding + social-size crop
 *   (video-branding.ts) -> SOUND (video-audio.ts: narrator voiceover +
 *   music bed — every provider renders silent, so audio is a post stage)
 *   -> durable store.
 * Branding and audio are both best-effort: if ffmpeg is unavailable the
 * unbranded clip ships and `branded: false` tells the UI to show its logo
 * overlay instead; if the audio stage fails the silent clip ships and
 * `audio` in the result records what landed ('none' + reason). Either way
 * the finished URL is re-persisted into the durable store (via
 * persistBuffer, unbranded via persistRemoteAsset), so a job result never
 * points at a raw expiring provider URL unless persistence itself failed.
 */
import { planVideoShot } from './video-shot';
import { generateContentVideo, type VideoQuality } from './video-generation';
import { brandVideo, type AspectRatio } from './video-branding';
import { applyVideoAudio, videoAudioEnabled, type VideoAudioMeta } from './video-audio';
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
  backgroundScene?: string; // chosen background preset's scene text
  brand?: boolean;      // default true
  narrationText?: string; // script/caption the caller already wrote (reels) —
                          // read as the voiceover instead of generating one
}

export interface RenderedVideo {
  url: string;          // app-hosted when persisted, provider URL otherwise
  persisted: boolean;
  branded: boolean;
  shot: string;
  hook: string;
  aspect: AspectRatio;
  provider: string;
  /** Sound that landed on the clip; present only when the audio stage ran
   *  (VIDEO_AUDIO != off). narration/musicBed are 'none' when that part
   *  failed, with `reason` saying why — the render itself still succeeded. */
  audio?: VideoAudioMeta;
}

export async function renderContentVideo(prompt: string, o: RenderOptions = {}): Promise<RenderedVideo | null> {
  const aspect: AspectRatio = o.aspect && o.aspect in SOCIAL_SIZES ? o.aspect : '9:16';
  let shot = (o.shot || '').trim();
  let hook = '';
  if (!shot) {
    if (o.exact) shot = prompt.trim();
    else ({ shot, hook } = await planVideoShot(prompt, o.userId));
  }

  // A chosen background preset wins over whatever setting the planner (or
  // the user) put in the shot: append it as an explicit Setting line so
  // every render path (planned, exact, pre-written shot) honors it.
  if (o.backgroundScene) shot = `${shot} Setting: ${o.backgroundScene}.`;

  const video = await generateContentVideo(shot, {
    duration: o.duration, quality: o.quality, image: o.image,
    aspect: aspect === '16:9' ? '16:9' : '9:16',
  });
  if (!video) return null;

  const audioOn = videoAudioEnabled();
  let audio: VideoAudioMeta | undefined;
  const audioField = (): { audio?: VideoAudioMeta } => {
    if (!audioOn) return {};
    return { audio: audio ?? { narration: 'none', musicBed: 'none', reason: 'audio mix unavailable' } };
  };

  // Branding and the audio stage both work on the clip bytes. Download once
  // when either needs them; when neither does (brand off + audio off) keep
  // the old straight-to-persistRemoteAsset path untouched.
  let buf: Buffer | null = null;
  if (o.brand !== false || audioOn) {
    try {
      const res = await fetch(video.url, { signal: AbortSignal.timeout(60000) });
      if (res.ok) buf = Buffer.from(await res.arrayBuffer());
    } catch (e: any) {
      console.warn('[content-video] clip download failed:', e?.message || e);
    }
  }

  let branded = false;
  if (buf && o.brand !== false) {
    try {
      const brandedBuf = await brandVideo(buf, aspect);
      if (brandedBuf) { buf = brandedBuf; branded = true; }
    } catch (e: any) {
      console.warn('[content-video] branding step failed:', e?.message || e);
    }
  }

  // Sound last, on the final picture (so the bed also plays under the
  // branding end card). Non-fatal by design — see video-audio.ts.
  if (buf && audioOn) {
    const mixed = await applyVideoAudio(buf, {
      narrationText: o.narrationText,
      sourceText: shot,
      userId: o.userId,
    }).catch(() => null);
    if (mixed) { buf = mixed.buffer; audio = mixed.audio; }
    else audio = { narration: 'none', musicBed: 'none', reason: 'audio mix failed' };
  }

  if (buf) {
    const saved = await persistBuffer(buf, 'video/mp4');
    if (saved) return { url: saved.url, persisted: true, branded, shot, hook, aspect, provider: video.provider, ...audioField() };
  }
  const saved = await persistRemoteAsset(video.url);
  return { url: saved?.url ?? video.url, persisted: !!saved, branded: false, shot, hook, aspect, provider: video.provider, ...audioField() };
}
