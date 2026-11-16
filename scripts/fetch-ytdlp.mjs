#!/usr/bin/env node
/**
 * Fetch the PINNED yt-dlp binary for the AI Clipper's YouTube ingestion
 * (server/services/ytdlp.ts). Runs as the package postinstall.
 *
 * - Version is pinned (YTDLP_VERSION) and every asset's SHA256 is pinned
 *   below from that release's official SHA2-256SUMS — a download that
 *   doesn't match is deleted, never installed.
 * - Lands in server/assets/bin/ (gitignored — a 41MB binary doesn't
 *   belong in git; this mirrors how ffmpeg-static's binary arrives via
 *   its own postinstall and exists on Render).
 * - FAIL-SOFT by design: any failure (offline build, GitHub down) logs a
 *   warning and exits 0 so `npm install` never breaks. The clipper then
 *   reports the honest "downloader tool is missing" message at runtime
 *   and the upload path still works. `--strict` turns failures into a
 *   non-zero exit for manual runs.
 */
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const YTDLP_VERSION = '2026.10.26';

// From https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/SHA2-256SUMS
export const YTDLP_ASSETS = {
  'linux-x64': { file: 'yt-dlp_linux', sha256: '767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795' },
  'linux-arm64': { file: 'yt-dlp_linux_aarch64', sha256: 'e87e9533e89fe5889abaa21f5114dfe7756d6aa6219b83551add04d48b18e483' },
  'darwin-x64': { file: 'yt-dlp_macos', sha256: '0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa' },
  'darwin-arm64': { file: 'yt-dlp_macos', sha256: '0f922c15ccc0b83eefa1c8bc9104e434318c4bf16e408e1ee93b7745a6efe0aa' },
  'win32-x64': { file: 'yt-dlp.exe', sha256: 'f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d' },
};

const STRICT = process.argv.includes('--strict');
const FORCE = process.argv.includes('--force');

function warn(msg) {
  console.warn(`[fetch-ytdlp] ${msg}`);
  if (STRICT) process.exit(1);
}

async function main() {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const binDir = path.join(root, 'server', 'assets', 'bin');
  const isWin = process.platform === 'win32';
  const dest = path.join(binDir, isWin ? 'yt-dlp.exe' : 'yt-dlp');
  const key = `${process.platform}-${process.arch}`;
  const asset = YTDLP_ASSETS[key];
  if (!asset) { warn(`no pinned asset for platform ${key} — skipping`); return; }

  if (!FORCE && fs.existsSync(dest)) {
    const v = spawnSync(dest, ['--version'], { timeout: 30_000, encoding: 'utf8' });
    if (String(v.stdout || '').trim() === YTDLP_VERSION) {
      console.log(`[fetch-ytdlp] yt-dlp ${YTDLP_VERSION} already installed`);
      return;
    }
  }

  const url = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${asset.file}`;
  console.log(`[fetch-ytdlp] downloading yt-dlp ${YTDLP_VERSION} (${asset.file})…`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) { warn(`download failed: HTTP ${res.status}`); return; }
  fs.mkdirSync(binDir, { recursive: true });
  const tmp = `${dest}.download`;
  const hash = createHash('sha256');
  const out = fs.createWriteStream(tmp);
  for await (const chunk of res.body) { hash.update(chunk); out.write(chunk); }
  await new Promise((resolve, reject) => { out.end(resolve); out.on('error', reject); });
  const digest = hash.digest('hex');
  if (digest !== asset.sha256) {
    fs.rmSync(tmp, { force: true });
    warn(`SHA256 mismatch for ${asset.file} (got ${digest}) — refusing to install`);
    return;
  }
  fs.renameSync(tmp, dest);
  if (!isWin) fs.chmodSync(dest, 0o755);
  const v = spawnSync(dest, ['--version'], { timeout: 30_000, encoding: 'utf8' });
  const printed = String(v.stdout || '').trim();
  if (printed !== YTDLP_VERSION) { warn(`installed binary reports version "${printed}", expected ${YTDLP_VERSION}`); return; }
  console.log(`[fetch-ytdlp] yt-dlp ${YTDLP_VERSION} installed at ${path.relative(root, dest)} (sha256 verified)`);
}

main().catch((e) => warn(`failed: ${e?.message || e}`));
