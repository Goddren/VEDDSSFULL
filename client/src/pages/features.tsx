import { Link } from 'wouter';

/* /features — the real VEDD feature set, grouped and explained.
   Content-only (global Header/Footer wrap it). Scoped under .vfx. */

const CSS = `
.vfx{--bg:#0B0B0E;--card:#151619;--line:rgba(255,255,255,.08);--tx:#F4F5F6;--tx2:#9BA1A9;--tx3:#5B616B;
  --red:#FF3B34;--gold:#F5C451;--green:#27D07C;--mono:ui-monospace,"SF Mono",Menlo,monospace;
  background:var(--bg);color:var(--tx);min-height:100vh;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.vfx .shell{max-width:1080px;margin:0 auto;padding:0 22px}
.vfx .hd{padding:64px 0 20px;text-align:center}
.vfx .kicker{font:600 12px var(--mono);text-transform:uppercase;letter-spacing:.22em;color:var(--red);margin-bottom:14px}
.vfx h1{font-size:clamp(2.2rem,5.5vw,3.6rem);letter-spacing:-.03em;font-weight:850;margin:0 0 14px;text-wrap:balance}
.vfx .lead{color:var(--tx2);max-width:56ch;margin:0 auto;font-size:1.1rem}
.vfx .grp{padding:36px 0 8px}
.vfx .gh{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.vfx .gh .gt{font:800 1.5rem inherit;letter-spacing:-.01em}
.vfx .gh .gl{flex:1;height:1px;background:var(--line)}
.vfx .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.vfx .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px;transition:border-color .2s,transform .2s}
.vfx .card:hover{border-color:rgba(255,59,52,.35);transform:translateY(-2px)}
.vfx .card.star{border-color:rgba(255,59,52,.45);background:linear-gradient(160deg,#1a1113,var(--card))}
.vfx .card .bd{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.vfx .card h3{font-size:1.1rem;font-weight:700;margin:0}
.vfx .card .nb{font:700 9px var(--mono);text-transform:uppercase;letter-spacing:.12em;color:#fff;background:var(--red);padding:3px 7px;border-radius:999px}
.vfx .card p{color:var(--tx2);font-size:.95rem;margin:0;line-height:1.6}
.vfx .cta{text-align:center;padding:56px 0 70px}
.vfx .btn{display:inline-block;font:700 16px inherit;color:#fff;background:linear-gradient(150deg,var(--red),#B4160D);
  border:none;padding:15px 32px;border-radius:999px;cursor:pointer;text-decoration:none;box-shadow:0 10px 34px rgba(255,59,52,.34)}
.vfx .sub-links{margin-top:16px;color:var(--tx3);font-size:.95rem}
.vfx .sub-links a{color:var(--tx2)}
@media(max-width:760px){.vfx .grid{grid-template-columns:1fr}}
`;

