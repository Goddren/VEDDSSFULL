// ─── Abba Strategist ──────────────────────────────────────────────────────────
// An AI trading strategist that SEES everything — closed trades, win/loss patterns,
// pairs, sessions, time-of-day, trade size, strategy, the brain's learnings, the
// weekly goal and news — then (a) diagnoses performance, (b) adapts the next-day &
// weekly plan for better accuracy toward the goal, (c) surfaces high-accuracy setups,
// and (d) chats with the user, explaining everything in plain English.

import type { Request, Response } from 'express';
import { storage } from './storage';

interface AbbaContext {
  goal: { weeklyTarget: number; currentProfit: number; progressPct: number; tradingPairs: string[] };
  performance: {
    overall: { trades: number; wins: number; losses: number; winRate: number; totalPnl: number };
    today: { trades: number; wins: number; losses: number; winRate: number; totalPnl: number };
    bySource: Record<string, { trades: number; winRate: number; totalPnl: number }>;
    byPair: Array<{ pair: string; trades: number; winRate: number; pnl: number }>;
    bySession: Array<{ session: string; trades: number; winRate: number; pnl: number }>;
    avgConfWinners: number;
    avgConfLosers: number;
  };
  recentTrades: Array<{ symbol: string; direction: string; result: string; pnl: number; conf: number; source: string; session: string; when: string }>;
  brain: any;
}

const sessionOf = (d: Date) => { const h = d.getUTCHours(); return h < 7 ? 'Asian' : h < 13 ? 'London' : h < 20 ? 'New York' : 'Late NY'; };

export async function buildAbbaContext(userId: number): Promise<AbbaContext> {
  const all = await storage.getAiTradeResults(userId, 500);
  const closed = all.filter((t: any) => t.result && t.result !== 'PENDING' && t.closedAt);
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);

  const tally = (rows: any[]) => {
    const wins = rows.filter(r => r.result === 'WIN').length;
    const losses = rows.filter(r => r.result === 'LOSS').length;
    const decided = wins + losses;
    return {
      trades: rows.length, wins, losses,
      winRate: decided > 0 ? Math.round((wins / decided) * 100) : 0,
      totalPnl: Math.round(rows.reduce((s, r) => s + (r.profitLoss || 0), 0) * 100) / 100,
    };
  };
  const group = (rows: any[], key: (t: any) => string) => {
    const m: Record<string, any[]> = {};
    for (const t of rows) { const k = key(t) || '—'; (m[k] = m[k] || []).push(t); }
    return Object.entries(m).map(([k, v]) => {
      const tt = tally(v); return { key: k, trades: tt.trades, winRate: tt.winRate, pnl: tt.totalPnl };
    });
  };
  const avgConf = (rows: any[]) => rows.length ? Math.round(rows.reduce((s, t) => s + (t.aiConfidence || 0), 0) / rows.length) : 0;

  const wins = closed.filter((t: any) => t.result === 'WIN');
  const losses = closed.filter((t: any) => t.result === 'LOSS');

  // Weekly goal from the stored strategy (global cache or DB)
  const wk = (global as any).mt5WeeklyStrategies?.[userId];
  let weeklyTarget = wk?.plan?.profitTarget ?? wk?.profitTarget ?? 0;
  let currentProfit = wk?.currentProfit ?? 0;
  try {
    const ws = await (storage as any).getWeeklyStrategy?.(userId);
    if (ws) { weeklyTarget = ws.profitTarget ?? weeklyTarget; currentProfit = ws.currentProfit ?? currentProfit; }
  } catch { /* optional */ }

  const tradingPairs: string[] = (global as any).liveEngineConfigCache?.[userId]?.pairs
    ?? wk?.plan?.pairs ?? [...new Set(closed.map((t: any) => (t.symbol || '').toUpperCase()))].slice(0, 12);

  return {
    goal: {
      weeklyTarget, currentProfit,
      progressPct: weeklyTarget > 0 ? Math.round((currentProfit / weeklyTarget) * 100) : 0,
      tradingPairs,
    },
    performance: {
      overall: tally(closed),
      today: tally(closed.filter((t: any) => new Date(t.closedAt) >= dayStart)),
      bySource: {
        MT5: (() => { const t = tally(closed.filter((x: any) => x.source !== 'tradelocker')); return { trades: t.trades, winRate: t.winRate, totalPnl: t.totalPnl }; })(),
        TradeLocker: (() => { const t = tally(closed.filter((x: any) => x.source === 'tradelocker')); return { trades: t.trades, winRate: t.winRate, totalPnl: t.totalPnl }; })(),
      },
      byPair: group(closed, (t) => (t.symbol || '').toUpperCase()).map(g => ({ pair: g.key, trades: g.trades, winRate: g.winRate, pnl: g.pnl })).sort((a, b) => a.pnl - b.pnl),
      bySession: group(closed, (t) => sessionOf(new Date(t.closedAt))).map(g => ({ session: g.key, trades: g.trades, winRate: g.winRate, pnl: g.pnl })).sort((a, b) => a.pnl - b.pnl),
      avgConfWinners: avgConf(wins),
      avgConfLosers: avgConf(losses),
    },
    recentTrades: closed
      .sort((a: any, b: any) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime())
      .slice(0, 30)
      .map((t: any) => ({
        symbol: (t.symbol || '').toUpperCase(), direction: t.direction, result: t.result,
        pnl: Math.round((t.profitLoss || 0) * 100) / 100, conf: t.aiConfidence || 0,
        source: t.source === 'tradelocker' ? 'TradeLocker' : 'MT5',
        session: sessionOf(new Date(t.closedAt)), when: t.closedAt,
      })),
    brain: (global as any).veddAIBrain?.[userId] ?? null,
  };
}

