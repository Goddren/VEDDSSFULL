// ─── Polymarket US Auto-Trading Engine ───────────────────────────────────────
// Mirrors the Kalshi engine and REUSES the exact same strategy functions
// (momentum / volume_profile / markov / order_flow / ensemble / auto + value
// picks + confluence + EV + TP/SL). Trades the CFTC-regulated api.polymarket.us
// exchange (no VPN) on its crypto markets, discovered live from the public gateway.
//
// The strategies are BTC-direction predictors shared with Kalshi — single source
// of truth. This engine maps that signal onto whatever crypto market Polymarket US
// currently lists; if none exist yet it runs live and reports "waiting for market".

import { getKalshiSignal, getKalshiConsensus, type KalshiStrategy, type TradeSignal } from './kalshi-strategies';
import { scanAllKalshiStrategies } from './kalshi-engine';
import {
  hasPmUsCredentials, findPmUsCryptoMarket, getPmUsBbo, placePmUsOrder,
} from './polymarket-us';

export interface PmUsEngineConfig {
  contractsPerTrade: number;
  maxOpenTrades: number;
  cooldownMinutes: number;
  minConfidence: number;
  requireAlignedHourly: boolean;
  requireConfluence: boolean;
  strategy: KalshiStrategy | 'auto';
  autoTradeValuePicks: boolean;
  minValueScore: number;
  takeProfitCents: number;
  stopLossCents: number;
  asset: 'bitcoin' | 'ethereum';
  // Compounding — stake a % of the growing bankroll instead of a fixed count
  compounding: boolean;
  riskPctPerTrade: number;
  startingBankroll: number;
}

export interface PmUsTrade {
  id: string;
  marketSlug: string;
  title: string;
  side: 'yes' | 'no';
  count: number;
  entryPriceCents: number;
  currentPriceCents: number;
  stake: number;
  unrealizedPnl: number;
  signal: { direction: 'BUY' | 'SELL'; confidence: number; strategy: string };
  openedAt: string;
  closedAt?: string;
  realizedPnl?: number;
  exitReason?: 'take_profit' | 'stop_loss' | 'manual';
  status: 'open' | 'closed';
  paper: boolean;
}

export interface PmUsEngineState {
  isRunning: boolean;
  isPaperMode: boolean;
  lastScanAt: string | null;
  lastScanResult: string | null;
  lastTradeAt: string | null;
  openTrades: PmUsTrade[];
  closedTrades: PmUsTrade[];
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  config: PmUsEngineConfig;
}

const DEFAULT_CONFIG: PmUsEngineConfig = {
  contractsPerTrade: 5, maxOpenTrades: 3, cooldownMinutes: 20, minConfidence: 70,
  requireAlignedHourly: true, requireConfluence: true, strategy: 'ensemble',
  autoTradeValuePicks: false, minValueScore: 8, takeProfitCents: 90, stopLossCents: 25,
  asset: 'bitcoin',
  compounding: false, riskPctPerTrade: 5, startingBankroll: 100,
};

const STRATEGY_LABELS: Record<string, string> = {
  momentum: 'Momentum', volume_profile: 'Volume Profile', markov: 'Markov',
  order_flow: 'Order Flow', ensemble: 'AI Ensemble', auto: 'Auto (Best)',
};

const _states = new Map<number, PmUsEngineState>();
const _timers = new Map<number, ReturnType<typeof setInterval>>();

export function getPmUsEngineState(userId: number): PmUsEngineState {
  if (!_states.has(userId)) {
    _states.set(userId, {
      isRunning: false, isPaperMode: !hasPmUsCredentials(userId),
      lastScanAt: null, lastScanResult: null, lastTradeAt: null,
      openTrades: [], closedTrades: [], totalRealizedPnl: 0, totalUnrealizedPnl: 0,
      config: { ...DEFAULT_CONFIG },
    });
  }
  const s = _states.get(userId)!;
  s.isPaperMode = !hasPmUsCredentials(userId);
  return s;
}

