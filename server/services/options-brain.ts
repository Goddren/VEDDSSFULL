// ── Options AI Engine — Self-Learning Brain ─────────────────────────────────
// Mirrors the FX SS AI Engine's veddAIBrain/runBrainLearning system (see
// server/routes.ts "VEDD SS AI SELF-LEARNING BRAIN ENGINE"), adapted from
// per-pair pip-based knowledge to per-underlying premium-%-based knowledge.
// Same architecture: derived/cached (in-memory + disk JSON) from real trade
// rows in optionsEngineTrades, the actual source of truth.

import * as fs from 'fs';
import * as path from 'path';
import { storage } from '../storage';
import type { OptionsEngineTrade } from '../../shared/schema';

interface ContractKnowledge {
  totalTrades: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  riskRewardRatio: number;
  preferredDirection: 'call' | 'put' | 'both';
  callWinRate: number;
  putWinRate: number;
  topHours: { hour: number; winRate: number; total: number }[];
  worstHours: { hour: number; winRate: number; total: number }[];
  bestStrategies: string[];
  strategyWinRates: Record<string, { winRate: number; total: number }>; // every strategy seen, not just the top-2 — lets the scanner check the SPECIFIC fired strategy, not just whether it made the shortlist
  maxWinStreak: number;
  maxLossStreak: number;
  recommendedContractMultiplier: number; // Kelly-clamped 0.25-1.5, same clamp as FX
}

function pctReturn(t: OptionsEngineTrade): number {
  if (!t.exitPrice || !t.entryPrice) return 0;
  return ((t.exitPrice - t.entryPrice) / t.entryPrice) * 100;
}

function buildContractKnowledge(trades: OptionsEngineTrade[]): ContractKnowledge {
  const closed = trades.filter(t => t.status === 'closed');
  const wins = closed.filter(t => (t.realizedPnl ?? 0) > 0);
  const losses = closed.filter(t => (t.realizedPnl ?? 0) <= 0);
  const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
  const avgWinPct = wins.length > 0 ? wins.reduce((s, t) => s + pctReturn(t), 0) / wins.length : 0;
  const avgLossPct = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + pctReturn(t), 0) / losses.length) : 0;
  const riskRewardRatio = avgLossPct > 0 ? avgWinPct / avgLossPct : avgWinPct > 0 ? 2 : 0;

  const calls = closed.filter(t => t.optionType === 'call');
  const puts = closed.filter(t => t.optionType === 'put');
  const callWins = calls.filter(t => (t.realizedPnl ?? 0) > 0).length;
  const putWins = puts.filter(t => (t.realizedPnl ?? 0) > 0).length;
  const callWinRate = calls.length > 0 ? Math.round((callWins / calls.length) * 100) : 50;
  const putWinRate = puts.length > 0 ? Math.round((putWins / puts.length) * 100) : 50;
  const preferredDirection: 'call' | 'put' | 'both' =
    Math.abs(callWinRate - putWinRate) > 15 ? (callWinRate > putWinRate ? 'call' : 'put') : 'both';

  // Hour-of-day (NY local hour, derived from createdAt) win-rate buckets — the
  // options-market equivalent of the FX brain's session/hour breakdown.
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

  // Best strategies — top 2 by win rate among strategies with 2+ trades.
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
  const strategyWinRates: Record<string, { winRate: number; total: number }> = {};
  for (const [s, v] of Object.entries(byStrategy)) {
    strategyWinRates[s] = { winRate: Math.round((v.wins / v.total) * 100), total: v.total };
  }

  // Win/loss streaks, in chronological order.
  const chrono = [...closed].sort((a, b) => new Date(a.closedAt ?? a.createdAt).getTime() - new Date(b.closedAt ?? b.createdAt).getTime());
  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  for (const t of chrono) {
    if ((t.realizedPnl ?? 0) > 0) { curWin++; curLoss = 0; } else { curLoss++; curWin = 0; }
    maxWinStreak = Math.max(maxWinStreak, curWin);
    maxLossStreak = Math.max(maxLossStreak, curLoss);
  }

  // Kelly-based size multiplier, same clamp FX uses (0.25-1.5).
  const kellyFraction = riskRewardRatio > 0 ? (winRate / 100) - ((1 - winRate / 100) / riskRewardRatio) : 0;
  const recommendedContractMultiplier = Math.max(0.25, Math.min(1.5, 1 + kellyFraction));

  return {
    totalTrades: closed.length, winRate, avgWinPct, avgLossPct, riskRewardRatio,
    preferredDirection, callWinRate, putWinRate, topHours, worstHours,
    bestStrategies, strategyWinRates, maxWinStreak, maxLossStreak, recommendedContractMultiplier,
  };
}

