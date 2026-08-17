import { Link } from 'wouter';

/* /pricing — clean marketing pricing page using the real plan bullets.
   Free -> /auth; paid tiers -> /subscription (existing checkout).
   Content-only (global Header/Footer wrap it). Scoped under .vpx. */

const CSS = `
.vpx{--bg:#0B0B0E;--card:#151619;--line:rgba(255,255,255,.08);--tx:#F4F5F6;--tx2:#9BA1A9;--tx3:#5B616B;
  --red:#FF3B34;--gold:#F5C451;--mono:ui-monospace,"SF Mono",Menlo,monospace;
  background:var(--bg);color:var(--tx);min-height:100vh;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.vpx .shell{max-width:1120px;margin:0 auto;padding:0 22px}
.vpx .hd{padding:64px 0 8px;text-align:center}
.vpx .kicker{font:600 12px var(--mono);text-transform:uppercase;letter-spacing:.22em;color:var(--red);margin-bottom:14px}
.vpx h1{font-size:clamp(2.2rem,5.5vw,3.4rem);letter-spacing:-.03em;font-weight:850;margin:0 0 14px}
.vpx .lead{color:var(--tx2);max-width:58ch;margin:0 auto;font-size:1.08rem}
.vpx .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:44px;align-items:start}
.vpx .plan{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px;position:relative}
.vpx .plan.pop{border-color:rgba(255,59,52,.5);background:linear-gradient(180deg,#1a1113,var(--card))}
.vpx .plan.best{border-color:rgba(245,196,81,.4)}
.vpx .badge{position:absolute;top:-11px;left:22px;font:700 10px var(--mono);text-transform:uppercase;letter-spacing:.12em;color:#fff;background:var(--red);padding:4px 11px;border-radius:999px}
.vpx .plan.best .badge{background:var(--gold);color:#241a02}
.vpx .pn{font:700 12px var(--mono);text-transform:uppercase;letter-spacing:.16em;color:var(--tx2)}
.vpx .pp{font:800 2.1rem/1 inherit;letter-spacing:-.02em;margin:12px 0 2px}
.vpx .pp small{font:600 .8rem var(--mono);color:var(--tx3)}
.vpx .btn{display:block;text-align:center;width:100%;margin:18px 0 6px;font:700 14px inherit;padding:12px;border-radius:999px;cursor:pointer;text-decoration:none;border:1px solid var(--line2,rgba(255,255,255,.14));color:var(--tx);background:transparent;transition:.2s}
.vpx .btn:hover{border-color:var(--red)}
.vpx .btn.solid{background:linear-gradient(150deg,var(--red),#B4160D);border:none;color:#fff;box-shadow:0 10px 30px rgba(255,59,52,.3)}
.vpx ul{list-style:none;padding:0;margin:16px 0 0;display:flex;flex-direction:column;gap:9px}
.vpx li{color:var(--tx2);font-size:.86rem;display:flex;gap:9px;align-items:flex-start;line-height:1.45}
.vpx li::before{content:"✓";color:var(--red);font-weight:800;flex-shrink:0}
.vpx .note{text-align:center;color:var(--tx3);font-size:.9rem;margin-top:26px}
.vpx .note a{color:var(--tx2)}
.vpx .cta{text-align:center;padding:52px 0 70px}
.vpx .psplit{margin-top:24px;background:linear-gradient(160deg,#1a1710,var(--card));border:1px solid rgba(245,196,81,.3);border-radius:18px;padding:28px;text-align:center}
.vpx .psplit .pn{color:var(--gold)}
.vpx .psplit h2{font-size:1.6rem;margin:8px 0}
.vpx .psplit p{color:var(--tx2);max-width:60ch;margin:0 auto}
@media(max-width:920px){.vpx .grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.vpx .grid{grid-template-columns:1fr}}
`;

type Plan = { name: string; price: string; per: string; cls?: string; badge?: string; cta: string; href: string; solid?: boolean; feats: string[] };