export function updatePmUsEngineConfig(userId: number, patch: Partial<PmUsEngineConfig>): void {
  const s = getPmUsEngineState(userId);
  const clean: any = { ...patch };
  if (clean.strategy && !STRATEGY_LABELS[clean.strategy]) delete clean.strategy;
  if (clean.minValueScore != null) clean.minValueScore = Math.max(1, Math.min(50, clean.minValueScore));
  if (clean.takeProfitCents != null) clean.takeProfitCents = Math.max(0, Math.min(99, clean.takeProfitCents));
  if (clean.stopLossCents != null) clean.stopLossCents = Math.max(0, Math.min(95, clean.stopLossCents));
  if (clean.riskPctPerTrade != null) clean.riskPctPerTrade = Math.max(1, Math.min(25, clean.riskPctPerTrade));
  if (clean.startingBankroll != null) clean.startingBankroll = Math.max(10, Math.min(1_000_000, clean.startingBankroll));
  s.config = { ...s.config, ...clean };
}

// Compounding sizing — bankroll grows with realized P&L so stakes scale up automatically
export function pmUsBankroll(s: PmUsEngineState): number {
  return Math.max(1, (s.config.startingBankroll || 100) + (s.totalRealizedPnl || 0));
}
export function pmUsContractsFor(s: PmUsEngineState, priceInCents: number): number {
  if (!s.config.compounding) return s.config.contractsPerTrade;
  const stakeTarget = pmUsBankroll(s) * ((s.config.riskPctPerTrade || 5) / 100);
  const perContract = Math.max(0.01, priceInCents / 100);
  return Math.max(1, Math.min(200, Math.floor(stakeTarget / perContract)));
}

export function startPmUsEngine(userId: number): void {
  const s = getPmUsEngineState(userId);
  if (s.isRunning) return;
  s.isRunning = true;
  _persistPmUsRunState(userId, true, s.isPaperMode);
  _runScan(userId).catch(console.error);
  _timers.set(userId, setInterval(() => _runScan(userId).catch(console.error), 5 * 60 * 1000));
}

export function stopPmUsEngine(userId: number): void {
  const s = getPmUsEngineState(userId);
  s.isRunning = false;
  _persistPmUsRunState(userId, false, s.isPaperMode);
  const iv = _timers.get(userId);
  if (iv) { clearInterval(iv); _timers.delete(userId); }
}

// ── Restart-persistence — without this, the engine silently reverts to
// "stopped" on every server restart/redeploy (Render redeploys on every
// push), with no error and no user-visible indication. Mirrors
// kalshi-engine.ts's _persistKalshiRunState/restoreKalshiEngineStateFromDb.
function _persistPmUsRunState(userId: number, isRunning: boolean, isPaperMode: boolean): void {
  import('../db').then(({ db }) => {
    import('../../shared/schema').then(({ engineRunState }) => {
      db.insert(engineRunState)
        .values({ userId, engine: 'polymarket-us', isRunning, isPaperMode })
        .onConflictDoUpdate({
          target: [engineRunState.userId, engineRunState.engine],
          set: { isRunning, isPaperMode, updatedAt: new Date() },
        })
        .catch(console.error);
    });
  });
}

export async function restorePmUsEngineStateFromDb(userId: number): Promise<void> {
  try {
    const { db } = await import('../db');
    const { engineRunState } = await import('../../shared/schema');
    const { eq, and } = await import('drizzle-orm');
    const rows = await db.select().from(engineRunState)
      .where(and(eq(engineRunState.userId, userId), eq(engineRunState.engine, 'polymarket-us')));
    const row = rows[0];
    if (row?.isRunning) {
      console.log(`[PolymarketUS] Restoring engine for user ${userId}`);
      startPmUsEngine(userId);
    }
  } catch (e) {
    console.error('[PolymarketUS] Failed to restore engine state:', e);
  }
}

export async function manualPmUsScan(userId: number) { return _runScan(userId, true); }

