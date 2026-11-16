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
 * Optional login: when the owner stores a browser-exported cookies.txt
 * in the YOUTUBE_COOKIES env var (off by default), downloads run as that
 * logged-in session via --cookies — the standard answer when the bot
 * wall still stops the client chain. The env value is a SECRET (it is
 * effectively a login token): validated in clipper-core, written to a
 * per-job temp file (0600) inside the job's workdir, deleted when the
 * download step ends, never logged, never present in any error text
 * (stderr is scrubbed of the file path before it can surface).
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
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  buildYtdlpDownloadArgs, buildYtdlpInfoArgs, classifyYtdlpError,
  parseYouTubeCookies, redactSecrets,
  ytdlpClientChain, type YtdlpErrorCode, type YouTubeCookiesParse,
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

// ─── YouTube login cookies (YOUTUBE_COOKIES env) ────────────────────────────
// Parsed once per distinct env value (env is static per boot in
// production). A malformed value warns ONCE — a static message, never
// any part of the value — and downloads proceed without a login.

let cookiesCache: { raw: string | undefined; parsed: YouTubeCookiesParse } | null = null;

export function loadYouTubeCookies(): YouTubeCookiesParse {
  const raw = process.env.YOUTUBE_COOKIES;
  if (cookiesCache && cookiesCache.raw === raw) return cookiesCache.parsed;
  const parsed = parseYouTubeCookies(raw);
  if (raw && raw.trim() && !parsed.ok) {
    console.warn('[ytdlp] YOUTUBE_COOKIES is set but is not a valid Netscape cookies.txt with youtube.com entries — ignoring it; downloads will run without a login.');
  }
  cookiesCache = { raw, parsed };
  return parsed;
}

/** True when a valid saved YouTube login is configured. */
export function youtubeCookiesConfigured(): boolean {
  return loadYouTubeCookies().ok;
}

/** Write the saved login to a per-job temp file (0600) inside `dir`.
 *  Returns the file path, or null when no valid login is configured. */
export function writeYouTubeCookiesFile(dir: string): string | null {
  const parsed = loadYouTubeCookies();
  if (!parsed.ok) return null;
  const file = path.join(dir, `.yt-cookies-${crypto.randomBytes(6).toString('hex')}.txt`);
  fs.writeFileSync(file, parsed.content, { mode: 0o600 });
  return file;
}

/** Delete a cookies temp file (best-effort; the job workdir is wiped by
 *  the caller regardless — this just shortens the secret's lifetime to
 *  the download step). */
export function removeYouTubeCookiesFile(file: string | null): void {
  if (!file) return;
  try { fs.unlinkSync(file); } catch { /* already gone */ }
}

function runYtdlp(args: string[], timeoutMs: number, scrub: (string | undefined | null)[] = []): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const bin = resolveYtdlpBin();
    // The child never inherits the cookie secret in its environment —
    // it receives the login through the --cookies file only.
    const childEnv = { ...process.env };
    delete childEnv.YOUTUBE_COOKIES;
    const p = spawn(bin, args, { env: childEnv });
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
        const raw = (stderr || stdout).trim().slice(-1500);
        // Classify on the raw text, then scrub any secret (the cookies
        // file path) out of the detail before it can reach a job record
        // or a client-visible error.
        const detail = redactSecrets(raw, scrub);
        reject(new YtdlpError(classifyYtdlpError(raw), detail || `yt-dlp exited ${code}`));
      }
    });
  });
}

export interface YouTubeInfo { title?: string; lengthSec?: number }

export async function fetchYouTubeInfo(url: string, cookiesFile?: string): Promise<YouTubeInfo> {
  const clients = ytdlpClientChain(process.env.CLIPPER_YTDLP_CLIENTS);
  const { stdout } = await runYtdlp(
    buildYtdlpInfoArgs(url, clients, noCheckCerts(), cookiesFile),
    240_000, [cookiesFile],
  );
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
  // If a saved YouTube login is configured, it applies from the very
  // first request (info included — the bot wall guards that too). The
  // temp cookie file lives only for this download step.
  const cookiesFile = writeYouTubeCookiesFile(destDir) || undefined;
  try {
    // Info first so an over-length video is refused before any download
    // (same discipline as the path this replaces).
    const info = await fetchYouTubeInfo(url, cookiesFile);
    if (info.lengthSec && info.lengthSec > opts.maxMinutes * 60) {
      throw new Error(`Video too long: exceeds the ${opts.maxMinutes} minute limit`);
    }
    const clients = ytdlpClientChain(process.env.CLIPPER_YTDLP_CLIENTS);
    const outputTemplate = path.join(destDir, 'source.%(ext)s');
    await runYtdlp(
      buildYtdlpDownloadArgs(url, {
        outputTemplate, maxBytes: opts.maxBytes, clients,
        ffmpegLocation: ffmpegBin(), noCheckCerts: noCheckCerts(), cookiesFile,
      }),
      900_000, [cookiesFile],
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
  } finally {
    removeYouTubeCookiesFile(cookiesFile || null);
  }
}
