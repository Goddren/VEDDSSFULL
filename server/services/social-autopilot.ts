// ─────────────────────────────────────────────────────────────────────────────
// Social autopilot — phase 1: REVIEW QUEUE ONLY (nothing is published).
//
// Turns the engine's real progress into faceless Instagram posts and X threads:
//   • weekly_recap   (Sat 10:00 UTC) — FX week in % of account, win rate, best pair
//   • shadow_progress (Wed 14:00 UTC) — Model 1 / Model 2 mastery (FX + crypto)
//   • engine_insight (Mon 14:00 UTC) — what the models are learning (best/worst slice)
//   • milestone      (checked every 6h + manual) — a scope reaches Proficient /
//                    Master, first live model trade, prop-firm phase pass
// Numbers come straight from the DB and are shown as PERCENTAGES only. Shadow
// results are labelled simulated. Every post carries a risk line. Cards are
// SVG rendered to PNG with sharp. Drafts wait in social_posts for approval;
// phase 2 will publish approved posts to Instagram + X.
// Env: SOCIAL_AUTOPILOT=off, SOCIAL_OWNER_USER_ID (1), PUBLIC_SITE_URL.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from '../db';

const OWNER = () => Number(process.env.SOCIAL_OWNER_USER_ID ?? 1);
const SITE = () => (process.env.PUBLIC_SITE_URL || 'https://veddbuild.com').replace(/\/$/, '');
const RISK = 'Not financial advice. Trading involves risk; past results don’t guarantee future returns.';
const TAGS_IG = '#algotrading #forex #aitrading #tradingbot #buildinpublic #propfirm #tradingjourney';

let ensured: Promise<void> | null = null;
export function ensureSocialTables(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(`
      CREATE TABLE IF NOT EXISTS social_posts (
        id serial PRIMARY KEY,
        kind text NOT NULL,
        platform text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        caption text,
        thread jsonb,
        image bytea,
        data jsonb,
        period_key text,
        created_at timestamp NOT NULL DEFAULT now(),
        reviewed_at timestamp,
        posted_at timestamp,
        external_id text,
        error text
      );
      CREATE INDEX IF NOT EXISTS social_posts_status_idx ON social_posts (status, created_at);
    `).then(() => undefined).catch((e: any) => { console.error('[social] ensure failed:', e?.message || e); ensured = null; });
  }
  return ensured;
}