function _recalc(s: PmUsEngineState) {
  s.totalUnrealizedPnl = Math.round(s.openTrades.reduce((sum, t) => sum + t.unrealizedPnl, 0) * 100) / 100;
}

async function _updateOpenTrades(userId: number, s: PmUsEngineState): Promise<void> {
  for (const t of [...s.openTrades]) {
    const bbo = await getPmUsBbo(t.marketSlug);
    if (!bbo) continue;
    const liveCents = Math.round((bbo.bestBid > 0 ? bbo.bestBid : bbo.currentPx) * 100);
    if (!liveCents) continue;
    t.currentPriceCents = liveCents;
    t.unrealizedPnl = Math.round(((liveCents / 100) * t.count - t.stake) * 100) / 100;
    const tp = s.config.takeProfitCents, sl = s.config.stopLossCents;
    if (tp > 0 && liveCents >= tp) _closeTrade(userId, t.id, liveCents, 'take_profit');
    else if (sl > 0 && liveCents <= sl) _closeTrade(userId, t.id, liveCents, 'stop_loss');
  }
  _recalc(s);
}

function _closeTrade(userId: number, id: string, exitCents: number, reason: PmUsTrade['exitReason']): boolean {
  const s = getPmUsEngineState(userId);
  const idx = s.openTrades.findIndex(t => t.id === id);
  if (idx === -1) return false;
  const t = s.openTrades[idx];
  const realized = Math.round(((exitCents / 100) * t.count - t.stake) * 100) / 100;
  t.status = 'closed'; t.closedAt = new Date().toISOString(); t.realizedPnl = realized;
  t.exitReason = reason; t.unrealizedPnl = 0;
  s.openTrades.splice(idx, 1);
  s.closedTrades.unshift(t);
  if (s.closedTrades.length > 50) s.closedTrades.length = 50;
  s.totalRealizedPnl = Math.round((s.totalRealizedPnl + realized) * 100) / 100;
  try { const { recordKalshiOutcome } = require('./kalshi-performance'); recordKalshiOutcome(userId, `pmus:${t.signal.strategy}`, realized); } catch {}
  _recalc(s);
  return true;
}

export function closePmUsTrade(userId: number, id: string): boolean {
  const s = getPmUsEngineState(userId);
  const t = s.openTrades.find(x => x.id === id);
  return t ? _closeTrade(userId, id, t.currentPriceCents, 'manual') : false;
}

