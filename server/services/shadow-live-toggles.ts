// ── Shadow → live go-live toggles ───────────────────────────────────────────
// (2026-11-15, Chris's directive: "I need a toggle on the app to allow it to
// go live fast… the toggle to live from shadow as easy as a toggle to turn
// on.") Every shadow lane gets an in-app toggle that flips it live — no
// code, no deploy — when its proof bar is met. The shape mirrors the FX
// Models pattern (fx-models.ts): a per-user toggle stored in runtime_state,
// default OFF, plus a per-strategy go-live bar the server re-verifies at
// flip time. The toggle never lies about being live:
//
// CRYPTO (fully functional): the live DeFi hot-wallet arm already trades
// real money, and the all-strategy shadow lane (crypto-shadow.ts) builds
// the record. A strategy trades live on the DeFi arm ONLY while its toggle
// is ON. Flip ON re-verifies the strategy's shadow record at flip time
// (the PR #77 discipline): ≥50 resolved shadow trades (rolling 90 days),
// mean net return > 0, win rate ≥ 40%, no losing week in the last two
// calendar weeks, shadow drawdown ≤ 10%. Bar unmet → the flip is REFUSED
// with the specific missing pieces ("23/50 trades · win rate 36%").
// Flip OFF is instant and unconditional. While ON, the PR #68 lesson
// gates and the PR #77 promoted guards still apply — the toggle is
// eligibility, not a gate bypass. Scope: the DeFi hot-wallet arm ONLY
// (the arm the shadow record maps to); perps / Hyperliquid / CeFi arms
// are untouched. Paper entries are practice and are never blocked.
// Kill switch CRYPTO_LIVE_TOGGLE=off bypasses the toggle gate entirely
// (the DeFi arm runs on its existing engine switches, exactly as before
// this module existed) and renders the panel toggles disabled.
//
// KALSHI STOCK PERPS (arming — read this before touching it): this
// module deliberately builds NO execution — the toggle records an ARMING
// intent ("Arm for live") plus live progress toward the lane's existing
// promotion bar (per strategy ≥50 shadow trades net of fees+funding,
// avg ≥ +0.2R, win rate ≥ 40%, no losing week in the last two calendar
// weeks, drawdown ≤ 10%). Arming itself places no trades and changes no
// engine behavior. The live execution path is a SEPARATE module
// (kalshi-perp-live.ts, built after this one), which reads these arms
// and re-verifies the bar, the margin state, and its own gates every
// cycle before any order. The panel's readiness lines are read from that
// lane's live report — never hard-coded — and fail closed to 'unknown'
// when the report cannot be read. Kill switch KALSHI_PERP_ARM=off.
//
// Every flip on either lane (attempted, refused, or applied) is audited
// to shadow_live_toggle_audit with the bar snapshot at flip time.
// State lives in runtime_state scopes 'crypto_live_toggles' and
// 'kalshi_perp_armed', keyed by userId — the same store the FX Models
// toggle uses, so a future lane (e.g. a pump.fun follower lane) adopts
// this shape by adding a scope + a bar evaluator.

import { pool } from '../db';
import { ensureRuntimeStateTable } from './runtime-state';
import { ensureCryptoShadowTables } from './crypto-shadow';
import { ensureKalshiPerpShadowTables } from './ensure-kalshi-perp-shadow-tables';

// ── Kill switches ───────────────────────────────────────────────────────────
export function cryptoLiveToggleOn(): boolean {
  return process.env.CRYPTO_LIVE_TOGGLE !== 'off';
}
export function kalshiPerpArmOn(): boolean {
  return process.env.KALSHI_PERP_ARM !== 'off';
}

