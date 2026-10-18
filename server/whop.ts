// ─────────────────────────────────────────────────────────────────────────────
// Whop payments (alongside Stripe / LemonSqueezy / Beacons / VEDD / credits).
//
// Flow: the pricing page asks /api/whop/checkout for a tier → we create a Whop
// checkout configuration for that tier's Whop plan with the VEDD user id in
// `metadata` → the user pays on Whop → Whop sends signed webhooks (Standard
// Webhooks: HMAC-SHA256 over "{webhook-id}.{webhook-timestamp}.{raw body}") →
// we activate / update / cancel the user's subscription.
//
// Env (Render, web service):
//   WHOP_API_KEY            — Whop API key (server only)
//   WHOP_WEBHOOK_SECRET     — the webhook's ws_… secret
//   WHOP_PLAN_STARTER / WHOP_PLAN_PREMIUM / WHOP_PLAN_YEARLY — Whop plan ids
//     for VEDD plans 2 / 3 / 4 (WHOP_PLAN_<vedd plan id> also accepted)
//   WHOP_API_BASE           — optional (default https://api.whop.com/api/v1;
//                             https://sandbox-api.whop.com/api/v1 for testing)
// Nothing is active until WHOP_API_KEY and at least one plan id are set.
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { pool } from './db';

const API_BASE = () => (process.env.WHOP_API_BASE || 'https://api.whop.com/api/v1').replace(/\/$/, '');
const SITE = () => (process.env.PUBLIC_SITE_URL || 'https://veddbuild.com').replace(/\/$/, '');
const NAMED: Record<number, string> = { 2: 'STARTER', 3: 'PREMIUM', 4: 'YEARLY' };

/** VEDD plan id → Whop plan id, from env. */
export function whopPlanMap(): Record<number, string> {
  const out: Record<number, string> = {};
  for (const id of [2, 3, 4]) {
    const v = process.env[`WHOP_PLAN_${NAMED[id]}`] || process.env[`WHOP_PLAN_${id}`];
    if (v && /^plan_/.test(v.trim())) out[id] = v.trim();
  }
  return out;
}
export function whopEnabled(): boolean {
  return !!process.env.WHOP_API_KEY && Object.keys(whopPlanMap()).length > 0;
}

let ensured: Promise<void> | null = null;
export function ensureWhopSchema(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS whop_membership_id text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS whop_user_id text;
      CREATE TABLE IF NOT EXISTS whop_webhook_events (
        id text PRIMARY KEY,
        type text NOT NULL,
        vedd_user_id integer,
        received_at timestamp NOT NULL DEFAULT now()
      );
    `).then(() => undefined).catch((e: any) => { console.error('[whop] schema ensure failed:', e?.message || e); ensured = null; });
  }
  return ensured;
}

/** Create a Whop checkout for a VEDD tier. Returns the URL to send the user to. */
export async function createWhopCheckout(userId: number, veddPlanId: number): Promise<{ url: string; id: string }> {
  const key = process.env.WHOP_API_KEY;
  const planId = whopPlanMap()[veddPlanId];
  if (!key) throw new Error('Whop is not configured (WHOP_API_KEY missing)');
  if (!planId) throw new Error(`No Whop plan configured for this tier (set WHOP_PLAN_${NAMED[veddPlanId] || veddPlanId})`);
  const res = await fetch(`${API_BASE()}/checkout_configurations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'payment',
      plan_id: planId,
      metadata: { vedd_user_id: String(userId), vedd_plan_id: String(veddPlanId) },
      redirect_url: `${SITE()}/subscription?whop=success`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Whop checkout failed (${res.status}): ${text.slice(0, 300)}`);
  const j: any = JSON.parse(text);
  const pu = String(j?.purchase_url || '');
  if (!pu) throw new Error('Whop returned no purchase_url');
  return { id: String(j.id || ''), url: /^https?:\/\//.test(pu) ? pu : `https://whop.com${pu.startsWith('/') ? '' : '/'}${pu}` };
}

/**
 * Standard Webhooks verification. Whop says to use the ws_… secret exactly as
 * given; the Standard Webhooks spec base64-decodes the part after the prefix.
 * Both key derivations are tried — a match on either proves the sender holds
 * the secret. Rejects timestamps more than 5 minutes off.
 */
