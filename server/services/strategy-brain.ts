/**
 * Strategy brain — the per-strategy knowledge profile Chris asked for:
 * "create a BRAIN through custom strategies, based on all the data points
 * gathered from the custom strategy."
 *
 * The profile fuses evidence layers, kept visibly separate so nobody
 * mistakes simulated results for live ones:
 *   1. backtest  — the deterministic replay's stats + data points
 *      (exit-reason mix, long/short win rates, average hold) from the
 *      strategy's last saved backtest.
 *   2. shadow    — SHADOW (virtual) deployments: the runner trading the
 *      spec forward on real bars with simulated fills (mode='shadow'
 *      rows). Forward evidence, but still not real money.
 *   3. live      — the deployment runner's own trade log on real
 *      accounts (mode='live' rows): realized trades, win rate, net
 *      P&L, per-symbol and per-exit-reason splits.
 *   4. deployments — where the strategy is currently running.
 *
 * Marketplace eligibility has two honest paths, kept separate:
 *   • LIVE — MIN_TRADES_TO_LIST live trades, as before.
 *   • SHADOW — the shadow record clears its own higher bar
 *     (strategyShadowProofEligible: ≥30 R-bearing shadow trades,
 *     avg ≥ +0.2R, win rate ≥ 40%, no losing week in the last two):
 *     the listing is then labelled "Proven in shadow", never "live".
 *     Kill switch STUDIO_MARKETPLACE_SHADOW=off removes this path.
 * Backtests never count on either path. The partition lives in
 * summarizeStrategyTrades so the separation is unit-checkable
 * (scripts/check-studio-shadow.ts).
 */
import { getWizardStrategy, recordWizardBrain } from './wizard-spec-strategies';
import { listDeployments, listStrategyTrades } from './strategy-deployments';

export interface StrategyBrainProfile {
  strategyId: number;
  name: string;
  symbol: string;
  timeframe: string;
  builtAt: string;
  backtest: {
    trades: number;
    winRate: number | null;
    netPnl: number;
    profitFactor: number | null;
    maxDrawdownPct: number | null;
    dataPoints: any;
  } | null;
  live: {
    trades: number;
    wins: number;
    losses: number;
    winRate: number | null;
    netPnl: number;
    openTrades: number;
    bySymbol: Record<string, { trades: number; wins: number; netPnl: number }>;
    exitReasons: Record<string, number>;
    firstTradeAt: string | null;
    lastTradeAt: string | null;
  };
  /** Shadow (virtual) deployment results — forward paper evidence,
   *  displayed separately from live and never counted in listableTrades. */
  shadow: StrategyTradeLayerSummary;
  deployments: Array<{ id: number; platform: string; accountLabel: string | null; status: string }>;
  /** Live trades available — the live Marketplace path needs >= 10. */
  listableTrades: number;
  /** Which Marketplace proof this strategy has earned, if any. */
  marketplace: StrategyMarketplaceProof;
}

export interface StrategyTradeLayerSummary {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netPnl: number;
  netR: number | null;
  /** How many closes carried an R multiple, and their average R. */
  rTrades: number;
  avgR: number | null;
  /** R by week (Monday-start, UTC) inside the last-two-weeks window —
   *  the "no losing week" evidence for the shadow listing gate. */
  recentWeeklyR: Array<{ weekStart: string; trades: number; r: number }>;
  openTrades: number;
  bySymbol: Record<string, { trades: number; wins: number; netPnl: number }>;
  exitReasons: Record<string, number>;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
}

export interface StrategyMarketplaceProof {
  /** True when either proof path qualifies the strategy for listing. */
  listable: boolean;
  /** The proof a listing would carry. Live wins when both qualify —
   *  it is the stronger claim and must never be understated. */
  proofType: 'live' | 'shadow' | null;
  liveEligible: boolean;
  shadowEligible: boolean;
  shadow: {
    trades: number;
    rTrades: number;
    avgR: number | null;
    winRate: number | null;
    minTrades: number;
    minAvgR: number;
    minWinRate: number;
  };
}

/** Monday 00:00 UTC of the week containing `d`, as an ISO date. */
function weekStartUtc(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - dow);
  return x.toISOString().slice(0, 10);
}