// ── Image cards (1080×1080 SVG → PNG) ─────────────────────────────────────
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${x.toFixed(d)}%`;

interface Card { eyebrow: string; title: string; big: string; bigColor?: string; sub?: string; rows?: Array<[string, string]>; series?: number[]; badge?: string; }

async function renderCard(c: Card): Promise<Buffer> {
  const W = 1080, H = 1080, F = 'DejaVu Sans, Arial, Helvetica, sans-serif';
  const rows = (c.rows || []).slice(0, 5).map(([k, v], i) =>
    `<text x="90" y="${700 + i * 58}" font-family="${F}" font-size="34" fill="#94a3b8">${esc(k)}</text>
     <text x="990" y="${700 + i * 58}" font-family="${F}" font-size="34" font-weight="700" fill="#e2e8f0" text-anchor="end">${esc(v)}</text>`).join('');
  let spark = '';
  if (c.series && c.series.length >= 2) {
    const xs = c.series, min = Math.min(0, ...xs), max = Math.max(0, ...xs), span = max - min || 1;
    // Chart band y=510..640, clear of the subtitle (460) and the rows (700+).
    const pts = xs.map((v, i) => `${90 + (i * 900) / (xs.length - 1)},${640 - ((v - min) / span) * 130}`).join(' ');
    const zeroY = 640 - ((0 - min) / span) * 130;
    const last = xs[xs.length - 1];
    spark = `<line x1="90" y1="${zeroY}" x2="990" y2="${zeroY}" stroke="#334155" stroke-dasharray="6 8"/>
      <polyline points="${pts}" fill="none" stroke="${last >= 0 ? '#34d399' : '#f87171'}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#151b33"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="60" y="60" width="${W - 120}" height="${H - 120}" rx="36" fill="none" stroke="#1e293b" stroke-width="3"/>
    <text x="90" y="150" font-family="${F}" font-size="30" font-weight="700" fill="#38bdf8" letter-spacing="4">${esc(c.eyebrow.toUpperCase())}</text>
    ${c.badge ? `<rect x="${990 - 24 * c.badge.length - 40}" y="112" width="${24 * c.badge.length + 40}" height="52" rx="26" fill="#f59e0b22" stroke="#f59e0b"/><text x="${990 - 12 * c.badge.length - 20}" y="148" font-family="${F}" font-size="26" font-weight="700" fill="#fbbf24" text-anchor="middle">${esc(c.badge)}</text>` : ''}
    <text x="90" y="240" font-family="${F}" font-size="54" font-weight="800" fill="#f8fafc">${esc(c.title)}</text>
    <text x="90" y="400" font-family="${F}" font-size="150" font-weight="800" fill="${c.bigColor || '#f8fafc'}">${esc(c.big)}</text>
    ${c.sub ? `<text x="90" y="460" font-family="${F}" font-size="34" fill="#94a3b8">${esc(c.sub)}</text>` : ''}
    ${spark}
    ${rows}
    <text x="90" y="1000" font-family="${F}" font-size="26" fill="#64748b">VEDD AI · ${esc(SITE().replace(/^https?:\/\//, ''))}</text>
    <text x="990" y="1000" font-family="${F}" font-size="22" fill="#475569" text-anchor="end">Not financial advice</text>
  </svg>`;
  const sharp = (await import('sharp')).default;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ── Data ──────────────────────────────────────────────────────────────────
async function fxWeek(): Promise<null | { pct: number; signals: number; winRate: number; best?: { pair: string; pct: number }; series: number[] }> {
  const owner = OWNER();
  const base = (await pool.query(
    `SELECT DISTINCT ON (split_part(r.key, ':', 1)) split_part(r.key, ':', 1) AS conn, (r.value->>'equity')::float AS eq
       FROM runtime_state r JOIN tradelocker_connections c ON c.id::text = split_part(r.key, ':', 1)
      WHERE r.scope = 'tl_day_start' AND c.user_id = $1 AND c.is_active = true
      ORDER BY split_part(r.key, ':', 1), r.key DESC`, [owner])).rows.reduce((a: number, r: any) => a + (Number(r.eq) || 0), 0);
  if (!(base > 0)) return null;
  const { rows } = await pool.query(
    `SELECT upper(regexp_replace(split_part(symbol, '.', 1), '[^A-Za-z0-9]', '', 'g')) AS s, direction AS d,
            created_at, closed_at, profit_loss::float AS pl
       FROM ai_trade_results
      WHERE user_id = $1 AND source LIKE 'tradelocker%' AND result IN ('WIN','LOSS','BREAKEVEN')
        AND closed_at > now() - interval '7 days' AND closed_at <= now()
      ORDER BY closed_at`, [owner]);
  if (!rows.length) return null;
  const sigs: Array<{ s: string; d: string; t: number; pl: number; close: number }> = [];
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    const g = sigs.find((x) => x.s === r.s && x.d === r.d && Math.abs(x.t - t) < 15 * 60_000);
    if (g) g.pl += Number(r.pl) || 0; else sigs.push({ s: r.s, d: r.d, t, pl: Number(r.pl) || 0, close: new Date(r.closed_at).getTime() });
  }
  const total = sigs.reduce((a, x) => a + x.pl, 0);
  // Win rate over decided trades only: $0 rows are mostly sync records with no
  // booked result, not real breakevens.
  const wins = sigs.filter((x) => x.pl > 0).length;
  const decided = sigs.filter((x) => x.pl !== 0).length;
  const byPair = new Map<string, number>();
  for (const x of sigs) byPair.set(x.s, (byPair.get(x.s) || 0) + x.pl);
  const bestE = Array.from(byPair.entries()).sort((a, b) => b[1] - a[1])[0];
  // cumulative % by day
  const days = new Map<string, number>();
  for (const x of sigs.sort((a, b) => a.close - b.close)) { const k = new Date(x.close).toISOString().slice(0, 10); days.set(k, (days.get(k) || 0) + x.pl); }
  let run = 0; const series = [0, ...Array.from(days.values()).map((v) => (run += v) / base * 100)];
  return { pct: (total / base) * 100, signals: sigs.length, winRate: decided ? (wins / decided) * 100 : 0, best: bestE && bestE[1] > 0 ? { pair: bestE[0], pct: (bestE[1] / base) * 100 } : undefined, series };
}

/** Public-facing level label (internal "(negative)" suffix dropped). */
const lvl = (l: string) => String(l || '').replace(/\s*\(negative\)/i, '');

async function mastery() {
  const fm = await import('./fx-models');
  const [fx, cr] = await Promise.all([fm.getModelMastery(OWNER(), { engine: 'fx', ownOnly: true }), fm.getModelMastery(OWNER(), { engine: 'crypto', ownOnly: true })]);
  return { fx, cr };
}

// ── Post builders ─────────────────────────────────────────────────────────
interface Draft { kind: string; period: string; card: Card; ig: string; x: string[]; data: any }

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

async function buildWeeklyRecap(): Promise<Draft | null> {
  const w = await fxWeek();
  if (!w) return null;
  const up = w.pct >= 0;
  const hook = up
    ? pick(['The AI engine closed the week green.', 'Another week of the engine doing its thing.', 'Week in the books — engine finished up.'])
    : pick(['Red week for the engine — here’s the honest breakdown.', 'Not every week is green. Full transparency below.']);
  const lines = [
    `Week result: ${pct(w.pct, 2)} of account`,
    `Signals: ${w.signals} · Win rate ${w.winRate.toFixed(0)}%`,
    ...(w.best ? [`Best pair: ${w.best.pair} (${pct(w.best.pct, 2)})`] : []),
  ];
  return {
    kind: 'weekly_recap', period: isoWeek(),
    card: { eyebrow: 'Live · weekly recap', title: 'AI FX engine — this week', big: pct(w.pct, 2), bigColor: up ? '#34d399' : '#f87171', sub: 'of account, all live trades', series: w.series,
      rows: [['Signals traded', String(w.signals)], ['Win rate', `${w.winRate.toFixed(0)}%`], ...(w.best ? [['Best pair', `${w.best.pair} ${pct(w.best.pct, 2)}`] as [string, string]] : [])] },
    ig: `${hook}\n\n${lines.join('\n')}\n\nEverything here is the live engine — no cherry-picking, % of account only.\n\n${RISK}\n\n${TAGS_IG}`,
    x: [
      `${hook}\n\n${lines.join('\n')}`,
      `How it trades: H4 sets the trend, H1 the structure, M15 the entry. Trades where H1+H4 agree get full size; everything else is cut down.`,
      `Building this in public — shadow models → live → prop firm. Follow along.\n\n${RISK}`,
    ],
    data: w,
  };
}

async function buildShadowProgress(): Promise<Draft | null> {
  const { fx, cr } = await mastery();
  const m = (list: any[], id: string) => list.find((x: any) => x.model === id);
  const f2 = m(fx.models, 'M2'), f1 = m(fx.models, 'M1'), c2 = m(cr.models, 'M2');
  const anyData = [f1, f2, c2].some((x) => x && x.trades > 0);
  if (!anyData) return null;
  const row = (label: string, x: any) => x ? [label, `${x.trades} ideas · ${(x.winRate * 100).toFixed(0)}% · ${lvl(x.level)}`] as [string, string] : [label, 'collecting'] as [string, string];
  const lead = [f2, f1, c2].filter(Boolean).sort((a: any, b: any) => b.trades - a.trades)[0];
  const leadName = lead === c2 ? 'Crypto trend' : lead === f1 ? 'FX range' : 'FX trend';
  return {
    kind: 'shadow_progress', period: isoWeek(),
    card: { eyebrow: 'Shadow mode · simulated', title: 'Model 1 & Model 2 progress', big: `${(lead.winRate * 100).toFixed(0)}%`, sub: `${leadName} model win rate (simulated)`, badge: 'SHADOW',
      rows: [row('FX Model 2 · trend', f2), row('FX Model 1 · range', f1), row('Crypto Model 2', c2)] },
    ig: `Two AI models are trading in SHADOW mode — every idea is recorded and scored against real prices, but no money is on the line until they prove themselves.\n\n` +
      `${f2 ? `FX Trend model: ${f2.trades} ideas, ${(f2.winRate * 100).toFixed(0)}% win rate (${lvl(f2.level)})\n` : ''}` +
      `${f1 ? `FX Range model: ${f1.trades} ideas, ${(f1.winRate * 100).toFixed(0)}% win rate (${lvl(f1.level)})\n` : ''}` +
      `${c2 ? `Crypto Trend model: ${c2.trades} ideas, ${(c2.winRate * 100).toFixed(0)}% win rate (${lvl(c2.level)})\n` : ''}` +
      `\nA model only goes live after 50+ scored ideas with a positive edge. Simulated results.\n\n${RISK}\n\n${TAGS_IG}`,
    x: [
      `Shadow mode update 🧪 Two AI models paper-trade every hour; each idea is scored against real prices.`,
      [f2 && `FX Trend: ${f2.trades} ideas · ${(f2.winRate * 100).toFixed(0)}% WR · ${lvl(f2.level)}`, f1 && `FX Range: ${f1.trades} ideas · ${(f1.winRate * 100).toFixed(0)}% WR · ${lvl(f1.level)}`, c2 && `Crypto Trend: ${c2.trades} ideas · ${(c2.winRate * 100).toFixed(0)}% WR · ${lvl(c2.level)}`].filter(Boolean).join('\n'),
      `Rule: no real money until a model has 50+ scored ideas with a positive edge. Simulated results.\n\n${RISK}`,
    ],
    data: { fx: fx.models, crypto: cr.models },
  };
}

async function buildEngineInsight(): Promise<Draft | null> {
  const { fx } = await mastery();
  const slices = fx.slices.filter((s: any) => s.trades >= 10);
  if (slices.length < 2) return null;
  const best = [...slices].sort((a: any, b: any) => b.avgR - a.avgR)[0];
  const worst = [...slices].sort((a: any, b: any) => a.avgR - b.avgR)[0];
  const lbl = (s: any) => `${s.model === 'M1' ? 'Range' : 'Trend'} · ${s.symbol} · ${s.session}`;
  return {
    kind: 'engine_insight', period: isoWeek(),
    card: { eyebrow: 'What the AI is learning', title: 'Best vs worst setup', big: `${best.avgR >= 0 ? '+' : ''}${best.avgR.toFixed(2)}R`, bigColor: '#34d399', sub: `avg per idea — ${lbl(best)}`, badge: 'SHADOW',
      rows: [['Best', `${lbl(best)} · ${(best.winRate * 100).toFixed(0)}%`], ['Worst', `${lbl(worst)} · ${(worst.winRate * 100).toFixed(0)}%`], ['Ideas scored', String(slices.reduce((a: number, s: any) => a + s.trades, 0))]] },
    ig: `What the AI engine learned this week:\n\n✅ Best setup: ${lbl(best)} — ${(best.winRate * 100).toFixed(0)}% win rate over ${best.trades} ideas\n❌ Worst setup: ${lbl(worst)} — ${(worst.winRate * 100).toFixed(0)}% over ${worst.trades}\n\nThe engine leans into what works and avoids what doesn’t — automatically. Simulated (shadow) results.\n\n${RISK}\n\n${TAGS_IG}`,
    x: [
      `What my AI trading engine learned this week 🧠`,
      `Best: ${lbl(best)} — ${(best.winRate * 100).toFixed(0)}% WR, ${best.trades} ideas\nWorst: ${lbl(worst)} — ${(worst.winRate * 100).toFixed(0)}% WR, ${worst.trades} ideas`,
      `It sizes up the winners and steps away from the losers on its own. Shadow results (simulated).\n\n${RISK}`,
    ],
    data: { best, worst },
  };
}

async function buildMilestones(): Promise<Draft[]> {
  const out: Draft[] = [];
  const { fx, cr } = await mastery();
  const seen = new Set<string>(((await getState('social_milestones', 'seen')) as string[] | null) || []);
  for (const [eng, m] of [['FX', fx], ['Crypto', cr]] as const) {
    for (const s of m.slices) {
      if (!['Proficient', 'Master'].includes(s.level)) continue;
      const key = `${eng}|${s.model}|${s.dayType}|${s.symbol}|${s.session}|${s.level}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const name = `${eng} ${s.model === 'M1' ? 'Range' : 'Trend'} model · ${s.symbol}`;
      out.push({
        kind: 'milestone', period: key,
        card: { eyebrow: 'Milestone unlocked', title: name, big: s.level.toUpperCase(), bigColor: '#fbbf24', sub: `${s.trades} scored ideas · ${(s.winRate * 100).toFixed(0)}% win rate`, badge: 'SHADOW',
          rows: [['Session', s.session], ['Day type', s.dayType], ['Avg per idea', `${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R`]] },
        ig: `🏆 Milestone: the ${name} just reached ${s.level}.\n\n${s.trades} scored ideas in shadow mode, ${(s.winRate * 100).toFixed(0)}% win rate, ${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R per idea (${s.session}, ${s.dayType} days).\n\nThat’s the bar a model has to clear before it’s even considered for real money. Simulated results.\n\n${RISK}\n\n${TAGS_IG}`,
        x: [`🏆 Milestone: my ${name} just hit ${s.level} in shadow mode.`, `${s.trades} scored ideas · ${(s.winRate * 100).toFixed(0)}% WR · ${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R/idea (${s.session}, ${s.dayType} days). Simulated.\n\n${RISK}`],
        data: s,
      });
    }
  }
  if (out.length) await setState('social_milestones', 'seen', Array.from(seen));
  // First live model trade.
  const live = await pool.query(`SELECT symbol, model, direction, created_at FROM fx_model_decisions WHERE user_id=$1 AND engine='fx' AND mode='live' ORDER BY created_at LIMIT 1`, [OWNER()]).catch(() => ({ rows: [] as any[] }));
  if (live.rows[0] && !seen.has('first_live')) {
    const r = live.rows[0];
    seen.add('first_live'); await setState('social_milestones', 'seen', Array.from(seen));
    out.push({ kind: 'milestone', period: 'first_live', card: { eyebrow: 'Milestone unlocked', title: 'First live model trade', big: 'LIVE', bigColor: '#34d399', sub: `${r.model === 'M1' ? 'Range' : 'Trend'} model · ${r.symbol} ${r.direction}` },
      ig: `🚀 The first AI model just graduated from shadow mode and placed a live trade (${r.symbol}).\n\nIt earned it with a proven shadow record. Now the real test begins.\n\n${RISK}\n\n${TAGS_IG}`,
      x: [`🚀 Shadow → live. My first AI model just placed its first real trade (${r.symbol}).`, `It only went live after proving a positive edge in simulation. Now the real test.\n\n${RISK}`], data: r });
  }
  return out;
}

