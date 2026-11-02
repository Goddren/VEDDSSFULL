/**
 * Strategy brain — the per-strategy knowledge profile Chris asked for:
 * "create a BRAIN through custom strategies, based on all the data points
 * gathered from the custom strategy."
 *
 * The profile fuses three evidence layers, kept visibly separate so
 * nobody mistakes simulated results for live ones:
 *   1. backtest  — the deterministic replay's stats + data points
 *      (exit-reason mix, long/short win rates, average hold) from the
 *      strategy's last saved backtest.
 *   2. live      — the deployment runner's own trade log: realized
 *      trades, win rate, net P&L, per-symbol and per-exit-reason splits.
 *   3. deployments — where the strategy is currently running.
 *
 * Only LIVE trades count toward Brain Marketplace eligibility
 * (MIN_TRADES_TO_LIST) — backtests inform the profile, they are never
 * sold as experience.
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
  deployments: Array<{ id: number; platform: string; accountLabel: string | null; status: string }>;
  /** Live trades available — the Marketplace needs >= MIN_TRADES_TO_LIST. */
  listableTrades: number;
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
  // Only P&L-bearing closes count as evidence — a position the broker
  // closed at its stop whose realized figure couldn't be read back is
  // recorded with pnl NULL and excluded from stats and listing alike.
  const closed = trades.filter((t) => t.status === 'closed' && t.pnl != null);
  const bySymbol: StrategyBrainProfile['live']['bySymbol'] = {};
  const exitReasons: Record<string, number> = {};
  let wins = 0, netPnl = 0;
  for (const t of closed) {
    const pnl = Number(t.pnl) || 0;
    netPnl += pnl;
    if (pnl > 0) wins++;
    const sym = String(t.symbol || '').toUpperCase();
    bySymbol[sym] = bySymbol[sym] || { trades: 0, wins: 0, netPnl: 0 };
    bySymbol[sym].trades++;
    if (pnl > 0) bySymbol[sym].wins++;
    bySymbol[sym].netPnl += pnl;
    const reason = String(t.exit_reason || 'unknown');
    exitReasons[reason] = (exitReasons[reason] || 0) + 1;
  }
  const times = closed.map((t) => new Date(t.closed_at).getTime()).filter((n) => isFinite(n));

  const deployments = await listDeployments(userId, strategyId);

  const profile: StrategyBrainProfile = {
    strategyId,
    name: strat.name,
    symbol: strat.spec.symbol,
    timeframe: strat.spec.timeframe,
    builtAt: new Date().toISOString(),
    backtest,
    live: {
      trades: closed.length,
      wins,
      losses: closed.length - wins,
      winRate: closed.length ? wins / closed.length : null,
      netPnl: Math.round(netPnl * 100) / 100,
      openTrades: trades.filter((t) => t.status === 'open').length,
      bySymbol,
      exitReasons,
      firstTradeAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
      lastTradeAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    },
    deployments: deployments.map((d) => ({ id: d.id, platform: d.platform, accountLabel: d.accountLabel, status: d.status })),
    listableTrades: closed.length,
  };

  await recordWizardBrain(userId, strategyId, { profile });
  return profile;
}