function contextSummary(ctx: AbbaContext): string {
  const p = ctx.performance;
  return [
    `GOAL: weekly target $${ctx.goal.weeklyTarget}, current $${ctx.goal.currentProfit} (${ctx.goal.progressPct}% there). Pairs: ${ctx.goal.tradingPairs.join(', ')}.`,
    `OVERALL: ${p.overall.trades} trades, ${p.overall.winRate}% WR (${p.overall.wins}W/${p.overall.losses}L), net $${p.overall.totalPnl}.`,
    `TODAY: ${p.today.trades} trades, ${p.today.winRate}% WR, net $${p.today.totalPnl}.`,
    `BY SOURCE: MT5 ${p.bySource.MT5.winRate}% ($${p.bySource.MT5.totalPnl}, ${p.bySource.MT5.trades}t) | TradeLocker ${p.bySource.TradeLocker.winRate}% ($${p.bySource.TradeLocker.totalPnl}, ${p.bySource.TradeLocker.trades}t).`,
    `BY PAIR (worst→best): ${p.byPair.slice(0, 8).map(x => `${x.pair} ${x.winRate}%/$${x.pnl}(${x.trades}t)`).join(', ')}.`,
    `BY SESSION: ${p.bySession.map(x => `${x.session} ${x.winRate}%/$${x.pnl}(${x.trades}t)`).join(', ')}.`,
    `CONFIDENCE: winners avg ${p.avgConfWinners}%, losers avg ${p.avgConfLosers}%.`,
    `RECENT (newest first): ${ctx.recentTrades.slice(0, 18).map(t => `${t.symbol} ${t.direction} ${t.result} $${t.pnl} @${t.conf}% [${t.session}/${t.source}]`).join(' | ')}.`,
    ctx.brain ? `BRAIN: ${ctx.brain.overallWinRate ?? '?'}% WR over ${ctx.brain.totalTradesAnalyzed ?? '?'} trades. Insights: ${(ctx.brain.learningInsights ?? []).slice(0, 4).join(' / ')}.` : 'BRAIN: not learned yet.',
  ].join('\n');
}

async function getClient(userId: number): Promise<{ client: any; model: string } | null> {
  try {
    const { getUniversalAIClientForUser } = await import('./openai');
    const client = await getUniversalAIClientForUser(userId);
    return { client, model: (client as any).defaultModel || 'gpt-4o' };
  } catch { return null; }
}

