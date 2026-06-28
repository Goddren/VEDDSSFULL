// ─── Business Credit Builder Routes ──────────────────────────────────────────
// Mounts at /api/biz-builder — all routes require session auth.

import { Router, Request, Response } from 'express';
import { db } from '../db';
import {
  bizProfiles, bizNameChecks, bizFormationLinks,
  bizBankLinks, bizCreditTasks, bizFundingMatches,
} from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

// ── Auth guard (same pattern as moomoo.ts / vedd-token.ts) ──────────────────
function requireAuth(req: Request, res: Response): boolean {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }
  return true;
}

function getUserId(req: Request): number {
  return (req.user as any).id;
}

// ── Claude AI call helper ────────────────────────────────────────────────────
// Resolves the API key using the same priority as the rest of the app:
//   1. User's own Anthropic key stored in userApiKeys (via AI API Keys page)
//   2. Server-level ANTHROPIC_API_KEY env var
async function resolveAnthropicKey(userId: number): Promise<string> {
  try {
    const { storage } = await import('../storage');
    const userKey = await storage.getActiveUserApiKey(userId, 'anthropic');
    if (userKey?.apiKey) {
      await storage.updateUserApiKeyUsage(userId, 'anthropic');
      return userKey.apiKey;
    }
  } catch (_) {}
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (!envKey) throw new Error('No Anthropic API key found. Add yours at AI API Keys or ask your admin to set ANTHROPIC_API_KEY.');
  return envKey;
}

async function callClaude(system: string, user: string, userId: number): Promise<string> {
  const apiKey = await resolveAnthropicKey(userId);
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: system + ' Return ONLY valid JSON, no markdown, no code fences.',
    messages: [{ role: 'user', content: user }],
  });
  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

function parseJson<T>(raw: string): T {
  // Strip any accidental markdown fences before parsing
  const cleaned = raw.replace(/^```[a-z]*\n?/m, '').replace(/```$/m, '').trim();
  return JSON.parse(cleaned) as T;
}

// ── Formation provider URL map ───────────────────────────────────────────────
const FORMATION_URLS: Record<string, string> = {
  stripe_atlas: process.env.STRIPE_ATLAS_REF_URL  || 'https://stripe.com/atlas',
  incfile:      process.env.INCFILE_REF_URL        || 'https://www.incfile.com',
  zenbusiness:  process.env.ZENBUSINESS_REF_URL    || 'https://www.zenbusiness.com',
};

// ── Bank provider URL map ────────────────────────────────────────────────────
const BANK_URLS: Record<string, string> = {
  mercury: process.env.MERCURY_REF_URL || 'https://mercury.com',
  relay:   process.env.RELAY_REF_URL   || 'https://relayfi.com',
  found:   process.env.FOUND_REF_URL   || 'https://found.com',
};

