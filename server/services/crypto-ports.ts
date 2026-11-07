// ─────────────────────────────────────────────────────────────────────────────
// Crypto ports of Sol / FX strategies — 2026-11-07 (design step 3).
//
// SHADOW LANE ONLY (crypto-shadow.ts). These runners are NOT in
// AUTO_STRATEGIES, the paper path or the live path; promoting one is the
// user's call once its shadow record earns it.
//
//   sniper            FX: >=4 of 5 confluences (15m EMA trend, RSI zone, MACD
//                     histogram, structure break, volume surge) AND the 4h bias
//                     (aggregated from 1h) agrees.
//   smc_ote           FX: 1h break of structure, price retraced into the 62-79%
//                     optimal-trade-entry zone of the impulse leg, with an
//                     aligned 15m order block or FVG. smcUtils wants
//                     NEWEST-FIRST candles; bars here are oldest-first, so they
//                     are reversed at the call (the d1d1f932 trap).
//   vwap_reversion    FX: price >= 2 sigma below the UTC-day VWAP with RSI <= 35.
//                     Long only (a short has no execution path on Base).
//   liquidity_sweep   Sol/FX: a recent 15m wick took out the prior swing low
//                     (high) and closed back inside; price holds back inside.
//   session_breakout  shadow test: 00-07 UTC range broken by a 15m close
//                     07-12 UTC, entered near the broken level.
//   btc_weekend_range shadow test: cbBTC only; Saturday 00-12 UTC range broken
//                     by a 1h close later in the weekend.
//
// Data: only 15m and 1h candles, which the existing runners already fetch;
// getDefiCandles caches per pool+timeframe at depth 300, so these add no
// GeckoTerminal calls. Kill switches: CRYPTO_PORTS=off (all),
// CRYPTO_RUNNER_<ID>=off (one; also works for the original runners).
// Step 4 adds dip_sniper, volume_explosion, flow_follower (pool buy/sell
// counts parsed from the discovery pages already fetched — no extra calls)
// and meme_velocity (new Base pools >= $25k, one shared new_pools call per
// discovery TTL, extra MEV cost CRYPTO_MEME_EXTRA_COST_BPS).
// The HTF alignment filter is not a runner: crypto-shadow.ts records
// htf_aligned + tags per entry and the stats judge it ('htf' bucket).
// ─────────────────────────────────────────────────────────────────────────────

type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
type Fetch = (symbol: string, tf: string, count: number, chain: string) => Promise<Bar[]>;
type Flow = import('./defi-market-data').PoolFlow;
type Entry = { liquidityUsd: number; priceUsd: number; volume24Usd?: number; flow?: Flow; newToken?: boolean } | undefined;

/** Step-4 flow runners: need the pool's buy/sell counts (no candles). */
export const FLOW_RUNNERS = new Set(['dip_sniper', 'volume_explosion', 'flow_follower', 'meme_velocity']);
/** Runs ONLY on new-pool tokens; every other runner skips them. */
export const NEW_TOKEN_RUNNERS = new Set(['meme_velocity']);
export function buyShare(w: { buys: number; sells: number } | undefined): number | null {
  const t = (w?.buys ?? 0) + (w?.sells ?? 0);
  return t > 0 ? (w!.buys / t) : null;
}
export interface PortResult { decision: 'signal' | 'watching' | 'error'; reasoning: string; score: number | null; price: number | null; dailyChangePercent: number | null; strategy: string; direction?: 'BUY' | 'SELL' }

/** Shadow-only tests: kept out of the AI prompt's evidence block. */
export const SHADOW_ONLY_TESTS = new Set(['session_breakout', 'btc_weekend_range']);

export function runnerEnabled(id: string): boolean {
  return process.env[`CRYPTO_RUNNER_${id.toUpperCase()}`] !== 'off';
}
export const portsEnabled = () => process.env.CRYPTO_PORTS !== 'off';