// ── Strategist: diagnose + adapt next-day/weekly plan + setups ──────────────────
export async function abbaStrategistHandler(req: Request, res: Response) {
  if (!(req as any).isAuthenticated?.()) return res.status(401).json({ error: 'Authentication required' });
  const userId = (req.user as any).id;
  try {
    const ctx = await buildAbbaContext(userId);
    if (ctx.performance.overall.trades === 0) {
      return res.json({ ready: false, message: 'No closed trades to analyze yet. Once trades close (MT5 or TradeLocker), Abba will build your adaptive plan.' });
    }
    const ai = await getClient(userId);
    if (!ai) return res.status(400).json({ error: 'No AI key configured. Add one in AI API Keys to enable Abba.' });

    const system = `You are Abba, the user's elite AI trading strategist and coach. You SEE all their real trade data. Be specific, honest, and numbers-driven — reference their actual pairs, sessions, win rates and P&L. Your job: explain why results are what they are, and adapt the plan to improve accuracy and reach the weekly goal. Respond ONLY with strict JSON.`;
    const prompt = `Here is the trader's live data:\n\n${contextSummary(ctx)}\n\nReturn JSON with EXACTLY these keys:
{
  "diagnosis": "2-4 sentence honest read of what's driving wins and losses (patterns: pairs, sessions, time, confidence, sizing, strategy, source).",
  "nextDayPlan": {
    "favorPairs": ["pairs to prioritise tomorrow based on edge"],
    "avoidPairs": ["pairs bleeding money to pause"],
    "bestSessions": ["sessions with the edge"],
    "recommendedMinConfidence": <number 70-90>,
    "sizingNote": "concrete sizing guidance",
    "strategyFocus": "which strategy/approach to lean on and which to drop"
  },
  "weeklyAdjustments": ["3-5 concrete changes to hit the weekly goal"],
  "setups": [{"pair":"", "bias":"BUY|SELL", "rationale":"high-accuracy setup to watch, with the condition/trigger"}],
  "goalAssessment": "are they on track for the weekly goal? what's needed from here in $ and realistic trade count.",
  "narrative": "a warm, clear 1-paragraph plain-English briefing the trader can read to understand the full picture and the plan."
}`;

    const r = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1400,
      temperature: 0.4,
    });
    let plan: any = {};
    try { plan = JSON.parse(r.choices[0]?.message?.content || '{}'); } catch { plan = {}; }

    res.json({ ready: true, generatedAt: new Date().toISOString(), context: { goal: ctx.goal, performance: ctx.performance }, ...plan });
  } catch (err: any) {
    console.error('[Abba strategist]', err);
    res.status(500).json({ error: err.message });
  }
}

// ── Chat: talk with Abba, full context injected ─────────────────────────────────
export async function abbaChatHandler(req: Request, res: Response) {
  if (!(req as any).isAuthenticated?.()) return res.status(401).json({ error: 'Authentication required' });
  const userId = (req.user as any).id;
  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message required' });
  try {
    const ctx = await buildAbbaContext(userId);
    const ai = await getClient(userId);
    if (!ai) return res.status(400).json({ error: 'No AI key configured. Add one in AI API Keys to chat with Abba.' });

    const system = `You are Abba, the trader's personal AI trading mentor inside the VEDD app. You can SEE their real trading data (below) — always ground answers in it, cite their actual pairs/sessions/win-rates/P&L. Teach clearly (examples + reasons), be encouraging but honest, and tie advice to reaching their weekly goal. Keep answers focused (under ~250 words) unless asked for depth. Include risk reminders where relevant; you are not a licensed financial advisor.\n\n=== TRADER'S LIVE DATA ===\n${contextSummary(ctx)}`;

    const msgs: any[] = [{ role: 'system', content: system }];
    if (Array.isArray(history)) {
      for (const h of history.slice(-8)) {
        if (h?.role && h?.content) msgs.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 2000) });
      }
    }
    msgs.push({ role: 'user', content: message.slice(0, 2000) });

    const r = await ai.client.chat.completions.create({
      model: ai.model, messages: msgs, max_tokens: 700, temperature: 0.6,
    });
    res.json({ reply: r.choices[0]?.message?.content || "I couldn't generate a reply right now — try again." });
  } catch (err: any) {
    console.error('[Abba chat]', err);
    res.status(500).json({ error: err.message });
  }
}
