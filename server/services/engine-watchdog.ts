// ─────────────────────────────────────────────────────────────────────────────
// Engine watchdog (2026-11-06) — recommendation #2 of the Nov 6 engine report.
//
// The Oct 30 – Nov 2, 2026 FX silence (no closes for 3 days, engine most
// likely emergency-stopped, which by design does NOT auto-resume) was only
// noticed when the owner asked. This watchdog checks every 30 minutes and
// classifies each engine's pulse from durable DB signals:
//
//   FX  ok           — a brain outcome landed in the last 24h
//       gated        — no closes ≥24h, but guard events and/or shadow-model
//                      AI decisions kept firing: the engine is ALIVE, the
//                      guards are blocking everything
//       silent       — no closes, no guard events, no AI decisions ≥24h:
//                      likely stopped / emergency-stopped / leader down
//       weekend_hold — stale, but the FX market is closed (Sat/Sun UTC)
//   Sol ok / stale   — no position (live/paper/shadow) closed in 48h
//
// Alerts go to the owner by email (first configured channel from
// messaging.ts) — at most 3 per silence episode, ≥24h apart — and the latest
// status is kept in runtime_state and surfaced on /api/health as
// `engineWatchdog`. The watchdog only observes and reports; it never starts,
// stops, or reconfigures an engine.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

const TICK_MS = 30 * 60 * 1000;
const FX_STALE_HOURS = 24;
const SOL_STALE_HOURS = 48;
const MAX_ALERTS_PER_EPISODE = 3;
const REALERT_MS = 24 * 3_600_000;
const REPORT_EMAIL = process.env.REPORT_EMAIL || 'donchismkos@gmail.com';

export interface EngineWatchdogStatus {
  checkedAt: string;
  fx: {
    state: 'ok' | 'gated' | 'silent' | 'weekend_hold' | 'no_data';
    lastCloseAt: string | null;
    hoursSinceLastClose: number | null;
    guardEvents24h: number;
    aiDecisions24h: number;
    message: string;
  };
  sol: {
    state: 'ok' | 'stale' | 'no_data';
    lastCloseAt: string | null;
    hoursSinceLastClose: number | null;
    message: string;
  };
}

let _lastStatus: EngineWatchdogStatus | null = null;
let _lastStatusAt = 0;

async function computeStatus(): Promise<EngineWatchdogStatus> {
  const { checkFxBrainHealth } = await import('./fx-brain');
  const fxHealth = await checkFxBrainHealth(24).catch(() => null);

  let guardEvents24h = 0;
  let aiDecisions24h = 0;
  try {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM engine_guard_events WHERE engine='fx' AND created_at > now() - interval '24 hours'`);
    guardEvents24h = rows[0]?.n ?? 0;
  } catch { /* table may not exist yet — treated as no activity */ }
  try {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM fx_model_decisions WHERE created_at > now() - interval '24 hours'`);
    aiDecisions24h = rows[0]?.n ?? 0;
  } catch { /* same */ }

  const fxLast = fxHealth?.lastBrainRowAt ?? null;
  const fxHours = fxHealth?.hoursSinceLastBrainRow ?? null;
  const utcDay = new Date().getUTCDay();
  const weekend = utcDay === 0 || utcDay === 6;

  let fxState: EngineWatchdogStatus['fx']['state'];
  let fxMessage: string;
  if (!fxLast || fxHours == null) {
    fxState = 'no_data';
    fxMessage = 'FX: no brain outcomes on record — nothing to watch yet.';
  } else if (fxHours < FX_STALE_HOURS) {
    fxState = 'ok';
    fxMessage = `FX OK — last close ${fxHours}h ago.`;
  } else if (weekend) {
    fxState = 'weekend_hold';
    fxMessage = `FX: no close in ${fxHours}h, but the market is closed for the weekend — recheck Monday.`;
  } else if (guardEvents24h + aiDecisions24h > 0) {
    fxState = 'gated';
    fxMessage = `FX RUNNING BUT FULLY GATED — no close in ${fxHours}h, yet ${guardEvents24h} guard firing(s) and ${aiDecisions24h} AI analysis decision(s) in the last 24h. The engine is alive; the guards are blocking everything. See the guard fire-rate view for which ones.`;
  } else {
    fxState = 'silent';
    fxMessage = `FX SILENT — no close in ${fxHours}h and no guard or AI activity in the last 24h. Likely stopped or emergency-stopped (an emergency stop does not auto-resume). Check the FX engine page and press Start if it shows Stopped.`;
  }

  let solLast: string | null = null;
  try {
    const { rows } = await pool.query(
      `SELECT max(NULLIF(closed_at, '')::timestamptz) AS last_at FROM sol_engine_positions WHERE status='closed'`);
    solLast = rows[0]?.last_at ? new Date(rows[0].last_at).toISOString() : null;
  } catch { /* table may not exist yet */ }
  const solHours = solLast ? Math.round((Date.now() - new Date(solLast).getTime()) / 36e5 * 10) / 10 : null;
  let solState: EngineWatchdogStatus['sol']['state'];
  let solMessage: string;
  if (!solLast || solHours == null) {
    solState = 'no_data';
    solMessage = 'Sol: no closed positions on record — nothing to watch yet.';
  } else if (solHours < SOL_STALE_HOURS) {
    solState = 'ok';
    solMessage = `Sol OK — last position closed ${solHours}h ago.`;
  } else {
    solState = 'stale';
    solMessage = `Sol STALE — no position (live, paper or shadow) has closed in ${solHours}h. If the Sol engine should be running, check its page.`;
  }

  return {
    checkedAt: new Date().toISOString(),
    fx: { state: fxState, lastCloseAt: fxLast, hoursSinceLastClose: fxHours, guardEvents24h, aiDecisions24h, message: fxMessage },
    sol: { state: solState, lastCloseAt: solLast, hoursSinceLastClose: solHours, message: solMessage },
  };
}

