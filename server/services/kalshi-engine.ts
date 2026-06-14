/**
 * Kalshi BTC Auto-Trading Engine
 *
 * Watches the BTC 5-min prediction (Binance-sourced) and places
 * real YES/NO orders on Kalshi's KXBTC hourly price-range events.
 *
 * Signal mapping:
 *   BUY  + priceChange1h > 0  → buy YES on the "≥ current BTC" tail contract
 *   SELL + priceChange1h < 0  → buy YES on the bracket just below current price
 *   Otherwise                 → no trade (neutral or conflicting signals)
 *
 * If no Kalshi credentials are saved: runs in paper mode (simulates fills
 * at current AMM ask price, tracks virtual P&L).
 */

import { getBTC5MinPrediction, type BTC5MinPrediction } from './btc-5min-predictor';
import { getKalshiBTCEvent, type KalshiBTCBracket }   from './kalshi';
import {
  placeKalshiOrder, getKalshiBalance, loadKalshiCredentials,
  type KalshiOrderResult,
} from './kalshi-trading';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KalshiTradeRecord {
  id: string;
  ticker: string;
  subtitle: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  entryPriceCents: number;
  currentPriceCents: number;
  stake: number;       // USD
  currentValue: number;
  unrealizedPnl: number;
  signal: { direction: 'BUY' | 'SELL'; confidence: number; btcPrice: number };
  openedAt: string;
  closedAt?: string;
  exitPriceCents?: number;
  realizedPnl?: number;
  status: 'open' | 'closed' | 'expired';
  paper: boolean;
  kalshiOrderId?: string;
}

export interface KalshiEngineState {
  isRunning: boolean;
  isPaperMode: boolean;
  lastScanAt: string | null;
  lastScanResult: string | null;
  lastTradeAt: string | null;
  openTrades: KalshiTradeRecord[];
  closedTrades: KalshiTradeRecord[];
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  config: KalshiEngineConfig;
}

export interface KalshiEngineConfig {
  contractsPerTrade: number;   // number of Kalshi contracts per order
  maxOpenTrades: number;
  cooldownMinutes: number;
  minConfidence: number;       // min BTC predictor confidence to fire (0-100)
  requireAlignedHourly: boolean; // require priceChange1h to align with 5m direction
}

// ── Per-user state ────────────────────────────────────────────────────────────

const _states  = new Map<number, KalshiEngineState>();
const _timers  = new Map<number, ReturnType<typeof setInterval>>();

const DEFAULT_CONFIG: KalshiEngineConfig = {
  contractsPerTrade:    5,
  maxOpenTrades:        3,
  cooldownMinutes:      20,
  minConfidence:        60,
  requireAlignedHourly: true,
};

export function getKalshiEngineState(userId: number): KalshiEngineState {
  if (!_states.has(userId)) {
    _states.set(userId, {
      isRunning:          false,
      isPaperMode:        !loadKalshiCredentials(userId),
      lastScanAt:         null,
      lastScanResult:     null,
      lastTradeAt:        null,
      openTrades:         [],
      closedTrades:       [],
      totalRealizedPnl:   0,
      totalUnrealizedPnl: 0,
      config: { ...DEFAULT_CONFIG },
    });
  }
  // Re-check paper mode each time (creds may have been added since start)
  const s = _states.get(userId)!;
  s.isPaperMode = !loadKalshiCredentials(userId);
  return s;
}

export function updateKalshiEngineConfig(userId: number, patch: Partial<KalshiEngineConfig>): void {
  const s = getKalshiEngineState(userId);
  s.config = { ...s.config, ...patch };
}

export function startKalshiEngine(userId: number): void {
  const s = getKalshiEngineState(userId);
  if (s.isRunning) return;
  s.isRunning = true;
  _runKalshiScan(userId).catch(console.error);
  const iv = setInterval(() => _runKalshiScan(userId).catch(console.error), 5 * 60 * 1000); // 5 min
  _timers.set(userId, iv);
}

export function stopKalshiEngine(userId: number): void {
  const s = getKalshiEngineState(userId);
  s.isRunning = false;
  const iv = _timers.get(userId);
  if (iv) { clearInterval(iv); _timers.delete(userId); }
}

export async function manualKalshiScan(userId: number): Promise<{ fired: boolean; reason: string }> {
  return _runKalshiScan(userId, true);
}

// ── Core scan ─────────────────────────────────────────────────────────────────

