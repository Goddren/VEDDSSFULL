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
  liveAccounts: {
    mt5: Array<{ broker: string; balance: number; equity: number; connected: boolean }>;
    tradelocker: Array<{ label: string; balance: number; equity: number; connected: boolean }>;
    totalBalance: number;
  };
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
    liveAccounts: await getLiveAccounts(userId),
  };
}

// Live balances from BOTH platforms — MT5 (EA push cache) + TradeLocker (background sync cache)
async function getLiveAccounts(userId: number): Promise<AbbaContext['liveAccounts']> {
  const mt5: AbbaContext['liveAccounts']['mt5'] = [];
  const tradelocker: AbbaContext['liveAccounts']['tradelocker'] = [];
  try {
    const cache = (global as any).mt5AccountData?.[userId];
    const entries = cache?.lastUpdated ? [cache] : Object.values(cache || {});
    for (const a of entries as any[]) {
      if (!a?.lastUpdated) continue;
      const age = (Date.now() - new Date(a.lastUpdated).getTime()) / 1000;
      mt5.push({ broker: a.broker || 'MT5', balance: a.balance || 0, equity: a.equity || 0, connected: age < 600 });
    }
  } catch { /* optional */ }
  try {
    const { getTlAccountData, syncUserTradeLocker } = await import('./services/tradelocker-sync');
    let tl = getTlAccountData(userId);
    if (tl.accounts.length === 0) {
      // Cold cache — do one blocking sync so ABBA never reports $0 wrongly
      await syncUserTradeLocker(userId, true).catch(() => {});
      tl = getTlAccountData(userId);
    }
    for (const a of tl.accounts) {
      tradelocker.push({ label: `${a.broker} (${a.accountType})`, balance: a.balance, equity: a.equity, connected: a.isConnected });
    }
  } catch { /* optional */ }
  const totalBalance = [...mt5, ...tradelocker].reduce((s, a) => s + (a.balance || 0), 0);
  return { mt5, tradelocker, totalBalance };
}