/** Manual milestone, e.g. a prop-firm phase pass. */
export async function createManualMilestone(title: string, detail: string, big = 'PASSED'): Promise<number> {
  return saveDraft({
    kind: 'milestone', period: `manual:${Date.now()}`,
    card: { eyebrow: 'Milestone', title: title.slice(0, 40), big: big.slice(0, 10), bigColor: '#34d399', sub: detail.slice(0, 60) },
    ig: `🏆 ${title}\n\n${detail}\n\nBuilt by an AI engine that started in shadow mode and earned its way to live trading.\n\n${RISK}\n\n${TAGS_IG}`,
    x: [`🏆 ${title}`, `${detail}\n\nFrom shadow mode → live → this. Building in public.\n\n${RISK}`],
    data: { title, detail },
  });
}

// ── Persistence ───────────────────────────────────────────────────────────
async function getState(scope: string, key: string): Promise<any> {
  try { const { getRuntimeStateStrict } = await import('./runtime-state'); return await getRuntimeStateStrict(scope, key); } catch { return null; }
}
async function setState(scope: string, key: string, v: unknown): Promise<void> {
  try {
    const { pool: p } = await import('../db');
    const { ensureRuntimeStateTable } = await import('./runtime-state');
    await ensureRuntimeStateTable();
    await p.query(`INSERT INTO runtime_state (scope, key, value, updated_at) VALUES ($1,$2,$3::jsonb,now()) ON CONFLICT (scope, key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [scope, key, JSON.stringify(v)]);
  } catch { /* non-fatal */ }
}
function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y.getTime()) / 86_400_000 + 1) / 7)).padStart(2, '0')}`;
}

async function saveDraft(d: Draft): Promise<number> {
  await ensureSocialTables();
  const img = await renderCard(d.card).catch((e: any) => { console.error('[social] card render failed:', e?.message || e); return null; });
  const x = d.x.map((t) => t.slice(0, 280));
  const a = await pool.query(`INSERT INTO social_posts (kind, platform, caption, image, data, period_key) VALUES ($1,'instagram',$2,$3,$4::jsonb,$5) RETURNING id`, [d.kind, d.ig.slice(0, 2200), img, JSON.stringify(d.data ?? null), d.period]);
  await pool.query(`INSERT INTO social_posts (kind, platform, caption, thread, image, data, period_key) VALUES ($1,'x',$2,$3::jsonb,$4,$5::jsonb,$6)`, [d.kind, x[0], JSON.stringify(x), img, JSON.stringify(d.data ?? null), d.period]);
  return a.rows[0].id;
}

/** Generate one kind now (manual button or scheduler). Skips if this period already has it. */
export async function generateKind(kind: 'weekly_recap' | 'shadow_progress' | 'engine_insight' | 'milestone', force = false): Promise<{ created: number; note: string }> {
  await ensureSocialTables();
  const drafts: Draft[] = [];
  if (kind === 'weekly_recap') { const d = await buildWeeklyRecap(); if (d) drafts.push(d); }
  if (kind === 'shadow_progress') { const d = await buildShadowProgress(); if (d) drafts.push(d); }
  if (kind === 'engine_insight') { const d = await buildEngineInsight(); if (d) drafts.push(d); }
  if (kind === 'milestone') drafts.push(...await buildMilestones());
  let created = 0;
  for (const d of drafts) {
    if (!force) {
      const dup = await pool.query(`SELECT 1 FROM social_posts WHERE kind=$1 AND period_key=$2 LIMIT 1`, [d.kind, d.period]);
      if (dup.rows.length) continue;
    }
    await saveDraft(d); created++;
  }
  return { created, note: drafts.length ? `${created} new draft set(s)` : 'not enough data yet for this post type' };
}

/** Hourly scheduler tick (web service, FX leader only). Drafts only. */
export function startSocialAutopilot(): void {
  if (process.env.SOCIAL_AUTOPILOT === 'off') return;
  const tick = async () => {
    try {
      const { isFxLeader } = await import('./live-trading-engine');
      if (!isFxLeader()) return;
      const now = new Date(), dow = now.getUTCDay(), h = now.getUTCHours();
      if (dow === 6 && h === 10) await generateKind('weekly_recap');
      if (dow === 3 && h === 14) await generateKind('shadow_progress');
      if (dow === 1 && h === 14) await generateKind('engine_insight');
      if (h % 6 === 0) await generateKind('milestone');
    } catch (e: any) { console.error('[social] tick failed (non-fatal):', e?.message || e); }
  };
  setInterval(tick, 60 * 60 * 1000);
  setTimeout(tick, 5 * 60 * 1000);
}

/** Build drafts without saving (diagnostics). */
export async function previewKind(kind: 'weekly_recap' | 'shadow_progress' | 'engine_insight'): Promise<{ draft: Draft | null; png?: Buffer }> {
  const d = kind === 'weekly_recap' ? await buildWeeklyRecap() : kind === 'shadow_progress' ? await buildShadowProgress() : await buildEngineInsight();
  return { draft: d, png: d ? await renderCard(d.card) : undefined };
}