const PLANS: Plan[] = [
  { name: 'Free', price: '$0', per: '/forever', cta: 'Start free', href: '/auth', feats: [
    '3 chart analyses per month', 'AI pattern recognition', 'Basic entry & exit signals',
    'Support & resistance levels', '2 social shares per month', 'Community access',
  ] },
  { name: 'Starter', price: '$49.95', per: '/mo', cta: 'Choose Starter', href: '/subscription', feats: [
    'ABBA AI personal assistant', '50 chart analyses per month', 'Multi-timeframe analysis',
    'EA generator — MT5, TradingView, TradeLocker, NinjaTrader 8', 'Futures EA generator (NQ/ES/YM/GC/CL)',
    'Weekly AI trading strategy', 'What-If scenario modeling', 'News & economic event alerts',
    'Signal webhooks', 'VEDD SS AI Brain Engine', 'Paper Trade AI Journal',
    'Brain Data Marketplace', 'Achievements, streaks & XP', 'Ambassador Training & 44-Day Journey',
    'Referral Hub', 'Bring Your Own AI Key (BYOK)', '25 social shares per month',
  ] },
  { name: 'Premium', price: '$149.99', per: '/mo', cls: 'pop', badge: 'Most popular', cta: 'Choose Premium', href: '/subscription', solid: true, feats: [
    'ABBA AI assistant (full context)', 'Unlimited chart analyses', 'Everything in Starter',
    'VEDD Live Trading Engine (Forex)', 'Trailing Stop AI — 9 methods',
    'Copy Trading — paper & real-broker with safety gates', 'Automatic trade logging (TradeLocker/MT5)',
    'Deep Reasoning Mode — Bull/Bear/Judge debate', 'Prop Firm Consistency Toolkit',
    'ORB Breakout Strategy Engine', 'Futures AI live feed', 'Solana scanner + auto-trade',
    'Sol Engine — paper & live', 'Polymarket prediction engine (BTC/ETH)',
    'Business Credit Builder & Business Builder', 'Grants Hub', 'Multi-agent AI consensus',
    'Bring Your Own AI Key (BYOK)', 'Unlimited social shares',
  ] },
  { name: 'Yearly', price: '$999.99', per: '/yr', cls: 'best', badge: 'Best value', cta: 'Choose Yearly', href: '/subscription', feats: [
    'Everything in Premium — yearly renewal', 'Business Credit Builder + Biz Builder', 'Grants Hub',
    'Copy Trading — paper & real-broker', 'Deep Reasoning + Prop Firm Toolkit', 'ORB Breakout Engine',
    'Polymarket prediction engine', 'NFC Wear-to-Earn VEDD clothing rewards', 'Innovation Lab (beta)',
    'All future feature updates', 'Early access to beta features', 'Priority support', 'Transferable membership',
  ] },
];

export default function PricingPage() {
  return (
    <div className="vpx">
      <style>{CSS}</style>
      <div className="shell">
        <div className="hd">
          <div className="kicker">Plans</div>
          <h1>Simple, transparent pricing.</h1>
          <p className="lead">Start free. Upgrade when the engine is paying off. One subscription, no hidden fees — pay with card, VEDD tokens, or ambassador credits.</p>
        </div>

        <div className="grid">
          {PLANS.map((p) => (
            <div className={`plan ${p.cls || ''}`} key={p.name}>
              {p.badge && <span className="badge">{p.badge}</span>}
              <div className="pn">{p.name}</div>
              <div className="pp">{p.price}<small>{p.per}</small></div>
              <Link href={p.href} className={`btn${p.solid ? ' solid' : ''}`}>{p.cta}</Link>
              <ul>{p.feats.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          ))}
        </div>

        <div className="psplit">
          <div className="pn">Ambassador Profit Split</div>
          <h2>No subscription? Trade on a profit split.</h2>
          <p>Serious about a prop-firm account? Get full VEDD access with <b>$0 up front</b> — VEDD takes <b>30% of your net prop-firm profit</b>, and only when you're profitable. Ask your VEDD ambassador (or support) to enroll you.</p>
          <Link href="/auth" className="btn solid" style={{ display: 'inline-block', width: 'auto', padding: '13px 28px', marginTop: 16 }}>Get started free</Link>
        </div>

        <p className="note">Pay with card, VEDD tokens, or ambassador credits at checkout · <Link href="/features">See every feature →</Link></p>

        <div className="cta">
          <Link href="/auth" className="btn solid" style={{ display: 'inline-block', width: 'auto', padding: '15px 32px' }}>Start free — no card</Link>
        </div>
      </div>
    </div>
  );
}
