import { db } from "./db";
import { aiUsageLog, subscriptionPlans, users } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";

// Cents per 1M tokens, input/output. Anything not listed (incl. any ":free" model)
// costs $0 — OpenRouter free-tier models and unknown/new models default to free
// rather than blocking usage; update this table as new paid models get wired in.
const MODEL_PRICING_CENTS_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 250, output: 1000 },
  'gpt-4o-mini': { input: 15, output: 60 },
  'claude-sonnet-4-6': { input: 300, output: 1500 },
  'claude-haiku-4-5-20251001': { input: 80, output: 400 },
  'gemini-2.0-flash': { input: 10, output: 40 },
  'gemini-1.5-pro-latest': { input: 125, output: 500 },
  'mistral-large-latest': { input: 200, output: 600 },
  'mistral-small-latest': { input: 20, output: 60 },
  'openai/gpt-oss-120b': { input: 5, output: 8 },   // Groq
  'openai/gpt-oss-20b': { input: 3, output: 5 },     // Groq (no :free suffix)
  'qwen/qwen3.6-27b': { input: 10, output: 10 },     // Groq
  'qwen/qwen3-vl-32b-instruct': { input: 10, output: 10 }, // Groq
};

function estimateCostCents(model: string, promptTokens: number, completionTokens: number): number {
  if (model.endsWith(':free')) return 0;
  const pricing = MODEL_PRICING_CENTS_PER_1M[model];
  if (!pricing) return 0;
  return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
}

export async function recordAiUsage(params: {
  userId: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  usedPlatformKey: boolean;
}): Promise<void> {
  try {
    const costCents = estimateCostCents(params.model, params.promptTokens, params.completionTokens);
    await db.insert(aiUsageLog).values({
      userId: params.userId,
      provider: params.provider,
      model: params.model,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      costCents,
      usedPlatformKey: params.usedPlatformKey,
    });
  } catch (e) {
    console.error('[AI Usage] Failed to record usage:', e);
  }
}

function monthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function getMonthlyPlatformKeyCostCents(userId: number): Promise<number> {
  try {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${aiUsageLog.costCents}), 0)` })
      .from(aiUsageLog)
      .where(and(
        eq(aiUsageLog.userId, userId),
        eq(aiUsageLog.usedPlatformKey, true),
        gte(aiUsageLog.createdAt, monthStart()),
      ));
    return Number(row?.total || 0);
  } catch (e) {
    console.error('[AI Usage] Failed to sum monthly usage:', e);
    return 0;
  }
}

// Effective cap = the higher of the user's paid subscription plan cap and their
// token-gated membership-tier-equivalent plan cap (mirrors the analysisLimit
// resolution already used for subscription/membership display in routes.ts).
export async function getEffectiveAiCostCapCents(userId: number): Promise<number> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return 50; // Free-tier default

    const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
    let cap = plans.find(p => p.name === 'Free')?.aiMonthlyCostCapCents ?? 50;

    if (user.subscriptionPlanId) {
      const plan = plans.find(p => p.id === user.subscriptionPlanId);
      if (plan) cap = Math.max(cap, plan.aiMonthlyCostCapCents);
    }

    const membershipTier = user.membershipTier || 'none';
    const TIER_PLAN_MAP: Record<string, string> = { basic: 'Starter', pro: 'Premium', elite: 'Yearly' };
    const equivalentPlanName = TIER_PLAN_MAP[membershipTier];
    if (equivalentPlanName) {
      const plan = plans.find(p => p.name === equivalentPlanName);
      if (plan) cap = Math.max(cap, plan.aiMonthlyCostCapCents);
    }

    // Profit Split Program: enrolled users get full access (highest plan cost cap)
    // with NO paid subscription — VEDD is paid via the 30% prop-firm profit split.
    try {
      const { isProfitSplitEnrolled } = await import('./services/profit-split');
      if (await isProfitSplitEnrolled(userId)) {
        const topCap = plans.reduce((m, p) => Math.max(m, p.aiMonthlyCostCapCents ?? 0), cap);
        cap = Math.max(cap, topCap);
      }
    } catch { /* non-fatal — never block cost-cap resolution on this */ }

    return cap;
  } catch (e) {
    console.error('[AI Usage] Failed to resolve cost cap:', e);
    return 50;
  }
}

// ── Per-user DAILY call cap on the shared platform key ──────────────────────
// The monthly cost cap above can't bound volume: free/unpriced models cost $0,
// so a single heavy user could make thousands of calls a day and drain the
// shared provider balance / rate limit for everyone (observed: 11k calls in a
// day exhausted OpenRouter mid-session). This caps CALLS, per user, per UTC day.
// Admins are exempt; personal keys are never gated. Counted from ai_usage_log
// so it survives deploys; cached briefly so it isn't a DB hit per AI call.
const DAILY_PLATFORM_CALL_CAP = Math.max(1, Number(process.env.AI_PLATFORM_DAILY_CALLS_PER_USER) || 2000);
const dailyCountCache = new Map<number, { at: number; day: string; count: number }>();

async function getTodayPlatformKeyCalls(userId: number): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const hit = dailyCountCache.get(userId);
  if (hit && hit.day === day && Date.now() - hit.at < 60_000) return hit.count;
  try {
    const dayStart = new Date(`${day}T00:00:00Z`);
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(aiUsageLog)
      .where(and(eq(aiUsageLog.userId, userId), eq(aiUsageLog.usedPlatformKey, true), gte(aiUsageLog.createdAt, dayStart)));
    const count = Number(row?.n || 0);
    dailyCountCache.set(userId, { at: Date.now(), day, count });
    return count;
  } catch (e) {
    console.error('[AI Usage] Failed to count daily calls (not capping this check):', e);
    return 0;
  }
}

async function isAdminUser(userId: number): Promise<boolean> {
  try {
    const [u] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId));
    return !!u?.isAdmin;
  } catch { return false; }
}

// Whether platform-key AI calls should be allowed for this user right now.
// Personal-key usage is never gated by this — only the shared platform key is.
export async function isUnderPlatformKeyCostCap(userId: number): Promise<boolean> {
  const [usedCents, capCents] = await Promise.all([
    getMonthlyPlatformKeyCostCents(userId),
    getEffectiveAiCostCapCents(userId),
  ]);
  if (usedCents >= capCents) return false;
  if (await isAdminUser(userId)) return true;
  const calls = await getTodayPlatformKeyCalls(userId);
  if (calls >= DAILY_PLATFORM_CALL_CAP) {
    console.warn(`[AI Usage] user ${userId} reached the daily platform-key cap (${calls}/${DAILY_PLATFORM_CALL_CAP} calls) — shared key paused for them until 00:00 UTC; personal keys still work`);
    return false;
  }
  return true;
}