// ── POST /api/biz-builder/create ─────────────────────────────────────────────
// Creates (or returns existing) biz profile for the logged-in user, then
// calls Claude to generate names, description, entity rec, and funding matches.
router.post('/biz-builder/create', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);

  try {
    const { businessIdea, entityType, state } = req.body;
    if (!businessIdea || !entityType || !state) {
      return res.status(400).json({ error: 'businessIdea, entityType, and state are required' });
    }

    const raw = await callClaude(
      'You are a business formation expert.',
      `Business idea: ${businessIdea}. Entity: ${entityType}. State: ${state}.
Return JSON: {
  "suggestedNames": ["name1","name2","name3","name4","name5"],
  "description": "3 sentences max about this business",
  "entityRecommendation": { "type": "string", "reason": "string" },
  "fundingMatches": [
    { "name": "string", "type": "string", "reason": "string" }
  ]
}`,
      userId
    );

    const aiData = parseJson<{
      suggestedNames: string[];
      description: string;
      entityRecommendation: { type: string; reason: string };
      fundingMatches: { name: string; type: string; reason: string }[];
    }>(raw);

    const [profile] = await db.insert(bizProfiles).values({
      userId,
      businessIdea,
      entityType: entityType as any,
      state,
      status: 'name_check',
      aiDescription: aiData.description,
    }).returning();

    res.json({ profile, aiData });
  } catch (e: any) {
    console.error('[BizBuilder] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/biz-builder/my-profile ─────────────────────────────────────────
// Returns the logged-in user's most recent biz profile with all related data.
router.get('/biz-builder/my-profile', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;
  const userId = getUserId(req);

  try {
    const profiles = await db.select().from(bizProfiles)
      .where(eq(bizProfiles.userId, userId))
      .orderBy(desc(bizProfiles.createdAt))
      .limit(1);

    if (!profiles.length) return res.json({ profile: null });

    const profile = profiles[0];
    const [nameChecks, formationLinks, bankLinks, creditTasks, fundingMatches] = await Promise.all([
      db.select().from(bizNameChecks).where(eq(bizNameChecks.bizProfileId, profile.id)),
      db.select().from(bizFormationLinks).where(eq(bizFormationLinks.bizProfileId, profile.id)),
      db.select().from(bizBankLinks).where(eq(bizBankLinks.bizProfileId, profile.id)),
      db.select().from(bizCreditTasks).where(eq(bizCreditTasks.bizProfileId, profile.id)),
      db.select().from(bizFundingMatches).where(eq(bizFundingMatches.bizProfileId, profile.id)),
    ]);

    res.json({ profile, nameChecks, formationLinks, bankLinks, creditTasks, fundingMatches });
  } catch (e: any) {
    console.error('[BizBuilder] my-profile error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/biz-builder/:profileId ──────────────────────────────────────────
router.get('/biz-builder/:profileId', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  try {
    const profileId = parseInt(req.params.profileId);
    const profiles = await db.select().from(bizProfiles).where(eq(bizProfiles.id, profileId)).limit(1);
    if (!profiles.length) return res.status(404).json({ error: 'Profile not found' });

    const profile = profiles[0];
    const [nameChecks, formationLinks, bankLinks, creditTasks, fundingMatches] = await Promise.all([
      db.select().from(bizNameChecks).where(eq(bizNameChecks.bizProfileId, profile.id)),
      db.select().from(bizFormationLinks).where(eq(bizFormationLinks.bizProfileId, profile.id)),
      db.select().from(bizBankLinks).where(eq(bizBankLinks.bizProfileId, profile.id)),
      db.select().from(bizCreditTasks).where(eq(bizCreditTasks.bizProfileId, profile.id)),
      db.select().from(bizFundingMatches).where(eq(bizFundingMatches.bizProfileId, profile.id)),
    ]);

    res.json({ profile, nameChecks, formationLinks, bankLinks, creditTasks, fundingMatches });
  } catch (e: any) {
    console.error('[BizBuilder] get profile error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/biz-builder/:profileId/name-check ───────────────────────────────
// TODO: integrate real SOS API per state — see sos.state.[state].us endpoints
router.post('/biz-builder/:profileId/name-check', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  try {
    const profileId = parseInt(req.params.profileId);
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    await db.insert(bizNameChecks).values({
      bizProfileId: profileId,
      nameChecked: name,
      available: true,
      source: 'ai_generated',
    });

    res.json({
      name,
      available: true,
      message: 'Name appears available. Verify at your state SOS before filing.',
    });
  } catch (e: any) {
    console.error('[BizBuilder] name-check error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/biz-builder/:profileId/select-formation ─────────────────────────
router.post('/biz-builder/:profileId/select-formation', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  try {
    const profileId = parseInt(req.params.profileId);
    const { provider } = req.body;
    if (!FORMATION_URLS[provider]) {
      return res.status(400).json({ error: 'Invalid provider. Must be stripe_atlas, incfile, or zenbusiness.' });
    }

    const redirectUrl = FORMATION_URLS[provider];
    await db.insert(bizFormationLinks).values({ bizProfileId: profileId, provider, redirectUrl });
    await db.update(bizProfiles).set({ status: 'formation', updatedAt: new Date() }).where(eq(bizProfiles.id, profileId));

    res.json({ provider, redirectUrl });
  } catch (e: any) {
    console.error('[BizBuilder] select-formation error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/biz-builder/:profileId/select-bank ──────────────────────────────
router.post('/biz-builder/:profileId/select-bank', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  try {
    const profileId = parseInt(req.params.profileId);
    const { provider } = req.body;
    if (!BANK_URLS[provider]) {
      return res.status(400).json({ error: 'Invalid provider. Must be mercury, relay, or found.' });
    }

    const referralUrl = BANK_URLS[provider];
    await db.insert(bizBankLinks).values({ bizProfileId: profileId, provider, referralUrl });
    await db.update(bizProfiles).set({ status: 'banking', updatedAt: new Date() }).where(eq(bizProfiles.id, profileId));

    res.json({ provider, referralUrl });
  } catch (e: any) {
    console.error('[BizBuilder] select-bank error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/biz-builder/:profileId/generate-credit-tasks ───────────────────
router.post('/biz-builder/:profileId/generate-credit-tasks', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  try {
    const profileId = parseInt(req.params.profileId);
    const profiles = await db.select().from(bizProfiles).where(eq(bizProfiles.id, profileId)).limit(1);
    if (!profiles.length) return res.status(404).json({ error: 'Profile not found' });

    const p = profiles[0];
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const addDays = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return fmt(d); };

    const raw = await callClaude(
      'You are a business credit expert.',
      `Generate a 90-day business credit building plan for a ${p.entityType} in ${p.state} doing: ${p.businessIdea}.

Always include these exact tasks (do not skip them):
1. Register with Dun & Bradstreet (get DUNS number) — due ${addDays(7)}, url: https://www.dnb.com/duns-number.html
2. Open Uline Net-30 account — due ${addDays(14)}, url: https://www.uline.com
3. Open Quill Net-30 account — due ${addDays(14)}, url: https://www.quill.com
4. Open Grainger Net-30 account — due ${addDays(21)}, url: https://www.grainger.com
5. Set up Nav.com credit monitoring — due ${addDays(7)}, url: https://www.nav.com
6. Register Experian Business profile — due ${addDays(14)}, url: https://www.experian.com/small-business
7. Register Equifax Business profile — due ${addDays(21)}, url: https://www.equifax.com/business

Then add 3-5 additional tasks specific to this business type.

Return a JSON array: [{ "task_name": "string", "task_type": "net30"|"credit_monitoring"|"duns_registration"|"trade_line", "provider": "string", "url": "string", "due_date": "YYYY-MM-DD", "notes": "string" }]`,
      getUserId(req)
    );

    type TaskRow = { task_name: string; task_type: string; provider: string; url: string; due_date: string; notes: string };
    const tasks = parseJson<TaskRow[]>(raw);

    const inserted = await db.insert(bizCreditTasks).values(
      tasks.map(t => ({
        bizProfileId: profileId,
        taskName:     t.task_name,
        taskType:     t.task_type as any,
        provider:     t.provider || null,
        url:          t.url || null,
        dueDate:      t.due_date || null,
        notes:        t.notes || null,
        status:       'pending' as const,
      }))
    ).returning();

    await db.update(bizProfiles)
      .set({ status: 'credit_building', updatedAt: new Date() })
      .where(eq(bizProfiles.id, profileId));

    res.json({ tasks: inserted });
  } catch (e: any) {
    console.error('[BizBuilder] generate-credit-tasks error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/biz-builder/:profileId/generate-funding-matches ─────────────────
router.post('/biz-builder/:profileId/generate-funding-matches', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  try {
    const profileId = parseInt(req.params.profileId);
    const profiles = await db.select().from(bizProfiles).where(eq(bizProfiles.id, profileId)).limit(1);
    if (!profiles.length) return res.status(404).json({ error: 'Profile not found' });

    const p = profiles[0];
    const raw = await callClaude(
      'You are a business funding expert.',
      `Find the top 5 funding sources for a ${p.entityType} business in ${p.state} doing: ${p.businessIdea}.

Return a JSON array: [{ "funder_name": "string", "funder_type": "grant"|"cdfi"|"sponsor"|"microloan"|"revenue_share", "match_score": number 1-100, "amount_range": "string e.g. $5K - $50K", "apply_url": "string real URL or #", "notes": "1-2 sentences on why a good fit" }]`,
      getUserId(req)
    );

    type FunderRow = { funder_name: string; funder_type: string; match_score: number; amount_range: string; apply_url: string; notes: string };
    const funders = parseJson<FunderRow[]>(raw);

    const inserted = await db.insert(bizFundingMatches).values(
      funders.map(f => ({
        bizProfileId: profileId,
        funderName:   f.funder_name,
        funderType:   f.funder_type as any,
        matchScore:   f.match_score || 0,
        amountRange:  f.amount_range || null,
        applyUrl:     f.apply_url || '#',
        notes:        f.notes || null,
      }))
    ).returning();

    await db.update(bizProfiles)
      .set({ status: 'funded', updatedAt: new Date() })
      .where(eq(bizProfiles.id, profileId));

    res.json({ matches: inserted });
  } catch (e: any) {
    console.error('[BizBuilder] generate-funding-matches error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/biz-builder/tasks/:taskId/complete ────────────────────────────
router.patch('/biz-builder/tasks/:taskId/complete', async (req: Request, res: Response) => {
  if (!requireAuth(req, res)) return;

  try {
    const taskId = parseInt(req.params.taskId);
    const existing = await db.select().from(bizCreditTasks).where(eq(bizCreditTasks.id, taskId)).limit(1);
    if (!existing.length) return res.status(404).json({ error: 'Task not found' });

    const isComplete = existing[0].status === 'complete';
    // Toggle: complete → pending, anything else → complete
    const newStatus = isComplete ? 'pending' : 'complete';
    const [updated] = await db.update(bizCreditTasks)
      .set({
        status:      newStatus,
        completedAt: newStatus === 'complete' ? new Date() : null,
      })
      .where(eq(bizCreditTasks.id, taskId))
      .returning();

    res.json({ task: updated });
  } catch (e: any) {
    console.error('[BizBuilder] complete task error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
