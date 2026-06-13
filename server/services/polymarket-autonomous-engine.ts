/**
 * VEDD Polymarket Autonomous Engine
 *
 * Completely separate from the forex live trading engine.
 * Monitors Polymarket BTC prediction market sentiment and opens
 * YES/NO positions DIRECTLY on Polymarket — not on TradeLocker or MT5.
 *
 * Paper trading by default (tracks real probabilities, no actual chain calls).
 * P&L model: shares = stake / (entryProb / 100), value = shares × (currentProb / 100).
 */

import { getPolymarketBTCSentiment, type PolymarketMarket, type PolymarketBTCSentiment } from './polymarket';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PolymarketPosition {
  id: string;
  market: {
    id: string;
    question: string;
    endDate: string | null;
  };
  side: 'YES' | 'NO';
  direction: 'BUY' | 'SELL';
  entryProbability: number;
  currentProbability: number;
  stake: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  openedAt: string;
  signal: {
    bullishScore: number;
    sentimentLabel: string;
    direction: string;
  };
  status: 'open' | 'closed' | 'resolved';
  closedAt?: string;
  closedProbability?: number;
  realizedPnl?: number;
}

export interface PolymarketEngineConfig {
  /** Minimum bullish score (0-100) to open a BUY (YES) position */
  minBullishScore: number;
  /** Minimum score inversion (100 - score ≥ this) to open a SELL position */
  minBearishScore: number;
  /** USDC stake per position (paper mode: simulated) */
  stakePerTrade: number;
  /** Max concurrent open positions */
  maxOpenPositions: number;
  /** Minutes to wait before opening another position */
  cooldownMinutes: number;
}

export interface PolymarketEngineState {
  isRunning: boolean;
  isPaperMode: boolean;
  lastScanAt: string | null;
  lastTradeAt: string | null;
  lastScanResult: string | null;
  openPositions: PolymarketPosition[];
  closedPositions: PolymarketPosition[];
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  tradesOpened: number;
  config: PolymarketEngineConfig;
}

// ── In-memory state per user ──────────────────────────────────────────────────

const _states = new Map<number, PolymarketEngineState>();
const _intervals = new Map<number, ReturnType<typeof setInterval>>();

const DEFAULT_CONFIG: PolymarketEngineConfig = {
  minBullishScore: 70,
  minBearishScore: 70,
  stakePerTrade: 10,
  maxOpenPositions: 3,
  cooldownMinutes: 30,
};

export function getEngineState(userId: number): PolymarketEngineState {
  if (!_states.has(userId)) {
    _states.set(userId, {
      isRunning: false,
      isPaperMode: true,
      lastScanAt: null,
      lastTradeAt: null,
      lastScanResult: null,
      openPositions: [],
      closedPositions: [],
      totalRealizedPnl: 0,
      totalUnrealizedPnl: 0,
      tradesOpened: 0,
      config: { ...DEFAULT_CONFIG },
    });
  }
  return _states.get(userId)!;
}

export function updateEngineConfig(userId: number, config: Partial<PolymarketEngineConfig>): void {
  const s = getEngineState(userId);
  s.config = { ...s.config, ...config };
}

// ── Engine lifecycle ──────────────────────────────────────────────────────────

export function startEngine(userId: number): void {
  const s = getEngineState(userId);
  if (s.isRunning) return;
  s.isRunning = true;
  _runScan(userId).catch(console.error);
  const iv = setInterval(() => _runScan(userId).catch(console.error), 5 * 60 * 1000);
  _intervals.set(userId, iv);
}

export function stopEngine(userId: number): void {
  const s = getEngineState(userId);
  s.isRunning = false;
  const iv = _intervals.get(userId);
  if (iv) { clearInterval(iv); _intervals.delete(userId); }
}

export async function manualScan(userId: number): Promise<{ fired: boolean; reason: string }> {
  return _runScan(userId, true);
}

// ── Core scan ─────────────────────────────────────────────────────────────────

async function _runScan(userId: number, manual = false): Promise<{ fired: boolean; reason: string }> {
  const s = getEngineState(userId);
  s.lastScanAt = new Date().toISOString();

  // Refresh open position prices
  await _refreshPositionPrices(s);

  if (s.openPositions.length >= s.config.maxOpenPositions) {
    const r = `Max open positions (${s.config.maxOpenPositions}) reached`;
    s.lastScanResult = r;
    return { fired: false, reason: r };
  }

  if (!manual && s.lastTradeAt) {
    const elapsed = Date.now() - new Date(s.lastTradeAt).getTime();
    if (elapsed < s.config.cooldownMinutes * 60 * 1000) {
      const minsLeft = Math.ceil((s.config.cooldownMinutes * 60 * 1000 - elapsed) / 60000);
      const r = `Cooldown active — ${minsLeft}m remaining`;
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }
  }

  try {
    const sentiment = await getPolymarketBTCSentiment();
    const score = sentiment.overallBullishScore;

    const isBullish = score >= s.config.minBullishScore;
    const isBearish = (100 - score) >= s.config.minBearishScore;

    if (!isBullish && !isBearish) {
      const r = `Sentiment neutral — score ${score}% (need ≥${s.config.minBullishScore}% bullish or ≤${100 - s.config.minBearishScore}% bearish)`;
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }

    const direction: 'BUY' | 'SELL' = isBullish ? 'BUY' : 'SELL';
    const result = await _openPosition(s, sentiment, direction);
    s.lastScanResult = result.reason;
    return result;
  } catch (err: any) {
    const r = `Scan error: ${err?.message ?? String(err)}`;
    s.lastScanResult = r;
    return { fired: false, reason: r };
  }
}

