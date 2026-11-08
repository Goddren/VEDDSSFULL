// ─────────────────────────────────────────────────────────────────────────────
// Crypto engine health (2026-11-08) — engine report follow-up.
//
// The crypto engine runs as a standalone Render cron job (server/crypto-
// cron.ts): one scan cycle, then the process exits. If that schedule is
// ever paused, deleted, or starts failing, nothing in the web service would
// notice — the same silent-failure trap the engine watchdog covers for FX
// and Sol. The cron now writes a heartbeat to runtime_state on every run;
// this service reads it (with a DB-artifact fallback, in case heartbeats
// predate this change) and classifies the pulse for /api/health and the
// watchdog.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

export interface CryptoEngineHealth {
  status: 'ok' | 'stale' | 'never';
  /** When the cron last finished a run (ok or error), from the heartbeat. */
  lastRunAt: string | null;
  lastRunState: string | null;
  /** Newest sign of life: last successful run or last crypto DB artifact. */
  lastActivityAt: string | null;
  ageMinutes: number | null;
  staleAfterMin: number;
  message: string;
}

/** The cron is scheduled every 2–5 minutes; 20 min without a pulse is dead. */
const STALE_MIN = () => Math.max(5, Number(process.env.CRYPTO_HEALTH_STALE_MIN ?? 20));

export async function getCryptoEngineHealth(): Promise<CryptoEngineHealth> {
  const staleAfterMin = STALE_MIN();

  let hb: any = null;
  try {
    const { getRuntimeStateStrict } = await import('./runtime-state');
    hb = await getRuntimeStateStrict('crypto_cron', 'heartbeat').catch(() => null);
  } catch { /* heartbeat is best-effort */ }

  let artifactAt: Date | null = null;
  try {
    const { rows } = await pool.query(
      `SELECT greatest(
         (SELECT max(opened_at) FROM crypto_paper_trades),
         (SELECT max(created_at) FROM fx_model_decisions WHERE engine = 'crypto')
       ) AS last_at`);
    artifactAt = rows[0]?.last_at ? new Date(rows[0].last_at) : null;
  } catch { /* tables may not exist on a fresh deploy */ }

  const lastRunAt: string | null = hb?.finishedAt ?? null;
  const lastRunState: string | null = hb?.state ?? null;
  const lastOkAt: string | null = hb?.state === 'ok' ? (hb?.finishedAt ?? null) : (hb?.lastOkAt ?? null);

  const candidates = [lastOkAt ? new Date(lastOkAt).getTime() : 0, artifactAt?.getTime() ?? 0].filter((n) => n > 0);
  const lastActivityMs = candidates.length ? Math.max(...candidates) : null;
  const lastActivityAt = lastActivityMs ? new Date(lastActivityMs).toISOString() : null;
  const ageMinutes = lastActivityMs ? Math.round(((Date.now() - lastActivityMs) / 60000) * 10) / 10 : null;

  let status: CryptoEngineHealth['status'];
  let message: string;
  if (lastActivityMs == null || ageMinutes == null) {
    status = 'never';
    message = 'Crypto: no cron heartbeat and no crypto trades/decisions on record — the cron may never have run, or its schedule is not set up.';
  } else if (ageMinutes <= staleAfterMin) {
    status = 'ok';
    message = `Crypto OK — last activity ${ageMinutes} min ago${lastRunState === 'error' ? ' (note: the latest cron run reported an error — see the cron log)' : ''}.`;
  } else {
    status = 'stale';
    message = `Crypto STALE — no successful run or crypto activity for ${ageMinutes} min (expected every few minutes). The Render cron job may be paused, deleted, or failing — check the cron service. Last run: ${lastRunAt ?? 'unknown'}${lastRunState ? ` (${lastRunState})` : ''}.`;
  }

  return { status, lastRunAt, lastRunState, lastActivityAt, ageMinutes, staleAfterMin, message };
}
