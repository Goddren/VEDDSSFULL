import crypto from 'crypto';

// ---------------------------------------------------------------------------
// VEDD Conversion Hook
// Fires silently in the background after a signup or paid subscription.
// Writes to vedd_conversions via the vedd-full-project portal server so the
// CRM and ambassador commission tables stay in sync.
//
// Required env vars:
//   VEDD_PORTAL_URL     — base URL of the vedd-full-project service on Render
//                         e.g. https://vedd-web.onrender.com
//   WEBHOOK_SECRET      — shared HMAC-SHA256 secret (same value set in both apps)
// ---------------------------------------------------------------------------

const PORTAL_URL    = process.env.VEDD_PORTAL_URL    || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET    || '';

export interface ConversionPayload {
  signupEmail:  string;
  username?:    string;
  signupPlan:   'free_trial' | 'pro' | 'enterprise';
  revenueCents: number;
  referralCode?: string;
  webhookSource: 'veddbuild_signup' | 'lemonsqueezy';
}

function sign(body: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

export async function fireConversionHook(payload: ConversionPayload): Promise<void> {
  if (!PORTAL_URL || !WEBHOOK_SECRET) {
    console.warn('[VEDDHook] VEDD_PORTAL_URL or WEBHOOK_SECRET not set — skipping conversion hook');
    return;
  }

  const body = JSON.stringify(payload);
  const sig  = sign(body);

  try {
    const res = await fetch(`${PORTAL_URL}/webhook/signup`, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-VEDD-Signature': sig,
      },
      body,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[VEDDHook] Conversion webhook returned ${res.status}: ${text}`);
    } else {
      console.log(`[VEDDHook] Conversion recorded — ${payload.webhookSource} — ${payload.signupEmail}`);
    }
  } catch (err: any) {
    // Non-fatal — never block the main request
    console.warn('[VEDDHook] Conversion webhook failed (non-fatal):', err?.message);
  }
}
