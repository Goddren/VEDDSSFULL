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

import { getKalshiCryptoEvent, KALSHI_SERIES_MAP, type KalshiBTCBracket, type KalshiCryptoCoin } from './kalshi';
import {
  placeKalshiOrder, getKalshiBalance, loadKalshiCredentials,
  type KalshiOrderResult,
} from './kalshi-trading';
import { getKalshiSignal, getKalshiConsensus, estimateHourlyVol, type KalshiStrategy, type TradeSignal, type KalshiConsensus } from './kalshi-strategies';
import { getCryptoCandles } from './btc-5min-predictor';
import { recordKalshiOutcome, getKalshiPerformance } from './kalshi-performance';

// Coins with a real, currently-tradeable hourly bracket market (same product
// structure as the original KXBTC). Verified live against Kalshi's API before
// adding: SOL sometimes has zero currently-open hourly events (handled as a
// per-symbol skip in the scan loop, not a hard error) — still listed since it
// comes and goes. 15-minute markets (KXBTC15M etc.) are a DIFFERENT product
// (single directional yes/no bet vs. multi-bracket price range) and are
// intentionally NOT included here — they'd need separate handling.
export const KALSHI_TRADEABLE_COINS: KalshiCryptoCoin[] = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];

// Session peak-bankroll tracker for Drawdown Shield — same in-memory,
// session-scoped pattern used by futures-scanner.ts/cryptocom-scanner.ts.
const _sessionPeakBankroll = new Map<number, number>();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KalshiTradeRecord {
  id: string;
  coin: KalshiCryptoCoin;  // which series/event this trade belongs to — added for multi-coin support
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
  strategy: string;    // strategy that opened it — for per-strategy win-rate tracking
  openedAt: string;
  closedAt?: string;
  exitPriceCents?: number;
  realizedPnl?: number;
  exitReason?: 'take_profit' | 'stop_loss' | 'manual' | 'settlement';
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
  // Which coins' hourly bracket markets to scan each cycle (was hardcoded to
  // BTC-only). The engine tries each in order and fires on the first one that
  // clears every gate that cycle — see KALSHI_TRADEABLE_COINS for what's
  // actually available (15-min markets are a different product, not covered).
  symbols: KalshiCryptoCoin[];
  contractsPerTrade: number;   // number of Kalshi contracts per order
  maxOpenTrades: number;
  cooldownMinutes: number;
  minConfidence: number;       // min signal confidence to fire (0-100)
  requireAlignedHourly: boolean; // require priceChange1h to align with signal direction
  requireConfluence: boolean;    // require ≥60% multi-strategy consensus agreement before firing
  strategy: KalshiStrategy | 'auto'; // 'auto' = scan all, pick best by live confidence × historical accuracy
  // Auto-trade the High-Value Picks (all-strategy consensus + edge model)
  autoTradeValuePicks: boolean; // if true, the engine fires the top value pick instead of single-strategy
  minValueScore: number;        // minimum value score to auto-trade a pick (default 8)
  // Auto-exit (take-profit / stop-loss on the contract price, in cents; 0 = disabled)
  takeProfitCents: number;      // close early when YES bid ≥ this (default 90)
  stopLossCents: number;        // close early when YES bid ≤ this (default 25)
  // Compounding — size stakes as a % of the growing bankroll instead of a fixed
  // contract count, so winners increase the next stake automatically.
  compounding: boolean;         // if true, contracts derive from bankroll % (default false)
  riskPctPerTrade: number;      // % of bankroll to stake per trade when compounding (default 5)
  startingBankroll: number;     // bankroll baseline in $ (paper mode / fallback, default 100)

  // ── FX SS AI Engine parity — same Kelly/Brain-Learning/Drawdown-Shield ────
  // pattern retrofitted from the options/futures/cryptocom engines this
  // session, sourced from the already-existing kalshi-performance.ts
  // per-strategy win-rate data (no new Brain service needed — it already
  // tracks exactly the win/loss data Kelly and Brain Learning Mode need).
  useKellyCriterion: boolean;     // size contracts by win-rate history instead of flat count
  brainLearningMode: boolean;     // lock at 1 contract until 10+ trades & 60%+ win rate
  drawdownShieldThreshold: number; // % DD from session-peak bankroll that cuts sizing to 25%
}

// ── Per-user state ────────────────────────────────────────────────────────────

const _states  = new Map<number, KalshiEngineState>();
const _timers  = new Map<number, ReturnType<typeof setInterval>>();

