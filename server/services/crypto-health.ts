// ─────────────────────────────────────────────────────────────────────────────
// Crypto engine health (2026-11-08) — engine report follow-up.
//
// The crypto engine runs outside the web service (a Render cron job, or a
// background worker). If its schedule is ever paused, deleted, or starts
// failing, nothing in the web service would notice — the same silent-
// failure trap the engine watchdog covers for FX and Sol.
//
// The scanner has always kept its own pulse: the single-row table
// crypto_engine_heartbeat, written by cryptocom-scanner.ts on every scan
// (tick_at / scan_started_at / scan_finished_at / phase / skipped_ticks /
// scans_completed / last_error). This service reads THAT table — the
// scanner's real heartbeat, written no matter which entry point started
// the scan — with a DB-artifact fallback for the case where the heartbeat
// row does not exist yet. (An earlier version of this file read a
// runtime_state heartbeat written by the cron entry point; that pulse
// never landed in production because the scanner's own table is the one
// every run actually writes. The cron-entry writes were removed.)
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

export interface CryptoEngineHealth {
  status: 'ok' | 'stale' | 'never';
  /** When the scanner last finished (or started) a scan, from its heartbeat row. */
  lastRunAt: string | null;
  lastRunState: string | null;
  /** Newest sign of life: heartbeat row or crypto DB artifact. */
  lastActivityAt: string | null;
  ageMinutes: number | null;
  staleAfterMin: number;
  message: string;
  /** 'background worker' | 'cron job' | null (no heartbeat row yet). */
  runner?: string | null;
  phase?: string | null;
  scansCompleted?: number | null;
  wedged?: boolean;
}

/** Default stale threshold; the schedule is documented as every 2–5 min. */
const STALE_MIN = () => Math.max(5, Number(process.env.CRYPTO_HEALTH_STALE_MIN ?? 20));

export async function getCryptoEngineHealth(): Promise<CryptoEngineHealth> {
  const staleAfterMin = STALE_MIN();

  let row: any = null;
  try {
    const { rows } = await pool.query(`SELECT * FROM crypto_engine_heartbeat WHERE id = 1`);
    row = rows[0] ?? null;
  } catch { /* table may not exist on a fresh deploy */ }

  let artifactAt: Date | null = null;
  try {
    const { rows } = await pool.query(
      `SELECT greatest(
         (SELECT max(opened_at) FROM crypto_paper_trades),
         (SELECT max(created_at) FROM fx_model_decisions WHERE engine = 'crypto')
       ) AS last_at`);
    artifactAt = rows[0]?.last_at ? new Date(rows[0].last_at) : null;
  } catch { /* tables may not exist on a fresh deploy */ }

  const iso = (v: any): string | null => (v ? new Date(v).toISOString() : null);
  let lastRunAt: string | null = null;
  let lastRunState: string | null = null;
  let runner: string | null = null;
  let phase: string | null = null;
  let scansCompleted: number | null = null;
  let wedged = false;
  let hbMs = 0;
  if (row) {
    runner = row.booted_at ? 'background worker' : 'cron job';
    phase = row.phase ?? null;
    scansCompleted = row.scans_completed ?? null;
    wedged = (row.skipped_ticks ?? 0) >= 3;
    lastRunAt = iso(row.scan_finished_at ?? row.scan_started_at ?? row.tick_at);
    lastRunState = row.last_error ? 'error' : phase === 'idle' ? 'ok' : phase;
    hbMs = Math.max(0, ...[row.tick_at, row.scan_finished_at, row.scan_started_at, row.updated_at]
      .filter(Boolean).map((d: any) => new Date(d).getTime()));
  }

  const lastActivityMs = Math.max(hbMs, artifactAt?.getTime() ?? 0) || null;
  const lastActivityAt = lastActivityMs ? new Date(lastActivityMs).toISOString() : null;
  const ageMinutes = lastActivityMs ? Math.round(((Date.now() - lastActivityMs) / 60000) * 10) / 10 : null;

  let status: CryptoEngineHealth['status'];
  let message: string;
  if (lastActivityMs == null || ageMinutes == null) {
    status = 'never';
    message = 'Crypto: no scanner heartbeat and no crypto trades/decisions on record — the engine may never have run against this database, or its schedule is not set up.';
  } else if (ageMinutes <= staleAfterMin) {
    status = 'ok';
    const bits = [`Crypto OK — last activity ${ageMinutes} min ago`];
    if (runner) bits.push(`runner: ${runner}`);
    if (scansCompleted != null) bits.push(`${scansCompleted} scans completed`);
    if (wedged) bits.push(`WARNING: the scan may be wedged at phase "${phase}" (${row?.skipped_ticks} skipped ticks)`);
    if (row?.last_error) bits.push(`last error: ${String(row.last_error).slice(0, 140)}`);
    message = bits.join(' · ') + '.';
  } else {
    status = 'stale';
    message = `Crypto STALE — no scanner tick or crypto activity for ${ageMinutes} min (threshold ${staleAfterMin} min). ${runner === 'background worker' ? 'The worker service may be down or wedged' : 'The Render cron job may be paused, deleted, or failing'} — check the service. Last scan: ${lastRunAt ?? 'unknown'}${phase ? ` (phase ${phase})` : ''}.`;
  }

  return { status, lastRunAt, lastRunState, lastActivityAt, ageMinutes, staleAfterMin, message, runner, phase, scansCompleted, wedged };
}
