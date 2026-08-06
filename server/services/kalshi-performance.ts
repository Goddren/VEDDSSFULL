/**
 * Kalshi per-strategy performance tracking.
 *
 * Persisted in a JSON sidecar (data/kalshi_performance.json) keyed by
 * userId → strategy, so win-rate history survives engine restarts (the
 * in-memory engine state is wiped on every deploy). Same sidecar pattern as
 * tl_risk_settings.json / kalshi_credentials.json — no DB migration needed.
 *
 * Every time a Kalshi position closes (take-profit, stop-loss, or settlement)
 * the engine records the outcome here, attributed to the strategy that opened
 * it ('momentum' | 'volume_profile' | 'markov' | 'order_flow' | 'consensus').
 */

import * as fs from 'fs';
import * as path from 'path';
import { backupDurableFile } from './cred-store';

const FILE = path.join(process.cwd(), 'data', 'kalshi_performance.json');

export interface KalshiStrategyStat {
  strategy: string;
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  totalPnl: number;       // realized $ across all closed trades
  bestPnl: number;
  worstPnl: number;
  lastResult: 'WIN' | 'LOSS' | 'BREAKEVEN' | null;
  lastClosedAt: string | null;
}

type Store = Record<string, Record<string, KalshiStrategyStat>>; // userId → strategy → stat

function emptyStat(strategy: string): KalshiStrategyStat {
  return {
    strategy, trades: 0, wins: 0, losses: 0, breakeven: 0,
    totalPnl: 0, bestPnl: 0, worstPnl: 0, lastResult: null, lastClosedAt: null,
  };
}

function loadAll(): Store {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch (e: any) {
    console.error('[Kalshi] Performance store is unreadable (corrupted JSON?) — treating as empty (win-rate history for this read will look reset):', e?.message);
  }
  return {};
}

function saveAll(store: Store): void {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const content = JSON.stringify(store, null, 2);
    fs.writeFileSync(FILE, content);
    backupDurableFile('kalshi_performance.json', content); // durable DB mirror (survives deploys) — this file's header comment claimed that guarantee already; it was never actually wired up
  } catch { /* ignore */ }
}

/** Record one closed Kalshi trade outcome against its strategy. */
export function recordKalshiOutcome(
  userId: number,
  strategy: string,
  realizedPnl: number,
): void {
  const store = loadAll();
  const uKey = String(userId);
  store[uKey] = store[uKey] || {};
  const stat = store[uKey][strategy] ?? emptyStat(strategy);

  stat.trades += 1;
  stat.totalPnl = Math.round((stat.totalPnl + realizedPnl) * 100) / 100;
  if (realizedPnl > 0.005)      { stat.wins += 1;      stat.lastResult = 'WIN'; }
  else if (realizedPnl < -0.005) { stat.losses += 1;    stat.lastResult = 'LOSS'; }
  else                           { stat.breakeven += 1; stat.lastResult = 'BREAKEVEN'; }
  stat.bestPnl  = Math.max(stat.bestPnl, Math.round(realizedPnl * 100) / 100);
  stat.worstPnl = Math.min(stat.worstPnl, Math.round(realizedPnl * 100) / 100);
  stat.lastClosedAt = new Date().toISOString();

  store[uKey][strategy] = stat;
  saveAll(store);
}

export interface KalshiPerformanceSummary {
  byStrategy: Array<KalshiStrategyStat & { winRate: number }>;
  totals: { trades: number; wins: number; losses: number; winRate: number; totalPnl: number };
}

/** Returns per-strategy stats (with win rate) plus an overall roll-up for a user. */
export function getKalshiPerformance(userId: number): KalshiPerformanceSummary {
  const map = loadAll()[String(userId)] ?? {};
  const byStrategy = Object.values(map).map(s => {
    const decided = s.wins + s.losses;
    return { ...s, winRate: decided > 0 ? Math.round((s.wins / decided) * 100) : 0 };
  }).sort((a, b) => b.trades - a.trades);

  const totals = byStrategy.reduce(
    (acc, s) => {
      acc.trades += s.trades; acc.wins += s.wins; acc.losses += s.losses;
      acc.totalPnl = Math.round((acc.totalPnl + s.totalPnl) * 100) / 100;
      return acc;
    },
    { trades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0 },
  );
  const decided = totals.wins + totals.losses;
  totals.winRate = decided > 0 ? Math.round((totals.wins / decided) * 100) : 0;

  return { byStrategy, totals };
}