const DEFAULT_CONFIG: KalshiEngineConfig = {
  symbols:              ['BTC'], // preserves existing behavior for accounts that never touch this setting
  contractsPerTrade:    5,
  maxOpenTrades:        3,
  cooldownMinutes:      20,
  minConfidence:        70,
  requireAlignedHourly: true,
  requireConfluence:    true,
  strategy:             'momentum',
  autoTradeValuePicks:  false,
  minValueScore:        8,
  takeProfitCents:      90,
  stopLossCents:        25,
  compounding:          false,
  riskPctPerTrade:      5,
  startingBankroll:     100,
  useKellyCriterion:       false,
  brainLearningMode:       true,
  drawdownShieldThreshold: 0, // 0 = disabled by default (opt-in, unlike options/futures/cryptocom)
};

const STRATEGY_LABELS: Record<KalshiStrategy | 'auto', string> = {
  momentum:       'Momentum',
  volume_profile: 'Volume Profile',
  markov:         'Markov',
  order_flow:     'Order Flow',
  ensemble:       'AI Ensemble',
  auto:           'Auto (Best)',
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
  // Guard symbols: only real tradeable coins, at least one, no duplicates
  if (clean.symbols) {
    const deduped = Array.from(new Set(clean.symbols)).filter(c => KALSHI_TRADEABLE_COINS.includes(c));
    clean.symbols = deduped.length ? deduped : ['BTC'];
  }
  // Clamp auto-trade / exit fields to sane ranges
  if (clean.minValueScore   != null) clean.minValueScore   = Math.max(1, Math.min(50, clean.minValueScore));
  if (clean.takeProfitCents != null) clean.takeProfitCents = Math.max(0, Math.min(99, clean.takeProfitCents));
  if (clean.stopLossCents   != null) clean.stopLossCents   = Math.max(0, Math.min(95, clean.stopLossCents));
  if (clean.riskPctPerTrade  != null) clean.riskPctPerTrade  = Math.max(1, Math.min(25, clean.riskPctPerTrade));
  if (clean.startingBankroll != null) clean.startingBankroll = Math.max(10, Math.min(1_000_000, clean.startingBankroll));
  s.config = { ...s.config, ...clean };
}

// ── Compounding sizing ─────────────────────────────────────────────────────────
// Bankroll grows with realized P&L, so each winning streak automatically raises
// the next stake — the fast-growth compounding curve. Capital-preservation floor:
// never fewer than 1 contract, never more than 200.
export function kalshiBankroll(s: KalshiEngineState): number {
  return Math.max(1, (s.config.startingBankroll || 100) + (s.totalRealizedPnl || 0));
}

export async function kalshiContractsFor(userId: number, s: KalshiEngineState, priceInCents: number): Promise<{ contracts: number; reasoning: string }> {
  const baseContracts = (() => {
    if (!s.config.compounding) return s.config.contractsPerTrade;
    const bankroll = kalshiBankroll(s);
    const stakeTarget = bankroll * ((s.config.riskPctPerTrade || 5) / 100);
    const perContract = Math.max(0.01, priceInCents / 100);
    return Math.max(1, Math.min(200, Math.floor(stakeTarget / perContract)));
  })();

  // Drawdown Shield — cut sizing to 25% once bankroll pulls back from its
  // session peak by more than the configured threshold.
  let riskMultiplier = 1;
  if (s.config.drawdownShieldThreshold > 0) {
    const bankroll = kalshiBankroll(s);
    const peak = Math.max(_sessionPeakBankroll.get(userId) ?? bankroll, bankroll);
    _sessionPeakBankroll.set(userId, peak);
    const ddFromPeakPct = peak > 0 ? ((peak - bankroll) / peak) * 100 : 0;
    if (ddFromPeakPct >= s.config.drawdownShieldThreshold) riskMultiplier = 0.25;
  }
  const shieldedBase = Math.max(1, Math.round(baseContracts * riskMultiplier));
  const shieldNote = riskMultiplier < 1 ? ` ⚠️ Drawdown Shield active — sized to ${Math.round(riskMultiplier * 100)}%.` : '';

  if (s.config.brainLearningMode) {
    const perf = getKalshiPerformance(userId);
    const brainLocked = perf.totals.trades < 10 || perf.totals.winRate < 60;
    if (brainLocked) {
      return { contracts: 1, reasoning: `🧠 Learning Mode: locked at 1 contract (${perf.totals.trades}/10 trades, ${perf.totals.winRate}%/60% WR).${shieldNote}` };
    }
    if (s.config.useKellyCriterion) {
      const fractionalKelly = (perf.totals.winRate / 100) * 0.25;
      const kellyContracts = Math.max(1, Math.round(shieldedBase * (1 + fractionalKelly)));
      return { contracts: kellyContracts, reasoning: `🧠 Brain unlocked (${perf.totals.trades} trades @ ${perf.totals.winRate}% WR) + Kelly sizing.${shieldNote}` };
    }
    return { contracts: shieldedBase, reasoning: `🧠 Brain unlocked (${perf.totals.trades} trades @ ${perf.totals.winRate}% WR).${shieldNote}` };
  }
  if (s.config.useKellyCriterion) {
    const perf = getKalshiPerformance(userId);
    const fractionalKelly = (perf.totals.winRate / 100) * 0.25;
    const kellyContracts = Math.max(1, Math.round(shieldedBase * (1 + fractionalKelly)));
    return { contracts: kellyContracts, reasoning: `Kelly sizing (${perf.totals.winRate}% WR over ${perf.totals.trades} trades).${shieldNote}` };
  }
  return { contracts: shieldedBase, reasoning: shieldNote.trim() };
}

