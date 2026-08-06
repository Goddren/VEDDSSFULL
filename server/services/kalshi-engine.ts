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

import { getKalshiCryptoEvent, getKalshiMarketStatus, isKalshiBrokerTradeable, KALSHI_SERIES_MAP, type KalshiBTCBracket, type KalshiCryptoCoin } from './kalshi';
import {
  placeKalshiOrder, getKalshiBalance, loadKalshiCredentials, getKalshiPositions,
  getKalshiOrders, cancelKalshiOrder,
  type KalshiOrderResult,
} from './kalshi-trading';
import { getKalshiSignal, getKalshiConsensus, estimateHourlyVol, type KalshiStrategy, type TradeSignal, type KalshiConsensus } from './kalshi-strategies';
import { getCryptoCandles } from './btc-5min-predictor';
import { recordKalshiOutcome, getKalshiPerformance } from './kalshi-performance';

// Coins/assets with a real, currently-tradeable bracket market (same product
// structure as the original KXBTC). Verified live against Kalshi's API before
// adding: SOL sometimes has zero currently-open hourly events (handled as a
// per-symbol skip in the scan loop, not a hard error) — still listed since it
// comes and goes. GOLD added for Kalshi's Commodities category (hourly only —
// see isKalshiBrokerTradeable in kalshi.ts for why 15-min is excluded). Oil is
// NOT included: confirmed live that neither its hourly nor 15-min series is
// broker/API-tradeable on Kalshi's side at all, so there's no working
// timeframe to wire up for it right now.
export const KALSHI_TRADEABLE_COINS: KalshiCryptoCoin[] = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'GOLD'];

// Session peak-bankroll tracker for Drawdown Shield — same in-memory,
// session-scoped pattern used by futures-scanner.ts/cryptocom-scanner.ts.
const _sessionPeakBankroll = new Map<number, number>();

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KalshiTradeRecord {
  id: string;
  coin: KalshiCryptoCoin;  // which series/event this trade belongs to — added for multi-coin support
  timeframe: 'hourly' | 'fifteen_min'; // which bracket-event product this ticker belongs to — needed to know which series to re-query for live pricing regardless of later config changes
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
  /** Set when isPaperMode is true because a real credential check FAILED
   * (not merely "no credentials saved") — lets the UI distinguish "never
   * connected" from "connected but broken" instead of collapsing both into
   * the same generic paper-mode badge. */
  credentialError: string | null;
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
  // Which coins' bracket markets to scan each cycle (was hardcoded to
  // BTC-only). The engine tries each in order and fires on the first one that
  // clears every gate that cycle — see KALSHI_TRADEABLE_COINS for what's
  // actually available.
  symbols: KalshiCryptoCoin[];
  // Which bracket-event product to trade: Kalshi posts both an hourly and a
  // fifteen-minute event for each coin (KXBTC vs KXBTC15M, etc — confirmed
  // live against Kalshi's real series listing). Same mechanics, much faster
  // cycle time. Default 'hourly' preserves existing behavior.
  timeframe: 'hourly' | 'fifteen_min';
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
  // Auto-exit, as a PERCENTAGE OF ENTRY PRICE (0 = disabled). Was an absolute
  // cents threshold — changed after confirming live that value-pick entries
  // (which specifically target cheap, underpriced contracts) routinely
  // start out already past a fixed absolute floor, guaranteeing an almost-
  // immediate stop-loss regardless of signal quality. A flat-cents relative
  // offset was tried next, but that degenerates at the extremes of Kalshi's
  // 1-99¢ range too: a cheap entry (e.g. 6¢) with an 8¢ stop floors at 1¢ —
  // barely any protection, since the position must fall to near-total loss
  // before stopping. Percentage-of-entry scales correctly across the whole
  // price range regardless of how cheap or expensive the entry was.
  takeProfitCents: number;      // close early when price ≥ entry × (1 + this/100) (default 50 = +50%)
  stopLossCents: number;        // close early when price ≤ entry × (1 - this/100) (default 40 = -40%)
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
  timeframe:            'hourly',
  contractsPerTrade:    5,
  maxOpenTrades:        3,
  cooldownMinutes:      20,
  minConfidence:        70,
  requireAlignedHourly: true,
  requireConfluence:    true,
  strategy:             'momentum',
  autoTradeValuePicks:  false,
  minValueScore:        8,
  takeProfitCents:      50, // +50% of entry price
  stopLossCents:        40, // -40% of entry price
  compounding:          false,
  riskPctPerTrade:      5,
  startingBankroll:     100,
  useKellyCriterion:       false,
  brainLearningMode:       true,
  drawdownShieldThreshold: 0, // 0 = disabled by default (opt-in, unlike options/futures/cryptocom)
};

