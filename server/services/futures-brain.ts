// ── Futures AI Engine — Self-Learning Brain ─────────────────────────────────
// Mirrors options-brain.ts (and, further back, the FX veddAIBrain system),
// adapted from premium-% knowledge to R-multiple/contract-count knowledge —
// the native way futures/day-trading risk is already measured in this app
// (symbolPerformance.totalR in futures-scanner.ts).

import * as fs from 'fs';
import * as path from 'path';
import { storage } from '../storage';
import type { FuturesEngineTrade } from '../../shared/schema';

interface SymbolKnowledge {
  totalTrades: number;
  winRate: number;
  avgWinR: number;
  avgLossR: number;
  riskRewardRatio: number;
  preferredDirection: 'long' | 'short' | 'both';
  longWinRate: number;
  shortWinRate: number;
  topHours: { hour: number; winRate: number; total: number }[];
  worstHours: { hour: number; winRate: number; total: number }[];
  bestStrategies: string[];
  maxWinStreak: number;
  maxLossStreak: number;
  recommendedContractMultiplier: number;
}

function rMultiple(t: FuturesEngineTrade): number {
  if (!t.exitPrice || !t.stopLoss) return 0;
  const riskDist = Math.abs(t.entryPrice - t.stopLoss);
  if (riskDist <= 0) return 0;
  const isLong = t.direction === 'long';
  const move = isLong ? t.exitPrice - t.entryPrice : t.entryPrice - t.exitPrice;
  return move / riskDist;
}

function buildSymbolKnowledge(trades: FuturesEngineTrade[]): SymbolKnowledge {
  const closed = trades.filter(t => t.status === 'closed');
  const withR = closed.map(t => ({ t, r: rMultiple(t) }));
  const wins = withR.filter(x => x.r > 0);
  const losses = withR.filter(x => x.r <= 0);
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
  const avgWinR = wins.length > 0 ? wins.reduce((s, x) => s + x.r, 0) / wins.length : 0;
  const avgLossR = losses.length > 0 ? Math.abs(losses.reduce((s, x) => s + x.r, 0) / losses.length) : 0;
  const riskRewardRatio = avgLossR > 0 ? avgWinR / avgLossR : avgWinR > 0 ? 2 : 0;

  const longs = closed.filter(t => t.direction === 'long');
  const shorts = closed.filter(t => t.direction === 'short');
  const longWins = longs.filter(t => (t.realizedPnl ?? 0) > 0).length;
  const shortWins = shorts.filter(t => (t.realizedPnl ?? 0) > 0).length;
  const longWinRate = longs.length > 0 ? Math.round((longWins / longs.length) * 100) : 50;
  const shortWinRate = shorts.length > 0 ? Math.round((shortWins / shorts.length) * 100) : 50;
  const preferredDirection: 'long' | 'short' | 'both' =
    Math.abs(longWinRate - shortWinRate) > 15 ? (longWinRate > shortWinRate ? 'long' : 'short') : 'both';

  const byHour: Record<number, { wins: number; total: number }> = {};
  for (const t of closed) {
    const hour = new Date(t.createdAt).getUTCHours();
    byHour[hour] = byHour[hour] || { wins: 0, total: 0 };
    byHour[hour].total++;
    if ((t.realizedPnl ?? 0) > 0) byHour[hour].wins++;
  }
  const hourStats = Object.entries(byHour)
    .filter(([, v]) => v.total >= 2)
    .map(([hour, v]) => ({ hour: Number(hour), winRate: Math.round((v.wins / v.total) * 100), total: v.total }));
  const topHours = [...hourStats].sort((a, b) => b.winRate - a.winRate).slice(0, 3);
  const worstHours = [...hourStats].sort((a, b) => a.winRate - b.winRate).slice(0, 2);

  const byStrategy: Record<string, { wins: number; total: number }> = {};
  for (const t of closed) {
    byStrategy[t.strategy] = byStrategy[t.strategy] || { wins: 0, total: 0 };
    byStrategy[t.strategy].total++;
    if ((t.realizedPnl ?? 0) > 0) byStrategy[t.strategy].wins++;
  }
  const bestStrategies = Object.entries(byStrategy)
    .filter(([, v]) => v.total >= 2)
    .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))
    .slice(0, 2)
    .map(([s]) => s);

  const chrono = [...closed].sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());
  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  for (const t of chrono) {
    if ((t.realizedPnl ?? 0) > 0) { curWin++; curLoss = 0; } else { curLoss++; curWin = 0; }
    maxWinStreak = Math.max(maxWinStreak, curWin);
    maxLossStreak = Math.max(maxLossStreak, curLoss);
  }

  const kellyFraction = riskRewardRatio > 0 ? (winRate / 100) - ((1 - winRate / 100) / riskRewardRatio) : 0;
  const recommendedContractMultiplier = Math.max(0.25, Math.min(1.5, 1 + kellyFraction));

  return {
    totalTrades: closed.length, winRate, avgWinR, avgLossR, riskRewardRatio,
    preferredDirection, longWinRate, shortWinRate, topHours, worstHours,
    bestStrategies, maxWinStreak, maxLossStreak, recommendedContractMultiplier,
  };
}