export function verifyWhopWebhook(rawBody: Buffer, headers: Record<string, any>): boolean {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  const id = String(headers['webhook-id'] || '');
  const ts = String(headers['webhook-timestamp'] || '');
  const sigHeader = String(headers['webhook-signature'] || '');
  if (!secret || !id || !ts || !sigHeader || !rawBody) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false;
  const signed = Buffer.concat([Buffer.from(`${id}.${ts}.`, 'utf8'), rawBody]);
  const keys: Buffer[] = [Buffer.from(secret, 'utf8')];
  const m = secret.match(/^(?:ws|whsec)_(.+)$/);
  if (m) {
    keys.push(Buffer.from(m[1], 'utf8'));
    try { const b = Buffer.from(m[1], 'base64'); if (b.length) keys.push(b); } catch { /* not base64 */ }
  }
  const provided = sigHeader.split(' ').map((p) => p.trim()).filter(Boolean).map((p) => (p.includes(',') ? p.split(',')[1] : p));
  for (const k of keys) {
    const expected = crypto.createHmac('sha256', k).update(signed).digest('base64');
    const eb = Buffer.from(expected);
    for (const p of provided) {
      const pb = Buffer.from(p);
      if (pb.length === eb.length && crypto.timingSafeEqual(pb, eb)) return true;
    }
  }
  return false;
}

/** Apply a verified webhook. Idempotent per webhook-id. */
export async function handleWhopEvent(webhookId: string, evt: any): Promise<{ handled: boolean; note: string }> {
  await ensureWhopSchema();
  const type = String(evt?.type || '');
  const data = evt?.data || {};
  const meta = data?.metadata || data?.membership?.metadata || {};
  let userId = Number(meta?.vedd_user_id) || null;
  const veddPlanId = Number(meta?.vedd_plan_id) || null;
  const membershipId: string | null = (type.startsWith('membership') ? data?.id : data?.membership?.id || data?.membership_id) || null;
  const whopUserId: string | null = data?.user?.id || data?.user_id || null;

  // Fallback: find the user by the membership we stored on activation.
  if (!userId && membershipId) {
    const r = await pool.query(`SELECT id FROM users WHERE whop_membership_id=$1 LIMIT 1`, [membershipId]).catch(() => ({ rows: [] as any[] }));
    userId = r.rows[0]?.id ?? null;
  }

  // Idempotency: one row per delivery id.
  const ins = await pool.query(`INSERT INTO whop_webhook_events (id, type, vedd_user_id) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING RETURNING id`, [webhookId, type, userId]);
  if (!ins.rows.length) return { handled: false, note: 'duplicate delivery' };
  if (!userId) return { handled: false, note: `no VEDD user for ${type}` };

  const periodEnd = data?.renewal_period_end || data?.expires_at || data?.current_period_end || null;
  const toDate = (v: any) => (v == null ? null : new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v));
  const status = String(data?.status || '').toLowerCase();

  const activate = async () => {
    await pool.query(
      `UPDATE users SET subscription_status='active',
              subscription_plan_id = COALESCE($2, subscription_plan_id),
              whop_membership_id = COALESCE($3, whop_membership_id),
              whop_user_id = COALESCE($4, whop_user_id),
              subscription_current_period_end = COALESCE($5, subscription_current_period_end)
        WHERE id=$1`,
      [userId, veddPlanId, membershipId, whopUserId, toDate(periodEnd)],
    );
  };
  const setStatus = async (s: string) => pool.query(`UPDATE users SET subscription_status=$2 WHERE id=$1`, [userId, s]);

  switch (type) {
    case 'membership.activated':
    case 'membership.went_valid':
    case 'payment.succeeded':
      await activate();
      return { handled: true, note: `activated plan ${veddPlanId ?? '(unchanged)'} for user ${userId}` };
    case 'membership.deactivated':
    case 'membership.went_invalid':
      await setStatus('canceled');
      return { handled: true, note: `canceled for user ${userId}` };
    case 'payment.failed':
      await setStatus('past_due');
      return { handled: true, note: `past_due for user ${userId}` };
    case 'membership.updated':
      if (['active', 'trialing', 'completed'].includes(status)) { await activate(); return { handled: true, note: `active (${status})` }; }
      if (['canceled', 'cancelled', 'expired', 'drafted'].includes(status)) { await setStatus('canceled'); return { handled: true, note: `canceled (${status})` }; }
      if (status === 'past_due' || status === 'unresolved') { await setStatus('past_due'); return { handled: true, note: `past_due (${status})` }; }
      return { handled: false, note: `membership.updated status '${status}' ignored` };
    default:
      return { handled: false, note: `unhandled ${type}` };
  }
}