// ── Open position ─────────────────────────────────────────────────────────────

async function _openPosition(
  s: PolymarketEngineState,
  sentiment: PolymarketBTCSentiment,
  direction: 'BUY' | 'SELL',
): Promise<{ fired: boolean; reason: string }> {
  const openIds = new Set(s.openPositions.map(p => p.market.id));
  const now = Date.now();

  const candidates = sentiment.markets.filter(m => {
    if (openIds.has(m.id)) return false;
    if (m.closed) return false;
    if (m.endDate) {
      const end = new Date(m.endDate).getTime();
      if (end - now < 2 * 60 * 60 * 1000) return false; // skip markets closing < 2 h
    }
    if (direction === 'BUY' && m.direction === 'bullish') return true;
    if (direction === 'SELL' && m.direction === 'bearish') return true;
    return false;
  });

  if (candidates.length === 0) {
    return { fired: false, reason: `No suitable open ${direction} market available on Polymarket` };
  }

  const best = candidates.sort((a, b) => b.volume - a.volume)[0];
  const entryProb = best.yesProbability;

  if (entryProb <= 5 || entryProb >= 95) {
    return { fired: false, reason: `Market probability ${entryProb}% too extreme — skipping` };
  }

  const position: PolymarketPosition = {
    id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    market: { id: best.id, question: best.question, endDate: best.endDate },
    side: 'YES',
    direction,
    entryProbability: entryProb,
    currentProbability: entryProb,
    stake: s.config.stakePerTrade,
    currentValue: s.config.stakePerTrade,
    unrealizedPnl: 0,
    unrealizedPnlPct: 0,
    openedAt: new Date().toISOString(),
    signal: {
      bullishScore: sentiment.overallBullishScore,
      sentimentLabel: sentiment.sentimentLabel,
      direction,
    },
    status: 'open',
  };

  s.openPositions.push(position);
  s.lastTradeAt = new Date().toISOString();
  s.tradesOpened++;

  return {
    fired: true,
    reason: `Opened YES on "${best.question.slice(0, 60)}..." at ${entryProb}% — stake $${s.config.stakePerTrade}`,
  };
}

// ── Price refresh ─────────────────────────────────────────────────────────────

async function _refreshPositionPrices(s: PolymarketEngineState): Promise<void> {
  if (s.openPositions.length === 0) return;

  try {
    const sentiment = await getPolymarketBTCSentiment();

    for (const pos of s.openPositions) {
      const market = sentiment.markets.find(m => m.id === pos.market.id);
      if (!market) continue;

      const currentProb = pos.side === 'YES' ? market.yesProbability : (100 - market.yesProbability);
      pos.currentProbability = currentProb;

      // shares owned = stake / (entryProb / 100) = stake * 100 / entryProb
      const shares = (pos.stake * 100) / pos.entryProbability;
      pos.currentValue = shares * (currentProb / 100);
      pos.unrealizedPnl = pos.currentValue - pos.stake;
      pos.unrealizedPnlPct = (pos.unrealizedPnl / pos.stake) * 100;

      if (market.closed) {
        closePosition(s, pos.id, currentProb);
      }
    }

    s.totalUnrealizedPnl = s.openPositions.reduce((acc, p) => acc + p.unrealizedPnl, 0);
  } catch { /* non-fatal */ }
}

// ── Close position ────────────────────────────────────────────────────────────

export function closePosition(s: PolymarketEngineState, positionId: string, exitProb?: number): boolean {
  const idx = s.openPositions.findIndex(p => p.id === positionId);
  if (idx === -1) return false;

  const pos = s.openPositions[idx];
  const ep = exitProb ?? pos.currentProbability;

  const shares = (pos.stake * 100) / pos.entryProbability;
  const exitValue = shares * (ep / 100);
  const realizedPnl = exitValue - pos.stake;

  pos.status = ep >= 99 ? 'resolved' : 'closed';
  pos.closedAt = new Date().toISOString();
  pos.closedProbability = ep;
  pos.realizedPnl = realizedPnl;
  pos.unrealizedPnl = 0;
  pos.unrealizedPnlPct = 0;

  s.openPositions.splice(idx, 1);
  s.closedPositions.unshift(pos);
  if (s.closedPositions.length > 50) s.closedPositions.length = 50;

  s.totalRealizedPnl += realizedPnl;
  s.totalUnrealizedPnl = s.openPositions.reduce((acc, p) => acc + p.unrealizedPnl, 0);

  return true;
}

export function closeAllPositions(userId: number): number {
  const s = getEngineState(userId);
  const ids = s.openPositions.map(p => p.id);
  ids.forEach(id => closePosition(s, id));
  return ids.length;
}