async function _runScan(userId: number, manual = false): Promise<{ fired: boolean; reason: string }> {
  const s = getPmUsEngineState(userId);
  s.lastScanAt = new Date().toISOString();
  await _updateOpenTrades(userId, s);

  if (s.openTrades.length >= s.config.maxOpenTrades) {
    const r = `Max open trades (${s.config.maxOpenTrades}) reached`; s.lastScanResult = r; return { fired: false, reason: r };
  }
  if (!manual && s.lastTradeAt) {
    const elapsed = Date.now() - new Date(s.lastTradeAt).getTime();
    if (elapsed < s.config.cooldownMinutes * 60000) {
      const r = `Cooldown: ${Math.ceil((s.config.cooldownMinutes * 60000 - elapsed) / 60000)}m left`; s.lastScanResult = r; return { fired: false, reason: r };
    }
  }

  try {
    // Resolve strategy (auto → best by accuracy)
    let strat: KalshiStrategy;
    let label: string;
    if (s.config.strategy === 'auto') {
      const scan = await scanAllKalshiStrategies(userId);
      if (!scan.selected) { const r = 'Auto: all strategies NEUTRAL'; s.lastScanResult = r; return { fired: false, reason: r }; }
      strat = scan.selected; label = `Auto→${STRATEGY_LABELS[strat]}`;
    } else { strat = s.config.strategy; label = STRATEGY_LABELS[strat] ?? strat; }

    const pred: TradeSignal = await getKalshiSignal(strat);
    if (!pred || pred.direction === 'NEUTRAL') { const r = `${label}: NEUTRAL`; s.lastScanResult = r; return { fired: false, reason: r }; }
    if (pred.confidence < s.config.minConfidence) { const r = `${label}: ${pred.confidence}% < ${s.config.minConfidence}%`; s.lastScanResult = r; return { fired: false, reason: r }; }

    if (s.config.requireAlignedHourly) {
      const aligned = (pred.direction === 'BUY' && pred.priceChange1h > 0) || (pred.direction === 'SELL' && pred.priceChange1h < 0);
      if (!aligned) { const r = `1h trend conflicts with ${pred.direction}`; s.lastScanResult = r; return { fired: false, reason: r }; }
    }
    if (s.config.requireConfluence) {
      const c = await getKalshiConsensus();
      if (!(c.direction === pred.direction && c.agreement >= 0.6)) { const r = `Confluence fail (consensus ${c.direction} ${Math.round(c.agreement * 100)}%)`; s.lastScanResult = r; return { fired: false, reason: r }; }
    }

    // Find a tradable crypto market on Polymarket US
    const market = await findPmUsCryptoMarket(s.config.asset);
    if (!market) {
      const r = `🟢 Engine live — no ${s.config.asset.toUpperCase()} market on Polymarket US yet (waiting). Signal was ${label} ${pred.direction} ${pred.confidence}%.`;
      s.lastScanResult = r; return { fired: false, reason: r };
    }
    const bbo = await getPmUsBbo(market.slug);
    const askCents = bbo && bbo.bestAsk > 0 ? Math.round(bbo.bestAsk * 100) : (market.bestAsk ? Math.round(market.bestAsk * 100) : 0);
    if (!askCents || askCents >= 97) { const r = `${market.slug}: no/expensive price (${askCents}¢)`; s.lastScanResult = r; return { fired: false, reason: r }; }

    // Expected-value gate: don't pay more than the signal's implied probability
    if (askCents > pred.confidence - 5) { const r = `No edge: ${askCents}¢ vs ~${pred.confidence}% — skip`; s.lastScanResult = r; return { fired: false, reason: r }; }

    // Map direction → outcome: BUY → buy YES (long), SELL → buy NO (short)
    const side: 'yes' | 'no' = pred.direction === 'BUY' ? 'yes' : 'no';
    const intent = pred.direction === 'BUY' ? 'ORDER_INTENT_BUY_LONG' : 'ORDER_INTENT_BUY_SHORT';
    const contracts = pmUsContractsFor(s, askCents);
    const stake = (askCents / 100) * contracts;

    if (!s.isPaperMode) {
      const r = await placePmUsOrder(userId, {
        marketSlug: market.slug, intent: intent as any, type: 'ORDER_TYPE_MARKET',
        quantity: contracts,
      });
      if (!r.ok) { const msg = `Order failed (HTTP ${r.status}): ${JSON.stringify(r.data).slice(0, 160)}`; s.lastScanResult = msg; return { fired: false, reason: msg }; }
    }

    const trade: PmUsTrade = {
      id: `pmus-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      marketSlug: market.slug, title: market.title || market.question || market.slug,
      side, count: contracts, entryPriceCents: askCents, currentPriceCents: askCents,
      stake, unrealizedPnl: 0,
      signal: { direction: pred.direction, confidence: pred.confidence, strategy: strat },
      openedAt: new Date().toISOString(), status: 'open', paper: s.isPaperMode,
    };
    s.openTrades.push(trade);
    s.lastTradeAt = new Date().toISOString();
    _recalc(s);

    const compNote = s.config.compounding ? ` · compounding ${s.config.riskPctPerTrade}% of $${pmUsBankroll(s).toFixed(0)}` : '';
    const r = `${s.isPaperMode ? '[PAPER]' : '[LIVE]'} ${label}: ${side.toUpperCase()} × ${contracts} on "${trade.title}" @ ${askCents}¢ (stake $${stake.toFixed(2)})${compNote}`;
    s.lastScanResult = r;
    return { fired: true, reason: r };
  } catch (err: any) {
    const r = `Scan error: ${err.message}`; s.lastScanResult = r; return { fired: false, reason: r };
  }
}