/** Identify which coin + timeframe a ticker belongs to from its series
 * prefix. Fifteen-min series prefixes (e.g. "KXBTC15M") share a root with
 * their hourly counterpart ("KXBTC"), so the more specific fifteen-min
 * prefix must be checked FIRST — checking hourly first would misclassify
 * every 15-min ticker as hourly (KXBTC is itself a string-prefix of KXBTC15M). */
function _coinAndTimeframeFromTicker(ticker: string): { coin: KalshiCryptoCoin; timeframe: 'hourly' | 'fifteen_min' } {
  for (const c of KALSHI_TRADEABLE_COINS) {
    if (ticker.startsWith(KALSHI_SERIES_MAP[c].fifteenMin)) return { coin: c, timeframe: 'fifteen_min' };
  }
  for (const c of KALSHI_TRADEABLE_COINS) {
    if (ticker.startsWith(KALSHI_SERIES_MAP[c].hourly)) return { coin: c, timeframe: 'hourly' };
  }
  return { coin: 'BTC', timeframe: 'hourly' };
}

const STRATEGY_LABELS: Record<KalshiStrategy | 'auto', string> = {
  momentum:       'Momentum',
  volume_profile: 'Volume Profile',
  markov:         'Markov',
  order_flow:     'Order Flow',
  ensemble:       'AI Ensemble',
  auto:           'Auto (Best)',
};

// Persisted per-user config overrides, hydrated from kalshi_engine_configs at
// boot (see hydratePersistedKalshiConfigs). Applied on top of DEFAULT_CONFIG
// whenever fresh in-memory state is created, so symbols/strategy/risk
// settings survive a Render redeploy instead of resetting to BTC-only.
const _persistedConfigOverrides = new Map<number, Partial<KalshiEngineConfig>>();

// Cached credential-validity check. isPaperMode previously only checked
// whether a credential FILE existed, never whether it actually authenticates
// — an expired/revoked key or a dead password-auth credential (Kalshi
// removed email/password login entirely) would show "LIVE" while every real
// order silently failed each cooldown cycle. A real check is an API round
// trip, too slow/rate-limit-risky to run on every getKalshiEngineState()
// call (read very frequently) — so it's cached and refreshed at the top of
// each scan cycle (every 5 min) instead. Only a POSITIVELY CONFIRMED auth
// failure forces paper mode; a transient check error (network blip) leaves
// the previous result in place rather than flipping the badge on a hiccup.
const _credValidity = new Map<number, { valid: boolean; error?: string; checkedAt: number }>();
const CRED_VALIDITY_TTL_MS = 10 * 60 * 1000;

export async function refreshKalshiCredValidity(userId: number): Promise<void> {
  if (!loadKalshiCredentials(userId)) { _credValidity.delete(userId); return; }
  const cached = _credValidity.get(userId);
  if (cached && Date.now() - cached.checkedAt < CRED_VALIDITY_TTL_MS) return;
  try {
    const { testKalshiCredentials } = await import('./kalshi-trading');
    const result = await testKalshiCredentials(userId);
    _credValidity.set(userId, { valid: result.valid, error: result.error, checkedAt: Date.now() });
  } catch { /* transient failure — keep previous cached result, if any */ }
}

