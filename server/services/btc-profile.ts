// ─────────────────────────────────────────────────────────────────────────────
// BTCUSD profile for the FX engine (2026-10-16).
//
// 90 days of BTCUSD on TradeLocker: +$17.3k over 140 trades at a 38% win
// rate — a TREND pair: few, large winners. 06–16 UTC made +$17.5k at 75% WR;
// 20–01 UTC lost −$4.3k at 22%. BUYs made +$16.6k, SELLs +$0.7k. Holds over
// 4h won 10 of 12. So, for BTC only:
//   1. Entries only 06:00–16:00 UTC; weekends at half size.
//   2. Longs need H4 bullish; shorts need H4 AND daily bearish.
//   3. Stop at least 1.5× H1 ATR; lots scaled down by the same factor so the
//      money at risk doesn't grow; target kept at ≥ 2R.
//   4. Let winners run: at +2R the stop locks +1R, then trails behind the
//      lowest low / highest high of the last 3 H1 candles (only tightens).
//      AI/reversal closes wait 60 min after the fill (xau-rules min hold).
//   5. Crypto context for the AI: equities (US30), dollar (USDI), weekend gap.
//   6. At most one BTC entry per H1 candle.
// BTC_PROFILE=off disables everything here; each threshold is env-tunable.
// ─────────────────────────────────────────────────────────────────────────────

import { marketDataService } from '../market-data/service';

export const BTC_PROFILE_ON = () => process.env.BTC_PROFILE !== 'off';
export function isBtc(symbol: string | null | undefined): boolean {
  return /^BTC/i.test(String(symbol || '').replace(/[^A-Za-z]/g, ''));
}

const HOURS = String(process.env.BTC_TRADE_HOURS_UTC || '6-16').split('-').map(Number);
const ATR_MULT = Number(process.env.BTC_SL_ATR_MULT ?? 1.5);
const MIN_RR = Number(process.env.BTC_MIN_RR ?? 2);
const WEEKEND_SIZE = Number(process.env.BTC_WEEKEND_SIZE ?? 0.5); // 0 = skip weekends