// ── Audit (durable; best-effort write — a failed audit insert is logged,
//    never allowed to block a user's OFF flip) ──────────────────────────────
let _auditEnsured: Promise<void> | null = null;
export function ensureLiveToggleAuditTable(): Promise<void> {
  if (!_auditEnsured) {
    _auditEnsured = pool.query(`CREATE TABLE IF NOT EXISTS shadow_live_toggle_audit (
      id serial PRIMARY KEY, user_id int NOT NULL, lane text NOT NULL, strategy text NOT NULL,
      action text NOT NULL, ok boolean NOT NULL, meets_bar boolean,
      missing jsonb, bar_snapshot jsonb, created_at timestamptz NOT NULL DEFAULT now())`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS shadow_live_toggle_audit_user ON shadow_live_toggle_audit (user_id, created_at)`))
      .then(() => undefined)
      .catch((e) => { _auditEnsured = null; throw e; });
  }
  return _auditEnsured;
}

export interface BarSnapshot {
  trades: number;
  meanNetPct: number | null;
  avgR: number | null;
  winRate: number | null;
  maxDrawdownPct: number;
  losingWeek: boolean;
}

async function auditFlip(row: {
  userId: number; lane: 'crypto' | 'kalshi_perp'; strategy: string;
  action: 'on' | 'off' | 'arm' | 'disarm'; ok: boolean;
  meetsBar: boolean | null; missing: string[]; bar: BarSnapshot | null;
}): Promise<void> {
  try {
    await ensureLiveToggleAuditTable();
    await pool.query(
      `INSERT INTO shadow_live_toggle_audit (user_id, lane, strategy, action, ok, meets_bar, missing, bar_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
      [row.userId, row.lane, row.strategy, row.action, row.ok, row.meetsBar,
       JSON.stringify(row.missing), row.bar ? JSON.stringify(row.bar) : null],
    );
  } catch (e: any) {
    console.error('[live-toggles] audit write failed (non-fatal):', e?.message ?? e);
  }
}

// ── Pure bar math (shared by both lanes; exported for the check script) ────
export interface ShadowClose { returnPct: number; rMultiple?: number | null; closedAt: string | number | Date }

/** Monday 00:00 UTC of the week containing d (Postgres date_trunc('week')
 *  semantics, in UTC). */
export function weekStartUtc(d: Date): number {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = new Date(t).getUTCDay(); // 0 = Sunday
  return t - ((dow + 6) % 7) * 86_400_000;
}

/** Weekly sums of `pick` over closes in the last two calendar weeks
 *  (the current week and the one before it, Monday-start UTC — the FX
 *  Models window in sliceLiveReady). losingWeek = any week WITH closes in
 *  that window summed below zero; weeks with no closes never condemn. */
export function lastTwoWeeks(closes: ShadowClose[], pick: (c: ShadowClose) => number | null, now: Date): { losingWeek: boolean; weeks: Array<{ weekStart: string; sum: number }> } {
  const windowStart = weekStartUtc(now) - 7 * 86_400_000;
  const byWeek = new Map<number, number>();
  for (const c of closes) {
    const t = new Date(c.closedAt).getTime();
    if (!Number.isFinite(t) || t < windowStart) continue;
    const v = pick(c);
    if (v == null || !Number.isFinite(v)) continue;
    const wk = weekStartUtc(new Date(t));
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + v);
  }
  const weeks = Array.from(byWeek.entries()).sort((a, b) => a[0] - b[0])
    .map(([wk, sum]) => ({ weekStart: new Date(wk).toISOString(), sum }));
  return { losingWeek: weeks.some((w) => w.sum < 0), weeks };
}

/** Peak-to-trough drawdown (%) of a $100 balance compounded by each close's
 *  net return_pct in order — the same replay math as the Kalshi panels'
 *  accountReplay (kalshi-stock-shadow.ts), kept local so this module has
 *  no cross-lane imports. */
export function maxDrawdownPctFromReturns(pcts: number[]): number {
  let balance = 100, peak = 100, maxDd = 0;
  for (const pct of pcts) {
    if (!Number.isFinite(pct)) continue;
    balance += (balance * pct) / 100;
    if (balance > peak) peak = balance;
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - balance) / peak) * 100);
  }
  return maxDd;
}

