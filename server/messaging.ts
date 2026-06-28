// ── VEDD Free & Paid Messaging Service ───────────────────────────────────────
// Channels available:
//   gmail    — nodemailer + Gmail SMTP (free, 500/day, needs GMAIL_USER + GMAIL_APP_PASSWORD)
//   resend   — Resend.com API (free 3,000/month, needs RESEND_API_KEY)
//   telegram — Telegram Bot API (unlimited free, needs TELEGRAM_BOT_TOKEN + user chat_id)
//   twilio   — Twilio SMS (paid/trial, needs TWILIO_* vars)
//   sendgrid — SendGrid (100/day free, needs SENDGRID_API_KEY)

import nodemailer from 'nodemailer';

export type MessageChannel = 'gmail' | 'resend' | 'telegram' | 'twilio' | 'sendgrid';
export type MessageResult = { success: boolean; channel: MessageChannel; id?: string; error?: string };

// ── Gmail SMTP (nodemailer) ───────────────────────────────────────────────────
// Setup: Google Account → Security → App Passwords → generate password for "Mail"
// Env vars: GMAIL_USER (your@gmail.com), GMAIL_APP_PASSWORD (16-char app password)
export async function sendGmail(to: string, subject: string, text: string, html?: string): Promise<MessageResult> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return { success: false, channel: 'gmail', error: 'GMAIL_USER and GMAIL_APP_PASSWORD not set. Create a Gmail App Password at myaccount.google.com/security → App Passwords.' };
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    const info = await transporter.sendMail({
      from: `"VEDD | Abba" <${user}>`,
      to,
      subject,
      text,
      html: html || `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#7c3aed">VEDD — Abba AI</h2><div>${text.replace(/\n/g, '<br/>')}</div></div>`,
    });
    return { success: true, channel: 'gmail', id: info.messageId };
  } catch (e: any) {
    return { success: false, channel: 'gmail', error: e.message };
  }
}

// ── Resend.com (free 3,000/month) ────────────────────────────────────────────
// Setup: resend.com → sign up free → API Keys → create key
// Env vars: RESEND_API_KEY, RESEND_FROM_EMAIL (must be verified domain or use onboarding@resend.dev for testing)
export async function sendResend(to: string, subject: string, text: string, html?: string): Promise<MessageResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { success: false, channel: 'resend', error: 'RESEND_API_KEY not set. Sign up free at resend.com and add your API key.' };
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM_EMAIL || 'Abba <onboarding@resend.dev>';
    const result = await resend.emails.send({ from, to, subject, text, html });
    if ((result as any).error) return { success: false, channel: 'resend', error: (result as any).error.message };
    return { success: true, channel: 'resend', id: (result.data as any)?.id };
  } catch (e: any) {
    return { success: false, channel: 'resend', error: e.message };
  }
}

// ── Telegram Bot (unlimited free) ────────────────────────────────────────────
// Setup:
//   1. Open Telegram → search @BotFather → /newbot → follow prompts
//   2. Copy the bot token BotFather gives you
//   3. User must send /start to your bot first to get their chat_id
//   4. Chat IDs can be retrieved from https://api.telegram.org/bot<TOKEN>/getUpdates after user messages the bot
// Env vars: TELEGRAM_BOT_TOKEN
// The `chatId` param is the user's Telegram chat ID (numeric string)
export async function sendTelegram(chatId: string, message: string): Promise<MessageResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { success: false, channel: 'telegram', error: 'TELEGRAM_BOT_TOKEN not set. Create a free bot at @BotFather on Telegram.' };
  if (!chatId?.trim()) return { success: false, channel: 'telegram', error: 'chatId required — user must have started your bot first.' };
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' });
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const data = await res.json() as any;
    if (!data.ok) return { success: false, channel: 'telegram', error: data.description || 'Telegram API error' };
    return { success: true, channel: 'telegram', id: String(data.result?.message_id) };
  } catch (e: any) {
    return { success: false, channel: 'telegram', error: e.message };
  }
}

// ── Twilio SMS (paid / free trial) ───────────────────────────────────────────
export async function sendTwilioSms(to: string, body: string): Promise<MessageResult> {
  const { sendSmsRaw } = await import('./twilio');
  const result = await sendSmsRaw(to, body);
  return { ...result, channel: 'twilio' };
}

// ── SendGrid email (100/day free) ────────────────────────────────────────────
export async function sendSendGrid(to: string, subject: string, text: string, html?: string): Promise<MessageResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return { success: false, channel: 'sendgrid', error: 'SENDGRID_API_KEY not set. Sign up at sendgrid.com (100/day free).' };
  try {
    const sgMail = await import('@sendgrid/mail');
    const sg = (sgMail as any).default || sgMail;
    sg.setApiKey(apiKey);
    await sg.send({
      to,
      from: process.env.SENDGRID_FROM_EMAIL || 'abba@vedd.app',
      subject,
      text,
      html: html || text,
    });
    return { success: true, channel: 'sendgrid' };
  } catch (e: any) {
    return { success: false, channel: 'sendgrid', error: e.message };
  }
}

// ── Unified send dispatcher ───────────────────────────────────────────────────
export async function sendMessage(opts: {
  channel: MessageChannel;
  // SMS / Telegram
  phone?: string;
  chatId?: string;
  // Email
  email?: string;
  subject?: string;
  html?: string;
  // Body
  message: string;
}): Promise<MessageResult> {
  const { channel, message, phone, chatId, email, subject, html } = opts;

  switch (channel) {
    case 'gmail':
      if (!email) return { success: false, channel, error: 'email address required for Gmail' };
      return sendGmail(email, subject || 'Message from VEDD Abba', message, html);

    case 'resend':
      if (!email) return { success: false, channel, error: 'email address required for Resend' };
      return sendResend(email, subject || 'Message from VEDD Abba', message, html);

    case 'telegram':
      if (!chatId) return { success: false, channel, error: 'Telegram chat ID required' };
      return sendTelegram(chatId, message);

    case 'twilio':
      if (!phone) return { success: false, channel, error: 'phone number required for Twilio SMS' };
      return sendTwilioSms(phone, message);

    case 'sendgrid':
      if (!email) return { success: false, channel, error: 'email address required for SendGrid' };
      return sendSendGrid(email, subject || 'Message from VEDD Abba', message, html);

    default:
      return { success: false, channel, error: `Unknown channel: ${channel}` };
  }
}

// ── Channel availability check (for UI status indicators) ────────────────────
export function getChannelStatus(): Record<MessageChannel, { configured: boolean; free: boolean; limit: string; setupUrl: string }> {
  return {
    gmail:    { configured: !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD), free: true,  limit: '500/day',      setupUrl: 'https://myaccount.google.com/apppasswords' },
    resend:   { configured: !!process.env.RESEND_API_KEY,    free: true,  limit: '3,000/month',  setupUrl: 'https://resend.com' },
    telegram: { configured: !!process.env.TELEGRAM_BOT_TOKEN, free: true, limit: 'Unlimited',    setupUrl: 'https://t.me/BotFather' },
    twilio:   { configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN), free: false, limit: 'Paid / trial', setupUrl: 'https://twilio.com' },
    sendgrid: { configured: !!process.env.SENDGRID_API_KEY,  free: true,  limit: '100/day',      setupUrl: 'https://sendgrid.com' },
  };
}
