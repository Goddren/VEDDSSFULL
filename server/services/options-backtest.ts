// Model-based backtester for the defined-risk credit-spread strategy.
//
// HONEST SCOPE: there is no historical option-chain feed here, so this does NOT
// replay real bid/ask/greeks. It reconstructs each spread from historical
// UNDERLYING daily bars + Black-Scholes pricing, using a realized-volatility
// estimate as the IV proxy (the same limitation the live IV-rank gate has until
// a real IV feed exists). It's for validating PARAMETERS (delta, width, DTE,
// IV-rank threshold, take/stop) and stress-window behavior — not for predicting
// exact dollars. Judge it on Sharpe / max drawdown / by-year, not on win rate.
//
// Approximations vs the live engine, stated plainly:
//  - Direction comes from a 20-day SMA trend filter, not the 5 live strategies.
//  - IV = annualized 20-day realized vol; IV-rank = its percentile over ~1yr.
//  - Fills are at the modeled mid (no spread/slippage); real results are worse.

import { AlpacaService } from '../alpaca';

// ── Black-Scholes ────────────────────────────────────────────────────────────
function normCdf(x: number): number {
  // Abramowitz-Stegun 7.1.26 erf approximation.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  let p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
function bs(type: 'call' | 'put', S: number, K: number, T: number, sigma: number, r = 0): { price: number; delta: number } {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
    const delta = type === 'call' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
    return { price: intrinsic, delta };
  }
  const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (type === 'call') {
    return { price: S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2), delta: normCdf(d1) };
  }
  return { price: K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1), delta: normCdf(d1) - 1 };
}

interface Bar { t: string; c: number; }

export interface BacktestParams {
  shortDelta: number; widthDollars: number; dte: number;
  ivRankMin: number; minIv: number; profitTakePct: number; stopMultiple: number;
  riskPct: number; minCreditPct: number; startingEquity: number;
}
export interface BacktestTrade {
  date: string; spreadType: 'bull_put' | 'bear_call'; shortK: number; longK: number;
  credit: number; maxLoss: number; ivRank: number; contracts: number; pnl: number; exit: string; heldDays: number;
}
export interface BacktestReport {
  symbol: string; from: string; to: string; tradingDays: number;
  trades: number; wins: number; losses: number; winRate: number;
  netPnl: number; avgPnl: number; sharpe: number; maxDrawdownPct: number;
  finalEquity: number; returnPct: number;
  byYear: Record<string, { trades: number; winRate: number; pnl: number }>;
  byIvRank: Record<string, { trades: number; winRate: number; pnl: number }>;
  note: string;
  sampleTrades: BacktestTrade[];
}

async function fetchDailyBars(service: AlpacaService, symbol: string, years: number): Promise<Bar[]> {
  const out: Bar[] = [];
  const now = new Date();
  for (let y = years; y >= 1; y--) {
    const start = new Date(now); start.setUTCFullYear(now.getUTCFullYear() - y);
    const end = new Date(now); end.setUTCFullYear(now.getUTCFullYear() - (y - 1));
    const bars = await service.getBars(symbol, '1Day', start, end, 1000).catch(() => []);
    for (const b of bars) out.push({ t: b.t, c: b.c });
  }
  // De-dupe by date + sort ascending.
  const seen = new Set<string>();
  return out.filter(b => { const d = b.t.slice(0, 10); if (seen.has(d)) return false; seen.add(d); return true; })
    .sort((a, b) => a.t.localeCompare(b.t));
}

