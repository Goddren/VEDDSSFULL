// ─────────────────────────────────────────────────────────────────────────────
// Standalone ALWAYS-ON crypto worker — a resilient alternative to the Render
// Cron Job, which kept silently not firing (crypto went dark for 37h twice).
//
// This runs the scanner's OWN 3-minute interval loop (startCryptocomEngineScanner)
// in a dedicated long-lived process, so there is NO dependency on Render's cron
// scheduler firing. Key properties:
//   • Isolated from the web service — ethers/DeFi stack loads ONLY here, never in
//     the web process, so a crypto OOM can never take down FX/TradeLocker/DXtrade.
//   • Self-healing — if this worker crashes or OOMs, Render's Background Worker
//     auto-restart brings just THIS process back; the web service is untouched.
//   • The memory-leak fixes (scan re-entrancy guard + ethers provider.destroy)
//     keep it stable; the re-entrancy guard also prevents overlapping scans.
//
// DEPLOY: run as a Render BACKGROUND WORKER (not a Cron Job), in the SAME REGION
// as the database — Render's internal DB hostname only resolves within one
// region, and a worker in Ohio against an Oregon database simply never connects.
//
//   build:  npm install --legacy-peer-deps --ignore-scripts
//   start:  npm run crypto-worker
//
// NOT `npm run build`. That runs vite, which OOMs on Render — the reason dist/
// is committed and served as-is. Building here fails the deploy, and Render then
// keeps the PREVIOUS instance running, so a broken deploy looks like a worker
// that simply ignores your redeploys.
//
// Env (Render does NOT copy env vars between services — a new worker starts with
// none, and with no DATABASE_URL db.ts silently falls back to localhost):
//   DATABASE_URL, ZEROX_API_KEY, NODE_ENV=production, NODE_VERSION=22.11.0
//
// Do NOT set CRYPTOCOM_ENCRYPTION_KEY here. Verified 2026-09-20: the stored
// hot-wallet key decrypts with the hardcoded DEFAULT, i.e. the var is unset in
// production. Setting it on one service and not another breaks every decrypt.
// API_KEY_ENCRYPTION_SECRET is not used on this path at all.
//
// Keep ENABLE_CRYPTO_ENGINE UNSET/false on the WEB service so the web process
// never runs the scanner too.
// (The one-shot dist/crypto-cron.js entry point remains for anyone still on a
// Cron Job; this worker supersedes it.)
// ─────────────────────────────────────────────────────────────────────────────

import { startCryptocomEngineScanner } from './services/cryptocom-scanner';

process.on('uncaughtException', (e) => console.error('[crypto-worker] uncaughtException:', e));
process.on('unhandledRejection', (e) => console.error('[crypto-worker] unhandledRejection:', e));

(async () => {
  console.log(`[crypto-worker] start ${new Date().toISOString()}`);
  try {
    const { ensureCryptocomEngineTables } = await import('./services/ensure-cryptocom-engine-tables');
    await ensureCryptocomEngineTables();
  } catch (e: any) {
    console.error('[crypto-worker] ensureCryptocomEngineTables (non-fatal):', e?.message ?? e);
  }
  // Sets up the internal setInterval(60s tick, re-entrancy guarded) scan loop.
  // The interval keeps the process alive; nothing else is needed.
  startCryptocomEngineScanner();
  console.log('[crypto-worker] scanner loop started — scanning on the internal interval, isolated from the web service.');
})();