export function getKalshiEngineState(userId: number): KalshiEngineState {
  if (!_states.has(userId)) {
    const override = _persistedConfigOverrides.get(userId);
    _states.set(userId, {
      isRunning:          false,
      isPaperMode:        !loadKalshiCredentials(userId),
      credentialError:    null,
      lastScanAt:         null,
      lastScanResult:     null,
      lastTradeAt:        null,
      openTrades:         [],
      closedTrades:       [],
      totalRealizedPnl:   0,
      totalUnrealizedPnl: 0,
      config: override ? { ...DEFAULT_CONFIG, ...override } : { ...DEFAULT_CONFIG },
    });
  }
  // Re-check paper mode each time (creds may have been added since start)
  const s = _states.get(userId)!;
  const hasCreds = !!loadKalshiCredentials(userId);
  const validity = _credValidity.get(userId);
  const knownInvalid = validity?.valid === false;
  s.isPaperMode = !hasCreds || knownInvalid;
  s.credentialError = knownInvalid ? (validity!.error ?? 'Credential check failed') : null;
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
  if (clean.timeframe && clean.timeframe !== 'hourly' && clean.timeframe !== 'fifteen_min') delete clean.timeframe;
  // Clamp auto-trade / exit fields to sane ranges
  if (clean.minValueScore   != null) clean.minValueScore   = Math.max(1, Math.min(50, clean.minValueScore));
  // Percentages of entry price now, not absolute/relative cents — a cheap
  // contract can legitimately multiply several times over (10¢ -> 99¢ is a
  // +890% move), so the take-profit upper bound is much wider than before;
  // stop-loss is capped at 99% since you can't lose more than the entry cost.
  if (clean.takeProfitCents != null) clean.takeProfitCents = Math.max(0, Math.min(500, clean.takeProfitCents));
  if (clean.stopLossCents   != null) clean.stopLossCents   = Math.max(0, Math.min(99, clean.stopLossCents));
  if (clean.riskPctPerTrade  != null) clean.riskPctPerTrade  = Math.max(1, Math.min(25, clean.riskPctPerTrade));
  if (clean.startingBankroll != null) clean.startingBankroll = Math.max(10, Math.min(1_000_000, clean.startingBankroll));
  s.config = { ...s.config, ...clean };
  _persistKalshiConfig(userId, s.config);
}

function _persistKalshiConfig(userId: number, config: KalshiEngineConfig): void {
  import('../db').then(({ db }) => {
    import('../../shared/schema').then(({ kalshiEngineConfigs }) => {
      db.insert(kalshiEngineConfigs)
        .values({ userId, config })
        .onConflictDoUpdate({
          target: kalshiEngineConfigs.userId,
          set: { config, updatedAt: new Date() },
        })
        .catch(console.error);
    });
  });
}

export async function hydratePersistedKalshiConfigs(): Promise<void> {
  try {
    const { db } = await import('../db');
    const { kalshiEngineConfigs } = await import('../../shared/schema');
    const rows = await db.select().from(kalshiEngineConfigs);
    for (const row of rows) {
      _persistedConfigOverrides.set(row.userId, row.config as Partial<KalshiEngineConfig>);
    }
    console.log(`[Kalshi] Hydrated ${rows.length} persisted engine config(s) — coin/strategy/risk settings will survive this restart.`);
  } catch (e) {
    console.error('[Kalshi] Failed to hydrate persisted engine configs:', e);
  }
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
    // totalRealizedPnl was purely in-memory, initialized to 0 on every fresh
    // state — meaning every redeploy silently reset the displayed cumulative
    // P&L to zero regardless of real trading history (reported as "balance
    // not updated" in the mobile nav — the dashboard only ever reflected
    // trades closed since the LAST restart, not the true all-time total).
    // Restore it from the durable trade history unconditionally, whether or
    // not the engine happens to be running right now.
    await _restoreKalshiRealizedPnl(userId);

    const { db } = await import('../db');
    const { engineRunState } = await import('../../shared/schema');
    const { eq, and } = await import('drizzle-orm');
    const rows = await db.select().from(engineRunState)
      .where(and(eq(engineRunState.userId, userId), eq(engineRunState.engine, 'kalshi')));
    const row = rows[0];
    if (row?.isRunning) {
      console.log(`[Kalshi] Restoring engine for user ${userId}`);
      // In-memory openTrades is wiped by this restart (nothing durable tracks
      // it) — reconcile against Kalshi's real account before resuming the
      // scan loop, or a fresh restart can place brand-new real orders on top
      // of real positions still resting on Kalshi from before the restart,
      // with no cap enforcement against actual exposure.
      await _reconcileKalshiPositionsOnBoot(userId);
      startKalshiEngine(userId);
    }
  } catch (e) {
    console.error('[Kalshi] Failed to restore engine state:', e);
  }
}