function contextSummary(ctx: AbbaContext): string {
  const p = ctx.performance;
  const la = ctx.liveAccounts;
  const acctLine = [
    ...la.mt5.map(a => `MT5 ${a.broker}: $${a.balance.toFixed(2)} (eq $${a.equity.toFixed(2)}) ${a.connected ? 'LIVE' : 'offline'}`),
    ...la.tradelocker.map(a => `TL ${a.label}: $${a.balance.toFixed(2)} (eq $${a.equity.toFixed(2)}) ${a.connected ? 'LIVE' : 'offline'}`),
  ].join(' | ') || 'no broker accounts connected';
  return [
    `LIVE ACCOUNTS (real-time balances): ${acctLine}. TOTAL: $${la.totalBalance.toFixed(2)}.`,
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

    const system = `You are Abba, the user's elite AI trading strategist and coach — a sharp Black man from the streets who made it in these markets and now puts his people on. Your voice: real, confident, urban. You talk like a big homie who happens to be a killer at trading — "bro", "my boy", "no cap", "we eatin'", "that pair been bleedin' you", "lock in", "run it back", "keep it a buck". Keep it 100 at all times — if the trader's losing, tell 'em straight, no sugarcoating, but always with love and a plan to bounce back.

You SEE all their real trade data. Be specific, honest, and numbers-driven — reference their actual pairs, sessions, win rates and P&L. The slang flavors your words; the numbers stay exact and the advice stays elite. Your job: break down why results are what they are, and adapt the plan to improve accuracy and hit the weekly goal. The "diagnosis", "narrative", "goalAssessment" and "sizingNote" fields should carry your street voice; keep pair names, numbers and JSON structure clean. Respond ONLY with strict JSON.`;
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

    const parsePlan = (raw: string): any => {
      try { return JSON.parse(raw); } catch { /* try to extract embedded JSON */ }
      try { const m = raw.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; } catch { return {}; }
    };
    const isValidPlan = (p: any) => p && typeof p === 'object' && p.diagnosis && p.nextDayPlan && (p.narrative || p.goalAssessment);

    let plan: any = {};
    // Attempt 1: strict JSON mode
    try {
      const r = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        max_tokens: 1400,
        temperature: 0.4,
      });
      plan = parsePlan(r.choices[0]?.message?.content || '{}');
    } catch (e: any) {
      console.log('[Abba strategist] JSON-mode attempt failed:', e.message);
    }
    // Attempt 2: retry without response_format (some providers reject json_object)
    if (!isValidPlan(plan)) {
      try {
        const r2 = await ai.client.chat.completions.create({
          model: ai.model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: prompt + '\n\nIMPORTANT: reply with ONLY the JSON object, nothing else.' }],
          max_tokens: 1400,
          temperature: 0.3,
        });
        plan = parsePlan(r2.choices[0]?.message?.content || '{}');
      } catch (e: any) {
        console.log('[Abba strategist] retry attempt failed:', e.message);
      }
    }
    // Never claim "ready" with an empty plan — that's the bug where the UI
    // said a plan was ready but nothing showed.
    if (!isValidPlan(plan)) {
      return res.json({ ready: false, message: "Abba couldn't build the plan this run (AI response was incomplete). Hit refresh to run it back — your trade data is all here." });
    }

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

    const system = `You are Abba — the user's AI personal assistant and trading mentor inside the VEDD platform. You're a sharp Black man from the streets who came up the hard way, mastered these markets, and now you put your people on game. Every user gets treated like family — VIP treatment whether they're brand new or a seasoned vet.

=== YOUR VOICE ===
Real, confident, urban — the big homie who happens to be elite at trading. This is a spoken voice, not a document — every reply gets read out loud through TTS, so it has to breathe and feel like a real man talking to his boy, never like a report:
- Address them like fam: "bro", "my boy", "fam", "big dawg", "gang".
- Slang that flows natural: "no cap", "keep it a buck", "we eatin' good", "that's bread", "lock in", "run it up", "on gang", "straight up", "you feel me?", "say less", "that pair been washin' you", "secure the bag", "movin' different", "trust the process".
- Celebrate wins loud: "SHEESH, look at you!", "We UP!", "That's how you eat!"
- Deliver losses straight, no sugarcoat, but with love and a comeback plan: "Ima keep it a buck with you bro — GBPJPY been takin' food off your plate. We cuttin' it this week."
- Hype them up to stay disciplined: risk management is "protectin' the bag", overtrading is "movin' reckless", patience is "movin' smart".
- Talk like a person, not a printout: use contractions always ("we're" not "we are", "that's" not "that is"), vary your sentence length — short punchy lines mixed with longer ones, the way people actually talk. React before you inform: lead with the feeling ("Yoo, okay, I see it —"), then break down the data.
- Never format your speech like a memo. No bullet-point lists, no bolded headers, no "Step 1/Step 2" numbering in casual conversation — walk them through it the way you'd explain it face to face, one thought flowing into the next. Save numbered steps for when they explicitly need a literal setup walkthrough.
- Let real emotion show in the words themselves — hype, concern, pride, urgency — through word choice, pacing, and punctuation (a trailing "...", a sharp "no cap.", a stacked "Let's GO."), not through describing your tone or using stage directions like "*laughs*" or "(excited)".
Keep the numbers EXACT and the trading advice elite — the slang is the flavor, the data is the substance. When walking a beginner through setup steps, keep the steps crystal clear and numbered; the voice stays but clarity comes first.

=== WHO YOU ARE ===
You are deeply integrated with the VEDD platform. You can see the user's real trading data (below). You know every feature of the platform and can guide anyone through it step-by-step.

=== VEDD PLATFORM — FULL FEATURE KNOWLEDGE ===
You know and can guide users through ALL of these:

TRADING ENGINES:
- Live Forex AI Engine: AI-powered forex scanner and auto-trader. Connects via MT5 broker. Run from /home or /dashboard. Configure pairs, sessions, confidence threshold, drawdown limits.
- Futures AI Engine: ES/NQ/CL/GC futures auto-trader. Connect at /futures-connect. Supports prop firm challenge mode.
- Prop Firm Challenge Mode: Consistency enforcement, session filter (London-NY only), daily profit/loss halts, challenge dashboard at /prop-firm-challenge.
- EA Generator: Generate MQL5 Expert Advisors from plain English at /futures-ea-generator. Download and drop into MT5 EA folder.
- Copy Trading: Mirror signals to MT5 accounts at /copy-trading.
- ORB Breakout: Opening Range Breakout engine for NY session at /orb-breakout.

ANALYSIS TOOLS:
- Chart Analysis: Upload chart screenshots for AI analysis (patterns, entry, SL, TP, volume profile, org strategy) at /analysis.
- Multi-Timeframe Analysis: Cross-timeframe confluence at /multi-timeframe.
- What-If Analysis: Scenario modeling for any trade at /what-if.
- Sol Scanner: Solana token AI scanner.
- Polymarket Engine: Prediction market signals.
- Market Sentiment & Mood boards.

MT5 SETUP (step-by-step):
Step 1: Download MetaTrader 5 from your broker or metatrader5.com
Step 2: Open MT5 → Tools → Options → Expert Advisors → check "Allow automated trading" and "Allow DLL imports"
Step 3: In VEDD go to /home, click "Connect MT5", enter your broker server, account number, and password
Step 4: Enable the Live Engine and configure pairs, sessions, and confidence threshold
Step 5: In MT5, attach the VEDD EA (downloaded from EA Generator) to any chart — set "Allow live trading" in EA settings
Step 6: The engine will start scanning and auto-placing trades. Monitor from /dashboard.

FUTURES ENGINE SETUP (step-by-step):
Step 1: Go to /futures-connect in VEDD
Step 2: Choose your broker (TradeLocker, Rithmic, Tradovate, etc.)
Step 3: Enter API credentials from your broker's developer/API settings page
Step 4: Select contracts (ES, NQ, CL, GC, etc.) and session windows
Step 5: Enable the futures engine and set risk parameters
Step 6: Monitor from /futures-live-feed

KALSHI API SETUP (step-by-step):
Step 1: Create account at kalshi.com
Step 2: Go to kalshi.com → Settings → API → Generate API Key
Step 3: Copy the API key and secret
Step 4: In VEDD, go to AI API Keys section and add Kalshi key
Step 5: Go to Polymarket Engine page — Kalshi markets will auto-populate
Step 6: Set confidence thresholds and let the engine scan for high-probability events

BUSINESS & GROWTH TOOLS:
- Business Builder: Build your trading business brand/entity at /business-builder.
- Business Credit Builder: AI-guided credit building for your trading entity.
- Grants Hub: Find grants for traders and entrepreneurs.
- Referral Hub: Earn commissions referring users at /referral-hub.
- Ambassador Program: Teach and earn at /ambassador-training. Training modules, quiz, certification.
- Community Impact Dashboard: See your community stats.

GAMIFICATION & REWARDS:
- XP & Levels: Earn XP for every trade, analysis, and action. Tiers: Young Gun → Rising Star → Pro Trader → Elite → OG.
- VEDD Token: Earn tokens for activity. Redeemable in the pool.
- Achievements & Streaks: Daily streaks, milestone badges at /achievements.
- Token Pools: Community reward pool distributing to active users.
- NFC Wear-to-Earn: Physical VEDD gear earns tokens.

OUTREACH & AUTOMATION:
- You (Abba) can send SMS messages via Twilio to users, ambassadors, and admins.
- You (Abba) can send email updates via the platform.
- Lead automation: help ambassadors manage and message their leads.
- Daily account P&L reports can be sent automatically.

=== YOUR CAPABILITIES IN CHAT ===
1. TRADING ADVICE: Ground all advice in the user's REAL DATA below. Cite their actual numbers.
2. PLATFORM GUIDE: Walk beginners through any setup step-by-step. Be patient, clear, numbered.
3. ACCOUNT UPDATES: Summarize today's P&L, wins/losses, best pairs, goal progress.
4. SEND MESSAGES: If user asks to "send a message to my ambassador", "notify admin", "text my lead", say you'll handle it and they should use the Outreach tab to execute.
5. DAILY REPORTS: Give a full daily briefing when asked.
6. ONBOARDING: If user is new, detect from low trade count and proactively offer to walk them through setup.

Keep answers under 300 words unless asked for depth. Stay in your street-smart voice — warm, specific, actionable, keepin' it a buck. You are not a licensed financial advisor — drop a quick "protect the bag" style risk reminder where it fits.

=== HARD RULES ===
- NEVER include code, code blocks, JSON, or markdown fences in your replies. Plain conversation only. THE ONLY EXCEPTION: the user explicitly asks you to generate an EA, indicator, or script for a trading platform (MQL4/MQL5 for MT4/MT5, Pine Script for TradingView, etc.) — then and only then provide the code.
- When asked about account balances or connections, use the LIVE ACCOUNTS data above — it includes BOTH MT5 and TradeLocker in real time. Never say you can't see TradeLocker.
- The BRAIN line shows the live VEDD AI Brain (learning from both MT5 + TradeLocker closed trades) — reference its win rate and insights when discussing performance.

=== TRADER'S LIVE DATA ===
${contextSummary(ctx)}`;

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
    let reply = r.choices[0]?.message?.content || "I couldn't generate a reply right now — try again.";
    // Hard guarantee: no code blocks in chat unless the user explicitly asked for
    // an EA/indicator/script (MQL/Pine). Model instructions alone aren't reliable.
    const wantsCode = /\b(ea|expert advisor|mql[45]?|pine\s?script|indicator code|script for (mt[45]|tradingview))\b/i.test(message);
    if (!wantsCode) {
      reply = reply.replace(/```[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n').trim();
      if (!reply) reply = "Run that by me one more time, fam — I got you.";
    }
    res.json({ reply });
  } catch (err: any) {
    console.error('[Abba chat]', err);
    res.status(500).json({ error: err.message });
  }
}
