// All-Time Performance — combines every trading engine's closed-trade history
// (MT5 + TradeLocker share ai_trade_results; Options, Crypto.com, and Futures
// each have their own table) into one durable, queryable answer for "what's
// my biggest day / all-time total, across every connected account?" Built
// because that question previously required hand-written SQL across 5+
// tables every single time it was asked — there was no feature in the app
// that already combined them.

import { pool } from '../db';

export interface EnginePnlPoint {
  engine: 'mt5' | 'tradelocker' | 'options' | 'cryptocom' | 'futures';
  pnl: number;
  trades: number;
}

export interface DailyPerformance {
  date: string; // 'YYYY-MM-DD'
  total: number;
  byEngine: EnginePnlPoint[];
}

export interface AllTimePerformance {
  allTimeTotal: number;
  totalTrades: number;
  biggestDay: DailyPerformance | null;
  dailyHistory: DailyPerformance[]; // ascending by date
  byEngineAllTime: EnginePnlPoint[];
}

export async function getAllTimePerformance(userId: number): Promise<AllTimePerformance> {
  // ai_trade_results holds both MT5 and TradeLocker trades, distinguished by
  // `source` — 'tradelocker'/'tradelocker_auto' are TradeLocker, everything
  // else (mt5_ea, mt5_copier, manual, brain_autoexec) is MT5.
  const atrQuery = pool.query(
    `SELECT
       CASE WHEN source IN ('tradelocker', 'tradelocker_auto') THEN 'tradelocker' ELSE 'mt5' END AS engine,
       date_trunc('day', closed_at)::date AS day,
       sum(profit_loss) AS pnl, count(*) AS trades
     FROM ai_trade_results
     WHERE user_id = $1 AND result IS NOT NULL AND result != 'PENDING' AND closed_at IS NOT NULL
     GROUP BY engine, day`,
    [userId]
  );
  const optQuery = pool.query(
    `SELECT date_trunc('day', closed_at)::date AS day, sum(realized_pnl) AS pnl, count(*) AS trades
     FROM options_engine_trades WHERE user_id = $1 AND status = 'closed' AND closed_at IS NOT NULL
     GROUP BY day`,
    [userId]
  );
  const cryptoQuery = pool.query(
    `SELECT date_trunc('day', closed_at)::date AS day, sum(realized_pnl) AS pnl, count(*) AS trades
     FROM cryptocom_engine_trades WHERE user_id = $1 AND status = 'closed' AND closed_at IS NOT NULL
     GROUP BY day`,
    [userId]
  );
  const futuresQuery = pool.query(
    `SELECT date_trunc('day', closed_at)::date AS day, sum(realized_pnl) AS pnl, count(*) AS trades
     FROM futures_engine_trades WHERE user_id = $1 AND status = 'closed' AND closed_at IS NOT NULL
     GROUP BY day`,
    [userId]
  );

  const [atr, opt, crypto, futures] = await Promise.all([
    atrQuery.catch(() => ({ rows: [] as any[] })),
    optQuery.catch(() => ({ rows: [] as any[] })),
    cryptoQuery.catch(() => ({ rows: [] as any[] })),
    futuresQuery.catch(() => ({ rows: [] as any[] })),
  ]);

  const byDay: Record<string, Record<string, { pnl: number; trades: number }>> = {};
  const addRows = (rows: any[], engineOverride?: string) => {
    for (const r of rows) {
      const day = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
      const engine = engineOverride ?? r.engine;
      byDay[day] = byDay[day] || {};
      byDay[day][engine] = byDay[day][engine] || { pnl: 0, trades: 0 };
      byDay[day][engine].pnl += Number(r.pnl) || 0;
      byDay[day][engine].trades += Number(r.trades) || 0;
    }
  };
  addRows(atr.rows); // engine already split into mt5/tradelocker per-row
  addRows(opt.rows, 'options');
  addRows(crypto.rows, 'cryptocom');
  addRows(futures.rows, 'futures');

  const dailyHistory: DailyPerformance[] = Object.entries(byDay)
    .map(([date, engines]) => {
      const byEngine: EnginePnlPoint[] = Object.entries(engines).map(([engine, v]) => ({
        engine: engine as EnginePnlPoint['engine'], pnl: Math.round(v.pnl * 100) / 100, trades: v.trades,
      }));
      const total = Math.round(byEngine.reduce((s, e) => s + e.pnl, 0) * 100) / 100;
      return { date, total, byEngine };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const biggestDay = dailyHistory.length > 0
    ? dailyHistory.reduce((max, d) => (d.total > max.total ? d : max), dailyHistory[0])
    : null;

  const allTimeTotal = Math.round(dailyHistory.reduce((s, d) => s + d.total, 0) * 100) / 100;
  const totalTrades = dailyHistory.reduce((s, d) => s + d.byEngine.reduce((s2, e) => s2 + e.trades, 0), 0);

  const engineTotals: Record<string, { pnl: number; trades: number }> = {};
  for (const d of dailyHistory) {
    for (const e of d.byEngine) {
      engineTotals[e.engine] = engineTotals[e.engine] || { pnl: 0, trades: 0 };
      engineTotals[e.engine].pnl += e.pnl;
      engineTotals[e.engine].trades += e.trades;
    }
  }
  const byEngineAllTime: EnginePnlPoint[] = Object.entries(engineTotals).map(([engine, v]) => ({
    engine: engine as EnginePnlPoint['engine'], pnl: Math.round(v.pnl * 100) / 100, trades: v.trades,
  }));

  return { allTimeTotal, totalTrades, biggestDay, dailyHistory, byEngineAllTime };
}
