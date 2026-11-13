// ─────────────────────────────────────────────────────────────────────────────
// Crypto all-strategy shadow lane — 2026-11-07 (design step 2).
//
// Every crypto runner (trend_following, momentum, order_flow, volume_profile,
// breakout, structure, divergence + the composite) is evaluated on the
// cycle's DeFi symbols and every signal is traded VIRTUALLY into
// crypto_shadow_trades: longs as 'long', SELL signals as 'hypothetical_short'
// (Base spot can't short; they are reported apart). Never touches live
// orders, wallets, or the paper table (crypto_paper_trades).
//
// Levels: stop = CRYPTO_SL_ATR_MULT (1.5) x H1 ATR clamped 1.5–12%, target 2x
// stop; costs from paper-costs.ts by pool liquidity; entries with a stop under
// 3x the round-trip cost are skipped. Time limit by runner timeframe (24h fast
// / 72h slow, crypto-paper.ts paperMaxHoursFor).
// Caps: CRYPTO_SHADOW_MAX_PER_STRATEGY (3) open per strategy, CRYPTO_SHADOW_MAX_OPEN
// (30) total; no duplicate underlying within a strategy; 60-min re-entry
// cooldown per strategy+underlying. Runs at most every CRYPTO_SHADOW_EVERY_MIN
// (10) per user to spare the GeckoTerminal budget.
//
// Each entry writes market context to crypto_shadow_context; closed rows roll
// up per strategy × bucket and are judged by MEDIAN net % (favor/avoid needs
// n ≥ CRYPTO_SHADOW_STATS_MIN_N, 15). The crypto AI confirmation prompt
// reads the strongest buckets, and each entry stores the advice it would
// have got (advice_at_entry).
// Lesson gate (2026-11-12, shadow-lesson-gate.ts): the lane also ACTS on
// those verdicts — an entry whose strategy (overall) or exact context
// bucket carries an 'avoid' verdict is skipped and the block audited in
// shadow_lesson_blocks. Rolling 60-day stats rehabilitate on their own.
// Kill switches: CRYPTO_SHADOW_ALL=off (whole lane),
// CRYPTO_SHADOW_LESSONS=off (lesson gate only).
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';
import { cryptoShadowLessonsOn, logShadowLessonBlock, matchingAvoidBucket } from './shadow-lesson-gate';

type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
export interface ShadowRunnerResult { decision: string; reasoning: string; score: number | null; price: number | null; dailyChangePercent: number | null; strategy: string; direction?: 'BUY' | 'SELL' }
export interface ShadowDeps {
  runners: Record<string, (sym: string, cfg: any) => Promise<ShadowRunnerResult>>;
  /** The engine's signal gates (HTF bias etc.); used only to record whether live would have blocked it. */
  gate: (sym: string, r: ShadowRunnerResult, cfg: any) => Promise<ShadowRunnerResult>;
  universe: (sym: string) => { address: string; poolAddress: string; liquidityUsd: number; priceUsd: number; volume24Usd?: number; flow?: import('./defi-market-data').PoolFlow; newToken?: boolean } | undefined;
  h1: (sym: string) => Promise<{ atr: number; bars: Bar[] } | null>;
}

const num = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };
export const shadowAllEnabled = () => process.env.CRYPTO_SHADOW_ALL !== 'off';
const MAX_OPEN = () => Math.floor(num('CRYPTO_SHADOW_MAX_OPEN', 30));
const MAX_PER_STRAT = () => Math.floor(num('CRYPTO_SHADOW_MAX_PER_STRATEGY', 3));
const COOLDOWN_MS = () => num('CRYPTO_SHADOW_COOLDOWN_MIN', 60) * 60_000;
const EVERY_MS = () => num('CRYPTO_SHADOW_EVERY_MIN', 10) * 60_000;
const NOTIONAL = () => num('CRYPTO_SHADOW_NOTIONAL_USD', 20);

