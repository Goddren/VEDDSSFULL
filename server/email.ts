import sgMail from '@sendgrid/mail';

const FROM = 'VEDD Trading AI <noreply@veddbuild.com>';
let initialized = false;

function getClient(): typeof sgMail | null {
  if (!initialized) {
    const key = process.env.SENDGRID_API_KEY;
    if (!key) {
      console.warn('[Email] SENDGRID_API_KEY not set — emails disabled');
      return null;
    }
    sgMail.setApiKey(key);
    initialized = true;
  }
  return sgMail;
}

async function send(msg: sgMail.MailDataRequired) {
  const client = getClient();
  if (!client) return;
  try {
    await client.send(msg);
    console.log(`[Email] Sent "${msg.subject}" to ${msg.to}`);
  } catch (err: any) {
    console.error('[Email] Send error:', err?.response?.body ?? err?.message ?? err);
  }
}

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #080B14;
  color: #e5e7eb;
  max-width: 560px;
  margin: 0 auto;
  padding: 40px 32px;
  border-radius: 16px;
`;

export async function sendWelcomeEmail(to: string, name: string) {
  const displayName = name || 'Trader';
  await send({
    to,
    from: FROM,
    subject: 'Welcome to VEDD — Your AI Trading Journey Starts Now',
    html: `
      <div style="${baseStyle}">
        <img src="https://veddbuild.com/assets/IMG_3645-7VdkjQiC.png" alt="VEDD" style="height:48px;margin-bottom:24px;" />
        <h1 style="color:#fff;font-size:24px;font-weight:900;margin:0 0 8px;">Welcome, ${displayName}! 🎉</h1>
        <p style="color:#9ca3af;font-size:15px;line-height:1.6;margin:0 0 24px;">
          Your VEDD account is live. You now have access to AI-powered chart analysis,
          multi-timeframe strategies, the Abba AI Strategist, and more.
        </p>
        <a href="https://veddbuild.com/dashboard" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;margin-bottom:32px;">
          Go to Dashboard →
        </a>
        <p style="color:#6b7280;font-size:13px;margin:0;">
          Three things to do first:<br/>
          1. Add your AI API keys (<a href="https://veddbuild.com/ai-api-keys" style="color:#ef4444;">AI API Keys</a>)<br/>
          2. Upload your first chart for analysis<br/>
          3. Check your weekly plan on the <a href="https://veddbuild.com/weekly-strategy" style="color:#ef4444;">SS Engine</a>
        </p>
        <hr style="border:none;border-top:1px solid #1a1f2e;margin:32px 0;" />
        <p style="color:#4b5563;font-size:12px;margin:0;">
          VEDD Trading AI · veddbuild.com<br/>
          You're receiving this because you created a VEDD account.
        </p>
      </div>
    `,
  });
}

export async function sendSubscriptionConfirmation(to: string, name: string, planName: string) {
  const displayName = name || 'Trader';
  await send({
    to,
    from: FROM,
    subject: `You're on the ${planName} plan — VEDD`,
    html: `
      <div style="${baseStyle}">
        <img src="https://veddbuild.com/assets/IMG_3645-7VdkjQiC.png" alt="VEDD" style="height:48px;margin-bottom:24px;" />
        <h1 style="color:#fff;font-size:24px;font-weight:900;margin:0 0 8px;">Subscription confirmed ✓</h1>
        <p style="color:#9ca3af;font-size:15px;line-height:1.6;margin:0 0 8px;">
          Hi ${displayName}, your <strong style="color:#fff;">${planName}</strong> plan is now active.
          All features for your plan are unlocked.
        </p>
        <a href="https://veddbuild.com/dashboard" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;margin:24px 0 32px;">
          Start Trading →
        </a>
        <p style="color:#6b7280;font-size:13px;margin:0;">
          Manage or cancel your subscription anytime at
          <a href="https://veddbuild.com/subscription" style="color:#ef4444;">veddbuild.com/subscription</a>.
        </p>
        <hr style="border:none;border-top:1px solid #1a1f2e;margin:32px 0;" />
        <p style="color:#4b5563;font-size:12px;margin:0;">
          VEDD Trading AI · veddbuild.com
        </p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(to: string, resetLink: string) {
  await send({
    to,
    from: FROM,
    subject: 'Reset your VEDD password',
    html: `
      <div style="${baseStyle}">
        <img src="https://veddbuild.com/assets/IMG_3645-7VdkjQiC.png" alt="VEDD" style="height:48px;margin-bottom:24px;" />
        <h1 style="color:#fff;font-size:24px;font-weight:900;margin:0 0 8px;">Password reset</h1>
        <p style="color:#9ca3af;font-size:15px;line-height:1.6;margin:0 0 24px;">
          We received a request to reset your VEDD password.
          Click the button below — it expires in <strong style="color:#fff;">1 hour</strong>.
        </p>
        <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;margin-bottom:32px;">
          Reset Password →
        </a>
        <p style="color:#6b7280;font-size:13px;margin:0 0 8px;">
          If you didn't request this, ignore this email — your password won't change.
        </p>
        <p style="color:#4b5563;font-size:12px;word-break:break-all;">
          Or copy this link: ${resetLink}
        </p>
        <hr style="border:none;border-top:1px solid #1a1f2e;margin:32px 0;" />
        <p style="color:#4b5563;font-size:12px;margin:0;">
          VEDD Trading AI · veddbuild.com
        </p>
      </div>
    `,
  });
}
