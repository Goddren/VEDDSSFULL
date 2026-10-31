/**
 * VEDD branding for generated clips, added after rendering (AI video models
 * garble any text or logo they try to draw): a small logo watermark in the
 * bottom-right corner plus a 1.5s end card with the logo on VEDD navy.
 *
 * Uses ffmpeg-static (server/services/ffmpeg.ts), falling back to system ffmpeg.
 * Returns null on any failure so callers can ship the unbranded clip.
 */
import { runFfmpeg, probe as probeVideo } from './ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';

// The real VEDD logo PNG (same file as components/ui/vedd-logo.tsx).
// Not icons/icon-512x512.png: that file is an SVG with a .png name.
const LOGO_CANDIDATES = [
  path.resolve(process.cwd(), 'attached_assets/IMG_3645.png'),
];
const END_CARD_SECONDS = 1.5;
const FPS = 16;
const NAVY = '0x080B14';

export function findLogo(): string | null {
  return LOGO_CANDIDATES.find((p) => fs.existsSync(p)) ?? null;
}

/** Width:height of the final clip. The source is center-cropped to it first. */
export type AspectRatio = '9:16' | '1:1' | '4:5' | '16:9';
const RATIO: Record<AspectRatio, number> = { '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9 };

export async function brandVideo(video: Buffer, aspect: AspectRatio = '9:16'): Promise<Buffer | null> {
  const logo = findLogo();
  if (!logo) { console.warn('[video-branding] logo not found; skipping branding'); return null; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vedd-brand-'));
  const src = path.join(dir, 'in.mp4');
  const dst = path.join(dir, 'out.mp4');
  try {
    fs.writeFileSync(src, video);
    const { width: sw, height: sh } = await probeVideo(src);
    const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
    // Center-crop to the target ratio (e.g. 9:16 source -> 1:1 or 4:5 feed post).
    const r = RATIO[aspect] ?? RATIO['9:16'];
    const w = even(sw / sh > r ? sh * r : sw);
    const h = even(sw / sh > r ? sh : sw / r);
    const wm = even(w * 0.16);
    const margin = Math.round(w * 0.04);
    const card = even(w * 0.42);
    const filter = [
      `[1:v]scale=${wm}:-1,format=rgba,colorchannelmixer=aa=0.85[wm]`,
      `[0:v]crop=${w}:${h}[src]`,
      `[src][wm]overlay=W-w-${margin}:H-h-${margin},fps=${FPS},format=yuv420p,setsar=1[main]`,
      `[2:v]scale=${card}:-1,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${NAVY},fps=${FPS},format=yuv420p,setsar=1[card]`,
      `[main][card]concat=n=2:v=1:a=0[out]`,
    ].join(';');
    await runFfmpeg([
      '-y', '-i', src, '-i', logo, '-loop', '1', '-t', String(END_CARD_SECONDS), '-i', logo,
      '-filter_complex', filter, '-map', '[out]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dst,
    ]);
    return fs.readFileSync(dst);
  } catch (e: any) {
    console.warn('[video-branding] branding failed, shipping unbranded clip:', e?.message || e);
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