/** Summarize resolved closes (already in close order) into the bar inputs.
 *  Weekly sums use returnPct for crypto and R for Kalshi — `weekUnit`
 *  picks which; avgR is the mean r_multiple over closes that carry one. */
export function summarizeCloses(closes: ShadowClose[], now: Date, weekUnit: 'pct' | 'r'): BarSnapshot & { weeks: Array<{ weekStart: string; sum: number }> } {
  const pcts = closes.map((c) => c.returnPct).filter((v) => Number.isFinite(v));
  const trades = pcts.length;
  const meanNetPct = trades ? pcts.reduce((a, b) => a + b, 0) / trades : null;
  const winRate = trades ? pcts.filter((v) => v > 0).length / trades : null;
  const rs = closes.map((c) => c.rMultiple).filter((v): v is number => v != null && Number.isFinite(v));
  const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
  const { losingWeek, weeks } = lastTwoWeeks(closes, weekUnit === 'r' ? (c) => c.rMultiple ?? null : (c) => c.returnPct, now);
  return { trades, meanNetPct, avgR, winRate, maxDrawdownPct: maxDrawdownPctFromReturns(pcts), losingWeek, weeks };
}

const pct1 = (v: number) => `${v.toFixed(1)}%`;
const signedPct = (v: number) => `${v >= 0 ? '+' : '−'}${pct1(Math.abs(v))}`;
const wrPct = (v: number) => `${Math.round(v * 100)}%`;

// ── CRYPTO: the bar (Chris's numbers, 2026-11-15) ───────────────────────────
export const CRYPTO_LIVE_BAR = { minTrades: 50, minWinRate: 0.4, maxDrawdownPct: 10, windowDays: 90 } as const;

/** Pure verdict: which pieces of the crypto go-live bar are missing, in
 *  plain words with the actual numbers ("23/50 trades"). Empty = met. */
export function evaluateCryptoBar(s: BarSnapshot): { meetsBar: boolean; missing: string[] } {
  const missing: string[] = [];
  if (s.trades < CRYPTO_LIVE_BAR.minTrades) missing.push(`${s.trades}/${CRYPTO_LIVE_BAR.minTrades} shadow trades`);
  if (!(s.meanNetPct != null && s.meanNetPct > 0)) missing.push(`mean net ${s.meanNetPct == null ? '—' : signedPct(s.meanNetPct)} (needs above 0%)`);
  if (!(s.winRate != null && s.winRate >= CRYPTO_LIVE_BAR.minWinRate)) missing.push(`win rate ${s.winRate == null ? '—' : wrPct(s.winRate)} (needs ≥ ${wrPct(CRYPTO_LIVE_BAR.minWinRate)})`);
  if (s.losingWeek) missing.push('a losing week in the last two weeks');
  if (s.maxDrawdownPct > CRYPTO_LIVE_BAR.maxDrawdownPct) missing.push(`shadow drawdown ${pct1(s.maxDrawdownPct)} (needs ≤ ${CRYPTO_LIVE_BAR.maxDrawdownPct}%)`);
  return { meetsBar: missing.length === 0, missing };
}

/** The strategies that can trade on the live DeFi arm — the scanner's
 *  AUTO_STRATEGIES plus the composite they can combine into. The shadow
 *  lane's port runners (crypto-ports.ts) are shadow-only by design and
 *  are NOT listed: a toggle for a strategy that can never trade live
 *  would be a lie. Parity with the scanner is pinned by the check script. */
export const CRYPTO_LIVE_STRATEGIES = [
  'trend_following', 'momentum', 'order_flow', 'volume_profile',
  'breakout', 'structure', 'divergence', 'composite_autonomous',
] as const;

async function cryptoStrategyCloses(userId: number, strategy: string): Promise<ShadowClose[]> {
  await ensureCryptoShadowTables();
  const { rows } = await pool.query(
    `SELECT return_pct, closed_at FROM crypto_shadow_trades
      WHERE user_id=$1 AND strategy=$2 AND status='closed' AND return_pct IS NOT NULL
        AND closed_at >= now() - interval '${CRYPTO_LIVE_BAR.windowDays} days'
      ORDER BY closed_at ASC`,
    [userId, strategy]);
  return rows.map((r: any) => ({ returnPct: Number(r.return_pct), closedAt: r.closed_at }));
}