let _ensured: Promise<void> | null = null;
export function ensureCryptoShadowTables(): Promise<void> {
  if (!_ensured) {
    _ensured = pool.query(`CREATE TABLE IF NOT EXISTS crypto_shadow_trades (
      id serial PRIMARY KEY, user_id int NOT NULL, strategy text NOT NULL, symbol text NOT NULL, underlying text NOT NULL,
      chain text, token_address text, pool_address text, direction text NOT NULL,
      entry_price double precision NOT NULL, stop_loss double precision NOT NULL, take_profit double precision NOT NULL,
      sl_pct double precision NOT NULL, notional_usd double precision NOT NULL, cost_bps double precision NOT NULL,
      score real, max_hours double precision NOT NULL, status text NOT NULL DEFAULT 'open',
      exit_price double precision, exit_reason text, gross_return_pct double precision, return_pct double precision,
      r_multiple double precision, peak_gain_pct double precision,
      opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz)`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS crypto_shadow_trades_user_status ON crypto_shadow_trades (user_id, status)`))
      .then(() => pool.query(`CREATE TABLE IF NOT EXISTS crypto_shadow_context (
      trade_id int PRIMARY KEY, user_id int NOT NULL, strategy text NOT NULL, symbol text NOT NULL, direction text NOT NULL,
      liquidity_usd double precision, change_1h double precision, change_24h double precision, volume_24h_usd double precision,
      atr_pct double precision, h1_trend text, h4_trend text, htf_aligned boolean, live_gate_blocked boolean,
      btc_change_24h double precision, hour_utc int, day_of_week int, score real, tags text[], advice_at_entry text,
      closed_at timestamptz, exit_reason text, hold_minutes double precision, net_pct double precision)`))
      // Step 4 (2026-11-07): pool order flow + token basics.
      .then(() => pool.query(`ALTER TABLE crypto_shadow_context
        ADD COLUMN IF NOT EXISTS buy_share_h1 double precision, ADD COLUMN IF NOT EXISTS buy_share_h24 double precision,
        ADD COLUMN IF NOT EXISTS txns_h1 int, ADD COLUMN IF NOT EXISTS txns_h24 int,
        ADD COLUMN IF NOT EXISTS buyers_h1 int, ADD COLUMN IF NOT EXISTS sellers_h1 int,
        ADD COLUMN IF NOT EXISTS market_cap_usd double precision, ADD COLUMN IF NOT EXISTS token_age_hours double precision,
        ADD COLUMN IF NOT EXISTS new_token boolean`))
      .then(() => undefined)
      .catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function ema(vals: number[], n: number): number | null {
  if (vals.length < n) return null;
  const k = 2 / (n + 1); let e = vals.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < vals.length; i++) e = vals[i] * k + e * (1 - k);
  return e;
}
/** Bars may arrive newest-first or oldest-first; normalise to oldest-first. */
function oldestFirst(bars: Bar[]): Bar[] { return bars.length > 1 && bars[0].t > bars[bars.length - 1].t ? bars.slice().reverse() : bars; }
function trendOf(closes: number[], fast: number, slow: number): string | null {
  const f = ema(closes, fast), s = ema(closes, slow);
  if (f == null || s == null) return null;
  return f > s * 1.002 ? 'BULLISH' : f < s * 0.998 ? 'BEARISH' : 'NEUTRAL';
}
function pctChange(bars: Bar[], hoursBack: number): number | null {
  if (bars.length <= hoursBack) return null;
  const now = bars[bars.length - 1].c, then = bars[bars.length - 1 - hoursBack].c;
  return then > 0 ? ((now - then) / then) * 100 : null;
}

export function bucketsOf(c: { hour_utc?: number | null; liquidity_usd?: number | null; change_24h?: number | null; atr_pct?: number | null; htf_aligned?: boolean | null; btc_change_24h?: number | null; direction?: string | null;
  buy_share_h1?: number | null; txns_h1?: number | null; market_cap_usd?: number | null; token_age_hours?: number | null }): Record<string, string> {
  const b: Record<string, string> = {};
  if (c.buy_share_h1 != null) b.buyShare = c.buy_share_h1 < 0.45 ? 'sellers<45%' : c.buy_share_h1 < 0.55 ? 'balanced' : c.buy_share_h1 < 0.65 ? 'buyers55-65%' : 'buyers65%+';
  if (c.txns_h1 != null) b.activity = c.txns_h1 < 20 ? 'quiet<20tx/h' : c.txns_h1 < 100 ? '20-100tx/h' : c.txns_h1 < 500 ? '100-500tx/h' : '500+tx/h';
  if (c.market_cap_usd != null && c.market_cap_usd > 0) b.mcap = c.market_cap_usd < 10e6 ? '<10M' : c.market_cap_usd < 100e6 ? '10-100M' : c.market_cap_usd < 1e9 ? '100M-1B' : '1B+';
  if (c.token_age_hours != null) b.age = c.token_age_hours < 72 ? '<3d' : c.token_age_hours < 720 ? '3-30d' : '30d+';
  if (c.direction) b.side = c.direction;
  if (c.hour_utc != null) { const s = Math.floor(c.hour_utc / 4) * 4; b.hour = `${String(s).padStart(2, '0')}-${String(s + 4).padStart(2, '0')}UTC`; }
  const liq = c.liquidity_usd ?? 0;
  if (liq > 0) b.liquidity = liq < 250_000 ? '<250k' : liq < 1_000_000 ? '250k-1M' : liq < 5_000_000 ? '1-5M' : '5M+';
  if (c.change_24h != null) b.change24h = c.change_24h < -10 ? '<-10%' : c.change_24h < -2 ? '-10--2%' : c.change_24h < 2 ? 'flat' : c.change_24h < 10 ? '2-10%' : '10%+';
  if (c.atr_pct != null) b.volatility = c.atr_pct < 1 ? 'atr<1%' : c.atr_pct < 3 ? 'atr1-3%' : 'atr3%+';
  if (c.htf_aligned != null) b.htf = c.htf_aligned ? 'aligned' : 'against';
  if (c.btc_change_24h != null) b.btc = c.btc_change_24h < -2 ? 'btc_down' : c.btc_change_24h > 2 ? 'btc_up' : 'btc_flat';
  return b;
}

export interface BucketStat { strategy: string; dim: string; bucket: string; n: number; medianNet: number; winRate: number; verdict: 'favor' | 'avoid' | 'learning' }
function quantile(s: number[], q: number) { if (!s.length) return 0; const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); }
export function aggregate(rows: any[]): BucketStat[] {
  const g = new Map<string, number[]>();
  for (const r of rows) {
    const v = Number(r.net_pct); if (!Number.isFinite(v)) continue;
    for (const [dim, bucket] of Object.entries({ ...bucketsOf(r), all: 'all' })) {
      const k = `${r.strategy}|${dim}|${bucket}`; (g.get(k) ?? g.set(k, []).get(k)!).push(v);
    }
  }
  const minN = num('CRYPTO_SHADOW_STATS_MIN_N', 15), fav = num('CRYPTO_SHADOW_FAVOR_MEDIAN_PCT', 0.5), avd = num('CRYPTO_SHADOW_AVOID_MEDIAN_PCT', 1);
  return Array.from(g.entries()).map(([k, v]) => {
    const [strategy, dim, bucket] = k.split('|'); const s = v.slice().sort((a, b) => a - b); const med = quantile(s, 0.5);
    const verdict: BucketStat['verdict'] = s.length >= minN ? (med > fav ? 'favor' : med < -avd ? 'avoid' : 'learning') : 'learning';
    return { strategy, dim, bucket, n: s.length, medianNet: med, winRate: s.filter((x) => x > 0).length / s.length, verdict };
  });
}
const _statsCache = new Map<number, { at: number; stats: BucketStat[] }>();
export async function computeCryptoShadowStats(userId: number, force = false): Promise<BucketStat[]> {
  const hit = _statsCache.get(userId);
  if (!force && hit && Date.now() - hit.at < 15 * 60_000) return hit.stats;
  await ensureCryptoShadowTables();
  const { rows } = await pool.query(
    `SELECT strategy, direction, hour_utc, liquidity_usd, change_24h, atr_pct, htf_aligned, btc_change_24h, buy_share_h1, txns_h1, market_cap_usd, token_age_hours, net_pct FROM crypto_shadow_context
      WHERE user_id=$1 AND closed_at IS NOT NULL AND net_pct IS NOT NULL AND closed_at >= now() - interval '60 days'`, [userId]);
  const stats = aggregate(rows);
  _statsCache.set(userId, { at: Date.now(), stats });
  return stats;
}
export function adviceFor(stats: BucketStat[], strategy: string, ctx: Parameters<typeof bucketsOf>[0]): string {
  const bs = bucketsOf(ctx);
  const hits = stats.filter((s) => s.strategy === strategy && s.verdict !== 'learning' && bs[s.dim] === s.bucket);
  if (!hits.length) return 'learning';
  const avoid = hits.filter((s) => s.verdict === 'avoid');
  const f = (s: BucketStat) => `${s.verdict}: ${s.dim} ${s.bucket} (n=${s.n}, median ${s.medianNet.toFixed(1)}%)`;
  return `${avoid.length ? 'avoid' : 'favor'} — ${[...avoid, ...hits.filter((s) => s.verdict === 'favor')].map(f).join('; ')}`.slice(0, 500);
}
/** Prompt block for crypto AI confirmation. Advice only. */
export async function getCryptoShadowStatsText(userId: number, max = 12): Promise<string> {
  try {
    // Shadow-only tests (session_breakout, btc_weekend_range) and the hour
    // buckets stay out of the prompt: no FX-style session language in crypto.
    const { SHADOW_ONLY_TESTS } = await import('./crypto-ports');
    const st = (await computeCryptoShadowStats(userId)).filter((s) => s.verdict !== 'learning' && s.dim !== 'all' && s.dim !== 'hour' && !SHADOW_ONLY_TESTS.has(s.strategy));
    if (!st.length) return '';
    const top = st.sort((a, b) => Math.abs(b.medianNet) * Math.sqrt(b.n) - Math.abs(a.medianNet) * Math.sqrt(a.n)).slice(0, max);
    return `CRYPTO SHADOW EVIDENCE (virtual trades of every strategy, net of costs, judged by MEDIAN; advice only; 'short' rows are hypothetical — Base spot can't short):\n` +
      top.map((s) => `- ${s.strategy} ${s.verdict.toUpperCase()} when ${s.dim}=${s.bucket}: n=${s.n}, median ${s.medianNet >= 0 ? '+' : ''}${s.medianNet.toFixed(2)}%, win ${(s.winRate * 100).toFixed(0)}%`).join('\n');
  } catch { return ''; }
}

// ── resolver ────────────────────────────────────────────────────────────────
export async function resolveCryptoShadowTrades(userId: number): Promise<number> {
  await ensureCryptoShadowTables();
  const { rows } = await pool.query(`SELECT * FROM crypto_shadow_trades WHERE user_id=$1 AND status='open'`, [userId]);
  if (!rows.length) return 0;
  const { getDefiPrice } = await import('./defi-market-data');
  let closed = 0;
  for (const t of rows) {
    const px = t.pool_address ? await getDefiPrice(t.chain || 'base', t.pool_address).catch(() => null) : null;
    const ageH = (Date.now() - new Date(t.opened_at).getTime()) / 3_600_000;
    const short = t.direction !== 'long';
    let exit: number | null = null, why = '';
    if (px != null && px > 0) {
      const move = ((short ? t.entry_price - px : px - t.entry_price) / t.entry_price) * 100;
      if (t.peak_gain_pct == null || move > t.peak_gain_pct) await pool.query(`UPDATE crypto_shadow_trades SET peak_gain_pct=$2 WHERE id=$1`, [t.id, move]);
      // Gap-through fills at the worse of price and level (no optimistic stop fills).
      if (short ? px >= t.stop_loss : px <= t.stop_loss) { exit = short ? Math.max(px, t.stop_loss) : Math.min(px, t.stop_loss); why = 'stop'; }
      else if (short ? px <= t.take_profit : px >= t.take_profit) { exit = t.take_profit; why = 'target'; }
      else if (ageH >= t.max_hours) { exit = px; why = 'time limit'; }
    } else if (ageH >= t.max_hours + 24) { exit = null; why = 'no price'; }
    if (!why) continue;
    const gross = exit != null ? ((short ? t.entry_price - exit : exit - t.entry_price) / t.entry_price) * 100 : null;
    const net = gross != null ? gross - Number(t.cost_bps) / 100 : null;
    const r = net != null && t.sl_pct > 0 ? net / t.sl_pct : null;
    const upd = await pool.query(
      `UPDATE crypto_shadow_trades SET status='closed', exit_price=$2, exit_reason=$3, gross_return_pct=$4, return_pct=$5, r_multiple=$6, closed_at=now()
        WHERE id=$1 AND status='open'`, [t.id, exit, why, gross, net, r]);
    if (!upd.rowCount) continue;
    closed++;
    await pool.query(`UPDATE crypto_shadow_context SET closed_at=now(), exit_reason=$2, hold_minutes=$3, net_pct=$4 WHERE trade_id=$1`,
      [t.id, why, ageH * 60, net]).catch(() => {});
  }
  return closed;
}

// ── entry lane ──────────────────────────────────────────────────────────────
const _lastRun = new Map<number, number>();
export async function runCryptoShadowAll(userId: number, cfg: any, symbols: string[], chain: string, slippageCapBps: number, deps: ShadowDeps): Promise<{ opened: number; closed: number }> {
  if (!shadowAllEnabled()) return { opened: 0, closed: 0 };
  await ensureCryptoShadowTables();
  const closed = await resolveCryptoShadowTrades(userId).catch(() => 0);
  if (Date.now() - (_lastRun.get(userId) || 0) < EVERY_MS()) return { opened: 0, closed };
  _lastRun.set(userId, Date.now());

  const { isTokenizedAsset, underlyingOf, paperMaxHoursFor } = await import('./crypto-paper');
  const { estimateCryptoRoundTripBps } = await import('./paper-costs');
  const stats = await computeCryptoShadowStats(userId).catch(() => [] as BucketStat[]);
  const { rows: open } = await pool.query(`SELECT strategy, underlying FROM crypto_shadow_trades WHERE user_id=$1 AND status='open'`, [userId]);
  const { rows: recent } = await pool.query(
    `SELECT strategy, underlying FROM crypto_shadow_trades WHERE user_id=$1 AND status='closed' AND closed_at >= now() - ($2::text || ' milliseconds')::interval`,
    [userId, String(COOLDOWN_MS())]);
  const btc = deps.universe('CBBTC') ? await deps.h1('CBBTC').catch(() => null) : null;
  const btcChange = btc ? pctChange(oldestFirst(btc.bars), 24) : null;
  const lo = num('CRYPTO_PAPER_SL_MIN', 1.5), hi = num('CRYPTO_PAPER_SL_MAX', 12), atrMult = num('CRYPTO_SL_ATR_MULT', 1.5), rr = num('CRYPTO_MIN_RR', 2);
  const floorMult = Number(process.env.CRYPTO_PAPER_COST_FLOOR_MULT ?? 3);
  let opened = 0;
  const shadowCfg = { ...cfg, directionFilter: 'both' };

  for (const symbol of symbols) {
    if (open.length >= MAX_OPEN()) break;
    if (isTokenizedAsset(symbol)) continue;
    const uni = deps.universe(symbol);
    if (!uni?.poolAddress) continue;
    const und = underlyingOf(symbol);
    // New-pool tokens are evaluated ONLY by the new-token runner (meme);
    // established tokens never by it.
    const { NEW_TOKEN_RUNNERS, buyShare } = await import('./crypto-ports');
    const runnersFor = Object.entries(deps.runners).filter(([k]) => uni.newToken ? NEW_TOKEN_RUNNERS.has(k) : !NEW_TOKEN_RUNNERS.has(k));
    const results = (await Promise.all(runnersFor.map(([k, fn]) => fn(symbol, shadowCfg).then((r) => ({ ...r, strategy: r.strategy || k })).catch(() => null))))
      .filter((r): r is ShadowRunnerResult => !!r);
    // Composite (same rule as auto mode): >=2 runners agree, blended score >= floor.
    const ORIGINAL = new Set(['trend_following', 'momentum', 'order_flow', 'volume_profile', 'breakout', 'structure', 'divergence']);
    const dirs = results.filter((r) => r.direction && ORIGINAL.has(r.strategy));
    const buys = dirs.filter((r) => r.direction === 'BUY'), sells = dirs.filter((r) => r.direction === 'SELL');
    const side = buys.length > sells.length ? buys : sells.length > buys.length ? sells : [];
    const signals = results.filter((r) => r.decision === 'signal' && r.direction && r.price);
    if (side.length >= 2) {
      const comp = Math.round(side.reduce((s, r) => s + (r.score ?? 0), 0) / side.length);
      if (comp >= (cfg.compositeMinEdgeScore ?? 72)) signals.push({ ...side[0], decision: 'signal', score: comp, strategy: 'composite_autonomous', reasoning: `${side.length} runners agree` });
    }
    if (!signals.length) continue;
    const h1 = await deps.h1(symbol).catch(() => null);
    if (!h1 || !(h1.atr > 0)) continue;
    const bars = oldestFirst(h1.bars), closes = bars.map((b) => b.c);
    const h1Trend = trendOf(closes, 9, 21);
    const h4Closes = closes.filter((_, i) => (closes.length - 1 - i) % 4 === 0);
    const h4Trend = trendOf(h4Closes, 5, 10);
    const ch1 = pctChange(bars, 1), ch24 = pctChange(bars, 24);
    const vol24 = bars.slice(-24).reduce((a, b) => a + (b.v || 0) * (b.c || 0), 0);

    for (const sig of signals) {
      if (open.length >= MAX_OPEN()) break;
      const strat = sig.strategy;
      if (open.filter((o) => o.strategy === strat).length >= MAX_PER_STRAT()) continue;
      if (open.some((o) => o.strategy === strat && o.underlying === und)) continue;
      if (recent.some((o) => o.strategy === strat && o.underlying === und)) continue;
      const price = Number(sig.price) || Number(uni.priceUsd);
      if (!(price > 0)) continue;
      const direction = sig.direction === 'SELL' ? 'hypothetical_short' : 'long';
      const short = direction !== 'long';
      const slPct = Math.min(hi, Math.max(lo, (h1.atr * atrMult / price) * 100));
      const costBps = estimateCryptoRoundTripBps({ notionalUsd: NOTIONAL(), liquidityUsd: uni.liquidityUsd, slippageCapBps }).roundTripBps
        // New pools: sniping bots, MEV and launch taxes — the high-cost model.
        + (uni.newToken ? Number(process.env.CRYPTO_MEME_EXTRA_COST_BPS ?? 200) : 0);
      if (floorMult > 0 && slPct < floorMult * costBps / 100) continue;
      const stop = short ? price * (1 + slPct / 100) : price * (1 - slPct / 100);
      const target = short ? price * (1 - slPct * rr / 100) : price * (1 + slPct * rr / 100);
      const aligned = h4Trend == null ? null : short ? h4Trend === 'BEARISH' : h4Trend === 'BULLISH';
      const gated = await deps.gate(symbol, sig, cfg).then((g) => g.decision !== 'signal').catch(() => null);
      const hourUtc = new Date().getUTCHours();
      const fl = uni.flow;
      const created = fl?.poolCreatedAt ? new Date(fl.poolCreatedAt).getTime() : NaN;
      const ctx = { hour_utc: hourUtc, liquidity_usd: uni.liquidityUsd, change_24h: ch24, atr_pct: (h1.atr / price) * 100, htf_aligned: aligned, btc_change_24h: btcChange, direction: short ? 'short' : 'long',
        buy_share_h1: fl ? buyShare(fl.h1) : null, txns_h1: fl ? fl.h1.buys + fl.h1.sells : null,
        market_cap_usd: fl ? (fl.marketCapUsd ?? fl.fdvUsd) : null,
        token_age_hours: Number.isFinite(created) ? (Date.now() - created) / 3_600_000 : null };
      const advice = adviceFor(stats, strat, ctx);
      // Lesson gate: skip entries the lane's own lessons have proven
      // losing. Stats are this lane's closes only (rolling 60 days).
      if (cryptoShadowLessonsOn()) {
        const hit = matchingAvoidBucket(stats, strat, bucketsOf(ctx), { includeAll: true });
        if (hit) {
          void logShadowLessonBlock({
            lane: 'crypto_shadow', userId, strategyKey: strat,
            bucket: hit.dim === 'all' ? 'strategy (all)' : `${hit.dim} ${hit.bucket}`,
            n: hit.n, winRate: hit.winRate, medianPct: hit.medianNet,
            reason: `bucket verdict 'avoid': n=${hit.n}, median net ${hit.medianNet.toFixed(2)}% over the rolling 60 days`,
          });
          continue;
        }
      }
      const tags: string[] = [];
      if (ch1 != null && Math.abs(ch1) >= 3) tags.push(ch1 > 0 ? 'hot_hour' : 'dump_hour');
      if (ch24 != null && ch24 >= 20) tags.push('extended_24h');
      // HTF alignment filter (design step 3): tag + stats only, never a block.
      if (aligned === false) tags.push('against_htf');
      if (aligned === true) tags.push('htf_aligned');
      if (gated) tags.push('live_gate_would_block');
      if (uni.liquidityUsd < 250_000) tags.push('thin_pool');
      if (uni.newToken) tags.push('new_token');
      if (ctx.buy_share_h1 != null && ctx.buy_share_h1 > 0.65) tags.push('buyers_dominant');
      if (ctx.buy_share_h1 != null && ctx.buy_share_h1 < 0.45) tags.push('sellers_dominant');
      const ins = await pool.query(
        `INSERT INTO crypto_shadow_trades (user_id, strategy, symbol, underlying, chain, token_address, pool_address, direction, entry_price, stop_loss, take_profit,
           sl_pct, notional_usd, cost_bps, score, max_hours) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [userId, strat, symbol, und, chain, uni.address ?? null, uni.poolAddress, direction, price, stop, target, slPct, NOTIONAL(), costBps, sig.score ?? null, paperMaxHoursFor(strat)]);
      const id = ins.rows[0]?.id;
      if (!id) continue;
      await pool.query(
        `INSERT INTO crypto_shadow_context (trade_id, user_id, strategy, symbol, direction, liquidity_usd, change_1h, change_24h, volume_24h_usd, atr_pct,
           h1_trend, h4_trend, htf_aligned, live_gate_blocked, btc_change_24h, hour_utc, day_of_week, score, tags, advice_at_entry,
           buy_share_h1, buy_share_h24, txns_h1, txns_h24, buyers_h1, sellers_h1, market_cap_usd, token_age_hours, new_token)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29) ON CONFLICT (trade_id) DO NOTHING`,
        [id, userId, strat, symbol, ctx.direction, uni.liquidityUsd, ch1, ch24, vol24 || null, ctx.atr_pct, h1Trend, h4Trend, aligned, gated, btcChange,
         hourUtc, new Date().getUTCDay(), sig.score ?? null, tags, advice,
         ctx.buy_share_h1, fl ? buyShare(fl.h24) : null, ctx.txns_h1, fl ? fl.h24.buys + fl.h24.sells : null,
         fl?.h1.buyers ?? null, fl?.h1.sellers ?? null, ctx.market_cap_usd, ctx.token_age_hours, !!uni.newToken]).catch(() => {});
      open.push({ strategy: strat, underlying: und });
      opened++;
    }
  }
  return { opened, closed };
}
