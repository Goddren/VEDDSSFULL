/**
 * yt-dlp runner — the clipper's YouTube ingestion.
 *
 * Replaces @distube/ytdl-core (PR #82's path, confirmed broken in
 * production 2026-11-15): from a datacenter IP, YouTube's web player
 * answers LOGIN_REQUIRED ("Sign in to confirm you're not a bot") with NO
 * streaming formats at all, so a library built on the web player can
 * never succeed server-side — and its error text matched none of the
 * job's friendly-error patterns, degrading to a generic "hit a problem".
 *
 * yt-dlp is the industry-standard answer: actively maintained against
 * YouTube's changes, and its multi-client fallback (tv → ios → android
 * → web_safari, see clipper-core) reaches formats the web player refuses
 * to hand a server. Verified end-to-end 2026-11-15: info + a real
 * download of a public video, ffprobe-confirmed (h264 + AAC).
 *
 * The binary is PINNED (YTDLP_VERSION) and fetched by
 * scripts/fetch-ytdlp.mjs (postinstall, SHA256-verified against the
 * release sums) into server/assets/bin/. This module has NO db imports
 * so it can be exercised standalone in checks and local verification.
 *
 * Failures throw YtdlpError tagged with a stable code (clipper-core's
 * classifyYtdlpError / ytdlpErrorMessage) so the job always surfaces the
 * real, plain-language reason.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  buildYtdlpDownloadArgs, buildYtdlpInfoArgs, classifyYtdlpError,
  ytdlpClientChain, type YtdlpErrorCode,
} from './clipper-core';
import { ffmpegBin } from './ffmpeg';

export const YTDLP_VERSION = '2026.10.26';

export class YtdlpError extends Error {
  ytdlpCode: YtdlpErrorCode;
  constructor(code: YtdlpErrorCode, detail: string) {
    super(detail);
    this.name = 'YtdlpError';
    this.ytdlpCode = code;
  }
}

/** Resolution order: explicit env override → the pinned bundled binary
 *  (postinstall-fetched) → a `yt-dlp` on PATH. */
export function resolveYtdlpBin(): string {
  if (process.env.CLIPPER_YTDLP_PATH) return process.env.CLIPPER_YTDLP_PATH;
  const bundled = path.join(
    process.cwd(), 'server', 'assets', 'bin',
    process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp',
  );
  if (fs.existsSync(bundled)) return bundled;
  return 'yt-dlp';
}

function noCheckCerts(): boolean {
  // Troubleshooting knob for deployments behind a TLS-intercepting
  // proxy; OFF by default — production talks to YouTube directly.
  return process.env.CLIPPER_YTDLP_NO_CHECK_CERTS === '1';
}

function runYtdlp(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const bin = resolveYtdlpBin();
    const p = spawn(bin, args, { env: process.env });
    let stdout = '', stderr = '';
    const cap = (s: string) => (s.length > 400_000 ? s.slice(-200_000) : s);
    const t = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new YtdlpError('network', `yt-dlp timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    p.stdout.on('data', (d) => { stdout = cap(stdout + d.toString()); });
    p.stderr.on('data', (d) => { stderr = cap(stderr + d.toString()); });
    p.on('error', (e: any) => {
      clearTimeout(t);
      if (e?.code === 'ENOENT') {
        reject(new YtdlpError('binary-missing', `yt-dlp binary not found (looked for ${bin})`));
      } else reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const detail = (stderr || stdout).trim().slice(-1500);
        reject(new YtdlpError(classifyYtdlpError(detail), detail || `yt-dlp exited ${code}`));
      }
    });
  });
}

export interface YouTubeInfo { title?: string; lengthSec?: number }

export async function fetchYouTubeInfo(url: string): Promise<YouTubeInfo> {
  const clients = ytdlpClientChain(process.env.CLIPPER_YTDLP_CLIENTS);
  const { stdout } = await runYtdlp(buildYtdlpInfoArgs(url, clients, noCheckCerts()), 240_000);
  let parsed: any = null;
  try { parsed = JSON.parse(stdout.trim()); } catch { /* fall through */ }
  if (!parsed) throw new YtdlpError('unknown', 'yt-dlp returned no video info');
  return {
    title: typeof parsed.title === 'string' ? parsed.title : undefined,
    lengthSec: Number(parsed.duration || 0) || undefined,
  };
}

export async function downloadYouTubeVideo(
  url: string,
  destDir: string,
  opts: { maxMinutes: number; maxBytes: number },
): Promise<{ file: string; title?: string; lengthSec?: number }> {
  // Info first so an over-length video is refused before any download
  // (same discipline as the path this replaces).
  const info = await fetchYouTubeInfo(url);
  if (info.lengthSec && info.lengthSec > opts.maxMinutes * 60) {
    throw new Error(`Video too long: exceeds the ${opts.maxMinutes} minute limit`);
  }
  const clients = ytdlpClientChain(process.env.CLIPPER_YTDLP_CLIENTS);
  const outputTemplate = path.join(destDir, 'source.%(ext)s');
  await runYtdlp(
    buildYtdlpDownloadArgs(url, {
      outputTemplate, maxBytes: opts.maxBytes, clients,
      ffmpegLocation: ffmpegBin(), noCheckCerts: noCheckCerts(),
    }),
    900_000,
  );
  // --merge-output-format mp4 makes source.mp4 the expected result; fall
  // back to any produced media file rather than failing on the name.
  const produced = fs.readdirSync(destDir)
    .filter((f) => /^source\.(mp4|webm|mov|m4v|mkv)$/i.test(f))
    .sort((a, b) => (a.endsWith('.mp4') ? 0 : 1) - (b.endsWith('.mp4') ? 0 : 1));
  if (!produced.length) throw new YtdlpError('unknown', 'yt-dlp finished but produced no video file');
  const file = path.join(destDir, produced[0]);
  const size = fs.statSync(file).size;
  if (size > opts.maxBytes) throw new Error('Video file too large to process');
  return { file, title: info.title, lengthSec: info.lengthSec };
}