/** Fresh (uncached) bar stats for one strategy — flip-time verification
 *  reads this, never a cached panel copy. */
export async function getCryptoStrategyBar(userId: number, strategy: string): Promise<BarSnapshot & { meetsBar: boolean; missing: string[] }> {
  const stats = summarizeCloses(await cryptoStrategyCloses(userId, strategy), new Date(), 'pct');
  const { weeks: _weeks, ...snapshot } = stats;
  return { ...snapshot, ...evaluateCryptoBar(snapshot) };
}

// ── CRYPTO: toggle state (runtime_state, FX-Models shape) ──────────────────
export interface CryptoLiveToggle { on: boolean; updatedAt: string; bar: BarSnapshot | null }
const CRYPTO_SCOPE = 'crypto_live_toggles';
const _cryptoCache = new Map<number, { at: number; toggles: Record<string, CryptoLiveToggle> }>();
const CACHE_MS = 30_000;

export async function getCryptoLiveToggles(userId: number): Promise<Record<string, CryptoLiveToggle>> {
  const hit = _cryptoCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.toggles;
  let toggles: Record<string, CryptoLiveToggle> = {};
  try {
    const { getRuntimeStateStrict } = await import('./runtime-state');
    const v = await getRuntimeStateStrict(CRYPTO_SCOPE, String(userId));
    if (v && typeof v === 'object') toggles = v;
  } catch { /* unreadable → no toggles → nothing is live (FX pattern) */ }
  _cryptoCache.set(userId, { at: Date.now(), toggles });
  return toggles;
}

