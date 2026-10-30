// Pure helpers for the Paper Trade AI Journal (paper-trade-tracker.ts), kept
// free of DB imports so they can be unit-tested.
import { computePips } from '../utils/pipUtils';

const TF_MINUTES: Record<string, number> = {
  M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440,
  '1M': 1, '5M': 5, '15M': 15, '30M': 30, '1H': 60, '4H': 240, '1D': 1440,
};

/** Start (ms) of the candle `now` falls in. Unknown timeframes count as H1. */
export function candleStart(timeframe: string, now: number): number {
  const periodMs = (TF_MINUTES[String(timeframe || '').toUpperCase()] || 60) * 60_000;
  return Math.floor(now / periodMs) * periodMs;
}

/** A usable entry price: a real, positive number. */
export function validEntry(entry: unknown): entry is number {
  return typeof entry === 'number' && Number.isFinite(entry) && entry > 0;
}

/**
 * The stop and target, or null when either is missing or on the wrong side of
 * the entry (a BUY needs stop < entry < target; a SELL the reverse).
 */
export function validLevels(direction: string, entry: number, stopLoss?: number | null, takeProfit?: number | null): { sl: number; tp: number } | null {
  const sl = Number(stopLoss), tp = Number(takeProfit);
  if (!validEntry(entry) || !(sl > 0) || !(tp > 0)) return null;
  const isSell = /sell/i.test(direction);
  if (isSell ? !(tp < entry && entry < sl) : !(sl < entry && entry < tp)) return null;
  return { sl, tp };
}

export type Bar = { timestamp: number; high: number; low: number };

/**
 * Which of stop and target price reached first, walking bars that opened at or
 * after `openedAt` (a bar that opened before the entry may hold moves from
 * before it). A bar that spans both levels counts as the stop: the bar alone
 * cannot say which came first, so assume the worse.
 */
export function firstHit(bars: Bar[], direction: string, sl: number, tp: number, openedAt: number): 'tp' | 'sl' | null {
  const isSell = /sell/i.test(direction);
  const sorted = bars.filter((b) => b.timestamp >= openedAt).sort((a, b) => a.timestamp - b.timestamp);
  for (const b of sorted) {
    const hitSl = isSell ? b.high >= sl : b.low <= sl;
    const hitTp = isSell ? b.low <= tp : b.high >= tp;
    if (hitSl) return 'sl';
    if (hitTp) return 'tp';
  }
  return null;
}

export type Resolution = {
  outcome: 'win' | 'loss' | 'breakeven';
  exitPrice: number;
  pnlPips: number | null;
  pnlPercent: number;
  note?: string;
};

/**
 * Outcome for a pending paper trade, or null while it is still open.
 * With a valid stop and target: whichever price reaches first; neither within
 * 24h is 'breakeven' (expired), marked at the current price. Without them: the
 * 24h price, ±5 pips.
 */
export function resolveOutcome(
  t: { symbol: string; direction: string; entryPrice: number; stopLoss?: number | null; takeProfit?: number | null; openedAt: number },
  bars: Bar[], currentPrice: number, now: number,
): Resolution | null {
  const pnl = (exit: number) => {
    const diff = /sell/i.test(t.direction) ? t.entryPrice - exit : exit - t.entryPrice;
    return { exitPrice: exit, pnlPips: computePips(t.symbol, t.entryPrice, exit, t.direction), pnlPercent: (diff / t.entryPrice) * 100 };
  };
  const ageHours = (now - t.openedAt) / 3_600_000;
  const lv = validLevels(t.direction, t.entryPrice, t.stopLoss, t.takeProfit);
  if (lv) {
    const hit = firstHit(bars, t.direction, lv.sl, lv.tp, t.openedAt);
    if (hit === 'tp') return { outcome: 'win', ...pnl(lv.tp) };
    if (hit === 'sl') return { outcome: 'loss', ...pnl(lv.sl) };
    if (ageHours < 24) return null;
    return { outcome: 'breakeven', ...pnl(currentPrice), note: 'expired: neither stop nor target hit within 24h' };
  }
  if (ageHours < 24) return null;
  const r = pnl(currentPrice);
  const pips = r.pnlPips ?? 0;
  return { outcome: pips > 5 ? 'win' : pips < -5 ? 'loss' : 'breakeven', ...r, note: 'no valid stop/target: judged on the 24h price' };
}