type Bar = { timestamp: number; open: number; high: number; low: number; close: number };
const h1Cache = new Map<string, { at: number; bars: Bar[]; atr: number }>();
const d1Cache = new Map<string, { at: number; trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' }>();
const lastEntryCandle = new Map<string, number>();

export async function btcH1(symbol: string): Promise<{ bars: Bar[]; atr: number } | null> {
  const hit = h1Cache.get(symbol);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit;
  try {
    const r = await marketDataService.fetchMarketData({ symbol, assetType: marketDataService.detectAssetType(symbol), timeframe: '1h', limit: 60 });
    const bars = ((r?.bars || []) as Bar[]).slice(0, -1);
    if (bars.length < 20) return null;
    const trs = bars.slice(1).map((b, i) => Math.max(b.high - b.low, Math.abs(b.high - bars[i].close), Math.abs(b.low - bars[i].close)));
    const atr = trs.slice(-14).reduce((a, c) => a + c, 0) / 14;
    const v = { at: Date.now(), bars, atr };
    h1Cache.set(symbol, v);
    return v;
  } catch { return null; }
}

/** Daily trend from EMA20 vs EMA50 and the last close (refreshed every 4h). */
export async function btcDailyTrend(symbol: string): Promise<'BULLISH' | 'BEARISH' | 'NEUTRAL' | null> {
  const hit = d1Cache.get(symbol);
  if (hit && Date.now() - hit.at < 4 * 3_600_000) return hit.trend;
  try {
    const r = await marketDataService.fetchMarketData({ symbol, assetType: marketDataService.detectAssetType(symbol), timeframe: '1d', limit: 80 });
    const closes = ((r?.bars || []) as Bar[]).slice(0, -1).map((b) => Number(b.close));
    if (closes.length < 55) return null;
    const ema = (n: number) => { const k = 2 / (n + 1); let e = closes.slice(0, n).reduce((a, c) => a + c, 0) / n; for (const c of closes.slice(n)) e = c * k + e * (1 - k); return e; };
    const e20 = ema(20), e50 = ema(50), last = closes[closes.length - 1];
    const trend = e20 > e50 && last > e20 ? 'BULLISH' : e20 < e50 && last < e20 ? 'BEARISH' : 'NEUTRAL';
    d1Cache.set(symbol, { at: Date.now(), trend });
    return trend;
  } catch { return null; }
}

/**
 * Entry rules 1, 2, 3 and 6. Returns a block reason, or adjusted stop / target
 * and a lot multiplier (≤ 1) to apply.
 */
export interface BtcEntryResult { block?: string; stopLoss?: number; takeProfit?: number; lotScale: number; weekendScale?: number; notes: string[] }
export async function btcEntryCheck(d: { symbol: string; direction: string; entryPrice?: number; stopLoss?: number; takeProfit?: number }, h4Trend: string | null | undefined, now = new Date()): Promise<BtcEntryResult> {
  const notes: string[] = [];
  let lotScale = 1;
  let weekendScale = 1;
  const h = now.getUTCHours();
  if (!(h >= HOURS[0] && h < HOURS[1])) return { block: `BTC trades only ${HOURS[0]}:00–${HOURS[1]}:00 UTC (late US/Asia lost −$4.3k over 90 days)`, lotScale: 0, notes: [] };
  const dow = now.getUTCDay();
  if (dow === 0 || dow === 6) {
    if (!(WEEKEND_SIZE > 0)) return { block: 'BTC weekend trading is off (thin liquidity)', lotScale: 0, notes: [] };
    lotScale *= WEEKEND_SIZE;
    weekendScale = WEEKEND_SIZE;
    notes.push(`weekend size ×${WEEKEND_SIZE}`);
  }
  const dir = String(d.direction || '').toUpperCase();
  if (dir === 'BUY' && h4Trend !== 'BULLISH') return { block: `BTC long needs H4 bullish (H4 ${h4Trend ?? 'n/a'})`, lotScale: 0, notes: [] };
  if (dir === 'SELL') {
    const d1 = await btcDailyTrend(d.symbol);
    if (h4Trend !== 'BEARISH' || d1 !== 'BEARISH') return { block: `BTC short needs H4 and daily bearish (H4 ${h4Trend ?? 'n/a'}, D1 ${d1 ?? 'n/a'}) — shorts made only +$718 over 90 days`, lotScale: 0, notes: [] };
  }
  const candle = Math.floor(now.getTime() / 3_600_000);
  if (lastEntryCandle.get(d.symbol) === candle) return { block: 'BTC: one entry per H1 candle', lotScale: 0, notes: [] };

  let stopLoss = d.stopLoss, takeProfit = d.takeProfit;
  const entry = Number(d.entryPrice), sl = Number(d.stopLoss);
  const h1 = await btcH1(d.symbol);
  if (h1 && entry > 0 && sl > 0) {
    const risk = Math.abs(entry - sl);
    const minRisk = h1.atr * ATR_MULT;
    if (risk > 0 && risk < minRisk) {
      stopLoss = dir === 'BUY' ? entry - minRisk : entry + minRisk;
      lotScale *= risk / minRisk; // same money at risk with the wider stop
      notes.push(`stop widened to ${ATR_MULT}× H1 ATR (${Math.round(minRisk)}), lots ×${(risk / minRisk).toFixed(2)}`);
    }
    const newRisk = Math.abs(entry - Number(stopLoss));
    const tp = Number(takeProfit);
    if (!(tp > 0) || Math.abs(tp - entry) < newRisk * MIN_RR) {
      takeProfit = dir === 'BUY' ? entry + newRisk * MIN_RR : entry - newRisk * MIN_RR;
      notes.push(`target set to ${MIN_RR}R`);
    }
  }
  return { stopLoss, takeProfit, lotScale, weekendScale, notes };
}

export function markBtcEntry(symbol: string, now = new Date()): void {
  lastEntryCandle.set(symbol, Math.floor(now.getTime() / 3_600_000));
}

/** Rule 4: the stop BTC wants now (only ever tightens), or null. */
export function btcTrailStop(p: { direction: string; entry: number; initialStop: number; price: number; currentStop?: number | null; bars: Bar[] }): { stop: number; why: string } | null {
  const buy = p.direction === 'BUY';
  const risk = Math.abs(p.entry - p.initialStop);
  if (!(risk > 0) || !(p.price > 0)) return null;
  const favR = (buy ? p.price - p.entry : p.entry - p.price) / risk;
  if (favR < MIN_RR) return null;
  let want = buy ? p.entry + risk : p.entry - risk; // lock +1R
  let why = `+${favR.toFixed(1)}R → lock +1R`;
  const last3 = p.bars.slice(-3);
  if (last3.length === 3) {
    const swing = buy ? Math.min(...last3.map((b) => b.low)) : Math.max(...last3.map((b) => b.high));
    if (buy ? swing > want : swing < want) { want = swing; why = `+${favR.toFixed(1)}R → trail behind last 3 H1 ${buy ? 'lows' : 'highs'}`; }
  }
  // Never at/through the current price, and only tighten.
  if (buy ? want >= p.price : want <= p.price) return null;
  const cur = Number(p.currentStop);
  if (cur > 0 && (buy ? want <= cur : want >= cur)) return null;
  return { stop: Math.round(want * 100) / 100, why };
}

/** Rule 5: crypto context line for the AI prompt. */
export function btcContextLine(crossAssets: Record<string, any> | undefined, fridayClose: number | undefined, price: number | undefined): string {
  const eq = crossAssets?.US30?.trend, usd = crossAssets?.USDI?.trend;
  const dow = new Date().getUTCDay();
  const gap = (dow === 0 || dow === 1) && fridayClose && price ? ((price - fridayClose) / fridayClose) * 100 : null;
  return `BTCUSD CRYPTO CONTEXT: trades 24/7 but this engine only enters ${HOURS[0]}-${HOURS[1]} UTC. It is a TREND pair here (few large winners; longs far stronger than shorts; holds >4h won 10/12).` +
    ` US equities (US30) ${eq ?? 'n/a'} — BTC usually moves WITH stocks; dollar (USDI) ${usd ?? 'n/a'} — BTC usually moves AGAINST the dollar.` +
    (gap != null ? ` Weekend move vs Friday close: ${gap >= 0 ? '+' : ''}${gap.toFixed(2)}% (CME gap risk on Monday).` : '') +
    ` Prefer longs with H4 bullish; shorts only with H4 and daily bearish. Stops >= ${ATR_MULT}x H1 ATR, targets >= ${MIN_RR}R, let it run.`;
}