async function storeCryptoLiveToggles(userId: number, toggles: Record<string, CryptoLiveToggle>): Promise<void> {
  // Awaited upsert (the saveFxModelSettings shape): a flip the API calls
  // successful must actually be durable before the response goes out.
  await ensureRuntimeStateTable();
  await pool.query(
    `INSERT INTO runtime_state (scope, key, value, updated_at) VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [CRYPTO_SCOPE, String(userId), JSON.stringify(toggles)],
  );
  _cryptoCache.set(userId, { at: Date.now(), toggles });
}

/** Panel payload: every live-capable strategy with its toggle state and
 *  its CURRENT bar progress (display only — flips re-verify fresh). */
export async function getCryptoLiveTogglePanel(userId: number): Promise<{
  enabled: boolean;
  strategies: Array<{ strategy: string; on: boolean; updatedAt: string | null; bar: BarSnapshot & { meetsBar: boolean; missing: string[] } }>;
}> {
  const toggles = await getCryptoLiveToggles(userId);
  const strategies = [];
  for (const strategy of CRYPTO_LIVE_STRATEGIES) {
    const bar = await getCryptoStrategyBar(userId, strategy).catch(() => ({
      trades: 0, meanNetPct: null, avgR: null, winRate: null, maxDrawdownPct: 0, losingWeek: false,
      ...evaluateCryptoBar({ trades: 0, meanNetPct: null, avgR: null, winRate: null, maxDrawdownPct: 0, losingWeek: false }),
    }));
    strategies.push({ strategy, on: toggles[strategy]?.on === true, updatedAt: toggles[strategy]?.updatedAt ?? null, bar });
  }
  return { enabled: cryptoLiveToggleOn(), strategies };
}

/** The flip. ON re-verifies the bar against FRESH stats and refuses with
 *  the missing pieces when unmet; OFF is instant and unconditional. */
export async function flipCryptoLiveToggle(userId: number, strategy: string, on: boolean):
  Promise<{ ok: boolean; status?: number; error?: string; missing?: string[]; bar?: BarSnapshot }> {
  if (!(CRYPTO_LIVE_STRATEGIES as readonly string[]).includes(strategy)) {
    return { ok: false, status: 400, error: `"${strategy}" is not a strategy that can trade on the DeFi hot wallet.` };
  }
  if (!on) {
    const toggles = await getCryptoLiveToggles(userId);
    toggles[strategy] = { on: false, updatedAt: new Date().toISOString(), bar: toggles[strategy]?.bar ?? null };
    await storeCryptoLiveToggles(userId, toggles);
    void auditFlip({ userId, lane: 'crypto', strategy, action: 'off', ok: true, meetsBar: null, missing: [], bar: null });
    return { ok: true };
  }
  if (!cryptoLiveToggleOn()) {
    void auditFlip({ userId, lane: 'crypto', strategy, action: 'on', ok: false, meetsBar: null, missing: [], bar: null });
    return { ok: false, status: 403, error: 'Go-live toggles are switched off right now (CRYPTO_LIVE_TOGGLE=off). The DeFi arm is running on its existing engine switches.' };
  }
  // Fresh stats on purpose — the same discipline as promoteCryptoBucket:
  // the client cannot talk its way past the bar with a stale panel copy.
  const bar = await getCryptoStrategyBar(userId, strategy);
  const cleanBar: BarSnapshot = {
    trades: bar.trades, meanNetPct: bar.meanNetPct, avgR: bar.avgR,
    winRate: bar.winRate, maxDrawdownPct: bar.maxDrawdownPct, losingWeek: bar.losingWeek,
  };
  if (!bar.meetsBar) {
    void auditFlip({ userId, lane: 'crypto', strategy, action: 'on', ok: false, meetsBar: false, missing: bar.missing, bar: cleanBar });
    return { ok: false, status: 422, error: `${strategy} has not cleared the go-live bar yet: ${bar.missing.join(' · ')}.`, missing: bar.missing, bar: cleanBar };
  }
  const toggles = await getCryptoLiveToggles(userId);
  toggles[strategy] = { on: true, updatedAt: new Date().toISOString(), bar: cleanBar };
  await storeCryptoLiveToggles(userId, toggles);
  void auditFlip({ userId, lane: 'crypto', strategy, action: 'on', ok: true, meetsBar: true, missing: [], bar: cleanBar });
  return { ok: true, bar: cleanBar };
}

/** Engine consult (hot path — cached, and it NEVER throws). Kill switch
 *  off → true: the toggle system is bypassed and the DeFi arm is governed
 *  by its existing switches, exactly as before this module existed. Store
 *  unreadable → false: live stays OFF rather than guessing (the FX Models
 *  settings pattern). The PR #68 lesson gates and PR #77 promoted guards
 *  run independently of this and still apply while a toggle is ON. */
export async function isCryptoStrategyLiveEnabled(userId: number, strategy: string): Promise<boolean> {
  if (!cryptoLiveToggleOn()) return true;
  try {
    return (await getCryptoLiveToggles(userId))[strategy]?.on === true;
  } catch { return false; }
}

// ── KALSHI STOCK PERPS: the existing promotion bar ──────────────────────────
export const KALSHI_PERP_BAR = { minTrades: 50, minAvgR: 0.2, minWinRate: 0.4, maxDrawdownPct: 10 } as const;

/** Pure verdict on the perp lane's promotion bar. Stats are the strategy's
 *  full resolved shadow record (the lane is young; the bar as set carries
 *  no window). avgR is net of fees + funding by the lane's construction. */
export function evaluateKalshiBar(s: BarSnapshot): { meetsBar: boolean; missing: string[] } {
  const missing: string[] = [];
  if (s.trades < KALSHI_PERP_BAR.minTrades) missing.push(`${s.trades}/${KALSHI_PERP_BAR.minTrades} shadow trades`);
  if (!(s.avgR != null && s.avgR >= KALSHI_PERP_BAR.minAvgR)) missing.push(`avg ${s.avgR == null ? '—' : `${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R`} (needs ≥ +${KALSHI_PERP_BAR.minAvgR.toFixed(2)}R)`);
  if (!(s.winRate != null && s.winRate >= KALSHI_PERP_BAR.minWinRate)) missing.push(`win rate ${s.winRate == null ? '—' : wrPct(s.winRate)} (needs ≥ ${wrPct(KALSHI_PERP_BAR.minWinRate)})`);
  if (s.losingWeek) missing.push('a losing week in the last two weeks');
  if (s.maxDrawdownPct > KALSHI_PERP_BAR.maxDrawdownPct) missing.push(`shadow drawdown ${pct1(s.maxDrawdownPct)} (needs ≤ ${KALSHI_PERP_BAR.maxDrawdownPct}%)`);
  return { meetsBar: missing.length === 0, missing };
}

async function kalshiStrategyCloses(userId: number, strategy: string): Promise<ShadowClose[]> {
  await ensureKalshiPerpShadowTables();
  const { rows } = await pool.query(
    `SELECT return_pct, r_multiple, closed_at FROM kalshi_perp_shadow_trades
      WHERE user_id=$1 AND strategy=$2 AND status='closed' AND return_pct IS NOT NULL
        AND exclude_from_stats IS NOT TRUE
      ORDER BY closed_at ASC`,
    [userId, strategy]);
  return rows.map((r: any) => ({
    returnPct: Number(r.return_pct),
    rMultiple: r.r_multiple == null ? null : Number(r.r_multiple),
    closedAt: r.closed_at,
  }));
}

export async function getKalshiStrategyBar(userId: number, strategy: string): Promise<BarSnapshot & { meetsBar: boolean; missing: string[] }> {
  const stats = summarizeCloses(await kalshiStrategyCloses(userId, strategy), new Date(), 'r');
  const { weeks: _weeks, ...snapshot } = stats;
  return { ...snapshot, ...evaluateKalshiBar(snapshot) };
}

// ── KALSHI: arming state (runtime_state) ────────────────────────────────────
export interface KalshiPerpArm { armed: boolean; updatedAt: string; bar: BarSnapshot | null }
const KALSHI_SCOPE = 'kalshi_perp_armed';
const _kalshiCache = new Map<number, { at: number; arms: Record<string, KalshiPerpArm> }>();

export async function getKalshiPerpArms(userId: number): Promise<Record<string, KalshiPerpArm>> {
  const hit = _kalshiCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.arms;
  let arms: Record<string, KalshiPerpArm> = {};
  try {
    const { getRuntimeStateStrict } = await import('./runtime-state');
    const v = await getRuntimeStateStrict(KALSHI_SCOPE, String(userId));
    if (v && typeof v === 'object') arms = v;
  } catch { /* unreadable → nothing armed */ }
  _kalshiCache.set(userId, { at: Date.now(), arms });
  return arms;
}

async function storeKalshiPerpArms(userId: number, arms: Record<string, KalshiPerpArm>): Promise<void> {
  await ensureRuntimeStateTable();
  await pool.query(
    `INSERT INTO runtime_state (scope, key, value, updated_at) VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [KALSHI_SCOPE, String(userId), JSON.stringify(arms)],
  );
  _kalshiCache.set(userId, { at: Date.now(), arms });
}

