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
 * Only LIVE trades count toward Brain Marketplace eligibility
 * (MIN_TRADES_TO_LIST) — backtests and shadow results inform the
 * profile, they are never sold as experience. The partition lives in
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
   *  displayed separately and NEVER counted toward listableTrades. */
  shadow: {
    trades: number;
    wins: number;
    losses: number;
    winRate: number | null;
    netPnl: number;
    /** Sum of per-trade R multiples (null when no shadow close carried
     *  an R — e.g. the spec had no stop to measure risk against). */
    netR: number | null;
    openTrades: number;
    exitReasons: Record<string, number>;
    firstTradeAt: string | null;
    lastTradeAt: string | null;
  };
  deployments: Array<{ id: number; platform: string; accountLabel: string | null; status: string }>;
  /** Live trades available — the Marketplace needs >= MIN_TRADES_TO_LIST. */
  listableTrades: number;
}

export interface StrategyTradeLayerSummary {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netPnl: number;
  netR: number | null;
  openTrades: number;
  bySymbol: Record<string, { trades: number; wins: number; netPnl: number }>;
  exitReasons: Record<string, number>;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
}

function summarizeLayer(rows: any[]): StrategyTradeLayerSummary {
  // Only P&L-bearing closes count as evidence — a position the broker
  // closed at its stop whose realized figure couldn't be read back is
  // recorded with pnl NULL and excluded from stats and listing alike.
  const closed = rows.filter((t) => t.status === 'closed' && t.pnl != null);
  const bySymbol: StrategyTradeLayerSummary['bySymbol'] = {};
  const exitReasons: Record<string, number> = {};
  let wins = 0, netPnl = 0, netR = 0, rCount = 0;
  for (const t of closed) {
    const pnl = Number(t.pnl) || 0;
    netPnl += pnl;
    if (pnl > 0) wins++;
    if (t.r_multiple != null && isFinite(Number(t.r_multiple))) { netR += Number(t.r_multiple); rCount++; }
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
export function summarizeStrategyTrades(trades: any[]): {
  live: StrategyTradeLayerSummary;
  shadow: StrategyTradeLayerSummary;
  listableTrades: number;
} {
  const live = summarizeLayer(trades.filter((t) => (t.mode ?? 'live') !== 'shadow'));
  const shadow = summarizeLayer(trades.filter((t) => t.mode === 'shadow'));
  return { live, shadow, listableTrades: live.trades };
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
    shadow: {
      trades: shadow.trades,
      wins: shadow.wins,
      losses: shadow.losses,
      winRate: shadow.winRate,
      netPnl: shadow.netPnl,
      netR: shadow.netR,
      openTrades: shadow.openTrades,
      exitReasons: shadow.exitReasons,
      firstTradeAt: shadow.firstTradeAt,
      lastTradeAt: shadow.lastTradeAt,
    },
    deployments: deployments.map((d) => ({ id: d.id, platform: d.platform, accountLabel: d.accountLabel, status: d.status })),
    listableTrades,
  };

  await recordWizardBrain(userId, strategyId, { profile });
  return profile;
}
