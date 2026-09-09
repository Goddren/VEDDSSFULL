// ─────────────────────────────────────────────────────────────────────────────
// Standalone crypto-engine CRON entry point.
//
// WHY THIS EXISTS: the always-on in-process crypto scanner accumulates memory
// over ~2h and OOMs the whole Render instance (taking FX/TradeLocker/DXtrade
// down with it). This entry point instead runs ONE scan cycle and EXITS, so the
// OS reclaims 100% of the process memory every run — a leak can't accumulate if
// the process never lives long enough to leak.
//
// DEPLOY: build produces dist/crypto-cron.js. Point a Render Cron Job at:
//   node --dns-result-order=ipv4first dist/crypto-cron.js
// on a schedule (e.g. every 2–5 min). It shares the same DATABASE_URL + env as
// the main service, so no code/data duplication. It runs INDEPENDENTLY of the
// always-on web service — an OOM here only kills this short-lived job, never FX.
//
// The main web service must keep ENABLE_CRYPTO_ENGINE unset/false so the
// in-process scanner does NOT also run (this cron is the single owner now).
// ─────────────────────────────────────────────────────────────────────────────

// Hard ceiling so a hung network call can never leave the job running forever
// (which would defeat the whole "short-lived process" point). Render also has
// its own job timeout, but this is a belt-and-suspenders self-kill.
const MAX_RUNTIME_MS = 4 * 60 * 1000; // 4 minutes
const _killTimer = setTimeout(() => {
  console.error('[crypto-cron] MAX_RUNTIME exceeded — force-exiting to reclaim memory.');
  process.exit(1);
}, MAX_RUNTIME_MS);
_killTimer.unref();

async function main(): Promise<void> {
  const started = Date.now();
  console.log(`[crypto-cron] start ${new Date().toISOString()}`);

  // Ensure the core crypto tables exist (cheap CREATE IF NOT EXISTS). The main
  // service normally creates these; doing it here too means the cron is safe to
  // run even if it fires before/without the web service.
  try {
    const { ensureCryptocomEngineTables } = await import('./services/ensure-cryptocom-engine-tables');
    await ensureCryptocomEngineTables();
  } catch (err: any) {
    console.error('[crypto-cron] ensureCryptocomEngineTables (non-fatal):', err?.message ?? err);
  }

  // Run exactly ONE scan cycle across all active users, then return. This is the
  // same function the always-on loop calls per tick — we just invoke it once
  // instead of on a setInterval, so the process can exit and free its memory.
  const { runCryptocomEngineScan } = await import('./services/cryptocom-scanner');
  await runCryptocomEngineScan();

  console.log(`[crypto-cron] scan complete in ${Date.now() - started}ms`);
}

main()
  .then(() => {
    clearTimeout(_killTimer);
    // Force-exit so any lingering DB pool / keep-alive socket can't hold the
    // process open — the whole point is that this process dies and frees RAM.
    process.exit(0);
  })
  .catch((err) => {
    console.error('[crypto-cron] fatal:', err?.stack ?? err);
    clearTimeout(_killTimer);
    process.exit(1);
  });
