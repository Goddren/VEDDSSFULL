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
async function fxWeek(windowDays = 7): Promise<null | { pct: number; signals: number; winRate: number; best?: { pair: string; pct: number }; series: number[] }> {
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
        AND closed_at > now() - make_interval(days => $2) AND closed_at <= now()
      ORDER BY closed_at`, [owner, windowDays]);
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
/** Yesterday's live result + shadow progress, for the morning email. */
async function buildDailyUpdate(): Promise<Draft | null> {
  const d = await fxWeek(1);
  const { fx } = await mastery();
  const f2 = fx.models.find((x: any) => x.model === 'M2'), f1 = fx.models.find((x: any) => x.model === 'M1');
  if (!d && !f2 && !f1) return null;
  const day = new Date().toISOString().slice(0, 10);
  const up = (d?.pct ?? 0) >= 0;
  const live = d ? `Last 24h (live): ${pct(d.pct, 2)} of account · ${d.signals} signal${d.signals === 1 ? '' : 's'} · ${d.winRate.toFixed(0)}% win rate` : 'Last 24h (live): no closed trades';
  const shadow = [f2 && `Trend model (shadow): ${f2.trades} ideas, ${(f2.winRate * 100).toFixed(0)}% (${lvl(f2.level)})`, f1 && `Range model (shadow): ${f1.trades} ideas, ${(f1.winRate * 100).toFixed(0)}% (${lvl(f1.level)})`].filter(Boolean) as string[];
  return {
    kind: 'daily_update', period: day,
    card: { eyebrow: 'Daily engine update', title: 'AI FX engine — last 24h', big: d ? pct(d.pct, 2) : '—', bigColor: d ? (up ? '#34d399' : '#f87171') : '#94a3b8', sub: d ? 'of account, live trades' : 'no closed trades in the last 24h', series: d?.series,
      rows: [...(d ? [['Signals', String(d.signals)] as [string, string], ['Win rate', `${d.winRate.toFixed(0)}%`] as [string, string]] : []), ...(f2 ? [['Trend model', `${f2.trades} ideas · ${lvl(f2.level)}`] as [string, string]] : [])] },
    ig: `Daily build log 📈\n\n${live}\n${shadow.join('\n')}\n\nBuilding an AI trading engine in public — every number is real, shadow results are simulated.\n\n${RISK}\n\n${TAGS_IG}`,
    x: [`Daily build log 📈\n\n${live}`, ...(shadow.length ? [shadow.join('\n')] : []), `Shadow → live → prop firm, in public.\n\n${RISK}`],
    data: { live: d, models: fx.models },
  };
}

// ── $100K prop-firm challenge account — daily results, REAL numbers ──────
// The one post type that shows dollars (user choice). Built from broker
// equity snapshots taken at 00:05 UTC each day (exact, unlike reconstructed
// per-trade P&L). Env: SOCIAL_CHALLENGE_CONN_ID (31 = HeroFX 100k),
// SOCIAL_CHALLENGE_SIZE (prop_firm_account_size, else 100000),
// SOCIAL_CHALLENGE_TARGET_PCT (10), SOCIAL_CHALLENGE_START (YYYY-MM-DD),
// SOCIAL_CHALLENGE=off to disable.
const CH_CONN = () => Number(process.env.SOCIAL_CHALLENGE_CONN_ID ?? 31);

async function challengeConn(): Promise<any | null> {
  const { storage } = await import('../storage');
  const conns = await storage.getUserTradelockerConnections(OWNER());
  return (conns as any[]).find((c) => c.id === CH_CONN() && c.isActive) || null;
}
async function readChallengeEquity(): Promise<number | null> {
  try {
    const conn = await challengeConn();
    if (!conn) return null;
    const { getOrCreateService } = await import('../tradelocker');
    const svc: any = await getOrCreateService(conn);
    const info = await svc.getAccountInfo();
    const eq = Number(info?.equity) > 0 ? Number(info.equity) : Number(info?.balance);
    return eq > 0 ? eq : null;
  } catch { return null; }
}
/** Store today's 00:05 UTC equity for the challenge account (once a day). */
export async function snapshotChallengeEquity(): Promise<void> {
  if (process.env.SOCIAL_CHALLENGE === 'off') return;
  const day = new Date().toISOString().slice(0, 10);
  if (await getState('challenge_equity', `${CH_CONN()}:${day}`)) return;
  const eq = await readChallengeEquity();
  if (!eq) return;
  // Sanity: within 25% of the last stored figure (or the account size).
  const { rows } = await pool.query(
    `SELECT (value->>'equity')::float AS eq FROM runtime_state WHERE scope IN ('challenge_equity','tl_day_start') AND key LIKE $1 ORDER BY key DESC LIMIT 1`, [`${CH_CONN()}:%`]);
  const conn = await challengeConn();
  const ref = rows[0] ? Number(rows[0].eq) : Number(conn?.propFirmAccountSize) || 100000;
  if (Math.abs(eq - ref) / ref > 0.25) { console.error(`[social] challenge snapshot ${eq} vs ${ref} rejected as implausible`); return; }
  await setState('challenge_equity', `${CH_CONN()}:${day}`, { equity: eq, at: Date.now() });
}
async function challengeSnap(day: string): Promise<number | null> {
  const v = await getState('challenge_equity', `${CH_CONN()}:${day}`);
  if (Number(v?.equity) > 0) return Number(v.equity);
  const t = await getState('tl_day_start', `${CH_CONN()}:${day}`); // risk-guard snapshot fallback
  return Number(t?.equity) > 0 ? Number(t.equity) : null;
}

async function buildChallengeDaily(): Promise<Draft | null> {
  if (process.env.SOCIAL_CHALLENGE === 'off') return null;
  const conn = await challengeConn();
  if (!conn) return null;
  const size = Number(process.env.SOCIAL_CHALLENGE_SIZE ?? conn.propFirmAccountSize ?? 100000) || 100000;
  const firm = String(conn.propFirmName || 'Prop firm').replace(/^herofx$/i, 'HeroFX');
  const today = new Date().toISOString().slice(0, 10);
  const yday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const nowEq = (await challengeSnap(today)) ?? (await readChallengeEquity());
  if (!nowEq) return null;
  // Most recent earlier snapshot = yesterday's open (or the last day we have).
  let prevEq = await challengeSnap(yday);
  if (prevEq == null) {
    const { rows } = await pool.query(
      `SELECT (value->>'equity')::float AS eq FROM runtime_state WHERE scope IN ('challenge_equity','tl_day_start') AND key LIKE $1 AND key < $2 ORDER BY key DESC LIMIT 1`,
      [`${CH_CONN()}:%`, `${CH_CONN()}:${today}`]);
    prevEq = rows[0] ? Number(rows[0].eq) : null;
  }
  // Real-money post: never publish an implausible figure. A read that lands on
  // the wrong/combined account (seen in testing: $199k on a $100k account) is
  // held back rather than posted.
  const ref = prevEq ?? size;
  if (Math.abs(nowEq - ref) / ref > 0.25) {
    console.error(`[social] challenge equity ${nowEq} vs reference ${ref} looks wrong — challenge post skipped`);
    return null;
  }
  const dayUsd = prevEq != null ? nowEq - prevEq : null;
  const dayPct = prevEq ? (dayUsd! / prevEq) * 100 : null;
  const totUsd = nowEq - size, totPct = (totUsd / size) * 100;
  const target = Number(process.env.SOCIAL_CHALLENGE_TARGET_PCT ?? 10);
  const progress = Math.max(0, Math.min(100, (totPct / target) * 100));
  const start = process.env.SOCIAL_CHALLENGE_START;
  const dayN = start ? Math.max(1, Math.floor((Date.now() - Date.parse(start + 'T00:00:00Z')) / 86_400_000) + 1) : null;
  // Yesterday's orders on this account (count only; P&L comes from equity).
  const tr = await pool.query(
    `SELECT count(*)::int AS n FROM tradelocker_trade_logs WHERE connection_id=$1 AND action='OPEN' AND status='executed' AND created_at >= $2::date AND created_at < $3::date`,
    [CH_CONN(), yday, today]).catch(() => ({ rows: [{ n: 0 }] }));
  const trades = Number(tr.rows[0]?.n) || 0;
  const usd$ = (x: number) => `${x >= 0 ? '+' : '-'}$${Math.abs(x).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const bal$ = (x: number) => `$${x.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const up = (dayUsd ?? 0) >= 0;
  const title = `${firm} $${Math.round(size / 1000)}K challenge${dayN ? ` — day ${dayN}` : ''}`;
  const dayLine = dayUsd != null ? `Yesterday: ${usd$(dayUsd)} (${pct(dayPct!, 2)}) · ${trades} trade${trades === 1 ? '' : 's'}` : `Yesterday: first tracked day`;
  const totLine = `Balance: ${bal$(nowEq)} · Total: ${usd$(totUsd)} (${pct(totPct, 2)})`;
  const progLine = `Progress to ${target}% target: ${progress.toFixed(0)}%`;
  return {
    kind: 'challenge_daily', period: today,
    card: { eyebrow: 'Live · prop firm challenge', title, big: dayUsd != null ? usd$(dayUsd) : bal$(nowEq), bigColor: dayUsd == null ? '#f8fafc' : up ? '#34d399' : '#f87171',
      sub: dayUsd != null ? `yesterday (${pct(dayPct!, 2)}) · real account, real money` : 'starting balance tracked from today',
      rows: [['Balance', bal$(nowEq)], ['Total since start', `${usd$(totUsd)} (${pct(totPct, 2)})`], [`Target ${target}%`, `${progress.toFixed(0)}% there`], ['Trades yesterday', String(trades)]] },
    ig: `${up ? '📈' : '📉'} ${title}

${dayLine}
${totLine}
${progLine}

The AI engine trades this ${firm} account live — real money, real numbers, every day. Win or lose, it gets posted.

${RISK}

#propfirm #fundedtrader #forex #aitrading #challenge #buildinpublic`,
    x: [
      `${up ? '📈' : '📉'} ${title}

${dayLine}
${totLine}`,
      `${progLine}

AI engine, live account, every result posted — red days too.

${RISK}`,
    ],
    data: { firm, size, nowEq, prevEq, dayUsd, dayPct, totUsd, totPct, target, trades },
  };
}