// ── indicators (oldest-first arrays) ────────────────────────────────────────
function emaSeries(v: number[], n: number): number[] {
  const out: number[] = []; if (v.length < n) return out;
  const k = 2 / (n + 1); let e = v.slice(0, n).reduce((a, b) => a + b, 0) / n; out[n - 1] = e;
  for (let i = n; i < v.length; i++) { e = v[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
const last = <T>(a: T[]) => a[a.length - 1];
function rsi(c: number[], n = 14): number | null {
  if (c.length <= n) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d >= 0) g += d; else l -= d; }
  g /= n; l /= n;
  for (let i = n + 1; i < c.length; i++) { const d = c[i] - c[i - 1]; g = (g * (n - 1) + Math.max(0, d)) / n; l = (l * (n - 1) + Math.max(0, -d)) / n; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
function macdHist(c: number[]): number | null {
  const f = emaSeries(c, 12), s = emaSeries(c, 26);
  if (s.length < c.length || c.length < 35) return null;
  const macd = c.map((_, i) => (f[i] ?? NaN) - (s[i] ?? NaN)).slice(25);
  const sig = emaSeries(macd, 9);
  return sig.length ? last(macd) - last(sig) : null;
}
function to4h(h1: Bar[]): Bar[] {
  const out: Bar[] = [];
  for (const b of h1) {
    const t4 = Math.floor(b.t / 14_400_000) * 14_400_000;
    const cur = out[out.length - 1];
    if (cur && cur.t === t4) { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; }
    else out.push({ t: t4, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
  }
  return out;
}
function bias(closes: number[], f: number, s: number): 'BUY' | 'SELL' | null {
  const a = last(emaSeries(closes, f)), b = last(emaSeries(closes, s));
  if (a == null || b == null) return null;
  return a > b ? 'BUY' : a < b ? 'SELL' : null;
}
const res = (strategy: string, decision: PortResult['decision'], reasoning: string, price: number | null, score: number | null = null, direction?: 'BUY' | 'SELL'): PortResult =>
  ({ decision, reasoning, score, price, dailyChangePercent: null, strategy, ...(direction ? { direction } : {}) });
const chainOf = (cfg: any) => cfg?.defiChain || 'base';

// ── runners ─────────────────────────────────────────────────────────────────
export function makePortRunners(fetchBars: Fetch, entryOf: (symbol: string) => Entry = () => undefined): Record<string, (symbol: string, cfg: any) => Promise<PortResult>> {
  const sniper = async (symbol: string, cfg: any): Promise<PortResult> => {
    const S = 'sniper';
    const m15 = await fetchBars(symbol, '15m', 120, chainOf(cfg)); const h1 = await fetchBars(symbol, '1h', 200, chainOf(cfg));
    if (m15.length < 60 || h1.length < 60) return res(S, 'error', `${symbol}: not enough history for sniper`, null);
    const c = m15.map((b) => b.c), price = last(c);
    const dir = bias(c, 9, 21);
    if (!dir) return res(S, 'watching', `${symbol}: no 15m trend`, price, 30);
    const { detectBOSCHOCH } = await import('../utils/smcUtils');
    const nf = m15.slice().reverse();
    const r = rsi(c), mh = macdHist(c);
    const bos = detectBOSCHOCH(nf, dir);
    const vRecent = m15.slice(-3).reduce((a, b) => a + b.v, 0) / 3, vBase = m15.slice(-23, -3).reduce((a, b) => a + b.v, 0) / 20;
    const checks = {
      ema: true,
      rsi: r != null && (dir === 'BUY' ? r >= 45 && r <= 68 : r >= 32 && r <= 55),
      macd: mh != null && (dir === 'BUY' ? mh > 0 : mh < 0),
      structure: !!bos.detected && bos.direction === (dir === 'BUY' ? 'BULLISH' : 'BEARISH'),
      volume: vBase > 0 && vRecent > vBase * 1.2,
    };
    const n = Object.values(checks).filter(Boolean).length;
    const h4 = bias(to4h(h1).map((b) => b.c), 5, 10);
    const why = `${n}/5 (${Object.entries(checks).filter(([, v]) => v).map(([k]) => k).join(', ')}), 4h bias ${h4 ?? 'n/a'}`;
    if (n >= 4 && h4 === dir) return res(S, 'signal', `${symbol}: sniper ${dir} — ${why}`, price, 60 + n * 7, dir);
    return res(S, 'watching', `${symbol}: sniper ${dir} — ${why}`, price, 40 + n * 5);
  };

  const smcOte = async (symbol: string, cfg: any): Promise<PortResult> => {
    const S = 'smc_ote';
    const h1 = await fetchBars(symbol, '1h', 120, chainOf(cfg)); const m15 = await fetchBars(symbol, '15m', 120, chainOf(cfg));
    if (h1.length < 40 || m15.length < 40) return res(S, 'error', `${symbol}: not enough history for smc_ote`, null);
    const { detectBOSCHOCH, detectOrderBlock, detectFairValueGap } = await import('../utils/smcUtils');
    const nf = (bars: Bar[]) => bars.slice().reverse();
    const h1nf = nf(h1), m15nf = nf(m15), price = last(m15).c;
    for (const dir of ['BUY', 'SELL'] as const) {
      const bos = detectBOSCHOCH(h1nf, dir);
      if (!bos.detected || bos.direction !== (dir === 'BUY' ? 'BULLISH' : 'BEARISH')) continue;
      // Impulse leg over the last 24 1h bars (oldest-first indices).
      const leg = h1.slice(-24);
      let lo = Infinity, hi = -Infinity, loI = 0, hiI = 0;
      leg.forEach((b, i) => { if (b.l < lo) { lo = b.l; loI = i; } if (b.h > hi) { hi = b.h; hiI = i; } });
      const range = hi - lo; if (!(range > 0)) continue;
      if (dir === 'BUY' && loI >= hiI) continue;  // impulse must run low → high
      if (dir === 'SELL' && hiI >= loI) continue; // and high → low for a short
      const zTop = dir === 'BUY' ? hi - 0.62 * range : lo + 0.79 * range;
      const zBot = dir === 'BUY' ? hi - 0.79 * range : lo + 0.62 * range;
      if (price < zBot || price > zTop) return res(S, 'watching', `${symbol}: ${dir} ${bos.type}, price outside OTE ${zBot.toPrecision(5)}–${zTop.toPrecision(5)}`, price, 45);
      const ob = detectOrderBlock(m15nf, dir), fvg = detectFairValueGap(m15nf, dir);
      const poi = (ob.detected && ob.aligns) || (fvg.detected && fvg.direction === (dir === 'BUY' ? 'BULLISH' : 'BEARISH'));
      if (!poi) return res(S, 'watching', `${symbol}: ${dir} in OTE but no aligned 15m order block/FVG`, price, 55);
      return res(S, 'signal', `${symbol}: ${dir} ${bos.type} on 1h, price in the 62–79% OTE with an aligned 15m ${ob.detected && ob.aligns ? 'order block' : 'FVG'}`, price, 75, dir);
    }
    return res(S, 'watching', `${symbol}: no 1h structure break`, price, 30);
  };

  const vwapReversion = async (symbol: string, cfg: any): Promise<PortResult> => {
    const S = 'vwap_reversion';
    const m15 = await fetchBars(symbol, '15m', 120, chainOf(cfg));
    if (m15.length < 40) return res(S, 'error', `${symbol}: not enough history for vwap_reversion`, null);
    const day0 = Math.floor(Date.now() / 86_400_000) * 86_400_000;
    let win = m15.filter((b) => b.t >= day0);
    if (win.length < 8) win = m15.slice(-32); // early in the UTC day: trailing 8h
    let pv = 0, vv = 0;
    for (const b of win) { const tp = (b.h + b.l + b.c) / 3; pv += tp * b.v; vv += b.v; }
    if (!(vv > 0)) return res(S, 'watching', `${symbol}: no volume for VWAP`, last(m15).c, 20);
    const vwap = pv / vv;
    let varSum = 0; for (const b of win) { const tp = (b.h + b.l + b.c) / 3; varSum += b.v * (tp - vwap) ** 2; }
    const sd = Math.sqrt(varSum / vv), price = last(m15).c, r = rsi(m15.map((b) => b.c));
    const z = sd > 0 ? (price - vwap) / sd : 0;
    if (z <= -2 && r != null && r <= 35) return res(S, 'signal', `${symbol}: ${z.toFixed(1)}σ below VWAP ${vwap.toPrecision(5)}, RSI ${r.toFixed(0)} — mean-reversion long`, price, 70, 'BUY');
    return res(S, 'watching', `${symbol}: ${z.toFixed(1)}σ from VWAP, RSI ${r?.toFixed(0) ?? 'n/a'}`, price, 35);
  };

  const liquiditySweep = async (symbol: string, cfg: any): Promise<PortResult> => {
    const S = 'liquidity_sweep';
    const m15 = await fetchBars(symbol, '15m', 60, chainOf(cfg));
    if (m15.length < 35) return res(S, 'error', `${symbol}: not enough history for liquidity_sweep`, null);
    const prior = m15.slice(-33, -3), recent = m15.slice(-3), price = last(m15).c;
    const swingLo = Math.min(...prior.map((b) => b.l)), swingHi = Math.max(...prior.map((b) => b.h));
    const bull = recent.some((b) => b.l < swingLo && b.c > swingLo) && price > swingLo;
    const bear = recent.some((b) => b.h > swingHi && b.c < swingHi) && price < swingHi;
    if (bull && !bear) return res(S, 'signal', `${symbol}: swept the 15m swing low ${swingLo.toPrecision(5)} and closed back above`, price, 68, 'BUY');
    if (bear && !bull) return res(S, 'signal', `${symbol}: swept the 15m swing high ${swingHi.toPrecision(5)} and closed back below`, price, 68, 'SELL');
    return res(S, 'watching', `${symbol}: no sweep`, price, 30);
  };

  const sessionBreakout = async (symbol: string, cfg: any): Promise<PortResult> => {
    const S = 'session_breakout';
    const now = new Date(), h = now.getUTCHours();
    const m15 = await fetchBars(symbol, '15m', 120, chainOf(cfg));
    const price = m15.length ? last(m15).c : null;
    if (h < 7 || h >= 12) return res(S, 'watching', `${symbol}: outside the 07–12 UTC window`, price, 0);
    const day0 = Math.floor(now.getTime() / 86_400_000) * 86_400_000;
    const range = m15.filter((b) => b.t >= day0 && b.t < day0 + 7 * 3_600_000);
    if (range.length < 20 || price == null) return res(S, 'watching', `${symbol}: no complete 00–07 UTC range`, price, 0);
    const hi = Math.max(...range.map((b) => b.h)), lo = Math.min(...range.map((b) => b.l)), size = hi - lo;
    const after = m15.filter((b) => b.t >= day0 + 7 * 3_600_000).slice(0, -1);
    const brk = after.find((b) => b.c > hi || b.c < lo);
    if (!brk || !(size > 0)) return res(S, 'watching', `${symbol}: 00–07 UTC range intact`, price, 30);
    const dir: 'BUY' | 'SELL' = brk.c > hi ? 'BUY' : 'SELL';
    const level = dir === 'BUY' ? hi : lo;
    if (Math.abs(price - level) > size * 0.5) return res(S, 'watching', `${symbol}: broke ${dir === 'BUY' ? 'up' : 'down'} but price is extended from the level`, price, 45);
    return res(S, 'signal', `${symbol}: 00–07 UTC range ${lo.toPrecision(5)}–${hi.toPrecision(5)} broken ${dir === 'BUY' ? 'up' : 'down'}, near the level`, price, 65, dir);
  };

  const btcWeekendRange = async (symbol: string, cfg: any): Promise<PortResult> => {
    const S = 'btc_weekend_range';
    if (symbol.toUpperCase() !== 'CBBTC') return res(S, 'watching', `${symbol}: BTC only`, null, 0);
    const now = new Date(), dow = now.getUTCDay();
    const h1 = await fetchBars(symbol, '1h', 72, chainOf(cfg));
    const price = h1.length ? last(h1).c : null;
    if (!(dow === 6 || dow === 0) || price == null) return res(S, 'watching', `${symbol}: weekday`, price, 0);
    const sat0 = Math.floor(now.getTime() / 86_400_000) * 86_400_000 - (dow === 0 ? 86_400_000 : 0);
    const range = h1.filter((b) => b.t >= sat0 && b.t < sat0 + 12 * 3_600_000);
    if (range.length < 10) return res(S, 'watching', `${symbol}: Saturday range not complete`, price, 0);
    const hi = Math.max(...range.map((b) => b.h)), lo = Math.min(...range.map((b) => b.l));
    const after = h1.filter((b) => b.t >= sat0 + 12 * 3_600_000).slice(0, -1);
    const brk = after.find((b) => b.c > hi || b.c < lo);
    if (!brk) return res(S, 'watching', `${symbol}: weekend range intact`, price, 30);
    const dir: 'BUY' | 'SELL' = brk.c > hi ? 'BUY' : 'SELL';
    return res(S, 'signal', `${symbol}: Saturday 00–12 UTC range ${lo.toFixed(0)}–${hi.toFixed(0)} broken ${dir === 'BUY' ? 'up' : 'down'} on a 1h close`, price, 62, dir);
  };

  // ── Step 4 flow runners (pool buy/sell counts from discovery; long only) ──
  const minTx = () => Number(process.env.CRYPTO_FLOW_MIN_TXNS_H1 ?? 20);
  const flowOf = (symbol: string, S: string): { f: Flow; e: NonNullable<Entry> } | PortResult => {
    const e = entryOf(symbol);
    if (!e?.flow) return res(S, 'watching', `${symbol}: no pool flow data`, e?.priceUsd ?? null, 0);
    return { f: e.flow, e };
  };
  const isRes = (x: any): x is PortResult => !!x && typeof x.decision === 'string';

  // Sol dip_sniper: price down on the day while buyers dominate the last hour.
  const dipSniper = async (symbol: string): Promise<PortResult> => {
    const S = 'dip_sniper'; const x = flowOf(symbol, S); if (isRes(x)) return x;
    const ch = x.f.change24hPct, bs = buyShare(x.f.h1), n = x.f.h1.buys + x.f.h1.sells;
    if (ch != null && ch <= -4 && ch >= -40 && bs != null && bs > 0.62 && n >= minTx())
      return res(S, 'signal', `${symbol}: ${ch.toFixed(1)}% on 24h but ${(bs * 100).toFixed(0)}% of ${n} trades in the last hour are buys — accumulation into the dip`, x.e.priceUsd, 66, 'BUY');
    return res(S, 'watching', `${symbol}: 24h ${ch?.toFixed(1) ?? 'n/a'}%, 1h buys ${bs != null ? (bs * 100).toFixed(0) : 'n/a'}%`, x.e.priceUsd, 30);
  };
  // Sol volume_explosion: last-hour volume >= 4x the 24h hourly average, buyers ahead.
  const volumeExplosion = async (symbol: string): Promise<PortResult> => {
    const S = 'volume_explosion'; const x = flowOf(symbol, S); if (isRes(x)) return x;
    const v1 = x.f.volume1hUsd ?? 0, avg = (x.e.volume24Usd ?? 0) / 24, bs = buyShare(x.f.h1);
    const mult = avg > 0 ? v1 / avg : 0;
    if (mult >= Number(process.env.CRYPTO_VOLX_MULT ?? 4) && bs != null && bs > 0.52)
      return res(S, 'signal', `${symbol}: last-hour volume ${mult.toFixed(1)}x the 24h hourly average, ${(bs * 100).toFixed(0)}% buys`, x.e.priceUsd, 64, 'BUY');
    return res(S, 'watching', `${symbol}: 1h volume ${mult.toFixed(1)}x average`, x.e.priceUsd, 30);
  };
  // Sol whale/smart-money flow: unusually large average trade, buyers ahead,
  // price not yet run (proxy: 1h avg trade size vs the 24h average; no 7d data).
  const flowFollower = async (symbol: string): Promise<PortResult> => {
    const S = 'flow_follower'; const x = flowOf(symbol, S); if (isRes(x)) return x;
    const n1 = x.f.h1.buys + x.f.h1.sells, n24 = x.f.h24.buys + x.f.h24.sells;
    const avg1 = n1 > 0 && x.f.volume1hUsd ? x.f.volume1hUsd / n1 : 0, avg24 = n24 > 0 ? (x.e.volume24Usd ?? 0) / n24 : 0;
    const sizeX = avg24 > 0 ? avg1 / avg24 : 0, bs = buyShare(x.f.h1), ch = x.f.change1hPct;
    if (sizeX >= 1.5 && bs != null && bs > 0.58 && n1 >= minTx() && ch != null && ch >= -5 && ch <= 20)
      return res(S, 'signal', `${symbol}: average trade ${sizeX.toFixed(1)}x the 24h norm, ${(bs * 100).toFixed(0)}% buys, 1h ${ch.toFixed(1)}% — large buyers before the move`, x.e.priceUsd, 64, 'BUY');
    return res(S, 'watching', `${symbol}: trade size ${sizeX.toFixed(1)}x norm`, x.e.priceUsd, 30);
  };
  // Sol meme_velocity / pump scalp: NEW Base pools only (>= $25k liquidity,
  // < 72h old), exploding in the last hour with buyers dominating.
  const memeVelocity = async (symbol: string): Promise<PortResult> => {
    const S = 'meme_velocity'; const x = flowOf(symbol, S); if (isRes(x)) return x;
    if (!x.e.newToken) return res(S, 'watching', `${symbol}: not a new pool`, x.e.priceUsd, 0);
    const ch = x.f.change1hPct, bs = buyShare(x.f.h1), n = x.f.h1.buys + x.f.h1.sells;
    if (ch != null && ch >= Number(process.env.CRYPTO_MEME_MIN_1H_PCT ?? 20) && bs != null && bs > 0.55 && n >= minTx())
      return res(S, 'signal', `${symbol}: new pool up ${ch.toFixed(0)}% in the last hour, ${(bs * 100).toFixed(0)}% buys over ${n} trades`, x.e.priceUsd, 60, 'BUY');
    return res(S, 'watching', `${symbol}: new pool, 1h ${ch?.toFixed(0) ?? 'n/a'}%`, x.e.priceUsd, 25);
  };

  const all: Record<string, (s: string, c: any) => Promise<PortResult>> = {
    sniper, smc_ote: smcOte, vwap_reversion: vwapReversion, liquidity_sweep: liquiditySweep,
    session_breakout: sessionBreakout, btc_weekend_range: btcWeekendRange,
    dip_sniper: dipSniper, volume_explosion: volumeExplosion, flow_follower: flowFollower, meme_velocity: memeVelocity,
  };
  if (!portsEnabled()) return {};
  return Object.fromEntries(Object.entries(all).filter(([id]) => runnerEnabled(id)));
}