function annualizedVol(closes: number[], i: number, window = 20): number {
  if (i < window) return 0;
  const rets: number[] = [];
  for (let k = i - window + 1; k <= i; k++) rets.push(Math.log(closes[k] / closes[k - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / rets.length;
  return Math.sqrt(varr) * Math.sqrt(252);
}

export async function backtestCreditSpread(service: AlpacaService, symbol: string, years: number, p: BacktestParams): Promise<BacktestReport> {
  const bars = await fetchDailyBars(service, symbol, years);
  const note = `Model-based (Black-Scholes on daily bars, realized-vol IV proxy, mid fills — no real chains/slippage). Direction from 20-day SMA. Validate parameters & stress behavior, not exact P&L.`;
  if (bars.length < 60) {
    return { symbol, from: bars[0]?.t?.slice(0,10) ?? '-', to: bars[bars.length-1]?.t?.slice(0,10) ?? '-', tradingDays: bars.length, trades: 0, wins: 0, losses: 0, winRate: 0, netPnl: 0, avgPnl: 0, sharpe: 0, maxDrawdownPct: 0, finalEquity: p.startingEquity, returnPct: 0, byYear: {}, byIvRank: {}, note: note + ` INSUFFICIENT DATA (${bars.length} bars from the free IEX feed).`, sampleTrades: [] };
  }
  const closes = bars.map(b => b.c);
  // Precompute IV (realized-vol proxy) series + rolling 1yr rank.
  const iv: number[] = closes.map((_, i) => annualizedVol(closes, i));

  const trades: BacktestTrade[] = [];
  let equity = p.startingEquity;
  const equityCurve: number[] = [equity];
  let openUntil = -1; // index until which we hold (one position at a time)

  for (let i = 30; i < bars.length; i++) {
    if (i < openUntil) continue; // still holding
    const S = closes[i];
    const sigma = iv[i];
    if (sigma <= 0) continue;
    // IV rank over trailing ~252 days.
    const lo = Math.max(20, i - 252);
    const windowIv = iv.slice(lo, i + 1).filter(v => v > 0);
    if (windowIv.length < 20) continue;
    const mn = Math.min(...windowIv), mx = Math.max(...windowIv);
    const ivRank = mx > mn ? Math.round(((sigma - mn) / (mx - mn)) * 100) : 50;
    if (ivRank < p.ivRankMin && sigma < p.minIv) continue; // IV-rank gate (with absolute floor fallback)

    // Direction from 20-day SMA trend.
    const sma = closes.slice(i - 20, i).reduce((a, b) => a + b, 0) / 20;
    const spreadType: 'bull_put' | 'bear_call' = S >= sma ? 'bull_put' : 'bear_call';
    const optType: 'call' | 'put' = spreadType === 'bull_put' ? 'put' : 'call';
    const T = p.dte / 365;

    // Find short strike near target delta by scanning $0.5 steps out to the money.
    let shortK = S, best = Infinity;
    for (let off = 0; off <= S * 0.25; off += 0.5) {
      const K = spreadType === 'bull_put' ? S - off : S + off;
      if (K <= 0) break;
      const d = Math.abs(Math.abs(bs(optType, S, K, T, sigma).delta) - p.shortDelta);
      if (d < best) { best = d; shortK = K; }
      if (Math.abs(bs(optType, S, K, T, sigma).delta) < p.shortDelta * 0.6) break;
    }
    const longK = spreadType === 'bull_put' ? shortK - p.widthDollars : shortK + p.widthDollars;
    if (longK <= 0) continue;

    const credit = Math.round((bs(optType, S, shortK, T, sigma).price - bs(optType, S, longK, T, sigma).price) * 100) / 100;
    const width = p.widthDollars;
    if (credit <= 0 || (credit / width) * 100 < p.minCreditPct) continue;
    const maxLoss = (width - credit) * 100;
    const contracts = Math.max(1, Math.floor((equity * p.riskPct / 100) / maxLoss));

    // Simulate day by day to expiry / management.
    let exit = 'expiry', pnlPerSpread = 0, held = 0;
    const expiryIdx = Math.min(bars.length - 1, i + p.dte);
    for (let j = i + 1; j <= expiryIdx; j++) {
      held = j - i;
      const Tj = Math.max(0, (p.dte - held) / 365);
      const Sj = closes[j];
      const closeCost = Math.round((bs(optType, Sj, shortK, Tj, iv[j] || sigma).price - bs(optType, Sj, longK, Tj, iv[j] || sigma).price) * 100) / 100;
      if (closeCost <= credit * (1 - p.profitTakePct / 100)) { exit = 'profit_target'; pnlPerSpread = (credit - Math.max(0, closeCost)) * 100; break; }
      if (closeCost >= credit * p.stopMultiple) { exit = 'stop_loss'; pnlPerSpread = (credit - closeCost) * 100; break; }
      if (Tj <= 0) { // expiry: settle at intrinsic
        const shortIntrinsic = optType === 'call' ? Math.max(0, Sj - shortK) : Math.max(0, shortK - Sj);
        const longIntrinsic = optType === 'call' ? Math.max(0, Sj - longK) : Math.max(0, longK - Sj);
        const settle = shortIntrinsic - longIntrinsic;
        pnlPerSpread = (credit - settle) * 100; exit = 'expiry'; break;
      }
    }
    const pnl = Math.round(pnlPerSpread * contracts * 100) / 100;
    equity += pnl;
    equityCurve.push(equity);
    trades.push({ date: bars[i].t.slice(0, 10), spreadType, shortK: Math.round(shortK * 100) / 100, longK: Math.round(longK * 100) / 100, credit, maxLoss: Math.round(maxLoss), ivRank, contracts, pnl, exit, heldDays: held });
    openUntil = i + Math.max(1, held); // free up after the hold
  }

  // Aggregate stats.
  const wins = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl < 0).length;
  const netPnl = Math.round(trades.reduce((s, t) => s + t.pnl, 0) * 100) / 100;
  const rets = trades.map(t => t.pnl / p.startingEquity);
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1)) : 0;
  const sharpe = sd > 0 ? Math.round((mean / sd) * Math.sqrt(Math.min(52, rets.length)) * 100) / 100 : 0; // per-trade Sharpe, annualized-ish
  let peak = equityCurve[0], maxDd = 0;
  for (const e of equityCurve) { if (e > peak) peak = e; const dd = (peak - e) / peak; if (dd > maxDd) maxDd = dd; }

  const byYear: Record<string, { trades: number; winRate: number; pnl: number }> = {};
  const byIvRank: Record<string, { trades: number; winRate: number; pnl: number }> = {};
  for (const t of trades) {
    const y = t.date.slice(0, 4);
    (byYear[y] ??= { trades: 0, winRate: 0, pnl: 0 }); byYear[y].trades++; byYear[y].pnl += t.pnl; if (t.pnl > 0) byYear[y].winRate++;
    const b = t.ivRank < 30 ? '<30' : t.ivRank < 50 ? '30-49' : t.ivRank < 70 ? '50-69' : '70+';
    (byIvRank[b] ??= { trades: 0, winRate: 0, pnl: 0 }); byIvRank[b].trades++; byIvRank[b].pnl += t.pnl; if (t.pnl > 0) byIvRank[b].winRate++;
  }
  for (const k of Object.keys(byYear)) { byYear[k].winRate = Math.round(100 * byYear[k].winRate / byYear[k].trades); byYear[k].pnl = Math.round(byYear[k].pnl); }
  for (const k of Object.keys(byIvRank)) { byIvRank[k].winRate = Math.round(100 * byIvRank[k].winRate / byIvRank[k].trades); byIvRank[k].pnl = Math.round(byIvRank[k].pnl); }

  return {
    symbol, from: bars[0].t.slice(0, 10), to: bars[bars.length - 1].t.slice(0, 10), tradingDays: bars.length,
    trades: trades.length, wins, losses, winRate: trades.length ? Math.round(100 * wins / trades.length) : 0,
    netPnl, avgPnl: trades.length ? Math.round(netPnl / trades.length * 100) / 100 : 0, sharpe,
    maxDrawdownPct: Math.round(maxDd * 1000) / 10, finalEquity: Math.round(equity), returnPct: Math.round((equity - p.startingEquity) / p.startingEquity * 1000) / 10,
    byYear, byIvRank, note, sampleTrades: trades.slice(-12),
  };
}