/** The arming panel's readiness lines, derived from the perp LIVE lane's
 *  own report (kalshi-perp-live.ts) — the same read the live panel shows.
 *  marginStatus is 'enabled'/'disabled' only when Kalshi actually
 *  answered; 'unknown' when there are no credentials or the read failed
 *  (fail closed — an unreadable answer is never dressed up as a state).
 *  livePathBuilt is true when the live lane's report was read at all:
 *  the report existing IS the live path existing. A failed read reports
 *  false rather than claiming a path it could not see. The import is
 *  dynamic — this module's established pattern for cross-service reads —
 *  so no import cycle with the live lane can form. */
export async function getKalshiPerpReadiness(userId: number): Promise<{ marginStatus: 'enabled' | 'disabled' | 'unknown'; livePathBuilt: boolean }> {
  try {
    const { getKalshiPerpLiveReport } = await import('./kalshi-perp-live');
    const report = await getKalshiPerpLiveReport(userId);
    return {
      marginStatus: report.marginEnabled === true ? 'enabled' : report.marginEnabled === false ? 'disabled' : 'unknown',
      livePathBuilt: true,
    };
  } catch {
    return { marginStatus: 'unknown', livePathBuilt: false };
  }
}

/** Panel payload: every strategy with shadow activity (plus any armed
 *  strategy), its bar progress, and the lane's readiness state read from
 *  the live lane's report (see getKalshiPerpReadiness). */