async function _restoreKalshiRealizedPnl(userId: number): Promise<void> {
  try {
    const { db } = await import('../db');
    const { aiTradeResults } = await import('../../shared/schema');
    const { eq, and, sql } = await import('drizzle-orm');
    const [row] = await db.select({ total: sql<string>`coalesce(sum(${aiTradeResults.profitLoss}), 0)` })
      .from(aiTradeResults)
      .where(and(eq(aiTradeResults.userId, userId), eq(aiTradeResults.source, 'kalshi')));
    const total = parseFloat(row?.total ?? '0') || 0;
    const s = getKalshiEngineState(userId);
    s.totalRealizedPnl = total;
  } catch (e: any) {
    console.error(`[Kalshi] Failed to restore totalRealizedPnl for user ${userId}:`, e?.message);
  }
}

// Best-effort reconstruction of real Kalshi positions this process has no
// memory of (server restart/redeploy wiped s.openTrades). We can't recover
// the original signal/strategy metadata — Kalshi's API doesn't store it —
// so these are tagged strategy:'reconciled' and given an approximate entry
// price derived from market_exposure. The goal isn't perfect P&L attribution
// for these; it's making sure maxOpenTrades/exposure accounting and the
// settlement-detection loop in _updateOpenTradePrices see them at all,
// instead of the engine silently placing new orders on top of forgotten
// real exposure.
async function _reconcileKalshiPositionsOnBoot(userId: number): Promise<void> {
  if (!loadKalshiCredentials(userId)) return; // paper mode — nothing real to reconcile
  const s = getKalshiEngineState(userId);
  try {
    const positions = await getKalshiPositions(userId);
    const trackedTickers = new Set(s.openTrades.map(t => t.ticker));
    let untracked = 0;
    for (const p of positions) {
      // Kalshi's V2 position schema renamed these to fixed-point decimal
      // STRINGS (position_fp, market_exposure_dollars) — confirmed against
      // the live OpenAPI spec. Old numeric position/market_exposure (cents)
      // kept as a fallback in case an older account/shard still serves them.
      const netContracts = p.position_fp != null ? parseFloat(p.position_fp) : Number(p.position ?? 0);
      if (!netContracts || netContracts <= 0) continue; // this engine only ever buys YES (long); skip flat/NO/short
      if (trackedTickers.has(p.ticker)) continue;
      untracked++;
      const count = Math.round(Math.abs(netContracts));
      const exposureCents = p.market_exposure_dollars != null
        ? Math.abs(parseFloat(p.market_exposure_dollars)) * 100
        : Math.abs(Number(p.market_exposure ?? 0));
      const avgEntryCents = count > 0 && exposureCents > 0 ? Math.round(exposureCents / count) : 50;
      const { coin, timeframe } = _coinAndTimeframeFromTicker(p.ticker);
      s.openTrades.push({
        id:                `kalshi-reconciled-${p.ticker}-${Date.now()}`,
        coin,
        timeframe,
        ticker:            p.ticker,
        subtitle:          p.ticker,
        side:              'yes',
        action:            'buy',
        count,
        entryPriceCents:   avgEntryCents,
        currentPriceCents: avgEntryCents,
        stake:             (avgEntryCents / 100) * count,
        currentValue:      (avgEntryCents / 100) * count,
        unrealizedPnl:     0,
        signal:            { direction: 'BUY', confidence: 0, btcPrice: 0 },
        strategy:          'reconciled',
        openedAt:          new Date().toISOString(),
        status:            'open',
        paper:             false,
      });
    }
    if (untracked > 0) {
      console.warn(`[Kalshi] Boot reconciliation: found ${untracked} real open position(s) for user ${userId} with no local record (server restart wiped it) — re-added as tracked trades so exposure/exit logic sees them.`);
      _recalcUnrealized(s);
    }
  } catch (e: any) {
    console.error(`[Kalshi] Boot position reconciliation failed for user ${userId} (continuing without it):`, e?.message);
  }
}

export async function manualKalshiScan(userId: number): Promise<{ fired: boolean; reason: string }> {
  return _runKalshiScan(userId, true);
}

// ── Shared order placement ──────────────────────────────────────────────────────

/** A limit order accepted by Kalshi (HTTP 200) is not necessarily FILLED —
 * it can rest unmatched if the book moves before it's processed. Previously
 * an accepted order was recorded as an opened trade at the quoted price
 * unconditionally. Give it a brief moment to match, then check whether it's
 * still resting; if so, cancel it and treat this as a non-fill rather than
 * booking a position that was never actually established. */
