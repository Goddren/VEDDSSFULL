import { Link } from 'wouter';

/* /features — real VEDD features, grouped. Each card has: a symbol, a small
   inline-SVG visual of what the feature produces, and a plain-English Example.
   Content-only (global Header/Footer wrap it). Scoped under .vfx. */

const CSS = `
.vfx{--bg:#0B0B0E;--card:#151619;--ink:#0e0f12;--line:rgba(255,255,255,.08);--tx:#F4F5F6;--tx2:#9BA1A9;--tx3:#5B616B;
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
.vfx .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;transition:border-color .2s,transform .2s;display:flex;flex-direction:column}
.vfx .card:hover{border-color:rgba(255,59,52,.35);transform:translateY(-2px)}
.vfx .card.star{border-color:rgba(255,59,52,.45);background:linear-gradient(160deg,#1a1113,var(--card))}
.vfx .vis{background:var(--ink);border:1px solid var(--line);border-radius:11px;height:58px;display:flex;align-items:center;padding:0 12px;margin-bottom:14px;overflow:hidden}
.vfx .vis svg{display:block}
.vfx .bd{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.vfx .bd .em{font-size:18px;line-height:1}
.vfx .card h3{font-size:1.08rem;font-weight:700;margin:0}
.vfx .card .nb{font:700 9px var(--mono);text-transform:uppercase;letter-spacing:.12em;color:#fff;background:var(--red);padding:3px 7px;border-radius:999px}
.vfx .card p{color:var(--tx2);font-size:.94rem;margin:0;line-height:1.6}
.vfx .card .ex{margin-top:12px;padding-top:11px;border-top:1px solid var(--line);font-size:.85rem;color:var(--tx3);line-height:1.55}
.vfx .card .ex b{display:block;color:var(--red);font:700 10px var(--mono);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
.vfx .card.star .ex b{color:var(--gold)}
.vfx .cta{text-align:center;padding:56px 0 70px}
.vfx .btn{display:inline-block;font:700 16px inherit;color:#fff;background:linear-gradient(150deg,var(--red),#B4160D);
  border:none;padding:15px 32px;border-radius:999px;cursor:pointer;text-decoration:none;box-shadow:0 10px 34px rgba(255,59,52,.34)}
.vfx .sub-links{margin-top:16px;color:var(--tx3);font-size:.95rem}
.vfx .sub-links a{color:var(--tx2)}
@media(max-width:760px){.vfx .grid{grid-template-columns:1fr}}
`;