const GROUPS: { group: string; items: { name: string; desc: string; badge?: string; star?: boolean }[] }[] = [
  {
    group: 'The AI engine & brain',
    items: [
      { name: 'VEDD SS AI Brain Engine', desc: 'The self-learning brain behind your trades — it grades every win and loss and gets sharper over time.', star: true },
      { name: 'VEDD Live Trading Engine (Forex)', desc: 'Runs your strategy around the clock, takes the trades and manages them hands-off.', star: true },
      { name: 'Pattern recognition', desc: 'Identifies chart patterns and technical indicators with advanced AI analysis.' },
      { name: 'Price predictions', desc: 'Accurate entry/exit points, stop-loss levels and potential profit targets.' },
      { name: 'Instant analysis', desc: 'Upload a chart and get a comprehensive read in seconds.' },
      { name: 'Deep Reasoning Mode', desc: 'A Bull / Bear / Veteran-Judge AI debate weighs both sides before a call.' },
      { name: 'Multi-agent AI consensus', desc: 'Several models agree before the engine acts — no single point of failure.' },
      { name: 'Trailing Stop AI', desc: 'Nine dynamic trailing-stop methods to protect and ride winners.' },
    ],
  },
  {
    group: 'ABBA — your personal AI',
    items: [
      { name: 'ABBA AI assistant', desc: 'Your JARVIS for trading — monitors live P&L, weekly-goal progress, open positions and pair strategy, advising you like a personal fund manager.', badge: 'NEW', star: true },
      { name: 'Goal intelligence', desc: 'Auto-adjusts lot sizes to keep you on pace for your weekly target.' },
      { name: 'Natural-language weekly plans', desc: 'Describe your week in plain English and ABBA builds the plan.' },
    ],
  },
  {
    group: 'Expert Advisors & automation',
    items: [
      { name: 'EA generator', desc: 'Build Expert Advisors for MT5, TradingView, TradeLocker and NinjaTrader 8.' },
      { name: 'Futures EA generator', desc: 'Generate futures EAs for NQ, ES, YM, GC and CL.' },
      { name: '4-Stage entry system', desc: 'HTF trend → pattern scoring → LTF timing → smart order type, for precision entries.' },
      { name: 'Choppy market filter', desc: 'Auto-pauses in ranging markets using ADX/ATR and resumes when trends develop.' },
      { name: 'MT5 trade copier EA', desc: 'Copy trades from MetaTrader 5 to TradeLocker and other platforms.' },
      { name: 'Webhook signal system', desc: 'Send signals to TradeLocker, TradingView or custom endpoints automatically.' },
      { name: 'Copy trading', desc: 'Paper and real-broker execution with built-in safety gates.' },
      { name: 'ORB breakout engine', desc: 'An opening-range breakout strategy engine, automated.' },
    ],
  },
  {
    group: 'Markets & scanners',
    items: [
      { name: 'BTC prediction & Kalshi auto-trader', desc: 'A live 5-minute Bitcoin call you can legally auto-trade on Kalshi, a CFTC-regulated US exchange. Paper mode, then live.', badge: 'NEW', star: true },
      { name: 'Solana token scanner', desc: 'AI scans trending Solana tokens for buy/sell signals — auto-trade via Phantom + Jupiter.' },
      { name: 'Sol Engine', desc: 'Paper and live trading for Solana strategies.' },
      { name: 'Polymarket prediction engine', desc: 'BTC/ETH prediction market signals.' },
      { name: 'Futures AI live feed', desc: 'A live NQ/ES/YM/GC/CL scanner.' },
    ],
  },
  {
    group: 'Rewards, learning & community',
    items: [
      { name: 'Brain Data Marketplace', desc: 'Buy a proven AI brain to start fast, or sell yours and earn VEDD every time it is used.', star: true },
      { name: 'VEDD token rewards', desc: 'Earn VEDD for analyses, EA creations and contributions, with automatic Solana wallet transfers.' },
      { name: 'XP & streak system', desc: 'Level up from YG to OG through five tiers and compete on leaderboards.' },
      { name: '44-Day Ambassador Training', desc: 'Interactive training blending trading education with biblical wisdom, with certifications.' },
      { name: 'Referral Hub', desc: 'Earn credits and VEDD for every trader you bring in.' },
      { name: 'What-If scenarios', desc: 'Test price targets, stops and conditions with probability and risk assessments before trading.' },
      { name: 'Paper Trade AI Journal', desc: 'Auto-resolving journal that logs and grades your paper trades.' },
      { name: 'NFC Wear-to-Earn', desc: 'Tap-to-earn VEDD rewards from VEDD clothing.' },
    ],
  },
  {
    group: 'Build your business',
    items: [
      { name: 'Business Credit Builder', desc: 'A guided 6-phase path to building business credit.' },
      { name: 'Business Builder', desc: 'Formation, banking and funding, step by step.' },
      { name: 'Grants Hub', desc: 'Discover grants across SBA, NSF, CDFI and Google.org.' },
      { name: 'Community Impact Dashboard', desc: 'Track the impact your trading and community activity create.' },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="vfx">
      <style>{CSS}</style>
      <div className="shell">
        <div className="hd">
          <div className="kicker">Everything inside the vault</div>
          <h1>One engine. One brain. Every tool.</h1>
          <p className="lead">From reading a single chart to running your whole strategy — here's everything VEDD's AI does for you.</p>
        </div>

        {GROUPS.map((g) => (
          <div className="grp" key={g.group}>
            <div className="gh"><span className="gt">{g.group}</span><span className="gl" /></div>
            <div className="grid">
              {g.items.map((it) => (
                <div className={`card${it.star ? ' star' : ''}`} key={it.name}>
                  <div className="bd"><h3>{it.name}</h3>{it.badge && <span className="nb">{it.badge}</span>}</div>
                  <p>{it.desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="cta">
          <Link href="/auth" className="btn">Start free — no card</Link>
          <div className="sub-links">Ready to compare plans? <Link href="/pricing">See pricing →</Link></div>
        </div>
      </div>
    </div>
  );
}