async function _verifyKalshiFill(userId: number, orderId: string): Promise<boolean> {
  await new Promise(res => setTimeout(res, 1500));
  try {
    const resting = await getKalshiOrders(userId, 'resting');
    const stillResting = resting.some((o: any) => (o.order_id ?? o.id) === orderId);
    if (stillResting) {
      await cancelKalshiOrder(userId, orderId);
      return false;
    }
    return true;
  } catch {
    // Couldn't verify (transient API issue) — don't block on an unverifiable
    // check; assume it filled rather than silently dropping a real trade
    // record for a position that (most likely) did get established.
    return true;
  }
}

async function _placeKalshiYes(
  userId: number,
  s: KalshiEngineState,
  p: { coin: KalshiCryptoCoin; timeframe: 'hourly' | 'fifteen_min'; ticker: string; subtitle: string; priceInCents: number; confidence: number; btcPrice: number; direction: 'BUY' | 'SELL'; label: string; strategy: string },
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
      // The V2 create-order response already reports how many contracts
      // filled immediately — skip the extra polling round-trip when that
      // already confirms a full fill; only poll when it's uncertain.
      const filled = result.status === 'executed' ? true : await _verifyKalshiFill(userId, result.orderId);
      if (!filled) {
        const r = `Order for "${p.subtitle}" didn't fill (price moved) — canceled, no position opened.`;
        s.lastScanResult = r;
        return { fired: false, reason: r };
      }
    } catch (err: any) {
      const r = `Order failed: ${err.message}`;
      s.lastScanResult = r;
      return { fired: false, reason: r };
    }
  }

  const trade: KalshiTradeRecord = {
    id:                `kalshi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    coin:              p.coin,
    timeframe:         p.timeframe,
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
    ? ` · auto-exit +${s.config.takeProfitCents}%/-${s.config.stopLossCents}% of entry`
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
  await refreshKalshiCredValidity(userId);
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
  // Previously only the LAST symbol's block reason was kept — e.g. if BTC was
  // blocked by a broken credential and DOGE just had no signal that cycle,
  // the dashboard only ever showed DOGE's benign reason, silently masking a
  // real problem with every other symbol. Collect every symbol's reason so
  // nothing is hidden.
  const perSymbolReasons: string[] = [];
  for (const coin of symbols) {
    const result = await _scanOneCoin(userId, s, coin);
    if (result.fired) {
      s.lastScanResult = result.reason;
      return result;
    }
    perSymbolReasons.push(result.reason);
  }
  const combined = perSymbolReasons.join(' · ');
  s.lastScanResult = combined;
  return { fired: false, reason: combined };
}

async function _scanOneCoin(userId: number, s: KalshiEngineState, coin: KalshiCryptoCoin): Promise<{ fired: boolean; reason: string }> {
  // Some (coin, timeframe) pairs are real, readable Kalshi markets but NOT
  // broker/API order-placeable (confirmed live — e.g. Gold's 15-min series).
  // Check this BEFORE spending a scan on signal generation so it fails with
  // a clear reason instead of only surfacing when an order attempt itself
  // inexplicably fails.
  if (!isKalshiBrokerTradeable(coin, s.config.timeframe)) {
    return { fired: false, reason: `${coin}: ${s.config.timeframe === 'fifteen_min' ? '15-min' : 'hourly'} market exists but isn't broker/API-tradeable on Kalshi's side — skipping` };
  }

  // ── Auto-trade the top High-Value Pick (all-strategy consensus + edge model) ──
  if (s.config.autoTradeValuePicks) {
    try {
      const vp = await scanKalshiValuePicks(userId, 1, coin, s.config.timeframe);
      const top = vp.picks[0];
      if (!top) {
        return { fired: false, reason: `${coin}: Value picks: no positive-edge bracket right now (${vp.consensus.direction} consensus)` };
      }
      if (top.valueScore < s.config.minValueScore) {
        return { fired: false, reason: `${coin}: Value picks: best score ${top.valueScore} below threshold (${s.config.minValueScore}) — "${top.subtitle}"` };
      }
      return await _placeKalshiYes(userId, s, {
        coin,
        timeframe: s.config.timeframe,
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

    // 2. Get the coin's bracket market event (hourly or fifteen-min, per config)
    const seriesTicker = s.config.timeframe === 'fifteen_min' ? KALSHI_SERIES_MAP[coin].fifteenMin : KALSHI_SERIES_MAP[coin].hourly;
    const event = await getKalshiCryptoEvent(seriesTicker, pred.currentPrice);
    if (!event.brackets.length) {
      return { fired: false, reason: `${coin}: No active ${seriesTicker} brackets available` };
    }

    // Skip if the event closes too soon to meaningfully resolve a trade —
    // scaled to the event's own cycle length: an hourly event needs the same
    // 15-min buffer as before, but that threshold would eat almost the ENTIRE
    // cycle of a 15-min event (which only ever has 0-15 min left to begin
    // with), so it uses a proportionally smaller buffer instead.
    const minCloseBufferMs = s.config.timeframe === 'fifteen_min' ? 3 * 60 * 1000 : 15 * 60 * 1000;
    if (event.msUntilClose < minCloseBufferMs) {
      return { fired: false, reason: `${coin}: Nearest ${seriesTicker} event closes in <${Math.round(minCloseBufferMs / 60000)}min — waiting for next event` };
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
      timeframe: s.config.timeframe,
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
    // Prefer the "greater" (above $X) tail bracket — wins if BTC stays above
    // that level. 'greater_or_equal' is the 15-min single-market product's
    // equivalent (confirmed live: KXBTC15M has exactly one market per event,
    // strike_type 'greater_or_equal') — same "bet price stays up" bet, buy
    // YES the same way.
    const greaterBrackets = brackets.filter(b => b.strikeType === 'greater' || b.strikeType === 'greater_or_equal');
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
    // Prefer "less" tail bracket, or a between bracket below current price.
    // A single-market 'greater_or_equal' 15-min event has no matching "bet
    // price falls" bracket to buy YES on — that would require buying NO on
    // the same market instead, which this engine doesn't do (YES-only, by
    // design, same as every other coin/timeframe here) — so SELL signals
    // simply don't trade 15-min markets rather than fabricate a NO order.
    const lessBrackets = brackets.filter(b => b.strikeType === 'less' || b.strikeType === 'less_or_equal');
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
  strikeType: 'greater' | 'less' | 'between' | 'greater_or_equal' | 'less_or_equal';
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
  // 'greater_or_equal'/'less_or_equal' are the 15-min single-market
  // product's strike types (confirmed live) — same tail-probability math as
  // 'greater'/'less', just a different label from Kalshi's API.
  if ((b.strikeType === 'greater' || b.strikeType === 'greater_or_equal') && b.floorStrike != null) {
    // P(close > floor) = 1 − CDF((floor − expected)/sigma)
    return 1 - normalCdf((b.floorStrike - expected) / sigmaPrice);
  }
  if ((b.strikeType === 'less' || b.strikeType === 'less_or_equal') && b.capStrike != null) {
    // P(close < cap) = CDF((cap − expected)/sigma)
    return normalCdf((b.capStrike - expected) / sigmaPrice);
  }
  if (b.strikeType === 'between' && b.floorStrike != null && b.capStrike != null) {
    return normalCdf((b.capStrike - expected) / sigmaPrice) - normalCdf((b.floorStrike - expected) / sigmaPrice);
  }
  return 0;
}

export async function scanKalshiValuePicks(userId: number, limit = 5, coin: KalshiCryptoCoin = 'BTC', timeframe: 'hourly' | 'fifteen_min' = 'hourly'): Promise<KalshiValueScanResult> {
  const scannedAt = new Date().toISOString();
  const consensus: KalshiConsensus = await getKalshiConsensus(coin);
  const btcPrice = consensus.currentPrice;

  const base: KalshiValueScanResult = {
    consensus: { direction: consensus.direction, confidence: consensus.confidence, agreement: consensus.agreement, reasons: consensus.reasons },
    btcPrice, eventTicker: null, minutesToClose: null, picks: [], scannedAt,
  };
  if (!btcPrice) return base;

  const seriesTicker = timeframe === 'fifteen_min' ? KALSHI_SERIES_MAP[coin].fifteenMin : KALSHI_SERIES_MAP[coin].hourly;
  const event = await getKalshiCryptoEvent(seriesTicker, btcPrice).catch(() => null);
  if (!event || !event.brackets.length) return base;
  base.eventTicker = event.eventTicker;
  base.minutesToClose = Math.round(event.msUntilClose / 60000);

  // Volatility scaled to the remaining time until the event closes. The vol
  // estimate itself (estimateHourlyVol) is still per-hour — sigmaPrice below
  // already scales it to whatever window is actually left (hoursLeft), so a
  // 15-min event correctly gets a much smaller sigma than an hourly one.
  const { candles } = await getCryptoCandles(coin, 100).catch(() => ({ candles: [] as any[] }));
  const hourlyVolFrac = candles.length ? estimateHourlyVol(candles) : 0.004;
  const hoursLeft = Math.max(0.02, event.msUntilClose / 3600000);
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

  // Pull each (coin, timeframe) pair's latest event once (open trades can
  // now span multiple coins AND both hourly/15-min products) and match each
  // open trade by ticker to refresh its current YES price (we value a YES
  // position at the bid — what we can sell at). Trades opened before the
  // 15-min expansion have no `timeframe` field — treat as hourly, matching
  // original behavior.
  const keysInPlay = Array.from(new Set(s.openTrades.map(t => `${t.coin || 'BTC'}:${t.timeframe || 'hourly'}`)));
  const bracketsByKey = new Map<string, KalshiBTCBracket[]>();
  for (const key of keysInPlay) {
    const [coin, timeframe] = key.split(':') as [KalshiCryptoCoin, 'hourly' | 'fifteen_min'];
    try {
      const seriesTicker = timeframe === 'fifteen_min' ? (KALSHI_SERIES_MAP[coin]?.fifteenMin ?? 'KXBTC15M') : (KALSHI_SERIES_MAP[coin]?.hourly ?? 'KXBTC');
      const event = await getKalshiCryptoEvent(seriesTicker, undefined, true);
      bracketsByKey.set(key, event.brackets);
    } catch {
      // Can't refresh this coin/timeframe's prices this cycle — leave its positions untouched.
    }
  }

  for (const t of [...s.openTrades]) {
    const brackets = bracketsByKey.get(`${t.coin || 'BTC'}:${t.timeframe || 'hourly'}`);
    const b = brackets?.find(x => x.ticker === t.ticker);

    if (b) {
      // Sell-side value = yes bid (fallback to probability/last)
      const liveCents = b.yesBid > 0 ? b.yesBid : (b.yesProbability > 0 ? b.yesProbability : t.currentPriceCents);
      await _applyLivePriceAndCheckExits(userId, s, t, liveCents);
      continue;
    }

    // Not in the "nearest" event's bracket list anymore. This used to mean
    // the trade was silently skipped forever (its event rolled off the
    // nearest-event window well before actually settling) — frozen "open"
    // with stale P&L and permanently occupying a maxOpenTrades slot, with no
    // path back since 'settlement' was never wired up anywhere. Fetch this
    // specific ticker's status directly instead of relying on it still being
    // "nearest": either it settled (close it out for real) or it's just
    // further out (keep pricing it from its own market, not the wrong event).
    try {
      const market = await getKalshiMarketStatus(t.ticker);
      if (!market) continue; // transient fetch failure — retry next cycle
      if (market.status === 'finalized' || market.status === 'settled' || market.result) {
        const settledCents = market.result === 'yes' ? 100 : market.result === 'no' ? 0
          : (market.lastPrice || t.currentPriceCents);
        await _settleKalshiTrade(userId, s, t, settledCents);
      } else {
        const liveCents = market.yesBid > 0 ? market.yesBid : (market.lastPrice > 0 ? market.lastPrice : t.currentPriceCents);
        await _applyLivePriceAndCheckExits(userId, s, t, liveCents);
      }
    } catch {
      // Leave untouched this cycle — will retry on the next scan.
    }
  }
  _recalcUnrealized(s);
}

/** Refresh one open trade's live price/unrealized P&L and fire TP/SL if crossed. */
async function _applyLivePriceAndCheckExits(userId: number, s: KalshiEngineState, t: KalshiTradeRecord, liveCents: number): Promise<void> {
  t.currentPriceCents = liveCents;
  t.currentValue      = (liveCents / 100) * t.count;
  t.unrealizedPnl      = t.currentValue - t.stake;

  // takeProfitCents/stopLossCents are PERCENTAGES of entry price now — a
  // flat-cents relative offset (the first fix) still degenerated at the
  // extremes: a cheap entry (e.g. 6¢) with an 8¢-relative stop floors at 1¢,
  // barely any real protection since the position has to fall to near-total
  // loss before stopping. Percentage-of-entry scales correctly across the
  // whole 1-99¢ range regardless of how cheap or expensive the entry was.
  const tpPct = s.config.takeProfitCents;
  const slPct = s.config.stopLossCents;
  const tpLevel = tpPct > 0 ? Math.min(99, Math.round(t.entryPriceCents * (1 + tpPct / 100))) : null;
  const slLevel = slPct > 0 ? Math.max(1, Math.round(t.entryPriceCents * (1 - slPct / 100))) : null;

  if (tpLevel != null && liveCents >= tpLevel) {
    const ok = await closeKalshiTrade(userId, t.id, liveCents, 'take_profit');
    if (ok) s.lastScanResult = `✅ Take-profit: closed "${t.subtitle}" at ${liveCents}¢ (entry ${t.entryPriceCents}¢ + ${tpPct}% target) — P&L $${((liveCents / 100 - t.entryPriceCents / 100) * t.count).toFixed(2)}`;
  } else if (slLevel != null && liveCents <= slLevel) {
    const ok = await closeKalshiTrade(userId, t.id, liveCents, 'stop_loss');
    if (ok) s.lastScanResult = `🛑 Stop-loss: closed "${t.subtitle}" at ${liveCents}¢ (entry ${t.entryPriceCents}¢ - ${slPct}% stop) — P&L $${((liveCents / 100 - t.entryPriceCents / 100) * t.count).toFixed(2)}`;
  }
}

function _recalcUnrealized(s: KalshiEngineState): void {
  s.totalUnrealizedPnl = s.openTrades.reduce((sum, t) => sum + t.unrealizedPnl, 0);
}

/** Shared finalize step: move a trade from open→closed, book P&L, feed the
 * learning loop, and persist to aiTradeResults. Does NOT touch the real
 * Kalshi order book — callers are responsible for actually exiting the
 * position first (or confirming it already settled) before calling this. */
function _finalizeKalshiClose(
  userId: number,
  s: KalshiEngineState,
  idx: number,
  exitCents: number,
  exitReason: 'take_profit' | 'stop_loss' | 'manual' | 'settlement',
): boolean {
  const trade = s.openTrades[idx];
  if (!trade) return false;
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

/** Real settlement detected (market resolved YES/NO) — nothing to sell, the
 * exchange already paid out (or the contract expired worthless). Just book it. */
async function _settleKalshiTrade(userId: number, s: KalshiEngineState, t: KalshiTradeRecord, settledCents: number): Promise<void> {
  const idx = s.openTrades.findIndex(x => x.id === t.id);
  if (idx === -1) return;
  _finalizeKalshiClose(userId, s, idx, settledCents, 'settlement');
}

export async function closeKalshiTrade(
  userId: number,
  tradeId: string,
  exitPriceCents?: number,
  exitReason: 'take_profit' | 'stop_loss' | 'manual' | 'settlement' = 'manual',
): Promise<boolean> {
  const s = getKalshiEngineState(userId);
  const idx = s.openTrades.findIndex(t => t.id === tradeId);
  if (idx === -1) return false;
  const trade = s.openTrades[idx];
  const exitCents = exitPriceCents ?? trade.currentPriceCents;

  if (!trade.paper) {
    // Real position — must actually sell it back on Kalshi. Previously this
    // function only ever updated VEDD's own ledger: TP/SL and manual/
    // close-all all marked the trade "closed" with a fabricated realized P&L
    // while the real YES contracts stayed resting on Kalshi's books,
    // unmanaged, indefinitely.
    try {
      await placeKalshiOrder(userId, trade.ticker, 'yes', 'sell', trade.count, exitCents);
    } catch (err: any) {
      // Don't fabricate a close on a real position we couldn't actually
      // exit — leave it open. If the real cause is that it already settled
      // (event closed between our last price check and now), the next
      // scan's _updateOpenTradePrices → getKalshiMarketStatus path will
      // detect that and settle it correctly instead.
      console.error(`[Kalshi] Sell order failed for ${trade.ticker} (leaving position open, will retry next cycle): ${err.message}`);
      s.lastScanResult = `⚠️ Could not close "${trade.subtitle}": ${err.message}`;
      return false;
    }
  }

  return _finalizeKalshiClose(userId, s, idx, exitCents, exitReason);
}

export async function closeAllKalshiTrades(userId: number): Promise<number> {
  const s = getKalshiEngineState(userId);
  const ids = s.openTrades.map(t => t.id);
  let closed = 0;
  for (const id of ids) {
    if (await closeKalshiTrade(userId, id)) closed++;
  }
  return closed;
}