function summarizeLayer(rows: any[], now = new Date()): StrategyTradeLayerSummary {
  // Only P&L-bearing closes count as evidence — a position the broker
  // closed at its stop whose realized figure couldn't be read back is
  // recorded with pnl NULL and excluded from stats and listing alike.
  const closed = rows.filter((t) => t.status === 'closed' && t.pnl != null);
  const bySymbol: StrategyTradeLayerSummary['bySymbol'] = {};
  const exitReasons: Record<string, number> = {};
  // "Last two weeks" = the current calendar week + the one before it,
  // the same window the FX models' sliceLiveReady grades.
  const recentFrom = (() => { const d = new Date(`${weekStartUtc(now)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 7); return d.getTime(); })();
  const weekly = new Map<string, { trades: number; r: number }>();
  let wins = 0, netPnl = 0, netR = 0, rCount = 0;
  for (const t of closed) {
    const pnl = Number(t.pnl) || 0;
    netPnl += pnl;
    if (pnl > 0) wins++;
    if (t.r_multiple != null && isFinite(Number(t.r_multiple))) {
      const r = Number(t.r_multiple);
      netR += r; rCount++;
      const closedAt = new Date(t.closed_at).getTime();
      if (isFinite(closedAt) && closedAt >= recentFrom) {
        const wk = weekStartUtc(new Date(closedAt));
        const w = weekly.get(wk) || { trades: 0, r: 0 };
        w.trades++; w.r += r;
        weekly.set(wk, w);
      }
    }
    const sym = String(t.symbol || '').toUpperCase();
    bySymbol[sym] = bySymbol[sym] || { trades: 0, wins: 0, netPnl: 0 };
    bySymbol[sym].trades++;
    if (pnl > 0) bySymbol[sym].wins++;
    bySymbol[sym].netPnl += pnl;
    const reason = String(t.exit_reason || 'unknown');
    exitReasons[reason] = (exitReasons[reason] || 0) + 1;
  }
  const times = closed.map((t) => new Date(t.closed_at).getTime()).filter((n) => isFinite(n));
  return {
    trades: closed.length,
    wins,
    losses: closed.length - wins,
    winRate: closed.length ? wins / closed.length : null,
    netPnl: Math.round(netPnl * 100) / 100,
    netR: rCount ? Math.round(netR * 1000) / 1000 : null,
    rTrades: rCount,
    avgR: rCount ? Math.round((netR / rCount) * 1000) / 1000 : null,
    recentWeeklyR: Array.from(weekly.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, w]) => ({ weekStart, trades: w.trades, r: Math.round(w.r * 1000) / 1000 })),
    openTrades: rows.filter((t) => t.status === 'open').length,
    bySymbol,
    exitReasons,
    firstTradeAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    lastTradeAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
  };
}

/**
 * Partition a strategy's trade log into its evidence layers and
 * summarize each. Rows without a mode (pre-shadow schema) are LIVE —
 * the column defaults to 'live', so legacy rows can never leak into
 * the shadow layer, and shadow rows can never inflate the live layer
 * or listableTrades (the Marketplace counter). Pure and exported so
 * the separation is checkable without a database
 * (scripts/check-studio-shadow.ts).
 */
export function summarizeStrategyTrades(trades: any[], now = new Date()): {
  live: StrategyTradeLayerSummary;
  shadow: StrategyTradeLayerSummary;
  listableTrades: number;
} {
  const live = summarizeLayer(trades.filter((t) => (t.mode ?? 'live') !== 'shadow'), now);
  const shadow = summarizeLayer(trades.filter((t) => t.mode === 'shadow'), now);
  return { live, shadow, listableTrades: live.trades };
}

// ── Marketplace proof gates ─────────────────────────────────────────────
export const STRATEGY_MARKETPLACE_MIN_LIVE_TRADES = 10;
export const STRATEGY_SHADOW_MIN_TRADES = 30;
export const STRATEGY_SHADOW_MIN_AVG_R = 0.2;
export const STRATEGY_SHADOW_MIN_WIN_RATE = 0.4;

/** Kill switch STUDIO_MARKETPLACE_SHADOW=off → shadow proof never lists. */
export const studioMarketplaceShadowOn = (): boolean => process.env.STUDIO_MARKETPLACE_SHADOW !== 'off';

/**
 * The shadow listing bar, graded on the shadow layer's real fields:
 * at least 30 shadow closes AND at least 30 of them carrying an R
 * multiple (an average R over a thinner R record would overstate the
 * proof), average R at least +0.2, win rate at least 40%, and no
 * losing week in the last two calendar weeks. Pure — the check script
 * walks every threshold from just below to just above.
 */
export function strategyShadowProofEligible(shadow: Partial<StrategyTradeLayerSummary> | null | undefined, opts: { shadowOn?: boolean } = {}): boolean {
  if (opts.shadowOn === false || (opts.shadowOn === undefined && !studioMarketplaceShadowOn())) return false;
  if (!shadow) return false;
  if ((Number(shadow.trades) || 0) < STRATEGY_SHADOW_MIN_TRADES) return false;
  if ((Number(shadow.rTrades) || 0) < STRATEGY_SHADOW_MIN_TRADES) return false;
  if (shadow.avgR == null || Number(shadow.avgR) < STRATEGY_SHADOW_MIN_AVG_R) return false;
  if (shadow.winRate == null || Number(shadow.winRate) < STRATEGY_SHADOW_MIN_WIN_RATE) return false;
  return (shadow.recentWeeklyR || []).every((w) => Number(w.r) >= 0);
}

/** Both listing paths for a strategy, from its separated layers. */
export function strategyMarketplaceProof(
  live: Partial<StrategyTradeLayerSummary> | null | undefined,
  shadow: Partial<StrategyTradeLayerSummary> | null | undefined,
  opts: { shadowOn?: boolean } = {},
): StrategyMarketplaceProof {
  const liveEligible = (Number(live?.trades) || 0) >= STRATEGY_MARKETPLACE_MIN_LIVE_TRADES;
  const shadowEligible = strategyShadowProofEligible(shadow, opts);
  return {
    listable: liveEligible || shadowEligible,
    proofType: liveEligible ? 'live' : shadowEligible ? 'shadow' : null,
    liveEligible,
    shadowEligible,
    shadow: {
      trades: Number(shadow?.trades) || 0,
      rTrades: Number(shadow?.rTrades) || 0,
      avgR: shadow?.avgR ?? null,
      winRate: shadow?.winRate ?? null,
      minTrades: STRATEGY_SHADOW_MIN_TRADES,
      minAvgR: STRATEGY_SHADOW_MIN_AVG_R,
      minWinRate: STRATEGY_SHADOW_MIN_WIN_RATE,
    },
  };
}

export async function buildStrategyBrain(userId: number, strategyId: number): Promise<StrategyBrainProfile | null> {
  const strat = await getWizardStrategy(userId, strategyId);
  if (!strat) return null;

  const bt: any = (strat as any).lastBacktest;
  const backtest = bt?.stats ? {
    trades: bt.stats.totalTrades ?? 0,
    winRate: bt.stats.winRate ?? null,
    netPnl: bt.stats.netPnl ?? 0,
    profitFactor: bt.stats.profitFactor ?? null,
    maxDrawdownPct: bt.stats.maxDrawdownPct ?? null,
    dataPoints: bt.dataPoints ?? null,
  } : null;

  const trades = await listStrategyTrades(userId, strategyId, 2000);
  const { live, shadow, listableTrades } = summarizeStrategyTrades(trades);

  const deployments = await listDeployments(userId, strategyId);

  const profile: StrategyBrainProfile = {
    strategyId,
    name: strat.name,
    symbol: strat.spec.symbol,
    timeframe: strat.spec.timeframe,
    builtAt: new Date().toISOString(),
    backtest,
    live: {
      trades: live.trades,
      wins: live.wins,
      losses: live.losses,
      winRate: live.winRate,
      netPnl: live.netPnl,
      openTrades: live.openTrades,
      bySymbol: live.bySymbol,
      exitReasons: live.exitReasons,
      firstTradeAt: live.firstTradeAt,
      lastTradeAt: live.lastTradeAt,
    },
    shadow,
    deployments: deployments.map((d) => ({ id: d.id, platform: d.platform, accountLabel: d.accountLabel, status: d.status })),
    listableTrades,
    marketplace: strategyMarketplaceProof(live, shadow),
  };

  await recordWizardBrain(userId, strategyId, { profile });
  return profile;
}