export async function generateKind(kind: 'weekly_recap' | 'shadow_progress' | 'engine_insight' | 'milestone' | 'daily_update' | 'challenge_daily', force = false): Promise<{ created: number; note: string }> {
  await ensureSocialTables();
  const drafts: Draft[] = [];
  if (kind === 'weekly_recap') { const d = await buildWeeklyRecap(); if (d) drafts.push(d); }
  if (kind === 'shadow_progress') { const d = await buildShadowProgress(); if (d) drafts.push(d); }
  if (kind === 'engine_insight') { const d = await buildEngineInsight(); if (d) drafts.push(d); }
  if (kind === 'milestone') drafts.push(...await buildMilestones());
  if (kind === 'daily_update') { const d = await buildDailyUpdate(); if (d) drafts.push(d); }
  if (kind === 'challenge_daily') { const d = await buildChallengeDaily(); if (d) drafts.push(d); }
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
/**
 * Morning email (manual posting for now): every draft created since the last
 * email — today's daily update plus any recap / progress / insight /
 * milestone — with the card image link, the Instagram caption and the X
 * thread, ready to copy. Uses the persona engine's mail channel.
 */
export async function sendMorningSocialEmail(force = false): Promise<{ sent: boolean; count: number; note: string }> {
  await ensureSocialTables();
  await generateKind('challenge_daily').catch(() => null);
  await generateKind('daily_update').catch(() => null);
  const last = Number((await getState('social_email', 'last_id'))?.id) || 0;
  const { rows } = await pool.query(
    `SELECT id, kind, platform, caption, thread, created_at FROM social_posts
      WHERE id > $1 AND status IN ('draft','approved') ORDER BY id`, [force ? 0 : last]);
  if (!rows.length) return { sent: false, count: 0, note: 'nothing new to send' };
  const esc2 = (t: string) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const byKind = new Map<string, any[]>();
  for (const r of rows) { const k = `${r.kind}|${new Date(r.created_at).toISOString().slice(0, 13)}`; (byKind.get(k) || byKind.set(k, []).get(k)!).push(r); }
  const LABEL: Record<string, string> = { challenge_daily: '$100K challenge — daily result', daily_update: 'Daily update', weekly_recap: 'Weekly recap', shadow_progress: 'Shadow progress', engine_insight: 'Engine insight', milestone: 'Milestone' };
  const blocks = Array.from(byKind.values()).map((g) => {
    const ig = g.find((r: any) => r.platform === 'instagram'), x = g.find((r: any) => r.platform === 'x');
    const img = (ig || x) ? `${SITE()}/api/social/image/${(ig || x).id}.png` : '';
    const thread: string[] = Array.isArray(x?.thread) ? x.thread : x?.caption ? [x.caption] : [];
    return `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:0 0 20px">
      <h3 style="margin:0 0 8px;font:600 16px system-ui">${esc2(LABEL[g[0].kind] || g[0].kind)}</h3>
      ${img ? `<p style="margin:0 0 10px"><a href="${img}"><img src="${img}" width="320" style="border-radius:8px;display:block" alt="post card"></a><span style="font:12px system-ui;color:#6b7280">Image: <a href="${img}">${img}</a> (save &amp; upload)</span></p>` : ''}
      ${ig ? `<p style="font:600 13px system-ui;margin:12px 0 4px">Instagram caption</p><pre style="white-space:pre-wrap;font:13px system-ui;background:#f9fafb;padding:10px;border-radius:8px;margin:0">${esc2(ig.caption)}</pre>` : ''}
      ${thread.length ? `<p style="font:600 13px system-ui;margin:12px 0 4px">X thread (${thread.length} tweets)</p>${thread.map((t, i) => `<pre style="white-space:pre-wrap;font:13px system-ui;background:#f9fafb;padding:10px;border-radius:8px;margin:0 0 6px">${i + 1}/ ${esc2(t)}</pre>`).join('')}` : ''}
    </div>`;
  }).join('');
  const html = `<div style="max-width:640px;margin:0 auto;font:14px system-ui;color:#111827">
    <h2 style="margin:0 0 4px">VEDD AI — today's post ideas</h2>
    <p style="margin:0 0 18px;color:#6b7280">Faceless Instagram + X, built from the engine's real numbers (percentages only). Copy, post, done. Manage drafts at <a href="${SITE()}/social-queue">${SITE()}/social-queue</a>.</p>
    ${blocks}
    <p style="color:#9ca3af;font-size:12px">${esc2(RISK)}</p></div>`;
  const { sendPersonaContentEmail } = await import('./persona-content-engine');
  const r = await sendPersonaContentEmail(`VEDD AI post ideas — ${new Date().toISOString().slice(0, 10)} (${byKind.size})`, html);
  if (r.success) await setState('social_email', 'last_id', { id: Math.max(...rows.map((x: any) => Number(x.id))), at: Date.now() });
  return { sent: !!r.success, count: byKind.size, note: r.success ? 'sent' : (r.reason || 'send failed') };
}

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
      if (h === 0) await snapshotChallengeEquity(); // 00:xx UTC equity for the challenge post
      // Morning email with today's post ideas (SOCIAL_EMAIL_HOUR_UTC, default 11 = ~7am US Eastern).
      if (h === Number(process.env.SOCIAL_EMAIL_HOUR_UTC ?? 11) && process.env.SOCIAL_MORNING_EMAIL !== 'off') {
        const today = new Date().toISOString().slice(0, 10);
        const sentDay = (await getState('social_email', 'day'))?.day;
        if (sentDay !== today) {
          const r = await sendMorningSocialEmail();
          await setState('social_email', 'day', { day: today, note: r.note });
          console.log(`[social] morning email: ${r.note} (${r.count} post sets)`);
        }
      }
    } catch (e: any) { console.error('[social] tick failed (non-fatal):', e?.message || e); }
  };
  setInterval(tick, 60 * 60 * 1000);
  setTimeout(tick, 5 * 60 * 1000);
}

/** Build drafts without saving (diagnostics). */
export async function previewKind(kind: 'weekly_recap' | 'shadow_progress' | 'engine_insight' | 'challenge_daily'): Promise<{ draft: Draft | null; png?: Buffer }> {
  const d = kind === 'challenge_daily' ? await buildChallengeDaily() : kind === 'weekly_recap' ? await buildWeeklyRecap() : kind === 'shadow_progress' ? await buildShadowProgress() : await buildEngineInsight();
  return { draft: d, png: d ? await renderCard(d.card) : undefined };
}
