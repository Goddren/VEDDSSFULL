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

import { getKalshiBTCEvent, type KalshiBTCBracket }   from './kalshi';
import {
  placeKalshiOrder, getKalshiBalance, loadKalshiCredentials,
  type KalshiOrderResult,
} from './kalshi-trading';
import { getKalshiSignal, getKalshiConsensus, estimateHourlyVol, type KalshiStrategy, type TradeSignal, type KalshiConsensus } from './kalshi-strategies';
import { getBTCCandles } from './btc-5min-predictor';

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
  minConfidence: number;       // min signal confidence to fire (0-100)
  requireAlignedHourly: boolean; // require priceChange1h to align with signal direction
  strategy: KalshiStrategy;    // 'momentum' | 'volume_profile' | 'markov'
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
  strategy:             'momentum',
};

const STRATEGY_LABELS: Record<KalshiStrategy, string> = {
  momentum:       'Momentum',
  volume_profile: 'Volume Profile',
  markov:         'Markov',
  order_flow:     'Order Flow',
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
  const clean: Partial<KalshiEngineConfig> = { ...patch };
  // Guard the strategy field against invalid values
  if (clean.strategy && !STRATEGY_LABELS[clean.strategy]) delete clean.strategy;
  s.config = { ...s.config, ...clean };
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
    // 1. Get directional signal from the selected strategy
    const stratLabel = STRATEGY_LABELS[s.config.strategy] ?? s.config.strategy;
    const pred = await getKalshiSignal(s.config.strategy);
    if (!pred || pred.direction === 'NEUTRAL') {
      const r = `${stratLabel}: NEUTRAL — ${pred?.reason ?? 'no clear direction'}`;
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }

    if (pred.confidence < s.config.minConfidence) {
      const r = `${stratLabel}: confidence ${pred.confidence}% below threshold (${s.config.minConfidence}%)`;
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }

    // Optional: require 1h trend to agree
    if (s.config.requireAlignedHourly) {
      const aligned =
        (pred.direction === 'BUY'  && pred.priceChange1h > 0) ||
        (pred.direction === 'SELL' && pred.priceChange1h < 0);
      if (!aligned) {
        const r = `1h trend (${pred.priceChange1h > 0 ? '+' : ''}${pred.priceChange1h.toFixed(2)}%) conflicts with ${pred.direction} signal`;
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

    const modeStr = s.isPaperMode ? '[PAPER]' : '[LIVE]';
    const r = `${modeStr} ${stratLabel}: bought YES × ${s.config.contractsPerTrade} on "${bracket.subtitle}" at ${priceInCents}¢ — stake $${stakeUsd.toFixed(2)}`;
    s.lastScanResult = r;
    return { fired: true, reason: r };

  } catch (err: any) {
    const r = `Scan error: ${err.message}`;
    s.lastScanResult = r;
    return { fired: false, reason: r };
  }
}

// ── Bracket selection ─────────────────────────────────────────────────────────

function _selectBracket(brackets: KalshiBTCBracket[], pred: TradeSignal): KalshiBTCBracket | null {
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

// ── Value-pick scanner ──────────────────────────────────────────────────────────
// Runs ALL strategies (consensus) + a volatility model to estimate each bracket's
// TRUE probability of resolving YES, then compares it to the market ask price.
//   edge = modelProbability − marketAsk   (positive = underpriced = value)
// Ranks brackets by a value score that rewards both edge and strategy agreement.

export interface KalshiValuePick {
  ticker: string;
  subtitle: string;
  strikeType: 'greater' | 'less' | 'between';
  marketAskCents: number;     // what it costs to buy YES now
  modelProbPct: number;       // our estimated probability it resolves YES
  edgePct: number;            // modelProb − marketAsk (the value)
  valueScore: number;         // edge × agreement × confidence weighting
  confidence: number;         // consensus confidence
  agreement: number;          // 0–1 strategy agreement
  rationale: string;
}

export interface KalshiValueScanResult {
  consensus: { direction: string; confidence: number; agreement: number; reasons: string[] };
  btcPrice: number;
  eventTicker: string | null;
  minutesToClose: number | null;
  picks: KalshiValuePick[];
  scannedAt: string;
}

/** Standard normal CDF (Abramowitz-Stegun approximation). */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

/** Model probability that BTC resolves the bracket YES at close, given consensus drift + vol. */
function _bracketModelProb(
  b: KalshiBTCBracket,
  btcPrice: number,
  sigmaPrice: number,        // expected price std-dev over the remaining window (in $)
  driftPrice: number,        // consensus-implied directional drift (in $, signed)
): number {
  if (sigmaPrice <= 0) sigmaPrice = btcPrice * 0.004;
  const expected = btcPrice + driftPrice;
  if (b.strikeType === 'greater' && b.floorStrike != null) {
    // P(close > floor) = 1 − CDF((floor − expected)/sigma)
    return 1 - normalCdf((b.floorStrike - expected) / sigmaPrice);
  }
  if (b.strikeType === 'less' && b.capStrike != null) {
    // P(close < cap) = CDF((cap − expected)/sigma)
    return normalCdf((b.capStrike - expected) / sigmaPrice);
  }
  if (b.strikeType === 'between' && b.floorStrike != null && b.capStrike != null) {
    return normalCdf((b.capStrike - expected) / sigmaPrice) - normalCdf((b.floorStrike - expected) / sigmaPrice);
  }
  return 0;
}

export async function scanKalshiValuePicks(userId: number, limit = 5): Promise<KalshiValueScanResult> {
  const scannedAt = new Date().toISOString();
  const consensus: KalshiConsensus = await getKalshiConsensus();
  const btcPrice = consensus.currentPrice;

  const base: KalshiValueScanResult = {
    consensus: { direction: consensus.direction, confidence: consensus.confidence, agreement: consensus.agreement, reasons: consensus.reasons },
    btcPrice, eventTicker: null, minutesToClose: null, picks: [], scannedAt,
  };
  if (!btcPrice) return base;

  const event = await getKalshiBTCEvent(btcPrice).catch(() => null);
  if (!event || !event.brackets.length) return base;
  base.eventTicker = event.eventTicker;
  base.minutesToClose = Math.round(event.msUntilClose / 60000);

  // Volatility scaled to the remaining time until the event closes
  const { candles } = await getBTCCandles(100).catch(() => ({ candles: [] as any[] }));
  const hourlyVolFrac = candles.length ? estimateHourlyVol(candles) : 0.004;
  const hoursLeft = Math.max(0.1, event.msUntilClose / 3600000);
  const sigmaPrice = btcPrice * hourlyVolFrac * Math.sqrt(hoursLeft);

  // Consensus drift: push the expected close in the consensus direction, scaled by
  // confidence & agreement, capped at ~0.6σ so the market price still dominates.
  const dirSign = consensus.direction === 'BUY' ? 1 : consensus.direction === 'SELL' ? -1 : 0;
  const driftFrac = dirSign * (consensus.confidence / 100) * consensus.agreement * 0.6;
  const driftPrice = sigmaPrice * driftFrac;

  const picks: KalshiValuePick[] = [];
  for (const b of event.brackets) {
    if (!b.hasLiquidity) continue;
    const ask = b.yesAsk > 0 ? b.yesAsk : b.yesProbability;
    if (ask <= 1 || ask >= 97) continue; // skip illiquid / already-decided

    const modelProb = _bracketModelProb(b, btcPrice, sigmaPrice, driftPrice);
    const modelProbPct = Math.round(modelProb * 100);
    const edgePct = modelProbPct - ask;
    if (edgePct <= 0) continue; // only surface underpriced (positive-edge) picks

    // Value score: edge weighted by how strongly the strategies agree & their confidence,
    // and lightly penalized for very long-shot (low absolute probability) picks.
    const agreementW = 0.5 + consensus.agreement * 0.5;       // 0.5–1.0
    const confW      = 0.5 + (consensus.confidence / 100) * 0.5; // 0.5–1.0
    const probW      = 0.6 + modelProb * 0.4;                  // favor more-likely outcomes
    const valueScore = Math.round(edgePct * agreementW * confW * probW * 10) / 10;

    picks.push({
      ticker: b.ticker,
      subtitle: b.subtitle,
      strikeType: b.strikeType,
      marketAskCents: ask,
      modelProbPct,
      edgePct,
      valueScore,
      confidence: consensus.confidence,
      agreement: consensus.agreement,
      rationale: `${consensus.direction} consensus (${Math.round(consensus.agreement * 100)}% agree, ${consensus.confidence}% conf). Model ${modelProbPct}% vs market ${ask}¢ → +${edgePct}¢ edge.`,
    });
  }

  picks.sort((a, b) => b.valueScore - a.valueScore);
  base.picks = picks.slice(0, limit);
  return base;
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