export function startKalshiEngine(userId: number): void {
  const s = getKalshiEngineState(userId);
  if (s.isRunning) return;
  s.isRunning = true;
  _persistKalshiRunState(userId, true, s.isPaperMode);
  _runKalshiScan(userId).catch(console.error);
  const iv = setInterval(() => _runKalshiScan(userId).catch(console.error), 5 * 60 * 1000);
  _timers.set(userId, iv);
}

export function stopKalshiEngine(userId: number): void {
  const s = getKalshiEngineState(userId);
  s.isRunning = false;
  _persistKalshiRunState(userId, false, s.isPaperMode);
  const iv = _timers.get(userId);
  if (iv) { clearInterval(iv); _timers.delete(userId); }
}

function _persistKalshiRunState(userId: number, isRunning: boolean, isPaperMode: boolean): void {
  import('../db').then(({ db }) => {
    import('../../shared/schema').then(({ engineRunState }) => {
      db.insert(engineRunState)
        .values({ userId, engine: 'kalshi', isRunning, isPaperMode })
        .onConflictDoUpdate({
          target: [engineRunState.userId, engineRunState.engine],
          set: { isRunning, isPaperMode, updatedAt: new Date() },
        })
        .catch(console.error);
    });
  });
}

export async function restoreKalshiEngineStateFromDb(userId: number): Promise<void> {
  try {
    const { db } = await import('../db');
    const { engineRunState } = await import('../../shared/schema');
    const { eq, and } = await import('drizzle-orm');
    const rows = await db.select().from(engineRunState)
      .where(and(eq(engineRunState.userId, userId), eq(engineRunState.engine, 'kalshi')));
    const row = rows[0];
    if (row?.isRunning) {
      console.log(`[Kalshi] Restoring engine for user ${userId}`);
      startKalshiEngine(userId);
    }
  } catch (e) {
    console.error('[Kalshi] Failed to restore engine state:', e);
  }
}

export async function manualKalshiScan(userId: number): Promise<{ fired: boolean; reason: string }> {
  return _runKalshiScan(userId, true);
}

// ── Shared order placement ──────────────────────────────────────────────────────