/* ── Mini visuals — a "here's what it produces" preview per feature type ── */
const Chart = () => {
  const bars: [number, number, number, string][] = [[6,20,16,'#27D07C'],[20,26,10,'#FF3B34'],[34,14,22,'#27D07C'],[48,22,12,'#27D07C'],[62,26,10,'#FF3B34'],[76,12,24,'#27D07C'],[90,18,16,'#27D07C'],[104,24,10,'#FF3B34'],[118,10,26,'#27D07C'],[132,15,19,'#27D07C']];
  return (
    <svg viewBox="0 0 150 44" width="150" height="44" aria-hidden="true">
      <polyline points="9,22 23,30 37,17 51,24 65,29 79,15 93,20 107,26 121,13 135,17" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="1" />
      {bars.map((b, i) => <rect key={i} x={b[0]} y={b[1]} width="7" height={b[2]} rx="1.5" fill={b[3]} opacity="0.9" />)}
    </svg>
  );
};
const Verdict = () => (
  <svg viewBox="0 0 210 40" width="210" height="40" aria-hidden="true">
    <rect x="2" y="8" width="206" height="26" rx="8" fill="none" stroke="rgba(39,208,124,.4)" />
    <text x="14" y="26" fill="#27D07C" fontSize="14" fontWeight="800" fontFamily="sans-serif">BUY</text>
    <text x="52" y="26" fill="#9BA1A9" fontSize="11" fontFamily="monospace">82%</text>
    <rect x="86" y="17" width="108" height="7" rx="3.5" fill="rgba(255,255,255,.1)" />
    <rect x="86" y="17" width="88" height="7" rx="3.5" fill="#27D07C" />
  </svg>
);
const Brain = () => {
  const pts: [number, number][] = [[16,32],[48,27],[80,23],[112,16],[150,12]];
  return (
    <svg viewBox="0 0 210 44" width="210" height="44" aria-hidden="true">
      <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="#FF3B34" strokeWidth="1.5" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="#FF3B34" />)}
      <text x="120" y="38" fill="#5B616B" fontSize="10" fontFamily="monospace">win-rate ↑</text>
    </svg>
  );
};
const Progress = () => (
  <svg viewBox="0 0 210 40" width="210" height="40" aria-hidden="true">
    <text x="2" y="12" fill="#5B616B" fontSize="9" fontFamily="monospace">WEEKLY GOAL</text>
    <rect x="2" y="20" width="160" height="8" rx="4" fill="rgba(255,255,255,.1)" />
    <rect x="2" y="20" width="115" height="8" rx="4" fill="#FF3B34" />
    <text x="172" y="27" fill="#9BA1A9" fontSize="11" fontFamily="monospace">72%</text>
  </svg>
);
const Flow = () => (
  <svg viewBox="0 0 210 40" width="210" height="40" aria-hidden="true">
    {[6, 84, 162].map((x, i) => <rect key={i} x={x} y="12" width="42" height="18" rx="5" fill="none" stroke="rgba(255,59,52,.4)" />)}
    <text x="27" y="24" fill="#9BA1A9" fontSize="9" fontFamily="monospace" textAnchor="middle">signal</text>
    <text x="105" y="24" fill="#9BA1A9" fontSize="9" fontFamily="monospace" textAnchor="middle">rules</text>
    <text x="183" y="24" fill="#27D07C" fontSize="9" fontFamily="monospace" textAnchor="middle">trade</text>
    <line x1="50" y1="21" x2="82" y2="21" stroke="#5B616B" strokeWidth="1.3" /><polygon points="82,21 77,18 77,24" fill="#5B616B" />
    <line x1="128" y1="21" x2="160" y2="21" stroke="#5B616B" strokeWidth="1.3" /><polygon points="160,21 155,18 155,24" fill="#5B616B" />
  </svg>
);
const Coin = () => (
  <svg viewBox="0 0 210 40" width="210" height="40" aria-hidden="true">
    <circle cx="24" cy="20" r="12" fill="#caa02f" /><circle cx="14" cy="20" r="12" fill="#F5C451" />
    <text x="14" y="24" fill="#241a02" fontSize="11" fontWeight="800" fontFamily="sans-serif" textAnchor="middle">V</text>
    <text x="48" y="25" fill="#F5C451" fontSize="16" fontWeight="800" fontFamily="sans-serif">+250 VEDD</text>
  </svg>
);
const Radar = () => (
  <svg viewBox="0 0 210 44" width="210" height="44" aria-hidden="true">
    <circle cx="24" cy="22" r="17" fill="none" stroke="rgba(255,255,255,.12)" /><circle cx="24" cy="22" r="9" fill="none" stroke="rgba(255,255,255,.1)" />
    <path d="M24 22 L41 13 A17 17 0 0 0 24 5 Z" fill="rgba(255,59,52,.25)" />
    <circle cx="35" cy="15" r="2.5" fill="#27D07C" /><circle cx="17" cy="30" r="2.5" fill="#FF3B34" />
    <text x="52" y="26" fill="#5B616B" fontSize="10" fontFamily="monospace">scanning tokens…</text>
  </svg>
);
const Checks = () => (
  <svg viewBox="0 0 210 46" width="210" height="46" aria-hidden="true">
    {[[8, 90, true], [22, 74, true], [36, 60, false]].map(([y, w, done], i) => (
      <g key={i}>
        <circle cx="8" cy={y as number} r="5" fill={done ? '#27D07C' : 'rgba(255,255,255,.12)'} />
        {done && <path d={`M5.5 ${y} l2 2 l3.5 -4`} stroke="#0e0f12" strokeWidth="1.4" fill="none" />}
        <rect x="20" y={(y as number) - 3} width={w as number} height="5" rx="2.5" fill="rgba(255,255,255,.12)" />
      </g>
    ))}
  </svg>
);

const VIS: Record<string, JSX.Element> = {
  chart: <Chart />, verdict: <Verdict />, brain: <Brain />, progress: <Progress />,
  flow: <Flow />, coin: <Coin />, radar: <Radar />, checks: <Checks />,
};

type Item = { icon: string; vis: string; name: string; desc: string; ex: string; badge?: string; star?: boolean };

