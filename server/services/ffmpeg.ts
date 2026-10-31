/**
 * ffmpeg runner. Uses the ffmpeg-static binary (installed with npm, so it
 * exists on Render where there is no system ffmpeg), falling back to a
 * system `ffmpeg`. ffmpeg-static ships no ffprobe, so sizes are read from
 * ffmpeg's own stream info.
 */
import { spawn } from 'child_process';
import { createRequire } from 'module';

let cached: string | null = null;
export function ffmpegBin(): string {
  if (cached) return cached;
  try {
    const req = createRequire(import.meta.url);
    const p = req('ffmpeg-static') as string | null;
    if (p) return (cached = p);
  } catch { /* not installed */ }
  return (cached = 'ffmpeg');
}

export function runFfmpeg(args: string[], timeoutMs = 180000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegBin(), ['-hide_banner', ...args]);
    let err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg timed out')); }, timeoutMs);
    p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 200000) err = err.slice(-100000); });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); code === 0 ? resolve(err) : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-4000)}`)); });
  });
}

/** Width/height, and whether the file has an audio stream. */
export async function probe(file: string): Promise<{ width: number; height: number; hasAudio: boolean; duration: number }> {
  // `ffmpeg -i file` exits 1 (no output given) but prints the stream info.
  const info: string = await runFfmpeg(['-i', file], 30000).catch((e: Error) => e.message);
  const v = /Stream #.*Video:.*?(\d{2,5})x(\d{2,5})/.exec(info);
  if (!v) throw new Error('could not read video size');
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
  const duration = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0;
  return { width: Number(v[1]), height: Number(v[2]), hasAudio: /Stream #.*Audio:/.test(info), duration };
}