async function _placeKalshiYes(
  userId: number,
  s: KalshiEngineState,
  p: { coin: KalshiCryptoCoin; ticker: string; subtitle: string; priceInCents: number; confidence: number; btcPrice: number; direction: 'BUY' | 'SELL'; label: string; strategy: string },
): Promise<{ fired: boolean; reason: string }> {
  // Compounding mode sizes the stake from the growing bankroll; otherwise fixed
  // count — then Brain Learning Mode / Kelly / Drawdown Shield adjust it further.
  const { contracts, reasoning: sizingReasoning } = await kalshiContractsFor(userId, s, p.priceInCents);
  const stakeUsd = (p.priceInCents / 100) * contracts;

  let kalshiOrderId: string | undefined;
  if (!s.isPaperMode) {
    try {
      const result: KalshiOrderResult = await placeKalshiOrder(
        userId, p.ticker, 'yes', 'buy', contracts, p.priceInCents,
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
    coin:              p.coin,
    ticker:            p.ticker,
    subtitle:          p.subtitle,
    side:              'yes',
    action:            'buy',
    count:             contracts,
    entryPriceCents:   p.priceInCents,
    currentPriceCents: p.priceInCents,
    stake:             stakeUsd,
    currentValue:      stakeUsd,
    unrealizedPnl:     0,
    signal:            { direction: p.direction, confidence: p.confidence, btcPrice: p.btcPrice },
    strategy:          p.strategy,
    openedAt:          new Date().toISOString(),
    status:            'open',
    paper:             s.isPaperMode,
    kalshiOrderId,
  };

  s.openTrades.push(trade);
  s.lastTradeAt = new Date().toISOString();
  _recalcUnrealized(s);

  const modeStr = s.isPaperMode ? '[PAPER]' : '[LIVE]';
  const exitNote = (s.config.takeProfitCents > 0 || s.config.stopLossCents > 0)
    ? ` · auto-exit TP ${s.config.takeProfitCents}¢/SL ${s.config.stopLossCents}¢`
    : '';
  const compNote = s.config.compounding ? ` · compounding ${s.config.riskPctPerTrade}% of $${kalshiBankroll(s).toFixed(0)} bankroll` : '';
  const r = `${modeStr} ${p.label}: bought YES × ${contracts} on "${p.subtitle}" at ${p.priceInCents}¢ — stake $${stakeUsd.toFixed(2)}${compNote}${exitNote}${sizingReasoning ? ` ${sizingReasoning}` : ''}`;
  s.lastScanResult = r;
  return { fired: true, reason: r };
}

// ── Core scan ─────────────────────────────────────────────────────────────────
// Loops the configured symbols (default ['BTC'], preserving old behavior) and
// fires on the first one that clears every gate this cycle. Per-symbol logic
// lives in _scanOneCoin — unchanged from the original single-coin version,
// just parameterized by `coin` throughout instead of assuming BTC.

async function _runKalshiScan(userId: number, manual = false): Promise<{ fired: boolean; reason: string }> {
  const s = getKalshiEngineState(userId);
  s.lastScanAt = new Date().toISOString();

  // Refresh live prices + run take-profit/stop-loss auto-exits first
  await _updateOpenTradePrices(userId, s);

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

  const symbols = s.config.symbols?.length ? s.config.symbols : (['BTC'] as KalshiCryptoCoin[]);
  let lastReason = 'No qualifying signal this cycle';
  for (const coin of symbols) {
    const result = await _scanOneCoin(userId, s, coin);
    if (result.fired) {
      s.lastScanResult = result.reason;
      return result;
    }
    lastReason = result.reason;
  }
  s.lastScanResult = lastReason;
  return { fired: false, reason: lastReason };
}

async function _scanOneCoin(userId: number, s: KalshiEngineState, coin: KalshiCryptoCoin): Promise<{ fired: boolean; reason: string }> {
  // ── Auto-trade the top High-Value Pick (all-strategy consensus + edge model) ──
  if (s.config.autoTradeValuePicks) {
    try {
      const vp = await scanKalshiValuePicks(userId, 1, coin);
      const top = vp.picks[0];
      if (!top) {
        return { fired: false, reason: `${coin}: Value picks: no positive-edge bracket right now (${vp.consensus.direction} consensus)` };
      }
      if (top.valueScore < s.config.minValueScore) {
        return { fired: false, reason: `${coin}: Value picks: best score ${top.valueScore} below threshold (${s.config.minValueScore}) — "${top.subtitle}"` };
      }
      return await _placeKalshiYes(userId, s, {
        coin,
        ticker: top.ticker,
        subtitle: top.subtitle,
        priceInCents: top.marketAskCents,
        confidence: top.confidence,
        btcPrice: vp.btcPrice,
        direction: vp.consensus.direction === 'SELL' ? 'SELL' : 'BUY',
        label: `${coin} value pick (score ${top.valueScore}, +${top.edgePct}¢ edge)`,
        strategy: 'consensus',
      });
    } catch (err: any) {
      return { fired: false, reason: `${coin}: Value-pick scan error: ${err.message}` };
    }
  }

  try {
    // 0. Resolve strategy — 'auto' scans all strategies and picks the best
    //    by live confidence × historical accuracy.
    let effectiveStrategy: KalshiStrategy;
    let stratLabel: string;
    if (s.config.strategy === 'auto') {
      const scan = await scanAllKalshiStrategies(userId, coin);
      if (!scan.selected) {
        return { fired: false, reason: `${coin} Auto: all strategies NEUTRAL this cycle — no trade` };
      }
      effectiveStrategy = scan.selected;
      const sel = scan.rows.find(row => row.strategy === effectiveStrategy)!;
      stratLabel = `${coin} Auto→${STRATEGY_LABELS[effectiveStrategy]} (acc ${sel.winRate}%/${sel.decidedTrades}t · conf ${sel.confidence}%)`;
    } else {
      effectiveStrategy = s.config.strategy;
      stratLabel = `${coin} ${STRATEGY_LABELS[effectiveStrategy] ?? effectiveStrategy}`;
    }

    // 1. Get directional signal from the resolved strategy
    const pred = await getKalshiSignal(effectiveStrategy, coin);
    if (!pred || pred.direction === 'NEUTRAL') {
      return { fired: false, reason: `${stratLabel}: NEUTRAL — ${pred?.reason ?? 'no clear direction'}` };
    }

    if (pred.confidence < s.config.minConfidence) {
      return { fired: false, reason: `${stratLabel}: confidence ${pred.confidence}% below threshold (${s.config.minConfidence}%)` };
    }

    // Optional: require 1h trend to agree
    if (s.config.requireAlignedHourly) {
      const aligned =
        (pred.direction === 'BUY'  && pred.priceChange1h > 0) ||
        (pred.direction === 'SELL' && pred.priceChange1h < 0);
      if (!aligned) {
        return { fired: false, reason: `${stratLabel}: 1h trend (${pred.priceChange1h > 0 ? '+' : ''}${pred.priceChange1h.toFixed(2)}%) conflicts with ${pred.direction} signal` };
      }
    }

    // Confluence gate: require the multi-strategy consensus to AGREE with this
    // signal (≥60% weighted agreement). Trading a single strategy that the others
    // contradict is a major loss source — only fire when the book agrees.
    if (s.config.requireConfluence !== false) {
      const consensus = await getKalshiConsensus(coin);
      const agrees = consensus.direction === pred.direction && consensus.agreement >= 0.6;
      if (!agrees) {
        return { fired: false, reason: `${stratLabel}: Confluence fail: says ${pred.direction} but consensus is ${consensus.direction} @ ${Math.round(consensus.agreement * 100)}% agree (need ≥60% agreeing)` };
      }
    }

    // 2. Get the coin's hourly bracket market event
    const seriesTicker = KALSHI_SERIES_MAP[coin].hourly;
    const event = await getKalshiCryptoEvent(seriesTicker, pred.currentPrice);
    if (!event.brackets.length) {
      return { fired: false, reason: `${coin}: No active ${seriesTicker} brackets available` };
    }

    // Skip if event closes in < 15 min (not enough time for trade to resolve meaningfully)
    if (event.msUntilClose < 15 * 60 * 1000) {
      return { fired: false, reason: `${coin}: Nearest ${seriesTicker} event closes in <15 min — waiting for next event` };
    }

    // 3. Select bracket
    const bracket = _selectBracket(event.brackets, pred);
    if (!bracket) {
      return { fired: false, reason: `${coin}: Could not find a suitable bracket for current signal` };
    }

    // 4. Determine order: always BUY YES on chosen bracket
    const priceInCents = bracket.yesAsk > 0 ? bracket.yesAsk : Math.max(1, bracket.yesProbability);
    if (priceInCents >= 97) {
      return { fired: false, reason: `${coin}: Bracket ${bracket.subtitle} already at ${priceInCents}¢ — too expensive` };
    }

    // Expected-value gate: our signal confidence ≈ P(win). Never pay MORE for the
    // contract than our edge justifies — buying an 80¢ contract on a 72% signal is
    // negative EV. Require the price to be at least 5¢ below implied probability.
    if (priceInCents > pred.confidence - 5) {
      return { fired: false, reason: `${coin}: No edge: ${bracket.subtitle} costs ${priceInCents}¢ but signal implies ~${pred.confidence}% win — need ≤${pred.confidence - 5}¢. Skip.` };
    }

    // 5. Place the order via shared helper
    return await _placeKalshiYes(userId, s, {
      coin,
      ticker: bracket.ticker,
      subtitle: bracket.subtitle,
      priceInCents,
      confidence: pred.confidence,
      btcPrice: pred.currentPrice,
      direction: pred.direction === 'SELL' ? 'SELL' : 'BUY',
      label: stratLabel,
      strategy: effectiveStrategy,
    });

  } catch (err: any) {
    return { fired: false, reason: `${coin}: Scan error: ${err.message}` };
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

// ── Per-strategy scan & auto-selector ────────────────────────────────────────────
// Runs every strategy, pairs each live signal with its historical accuracy, and
// ranks them so "Auto (Best)" mode trades whichever strategy is predicting best.

export interface KalshiStrategyScanRow {
  strategy: KalshiStrategy;
  label: string;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;       // live signal confidence
  reason: string;
  winRate: number;          // historical win rate (0 if no history)
  decidedTrades: number;    // wins + losses
  totalPnl: number;
  selectScore: number;      // ranking: live confidence blended with historical accuracy
  selected: boolean;
}

export interface KalshiStrategyScanResult {
  rows: KalshiStrategyScanRow[];
  selected: KalshiStrategy | null;
  btcPrice: number;
  scannedAt: string;
}

export async function scanAllKalshiStrategies(userId: number, coin: KalshiCryptoCoin = 'BTC'): Promise<KalshiStrategyScanResult> {
  const scannedAt = new Date().toISOString();
  const consensus: KalshiConsensus = await getKalshiConsensus(coin); // runs all 4 strategies
  // Per-strategy win-rate history is tracked per-user, not per-coin — a
  // simplification for this multi-coin expansion. BTC momentum's track record
  // currently informs the "auto" strategy pick for ETH/SOL/etc too, rather
  // than each coin building its own separate history. Splitting kalshi-
  // performance.ts out per-coin would be a reasonable fast-follow if the
  // learning signal needs to be more precise once real multi-coin history builds up.
  const perf = getKalshiPerformance(userId);

  const rows: KalshiStrategyScanRow[] = consensus.signals.map(sig => {
    const stat = perf.byStrategy.find(p => p.strategy === sig.strategy);
    const winRate = stat?.winRate ?? 0;
    const decided = stat ? stat.wins + stat.losses : 0;
    const totalPnl = stat?.totalPnl ?? 0;

    // Blend live confidence with historical accuracy. With no track record we lean
    // on confidence (accuracy treated as neutral 0.5); as history builds, real
    // accuracy dominates the choice. NEUTRAL signals can't be selected (score 0).
    const hasHistory = decided >= 3;
    const accuracyFactor = hasHistory ? winRate / 100 : 0.5;
    const selectScore = sig.direction === 'NEUTRAL'
      ? 0
      : Math.round(sig.confidence * (0.4 + accuracyFactor * 0.6));

    return {
      strategy: sig.strategy as KalshiStrategy,
      label: STRATEGY_LABELS[sig.strategy as KalshiStrategy] ?? sig.strategy,
      direction: sig.direction,
      confidence: sig.confidence,
      reason: sig.reason,
      winRate,
      decidedTrades: decided,
      totalPnl,
      selectScore,
      selected: false,
    };
  });

  // Best = highest selectScore among strategies with a live (non-neutral) signal
  let best: KalshiStrategyScanRow | null = null;
  for (const r of rows) if (r.selectScore > 0 && (!best || r.selectScore > best.selectScore)) best = r;
  if (best) best.selected = true;

  rows.sort((a, b) => b.selectScore - a.selectScore);
  return { rows, selected: best?.strategy ?? null, btcPrice: consensus.currentPrice, scannedAt };
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
  valueScore: number;         // edge × agreement × confidence × learned-winrate weighting
  confidence: number;         // consensus confidence
  agreement: number;          // 0–1 strategy agreement
  winRateWeight: number;      // learning factor applied from historical win rate (1.0 = neutral)
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

export async function scanKalshiValuePicks(userId: number, limit = 5, coin: KalshiCryptoCoin = 'BTC'): Promise<KalshiValueScanResult> {
  const scannedAt = new Date().toISOString();
  const consensus: KalshiConsensus = await getKalshiConsensus(coin);
  const btcPrice = consensus.currentPrice;

  const base: KalshiValueScanResult = {
    consensus: { direction: consensus.direction, confidence: consensus.confidence, agreement: consensus.agreement, reasons: consensus.reasons },
    btcPrice, eventTicker: null, minutesToClose: null, picks: [], scannedAt,
  };
  if (!btcPrice) return base;

  const seriesTicker = KALSHI_SERIES_MAP[coin].hourly;
  const event = await getKalshiCryptoEvent(seriesTicker, btcPrice).catch(() => null);
  if (!event || !event.brackets.length) return base;
  base.eventTicker = event.eventTicker;
  base.minutesToClose = Math.round(event.msUntilClose / 60000);

  // Volatility scaled to the remaining time until the event closes
  const { candles } = await getCryptoCandles(coin, 100).catch(() => ({ candles: [] as any[] }));
  const hourlyVolFrac = candles.length ? estimateHourlyVol(candles) : 0.004;
  const hoursLeft = Math.max(0.1, event.msUntilClose / 3600000);
  const sigmaPrice = btcPrice * hourlyVolFrac * Math.sqrt(hoursLeft);

  // Consensus drift: push the expected close in the consensus direction, scaled by
  // confidence & agreement, capped at ~0.35σ so the market price dominates (the old
  // 0.6σ over-stated our edge and produced false "value" picks that lost). Only
  // apply drift when the strategies genuinely agree (≥60%); otherwise trust the market.
  const dirSign = consensus.direction === 'BUY' ? 1 : consensus.direction === 'SELL' ? -1 : 0;
  const driftFrac = consensus.agreement >= 0.6
    ? dirSign * (consensus.confidence / 100) * consensus.agreement * 0.35
    : 0;
  const driftPrice = sigmaPrice * driftFrac;

  // ── Learning feedback ──────────────────────────────────────────────────────
  // Weight scores by the consensus strategy's historical win rate (once it has a
  // track record). Proven approach → lean harder; been losing → pull back.
  // Neutral (1.0) until ≥5 decided trades so early noise doesn't distort scoring.
  const perf = getKalshiPerformance(userId);
  const consStat = perf.byStrategy.find(st => st.strategy === 'consensus');
  let winRateWeight = 1.0;
  if (consStat && (consStat.wins + consStat.losses) >= 5) {
    // winRate 0% → 0.7×, 50% → 1.0×, 100% → 1.3×
    winRateWeight = Math.round((0.7 + (consStat.winRate / 100) * 0.6) * 100) / 100;
  }

  const picks: KalshiValuePick[] = [];
  for (const b of event.brackets) {
    if (!b.hasLiquidity) continue;
    const ask = b.yesAsk > 0 ? b.yesAsk : b.yesProbability;
    if (ask <= 1 || ask >= 97) continue; // skip illiquid / already-decided

    const modelProb = _bracketModelProb(b, btcPrice, sigmaPrice, driftPrice);
    const modelProbPct = Math.round(modelProb * 100);
    const edgePct = modelProbPct - ask;
    if (edgePct < 4) continue; // require a real ≥4¢ edge, not a marginal positive

    // Value score: edge weighted by how strongly the strategies agree & their confidence,
    // lightly penalized for very long-shot picks, and scaled by the learned win rate.
    const agreementW = 0.5 + consensus.agreement * 0.5;       // 0.5–1.0
    const confW      = 0.5 + (consensus.confidence / 100) * 0.5; // 0.5–1.0
    const probW      = 0.6 + modelProb * 0.4;                  // favor more-likely outcomes
    const valueScore = Math.round(edgePct * agreementW * confW * probW * winRateWeight * 10) / 10;

    const learnNote = winRateWeight !== 1.0
      ? ` Learned ${winRateWeight}× (consensus WR ${consStat!.winRate}% over ${consStat!.wins + consStat!.losses}).`
      : '';

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
      winRateWeight,
      rationale: `${consensus.direction} consensus (${Math.round(consensus.agreement * 100)}% agree, ${consensus.confidence}% conf). Model ${modelProbPct}% vs market ${ask}¢ → +${edgePct}¢ edge.${learnNote}`,
    });
  }

  picks.sort((a, b) => b.valueScore - a.valueScore);
  base.picks = picks.slice(0, limit);
  return base;
}

// ── P&L refresh ───────────────────────────────────────────────────────────────

async function _updateOpenTradePrices(userId: number, s: KalshiEngineState): Promise<void> {
  if (!s.openTrades.length) return;

  // Pull each coin's latest event once (open trades can now span multiple
  // coins) and match each open trade by ticker to refresh its current YES
  // price (we value a YES position at the bid — what we can sell at).
  // Trades opened before this expansion (or `coin` missing for any reason)
  // fall back to BTC, matching the original single-coin behavior.
  const coinsInPlay = Array.from(new Set(s.openTrades.map(t => t.coin || 'BTC')));
  const bracketsByCoin = new Map<KalshiCryptoCoin, KalshiBTCBracket[]>();
  for (const coin of coinsInPlay) {
    try {
      const seriesTicker = KALSHI_SERIES_MAP[coin]?.hourly ?? 'KXBTC';
      const event = await getKalshiCryptoEvent(seriesTicker, undefined, true);
      bracketsByCoin.set(coin, event.brackets);
    } catch {
      // Can't refresh this coin's prices this cycle — leave its positions untouched.
    }
  }

  for (const t of [...s.openTrades]) {
    const brackets = bracketsByCoin.get(t.coin || 'BTC');
    if (!brackets) continue;
    const b = brackets.find(x => x.ticker === t.ticker);
    if (!b) continue;
    // Sell-side value = yes bid (fallback to probability/last)
    const liveCents = b.yesBid > 0 ? b.yesBid : (b.yesProbability > 0 ? b.yesProbability : t.currentPriceCents);
    t.currentPriceCents = liveCents;
    t.currentValue      = (liveCents / 100) * t.count;
    t.unrealizedPnl     = t.currentValue - t.stake;

    // ── Auto-exit: take-profit / stop-loss on the contract price ──
    const tp = s.config.takeProfitCents;
    const sl = s.config.stopLossCents;
    if (tp > 0 && liveCents >= tp) {
      closeKalshiTrade(userId, t.id, liveCents, 'take_profit');
      s.lastScanResult = `✅ Take-profit: closed "${t.subtitle}" at ${liveCents}¢ (target ${tp}¢) — P&L $${((liveCents / 100 - t.entryPriceCents / 100) * t.count).toFixed(2)}`;
    } else if (sl > 0 && liveCents <= sl) {
      closeKalshiTrade(userId, t.id, liveCents, 'stop_loss');
      s.lastScanResult = `🛑 Stop-loss: closed "${t.subtitle}" at ${liveCents}¢ (stop ${sl}¢) — P&L $${((liveCents / 100 - t.entryPriceCents / 100) * t.count).toFixed(2)}`;
    }
  }
  _recalcUnrealized(s);
}

function _recalcUnrealized(s: KalshiEngineState): void {
  s.totalUnrealizedPnl = s.openTrades.reduce((sum, t) => sum + t.unrealizedPnl, 0);
}

export function closeKalshiTrade(
  userId: number,
  tradeId: string,
  exitPriceCents?: number,
  exitReason: 'take_profit' | 'stop_loss' | 'manual' | 'settlement' = 'manual',
): boolean {
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
  trade.exitReason    = exitReason;
  trade.unrealizedPnl = 0;

  s.openTrades.splice(idx, 1);
  s.closedTrades.unshift(trade);
  if (s.closedTrades.length > 50) s.closedTrades.length = 50;

  s.totalRealizedPnl += realizedPnl;
  _recalcUnrealized(s);

  // Feed the outcome into the per-strategy learning loop (survives restarts)
  try {
    recordKalshiOutcome(userId, trade.strategy || 'unknown', realizedPnl);
  } catch { /* non-blocking */ }

  // Persist to aiTradeResults so dashboard can display Kalshi trades
  Promise.resolve().then(async () => {
    try {
      const { db } = await import('../db');
      const { aiTradeResults } = await import('../../shared/schema');
      await db.insert(aiTradeResults).values({
        userId,
        symbol: `KALSHI:${trade.ticker}`,
        direction: trade.signal.direction === 'SELL' ? 'SELL' : 'BUY',
        entryPrice: trade.entryPriceCents / 100,
        exitPrice: exitCents / 100,
        result: realizedPnl > 0 ? 'WIN' : realizedPnl < 0 ? 'LOSS' : 'BREAKEVEN',
        profitLoss: Math.round(realizedPnl * 100) / 100,
        closedAt: new Date(),
        source: 'kalshi',
        mt5Ticket: trade.id,
        notes: `${trade.strategy}: ${trade.subtitle}${exitReason !== 'manual' ? ' | ' + exitReason : ''}`,
      });
    } catch { /* non-blocking */ }
  });

  return true;
}

export function closeAllKalshiTrades(userId: number): number {
  const s = getKalshiEngineState(userId);
  const ids = s.openTrades.map(t => t.id);
  ids.forEach(id => closeKalshiTrade(userId, id));
  return ids.length;
}