const GROUPS: { group: string; items: Item[] }[] = [
  {
    group: 'The AI engine & brain',
    items: [
      { icon: '🧠', vis: 'brain', name: 'VEDD SS AI Brain Engine', star: true, desc: 'The self-learning brain behind your trades — it grades every win and loss and gets sharper over time.', ex: 'After 20 EUR/USD trades it notices you win most on London-session breakouts and starts favoring them.' },
      { icon: '⚡', vis: 'chart', name: 'Live Trading Engine (Forex)', star: true, desc: 'Runs your strategy around the clock, takes the trades and manages them hands-off.', ex: 'You set a weekly target and it places and manages the forex trades to hit it while you’re at work.' },
      { icon: '📐', vis: 'chart', name: 'Pattern recognition', desc: 'Identifies chart patterns and technical indicators with advanced AI analysis.', ex: 'Flags a head-and-shoulders forming on GBP/JPY before it fully completes.' },
      { icon: '🎯', vis: 'verdict', name: 'Price predictions', desc: 'Accurate entry/exit points, stop-loss levels and potential profit targets.', ex: '“Enter 1.0850, stop 1.0820, target 1.0910.”' },
      { icon: '⏱️', vis: 'chart', name: 'Instant analysis', desc: 'Upload a chart and get a comprehensive read in seconds.', ex: 'Screenshot any chart, get a full breakdown in about two seconds.' },
      { icon: '⚖️', vis: 'verdict', name: 'Deep Reasoning Mode', desc: 'A Bull / Bear / Veteran-Judge AI debate weighs both sides before a call.', ex: 'A bull and a bear AI argue the setup, then a judge picks the stronger case.' },
      { icon: '🤝', vis: 'verdict', name: 'Multi-agent AI consensus', desc: 'Several models agree before the engine acts — no single point of failure.', ex: 'Three models must all agree before a trade is taken.' },
      { icon: '📈', vis: 'chart', name: 'Trailing Stop AI', desc: 'Nine dynamic trailing-stop methods to protect and ride winners.', ex: 'Locks in profit as XAU/USD runs, trailing just behind the move.' },
    ],
  },
  {
    group: 'ABBA — your personal AI',
    items: [
      { icon: '🤖', vis: 'verdict', name: 'ABBA AI assistant', badge: 'NEW', star: true, desc: 'Your JARVIS for trading — monitors live P&L, weekly-goal progress, open positions and pair strategy, advising you like a personal fund manager.', ex: '“You’re $120 from your weekly goal — one clean NAS100 setup should do it.”' },
      { icon: '🎯', vis: 'progress', name: 'Goal intelligence', desc: 'Auto-adjusts lot sizes to keep you on pace for your weekly target.', ex: 'Shrinks your lot size after a loss to protect the goal, grows it when you’re ahead.' },
      { icon: '🗣️', vis: 'checks', name: 'Natural-language weekly plans', desc: 'Describe your week in plain English and ABBA builds the plan.', ex: '“Trade EUR/USD and gold, aim for $500” turns into a full day-by-day plan.' },
    ],
  },
  {
    group: 'Expert Advisors & automation',
    items: [
      { icon: '🏗️', vis: 'flow', name: 'EA generator', desc: 'Build Expert Advisors for MT5, TradingView, TradeLocker and NinjaTrader 8.', ex: 'Turn your strategy into a ready-to-load MT5 EA in a click.' },
      { icon: '📊', vis: 'flow', name: 'Futures EA generator', desc: 'Generate futures EAs for NQ, ES, YM, GC and CL.', ex: 'Spin up an NQ scalping EA without writing code.' },
      { icon: '🪜', vis: 'flow', name: '4-Stage entry system', desc: 'HTF trend → pattern scoring → LTF timing → smart order type, for precision entries.', ex: 'Only enters when trend, pattern, timing and order type all line up.' },
      { icon: '🌊', vis: 'chart', name: 'Choppy market filter', desc: 'Auto-pauses in ranging markets using ADX/ATR and resumes when trends develop.', ex: 'Stops trading while GBP/USD chops sideways, resumes once a trend forms.' },
      { icon: '🔁', vis: 'flow', name: 'MT5 trade copier EA', desc: 'Copy trades from MetaTrader 5 to TradeLocker and other platforms.', ex: 'Mirror every MT5 trade to your TradeLocker account automatically.' },
      { icon: '🔗', vis: 'flow', name: 'Webhook signal system', desc: 'Send signals to TradeLocker, TradingView or custom endpoints automatically.', ex: 'Fire a signal to TradingView the moment an analysis completes.' },
      { icon: '👥', vis: 'flow', name: 'Copy trading', desc: 'Paper and real-broker execution with built-in safety gates.', ex: 'Follow a proven strategy with drawdown limits protecting your account.' },
      { icon: '🌅', vis: 'chart', name: 'ORB breakout engine', desc: 'An opening-range breakout strategy engine, automated.', ex: 'Auto-trades the opening-range breakout at each session open.' },
    ],
  },
  {
    group: 'Markets & scanners',
    items: [
      { icon: '🪙', vis: 'verdict', name: 'BTC prediction & Kalshi auto-trader', badge: 'NEW', star: true, desc: 'A live 5-minute Bitcoin call you can legally auto-trade on Kalshi, a CFTC-regulated US exchange. Paper mode, then live.', ex: 'A 5-min BTC BUY at 82% confidence gets auto-placed on Kalshi for you.' },
      { icon: '🔍', vis: 'radar', name: 'Solana token scanner', desc: 'AI scans trending Solana tokens for buy/sell signals — auto-trade via Phantom + Jupiter.', ex: 'Spots a trending Solana token and buys it through Jupiter automatically.' },
      { icon: '☀️', vis: 'radar', name: 'Sol Engine', desc: 'Paper and live trading for Solana strategies.', ex: 'Runs your Solana strategy in paper first, then live when you’re ready.' },
      { icon: '🎲', vis: 'verdict', name: 'Polymarket prediction engine', desc: 'BTC/ETH prediction-market signals.', ex: 'A BTC up-or-down signal ready for Polymarket.' },
      { icon: '📡', vis: 'chart', name: 'Futures AI live feed', desc: 'A live NQ/ES/YM/GC/CL scanner.', ex: 'Live NQ and ES signals streaming as the session moves.' },
    ],
  },
  {
    group: 'Rewards, learning & community',
    items: [
      { icon: '💰', vis: 'coin', name: 'Brain Data Marketplace', star: true, desc: 'Buy a proven AI brain to start fast, or sell yours and earn VEDD every time it is used.', ex: 'Sell your 71%-win brain and earn VEDD each time a new trader plugs it in.' },
      { icon: '🎁', vis: 'coin', name: 'VEDD token rewards', desc: 'Earn VEDD for analyses, EA creations and contributions, with automatic Solana wallet transfers.', ex: 'Earn VEDD for every chart you analyze — sent straight to your wallet.' },
      { icon: '🔥', vis: 'progress', name: 'XP & streak system', desc: 'Level up from YG to OG through five tiers and compete on leaderboards.', ex: 'Trade daily to climb from Young Gun to OG and top the leaderboard.' },
      { icon: '🎓', vis: 'progress', name: '44-Day Ambassador Training', desc: 'Interactive training blending trading education with biblical wisdom, with certifications.', ex: 'A daily lesson and quiz that builds toward a real certification.' },
      { icon: '🤝', vis: 'coin', name: 'Referral Hub', desc: 'Earn credits and VEDD for every trader you bring in.', ex: 'A friend subscribes with your link — you earn recurring credits.' },
      { icon: '🔮', vis: 'checks', name: 'What-If scenarios', desc: 'Test price targets, stops and conditions with probability and risk before trading.', ex: '“What if I move my stop 10 pips?” — see the odds before you commit.' },
      { icon: '📓', vis: 'checks', name: 'Paper Trade AI Journal', desc: 'Auto-resolving journal that logs and grades your paper trades.', ex: 'Logs your practice trades and grades each one for you automatically.' },
      { icon: '👕', vis: 'coin', name: 'NFC Wear-to-Earn', desc: 'Tap-to-earn VEDD rewards from VEDD clothing.', ex: 'Tap your VEDD hoodie to your phone to claim rewards.' },
    ],
  },
  {
    group: 'Build your business',
    items: [
      { icon: '🏦', vis: 'progress', name: 'Business Credit Builder', desc: 'A guided 6-phase path to building business credit.', ex: 'Walks you from EIN to fundable business credit, step by step.' },
      { icon: '🏢', vis: 'flow', name: 'Business Builder', desc: 'Formation, banking and funding, step by step.', ex: 'Form your LLC, open business banking and line up funding in one place.' },
      { icon: '💵', vis: 'checks', name: 'Grants Hub', desc: 'Discover grants across SBA, NSF, CDFI and Google.org.', ex: 'Matched to SBA and CDFI grants you actually qualify for.' },
      { icon: '🌍', vis: 'progress', name: 'Community Impact Dashboard', desc: 'Track the impact your trading and community activity create.', ex: 'See the real-world impact your activity has generated.' },
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
          <p className="lead">From reading a single chart to running your whole strategy — see everything VEDD's AI does, with a quick visual and example of each.</p>
        </div>

        {GROUPS.map((g) => (
          <div className="grp" key={g.group}>
            <div className="gh"><span className="gt">{g.group}</span><span className="gl" /></div>
            <div className="grid">
              {g.items.map((it) => (
                <div className={`card${it.star ? ' star' : ''}`} key={it.name}>
                  <div className="vis">{VIS[it.vis]}</div>
                  <div className="bd"><span className="em" aria-hidden="true">{it.icon}</span><h3>{it.name}</h3>{it.badge && <span className="nb">{it.badge}</span>}</div>
                  <p>{it.desc}</p>
                  <div className="ex"><b>Example</b>{it.ex}</div>
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