function buildLearningInsights(overallWinRate: number, totalTrades: number, contractKnowledge: Record<string, ContractKnowledge>): string[] {
  const insights: string[] = [];
  if (overallWinRate >= 60 && totalTrades >= 10) {
    insights.push(`Strong edge detected: ${overallWinRate}% overall win rate across ${totalTrades} trades`);
  } else if (overallWinRate < 50 && totalTrades >= 10) {
    insights.push(`Win rate below 50% — the engine will prioritize higher-confidence setups only until this improves`);
  }
  for (const [symbol, k] of Object.entries(contractKnowledge)) {
    if (k.totalTrades < 3) continue;
    if (k.preferredDirection !== 'both') {
      insights.push(`${symbol}: strong ${k.preferredDirection.toUpperCase()} bias detected (${k.preferredDirection === 'call' ? k.callWinRate : k.putWinRate}% WR)`);
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

async function computeOptionsBrain(userId: number): Promise<any> {
  const allTrades = await storage.getUserOptionsEngineTrades(userId, 1000);
  const closed = allTrades.filter(t => t.status === 'closed');
  const uniqueSymbols = Array.from(new Set(closed.map(t => t.underlyingSymbol)));

  const contractKnowledge: Record<string, ContractKnowledge> = {};
  for (const symbol of uniqueSymbols) {
    contractKnowledge[symbol] = buildContractKnowledge(closed.filter(t => t.underlyingSymbol === symbol));
  }

  const wins = closed.filter(t => (t.realizedPnl ?? 0) > 0).length;
  const overallWinRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;
  const totalProfit = closed.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);

  // Per-symbol calibrated minimum confidence — same staircase FX uses
  // (85/80/75/70/65), picking the lowest gate whose above-threshold trades
  // still clear 70% WR. Requires entryConfidence to have been recorded at
  // trade time (added alongside this fix) — trades from before that column
  // existed have entryConfidence = null and are excluded from the calibration,
  // falling back to the 70 default until enough post-fix trades accumulate.
  const CONFIDENCE_STAIRCASE = [85, 80, 75, 70, 65];
  const optimalMinConfidence: Record<string, number> = {};
  for (const symbol of uniqueSymbols) {
    const symbolClosed = closed.filter(t => t.underlyingSymbol === symbol && t.entryConfidence != null);
    let calibrated = 70;
    for (const floor of CONFIDENCE_STAIRCASE) {
      const above = symbolClosed.filter(t => (t.entryConfidence ?? 0) >= floor);
      if (above.length < 5) continue; // not enough samples at this floor to trust it
      const wr = above.filter(t => (t.realizedPnl ?? 0) > 0).length / above.length;
      if (wr >= 0.70) { calibrated = floor; break; }
    }
    optimalMinConfidence[symbol] = calibrated;
  }

  const brain = {
    lastLearned: new Date().toISOString(),
    totalTradesAnalyzed: closed.length,
    overallWinRate,
    totalProfit,
    symbolsLearned: uniqueSymbols.length,
    contractKnowledge,
    learningInsights: buildLearningInsights(overallWinRate, closed.length, contractKnowledge),
    optimalMinConfidence,
    lastUpdateAt: new Date().toISOString(),
  };

  (global as any).veddOptionsBrain = (global as any).veddOptionsBrain || {};
  (global as any).veddOptionsBrain[userId] = brain;

  try {
    const brainDir = path.join(process.cwd(), 'data', 'brains');
    if (!fs.existsSync(brainDir)) fs.mkdirSync(brainDir, { recursive: true });
    fs.writeFileSync(path.join(brainDir, `options_brain_${userId}.json`), JSON.stringify(brain));
  } catch { /* non-critical */ }

  console.log(`[options-brain] Learned from ${closed.length} trades across ${uniqueSymbols.length} underlyings for user ${userId}`);
  return brain;
}

export async function runOptionsBrainLearning(userId: number): Promise<any> {
  return computeOptionsBrain(userId);
}

export function loadPersistedOptionsBrain(userId: number): any | null {
  try {
    const p = path.join(process.cwd(), 'data', 'brains', `options_brain_${userId}.json`);
    if (!fs.existsSync(p)) return null;
    const brain = JSON.parse(fs.readFileSync(p, 'utf-8'));
    (global as any).veddOptionsBrain = (global as any).veddOptionsBrain || {};
    (global as any).veddOptionsBrain[userId] = brain;
    return brain;
  } catch { return null; }
}

const STALE_MS = 60000;
export async function getOrRefreshOptionsBrain(userId: number): Promise<any> {
  (global as any).veddOptionsBrain = (global as any).veddOptionsBrain || {};
  let brain = (global as any).veddOptionsBrain[userId];
  if (!brain) brain = loadPersistedOptionsBrain(userId);
  const isStale = !brain || (Date.now() - new Date(brain.lastUpdateAt).getTime()) > STALE_MS;
  if (isStale) brain = await runOptionsBrainLearning(userId);
  return brain;
}