async function _runKalshiScan(userId: number, manual = false): Promise<{ fired: boolean; reason: string }> {
  const s = getKalshiEngineState(userId);
  s.lastScanAt = new Date().toISOString();

  _updateOpenTradePrices(s);

  if (s.openTrades.length >= s.config.maxOpenTrades) {
    const r = `Max open trades (${s.config.maxOpenTrades}) reached`;
    s.lastScanResult = r;
    return { fired: false, reason: r };
  }

  if (!manual && s.lastTradeAt) {
    const elapsed = Date.now() - new Date(s.lastTradeAt).getTime();
    const cooldownMs = s.config.cooldownMinutes * 60 * 1000;
    if (elapsed < cooldownMs) {
      const minsLeft = Math.ceil((cooldownMs - elapsed) / 60000);
      const r = `Cooldown: ${minsLeft}m remaining`;
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }
  }

  try {
    // 1. Get 5-min BTC signal
    const pred = await getBTC5MinPrediction();
    if (!pred || pred.direction === 'NEUTRAL') {
      const r = 'BTC signal NEUTRAL — waiting for clear direction';
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }

    if (pred.confidence < s.config.minConfidence) {
      const r = `Signal confidence ${pred.confidence}% below threshold (${s.config.minConfidence}%)`;
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }

    // Optional: require 1h trend to agree
    if (s.config.requireAlignedHourly) {
      const aligned =
        (pred.direction === 'BUY'  && pred.priceChange1h > 0) ||
        (pred.direction === 'SELL' && pred.priceChange1h < 0);
      if (!aligned) {
        const r = `1h trend (${pred.priceChange1h > 0 ? '+' : ''}${pred.priceChange1h.toFixed(2)}%) conflicts with 5m ${pred.direction} signal`;
        s.lastScanResult = r;
        return { fired: false, reason: r };
      }
    }

    // 2. Get KXBTC market event
    const event = await getKalshiBTCEvent(pred.currentPrice);
    if (!event.brackets.length) {
      const r = 'No active KXBTC brackets available';
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }

    // Skip if event closes in < 15 min (not enough time for trade to resolve meaningfully)
    if (event.msUntilClose < 15 * 60 * 1000) {
      const r = 'Nearest KXBTC event closes in <15 min — waiting for next event';
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }

    // 3. Select bracket
    const bracket = _selectBracket(event.brackets, pred);
    if (!bracket) {
      const r = 'Could not find a suitable bracket for current signal';
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }

    // 4. Determine order: always BUY YES on chosen bracket
    const priceInCents = bracket.yesAsk > 0 ? bracket.yesAsk : Math.max(1, bracket.yesProbability);
    if (priceInCents >= 97) {
      const r = `Bracket ${bracket.subtitle} already at ${priceInCents}¢ — too expensive`;
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }

    const stakeUsd = (priceInCents / 100) * s.config.contractsPerTrade;

    // 5. Place real order or paper-fill
    let kalshiOrderId: string | undefined;
    if (!s.isPaperMode) {
      try {
        const result: KalshiOrderResult = await placeKalshiOrder(
          userId,
          bracket.ticker,
          'yes',
          'buy',
          s.config.contractsPerTrade,
          priceInCents,
        );
        kalshiOrderId = result.orderId;
      } catch (err: any) {
        const r = `Order failed: ${err.message}`;
        s.lastScanResult = r;
        return { fired: false, reason: r };
      }
    }

    const trade: KalshiTradeRecord = {
      id:                `kalshi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      ticker:            bracket.ticker,
      subtitle:          bracket.subtitle,
      side:              'yes',
      action:            'buy',
      count:             s.config.contractsPerTrade,
      entryPriceCents:   priceInCents,
      currentPriceCents: priceInCents,
      stake:             stakeUsd,
      currentValue:      stakeUsd,
      unrealizedPnl:     0,
      signal:            { direction: pred.direction, confidence: pred.confidence, btcPrice: pred.currentPrice },
      openedAt:          new Date().toISOString(),
      status:            'open',
      paper:             s.isPaperMode,
      kalshiOrderId,
    };

    s.openTrades.push(trade);
    s.lastTradeAt = new Date().toISOString();
    _recalcUnrealized(s);

    const modeStr = s.isPaperMode ? ' [PAPER]' : ' [LIVE]';
    const r = `${modeStr} Bought YES × ${s.config.contractsPerTrade} on "${bracket.subtitle}" at ${priceInCents}¢ — stake $${stakeUsd.toFixed(2)}`;
    s.lastScanResult = r;
    return { fired: true, reason: r };

  } catch (err: any) {
    const r = `Scan error: ${err.message}`;
    s.lastScanResult = r;
    return { fired: false, reason: r };
  }
}

// ── Bracket selection ─────────────────────────────────────────────────────────

function _selectBracket(brackets: KalshiBTCBracket[], pred: BTC5MinPrediction): KalshiBTCBracket | null {
  const btcPrice = pred.currentPrice;

  if (pred.direction === 'BUY') {
    // Prefer the "greater" (above $X) tail bracket — wins if BTC stays above that level
    const greaterBrackets = brackets.filter(b => b.strikeType === 'greater');
    if (greaterBrackets.length) {
      // Pick the one with floorStrike closest to and below current BTC price
      return greaterBrackets.sort((a, b) => {
        const da = btcPrice - (a.floorStrike ?? 0);
        const db = btcPrice - (b.floorStrike ?? 0);
        return Math.abs(da) - Math.abs(db);
      })[0];
    }
    // Fallback: between bracket containing current price
    return _findNearestBetween(brackets, btcPrice);
  }

  if (pred.direction === 'SELL') {
    // Prefer "less" tail bracket, or a between bracket below current price
    const lessBrackets = brackets.filter(b => b.strikeType === 'less');
    if (lessBrackets.length) {
      return lessBrackets.sort((a, b) => {
        const da = (a.capStrike ?? btcPrice) - btcPrice;
        const db = (b.capStrike ?? btcPrice) - btcPrice;
        return Math.abs(da) - Math.abs(db);
      })[0];
    }
    // Fallback: between bracket just below current price
    const below = brackets.filter(b =>
      b.strikeType === 'between' && b.capStrike != null && b.capStrike < btcPrice
    ).sort((a, b) => (b.capStrike ?? 0) - (a.capStrike ?? 0)); // highest cap just below btcPrice
    return below[0] ?? null;
  }

  return null;
}

function _findNearestBetween(brackets: KalshiBTCBracket[], btcPrice: number): KalshiBTCBracket | null {
  const between = brackets.filter(b => b.strikeType === 'between');
  if (!between.length) return null;
  return between.sort((a, b) => {
    const midA = ((a.floorStrike ?? 0) + (a.capStrike ?? 0)) / 2;
    const midB = ((b.floorStrike ?? 0) + (b.capStrike ?? 0)) / 2;
    return Math.abs(midA - btcPrice) - Math.abs(midB - btcPrice);
  })[0];
}

// ── P&L refresh ───────────────────────────────────────────────────────────────

function _updateOpenTradePrices(s: KalshiEngineState): void {
  // Lightweight refresh: mark expired trades from event close times
  // (In a full impl, we'd re-fetch CLOB prices here)
  const now = Date.now();
  for (const t of [...s.openTrades]) {
    // If we had a market closeTime we'd check it here; for now keep open
    void now;
  }
}

function _recalcUnrealized(s: KalshiEngineState): void {
  s.totalUnrealizedPnl = s.openTrades.reduce((sum, t) => sum + t.unrealizedPnl, 0);
}

export function closeKalshiTrade(userId: number, tradeId: string, exitPriceCents?: number): boolean {
  const s = getKalshiEngineState(userId);
  const idx = s.openTrades.findIndex(t => t.id === tradeId);
  if (idx === -1) return false;

  const trade = s.openTrades[idx];
  const exitCents = exitPriceCents ?? trade.currentPriceCents;
  // Each contract pays $1 if YES wins; we bought at entry price
  const exitValue   = (exitCents / 100) * trade.count;
  const realizedPnl = exitValue - trade.stake;

  trade.status        = 'closed';
  trade.closedAt      = new Date().toISOString();
  trade.exitPriceCents = exitCents;
  trade.realizedPnl   = realizedPnl;
  trade.unrealizedPnl = 0;

  s.openTrades.splice(idx, 1);
  s.closedTrades.unshift(trade);
  if (s.closedTrades.length > 50) s.closedTrades.length = 50;

  s.totalRealizedPnl += realizedPnl;
  _recalcUnrealized(s);
  return true;
}

export function closeAllKalshiTrades(userId: number): number {
  const s = getKalshiEngineState(userId);
  const ids = s.openTrades.map(t => t.id);
  ids.forEach(id => closeKalshiTrade(userId, id));
  return ids.length;
}