function buildLearningInsights(overallWinRate: number, totalTrades: number, symbolKnowledge: Record<string, SymbolKnowledge>): string[] {
  const insights: string[] = [];
  if (overallWinRate >= 60 && totalTrades >= 10) {
    insights.push(`Strong edge detected: ${overallWinRate}% overall win rate across ${totalTrades} trades`);
  } else if (overallWinRate < 50 && totalTrades >= 10) {
    insights.push(`Win rate below 50% — the engine will prioritize higher-confidence setups only until this improves`);
  }
  for (const [symbol, k] of Object.entries(symbolKnowledge)) {
    if (k.totalTrades < 3) continue;
    if (k.preferredDirection !== 'both') {
      insights.push(`${symbol}: strong ${k.preferredDirection.toUpperCase()} bias detected (${k.preferredDirection === 'long' ? k.longWinRate : k.shortWinRate}% WR)`);
    }
    if (k.worstHours[0] && k.worstHours[0].winRate < 30 && k.worstHours[0].total >= 3) {
      insights.push(`${symbol}: avoid entries around ${k.worstHours[0].hour}:00 UTC (${k.worstHours[0].winRate}% WR — loss zone)`);
    }
    if (k.bestStrategies.length > 0 && k.totalTrades >= 5) {
      insights.push(`${symbol}: best-performing strategy is "${k.bestStrategies[0]}"`);
    }
  }
  return insights.slice(0, 10);
}

async function computeFuturesBrain(userId: number): Promise<any> {
  const allTrades = await storage.getUserFuturesEngineTrades(userId, 1000);
  const closed = allTrades.filter(t => t.status === 'closed');
  const uniqueSymbols = Array.from(new Set(closed.map(t => t.symbol)));

  const symbolKnowledge: Record<string, SymbolKnowledge> = {};
  for (const symbol of uniqueSymbols) {
    symbolKnowledge[symbol] = buildSymbolKnowledge(closed.filter(t => t.symbol === symbol));
  }

  const wins = closed.filter(t => (t.realizedPnl ?? 0) > 0).length;
  const overallWinRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;
  const totalProfit = closed.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);

  const brain = {
    lastLearned: new Date().toISOString(),
    totalTradesAnalyzed: closed.length,
    overallWinRate,
    totalProfit,
    symbolsLearned: uniqueSymbols.length,
    symbolKnowledge,
    learningInsights: buildLearningInsights(overallWinRate, closed.length, symbolKnowledge),
    lastUpdateAt: new Date().toISOString(),
  };

  (global as any).veddFuturesBrain = (global as any).veddFuturesBrain || {};
  (global as any).veddFuturesBrain[userId] = brain;

  try {
    const brainDir = path.join(process.cwd(), 'data', 'brains');
    if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });
    fs.writeFileSync(path.join(brainDir, `futures_brain_${userId}.json`), JSON.stringify(brain));
  } catch { /* non-critical */ }

  console.log(`[futures-brain] Learned from ${closed.length} trades across ${uniqueSymbols.length} symbols for user ${userId}`);
  return brain;
}

export async function runFuturesBrainLearning(userId: number): Promise<any> {
  return computeFuturesBrain(userId);
}

export function loadPersistedFuturesBrain(userId: number): any | null {
  try {
    const p = path.join(process.cwd(), 'data', 'brains', `futures_brain_${userId}.json`);
    if (!fs.existsSync(p)) return null;
    const brain = JSON.parse(fs.readFileSync(p, 'utf-8'));
    (global as any).veddFuturesBrain = (global as any).veddFuturesBrain || {};
    (global as any).veddFuturesBrain[userId] = brain;
    return brain;
  } catch { return null; }
}

const STALE_MS = 60000;
export async function getOrRefreshFuturesBrain(userId: number): Promise<any> {
  (global as any).veddFuturesBrain = (global as any).veddFuturesBrain || {};
  let brain = (global as any).veddFuturesBrain[userId];
  if (!brain) brain = loadPersistedFuturesBrain(userId);
  const isStale = !brain || (Date.now() - new Date(brain.lastUpdateAt).getTime()) > STALE_MS;
  if (isStale) brain = await runFuturesBrainLearning(userId);
  return brain;
}