export async function getKalshiPerpArmingPanel(userId: number): Promise<{
  enabled: boolean;
  readiness: { marginStatus: 'enabled' | 'disabled' | 'unknown'; livePathBuilt: boolean };
  strategies: Array<{ strategy: string; armed: boolean; updatedAt: string | null; bar: BarSnapshot & { meetsBar: boolean; missing: string[] } }>;
}> {
  await ensureKalshiPerpShadowTables();
  const arms = await getKalshiPerpArms(userId);
  const { rows } = await pool.query(
    `SELECT DISTINCT strategy FROM kalshi_perp_shadow_trades WHERE user_id=$1`, [userId]).catch(() => ({ rows: [] as any[] }));
  const names = new Set<string>([...rows.map((r: any) => String(r.strategy)), ...Object.keys(arms)]);
  const strategies = [];
  for (const strategy of Array.from(names)) {
    const bar = await getKalshiStrategyBar(userId, strategy).catch(() => ({
      trades: 0, meanNetPct: null, avgR: null, winRate: null, maxDrawdownPct: 0, losingWeek: false,
      ...evaluateKalshiBar({ trades: 0, meanNetPct: null, avgR: null, winRate: null, maxDrawdownPct: 0, losingWeek: false }),
    }));
    strategies.push({ strategy, armed: arms[strategy]?.armed === true, updatedAt: arms[strategy]?.updatedAt ?? null, bar });
  }
  strategies.sort((a, b) => Number(b.armed) - Number(a.armed) || b.bar.trades - a.bar.trades || a.strategy.localeCompare(b.strategy));
  const readiness = await getKalshiPerpReadiness(userId);
  return { enabled: kalshiPerpArmOn(), readiness, strategies };
}

/** Arm / disarm. Arming is an intent flag only — it is NOT refused when
 *  the bar is unmet (the bar progress is shown, and any future live path
 *  must re-verify it), and it can never place a trade: nothing in this
 *  module references an order path. Disarm is instant. */
export async function setKalshiPerpArmed(userId: number, strategy: string, armed: boolean):
  Promise<{ ok: boolean; status?: number; error?: string; bar?: BarSnapshot }> {
  if (!strategy || typeof strategy !== 'string') return { ok: false, status: 400, error: 'strategy is required' };
  if (armed && !kalshiPerpArmOn()) {
    void auditFlip({ userId, lane: 'kalshi_perp', strategy, action: 'arm', ok: false, meetsBar: null, missing: [], bar: null });
    return { ok: false, status: 403, error: 'Arming is switched off right now (KALSHI_PERP_ARM=off).' };
  }
  const bar = await getKalshiStrategyBar(userId, strategy).catch(() => null);
  const cleanBar: BarSnapshot | null = bar ? {
    trades: bar.trades, meanNetPct: bar.meanNetPct, avgR: bar.avgR,
    winRate: bar.winRate, maxDrawdownPct: bar.maxDrawdownPct, losingWeek: bar.losingWeek,
  } : null;
  const arms = await getKalshiPerpArms(userId);
  arms[strategy] = { armed, updatedAt: new Date().toISOString(), bar: cleanBar };
  await storeKalshiPerpArms(userId, arms);
  void auditFlip({
    userId, lane: 'kalshi_perp', strategy, action: armed ? 'arm' : 'disarm', ok: true,
    meetsBar: bar ? bar.meetsBar : null, missing: bar ? bar.missing : [], bar: cleanBar,
  });
  return { ok: true, bar: cleanBar ?? undefined };
}