/** Latest watchdog status (cached ~30 min; computed on demand if never run). */
export async function getEngineWatchdogStatus(): Promise<EngineWatchdogStatus> {
  if (_lastStatus && Date.now() - _lastStatusAt < TICK_MS) return _lastStatus;
  const status = await computeStatus();
  _lastStatus = status;
  _lastStatusAt = Date.now();
  return status;
}

interface Episode { key: string; sent: number; lastAt: number }

async function maybeAlert(status: EngineWatchdogStatus): Promise<void> {
  const alerts: string[] = [];
  if (status.fx.state === 'gated' || status.fx.state === 'silent') alerts.push(status.fx.message);
  if (status.sol.state === 'stale') alerts.push(status.sol.message);
  if (!alerts.length) return;

  console.warn(`[engine-watchdog] ${alerts.join(' | ')}`);

  // Episode bookkeeping in runtime_state: an episode is keyed by the last
  // close timestamp, so a fresh close resets the counter automatically.
  let episodes: Record<string, Episode> = {};
  try {
    const { getRuntimeStateStrict, saveRuntimeState } = await import('./runtime-state');
    const stored = await getRuntimeStateStrict('engine_watchdog', 'episodes').catch(() => null);
    if (stored && typeof stored === 'object') episodes = stored as Record<string, Episode>;
    saveRuntimeState('engine_watchdog', 'status', status);
  } catch { /* state is best-effort; alerting still proceeds in-memory-safe below */ }

  const due: string[] = [];
  const check = (engine: 'fx' | 'sol', key: string | null, text: string | null) => {
    if (!text || !key) return;
    const ep = episodes[engine];
    if (!ep || ep.key !== key) episodes[engine] = { key, sent: 0, lastAt: 0 };
    const e = episodes[engine];
    if (e.sent < MAX_ALERTS_PER_EPISODE && Date.now() - e.lastAt >= REALERT_MS) {
      e.sent++;
      e.lastAt = Date.now();
      due.push(text);
    }
  };
  check('fx', status.fx.lastCloseAt, (status.fx.state === 'gated' || status.fx.state === 'silent') ? status.fx.message : null);
  check('sol', status.sol.lastCloseAt, status.sol.state === 'stale' ? status.sol.message : null);

  try {
    const { saveRuntimeState } = await import('./runtime-state');
    saveRuntimeState('engine_watchdog', 'episodes', episodes);
  } catch { /* best-effort */ }

  if (!due.length) return;

  // Email the owner via the first configured channel (resend → sendgrid →
  // gmail). If no channel is configured the alert still lives in the server
  // log, runtime_state and /api/health — it just cannot leave the box.
  try {
    const { sendMessage, getChannelStatus } = await import('../messaging');
    const configured = getChannelStatus();
    const channel = (['resend', 'sendgrid', 'gmail'] as const).find((c) => configured[c]?.configured);
    if (!channel) {
      console.warn('[engine-watchdog] alert due but no email channel is configured — alert recorded in health/runtime_state only.');
      return;
    }
    const result = await sendMessage({
      channel,
      email: REPORT_EMAIL,
      subject: '⚠️ VEDD engine watchdog: an engine has gone silent',
      message: `Engine watchdog alert (${status.checkedAt})\n\n${due.join('\n\n')}\n\nThe watchdog only observes — it never starts or reconfigures an engine. If the stop was intentional, ignore this; alerts repeat at most ${MAX_ALERTS_PER_EPISODE} times per silence episode.`,
    });
    if (!result.success) console.warn(`[engine-watchdog] alert email failed via ${channel}: ${result.error || 'unknown error'}`);
  } catch (e: any) {
    console.warn('[engine-watchdog] alert email threw (non-fatal):', e?.message || e);
  }
}

let _started = false;
/** Start the 30-minute watchdog tick. Idempotent; never throws. */
export function startEngineWatchdog(): void {
  if (_started) return;
  _started = true;
  const tick = async () => {
    try {
      const status = await computeStatus();
      _lastStatus = status;
      _lastStatusAt = Date.now();
      const { saveRuntimeState } = await import('./runtime-state');
      saveRuntimeState('engine_watchdog', 'status', status);
      await maybeAlert(status);
    } catch (e: any) {
      console.error('[engine-watchdog] tick failed (non-fatal):', e?.message || e);
    }
  };
  setTimeout(tick, 5 * 60 * 1000).unref?.();
  setInterval(tick, TICK_MS).unref?.();
  console.log('[engine-watchdog] started — FX 24h / Sol 48h silence checks every 30 min.');
}
