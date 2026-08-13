import { Link } from 'wouter';

/* /features — the real VEDD feature set, grouped, each with a symbol + a
   plain-English example of what it does. Content-only (global Header/Footer
   wrap it). Scoped under .vfx. */

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
.vfx .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px;transition:border-color .2s,transform .2s;display:flex;flex-direction:column}
.vfx .card:hover{border-color:rgba(255,59,52,.35);transform:translateY(-2px)}
.vfx .card.star{border-color:rgba(255,59,52,.45);background:linear-gradient(160deg,#1a1113,var(--card))}
.vfx .card .ic{font-size:24px;width:46px;height:46px;border-radius:13px;background:rgba(255,59,52,.1);border:1px solid rgba(255,59,52,.2);display:grid;place-items:center;margin-bottom:14px;line-height:1}
.vfx .card.star .ic{background:rgba(245,196,81,.12);border-color:rgba(245,196,81,.3)}
.vfx .card .bd{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.vfx .card h3{font-size:1.1rem;font-weight:700;margin:0}
.vfx .card .nb{font:700 9px var(--mono);text-transform:uppercase;letter-spacing:.12em;color:#fff;background:var(--red);padding:3px 7px;border-radius:999px}
.vfx .card p{color:var(--tx2);font-size:.95rem;margin:0;line-height:1.6}
.vfx .card .ex{margin-top:14px;padding-top:12px;border-top:1px solid var(--line);font-size:.86rem;color:var(--tx3);line-height:1.55}
.vfx .card .ex b{display:block;color:var(--red);font:700 10px var(--mono);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
.vfx .card.star .ex b{color:var(--gold)}
.vfx .cta{text-align:center;padding:56px 0 70px}
.vfx .btn{display:inline-block;font:700 16px inherit;color:#fff;background:linear-gradient(150deg,var(--red),#B4160D);
  border:none;padding:15px 32px;border-radius:999px;cursor:pointer;text-decoration:none;box-shadow:0 10px 34px rgba(255,59,52,.34)}
.vfx .sub-links{margin-top:16px;color:var(--tx3);font-size:.95rem}
.vfx .sub-links a{color:var(--tx2)}
@media(max-width:760px){.vfx .grid{grid-template-columns:1fr}}
`;

type Item = { icon: string; name: string; desc: string; ex: string; badge?: string; star?: boolean };

const GROUPS: { group: string; items: Item[] }[] = [
  {
    group: 'The AI engine & brain',
    items: [
      { icon: '🧠', name: 'VEDD SS AI Brain Engine', star: true, desc: 'The self-learning brain behind your trades — it grades every win and loss and gets sharper over time.', ex: 'After 20 EUR/USD trades it notices you win most on London-session breakouts and starts favoring them.' },
      { icon: '⚡', name: 'Live Trading Engine (Forex)', star: true, desc: 'Runs your strategy around the clock, takes the trades and manages them hands-off.', ex: 'You set a weekly target and it places and manages the forex trades to hit it while you’re at work.' },
      { icon: '📐', name: 'Pattern recognition', desc: 'Identifies chart patterns and technical indicators with advanced AI analysis.', ex: 'Flags a head-and-shoulders forming on GBP/JPY before it fully completes.' },
      { icon: '🎯', name: 'Price predictions', desc: 'Accurate entry/exit points, stop-loss levels and potential profit targets.', ex: '“Enter 1.0850, stop 1.0820, target 1.0910.”' },
      { icon: '⏱️', name: 'Instant analysis', desc: 'Upload a chart and get a comprehensive read in seconds.', ex: 'Screenshot any chart, get a full breakdown in about two seconds.' },
      { icon: '⚖️', name: 'Deep Reasoning Mode', desc: 'A Bull / Bear / Veteran-Judge AI debate weighs both sides before a call.', ex: 'A bull and a bear AI argue the setup, then a judge picks the stronger case.' },
      { icon: '🤝', name: 'Multi-agent AI consensus', desc: 'Several models agree before the engine acts — no single point of failure.', ex: 'Three models must all agree before a trade is taken.' },
      { icon: '📈', name: 'Trailing Stop AI', desc: 'Nine dynamic trailing-stop methods to protect and ride winners.', ex: 'Locks in profit as XAU/USD runs, trailing just behind the move.' },
    ],
  },
  {
    group: 'ABBA — your personal AI',
    items: [
      { icon: '🤖', name: 'ABBA AI assistant', badge: 'NEW', star: true, desc: 'Your JARVIS for trading — monitors live P&L, weekly-goal progress, open positions and pair strategy, advising you like a personal fund manager.', ex: '“You’re $120 from your weekly goal — one clean NAS100 setup should do it.”' },
      { icon: '🎯', name: 'Goal intelligence', desc: 'Auto-adjusts lot sizes to keep you on pace for your weekly target.', ex: 'Shrinks your lot size after a loss to protect the goal, grows it when you’re ahead.' },
      { icon: '🗣️', name: 'Natural-language weekly plans', desc: 'Describe your week in plain English and ABBA builds the plan.', ex: '“Trade EUR/USD and gold, aim for $500” turns into a full day-by-day plan.' },
    ],
  },
  {
    group: 'Expert Advisors & automation',
    items: [
      { icon: '🏗️', name: 'EA generator', desc: 'Build Expert Advisors for MT5, TradingView, TradeLocker and NinjaTrader 8.', ex: 'Turn your strategy into a ready-to-load MT5 EA in a click.' },
      { icon: '📊', name: 'Futures EA generator', desc: 'Generate futures EAs for NQ, ES, YM, GC and CL.', ex: 'Spin up an NQ scalping EA without writing code.' },
      { icon: '🪜', name: '4-Stage entry system', desc: 'HTF trend → pattern scoring → LTF timing → smart order type, for precision entries.', ex: 'Only enters when trend, pattern, timing and order type all line up.' },
      { icon: '🌊', name: 'Choppy market filter', desc: 'Auto-pauses in ranging markets using ADX/ATR and resumes when trends develop.', ex: 'Stops trading while GBP/USD chops sideways, resumes once a trend forms.' },
      { icon: '🔁', name: 'MT5 trade copier EA', desc: 'Copy trades from MetaTrader 5 to TradeLocker and other platforms.', ex: 'Mirror every MT5 trade to your TradeLocker account automatically.' },
      { icon: '🔗', name: 'Webhook signal system', desc: 'Send signals to TradeLocker, TradingView or custom endpoints automatically.', ex: 'Fire a signal to TradingView the moment an analysis completes.' },
      { icon: '👥', name: 'Copy trading', desc: 'Paper and real-broker execution with built-in safety gates.', ex: 'Follow a proven strategy with drawdown limits protecting your account.' },
      { icon: '🌅', name: 'ORB breakout engine', desc: 'An opening-range breakout strategy engine, automated.', ex: 'Auto-trades the opening-range breakout at each session open.' },
    ],
  },
  {
    group: 'Markets & scanners',
    items: [
      { icon: '🪙', name: 'BTC prediction & Kalshi auto-trader', badge: 'NEW', star: true, desc: 'A live 5-minute Bitcoin call you can legally auto-trade on Kalshi, a CFTC-regulated US exchange. Paper mode, then live.', ex: 'A 5-min BTC BUY at 82% confidence gets auto-placed on Kalshi for you.' },
      { icon: '🔍', name: 'Solana token scanner', desc: 'AI scans trending Solana tokens for buy/sell signals — auto-trade via Phantom + Jupiter.', ex: 'Spots a trending Solana token and buys it through Jupiter automatically.' },
      { icon: '☀️', name: 'Sol Engine', desc: 'Paper and live trading for Solana strategies.', ex: 'Runs your Solana strategy in paper first, then live when you’re ready.' },
      { icon: '🎲', name: 'Polymarket prediction engine', desc: 'BTC/ETH prediction-market signals.', ex: 'A BTC up-or-down signal ready for Polymarket.' },
      { icon: '📡', name: 'Futures AI live feed', desc: 'A live NQ/ES/YM/GC/CL scanner.', ex: 'Live NQ and ES signals streaming as the session moves.' },
    ],
  },
  {
    group: 'Rewards, learning & community',
    items: [
      { icon: '💰', name: 'Brain Data Marketplace', star: true, desc: 'Buy a proven AI brain to start fast, or sell yours and earn VEDD every time it is used.', ex: 'Sell your 71%-win brain and earn VEDD each time a new trader plugs it in.' },
      { icon: '🎁', name: 'VEDD token rewards', desc: 'Earn VEDD for analyses, EA creations and contributions, with automatic Solana wallet transfers.', ex: 'Earn VEDD for every chart you analyze — sent straight to your wallet.' },
      { icon: '🔥', name: 'XP & streak system', desc: 'Level up from YG to OG through five tiers and compete on leaderboards.', ex: 'Trade daily to climb from Young Gun to OG and top the leaderboard.' },
      { icon: '🎓', name: '44-Day Ambassador Training', desc: 'Interactive training blending trading education with biblical wisdom, with certifications.', ex: 'A daily lesson and quiz that builds toward a real certification.' },
      { icon: '🤝', name: 'Referral Hub', desc: 'Earn credits and VEDD for every trader you bring in.', ex: 'A friend subscribes with your link — you earn recurring credits.' },
      { icon: '🔮', name: 'What-If scenarios', desc: 'Test price targets, stops and conditions with probability and risk before trading.', ex: '“What if I move my stop 10 pips?” — see the odds before you commit.' },
      { icon: '📓', name: 'Paper Trade AI Journal', desc: 'Auto-resolving journal that logs and grades your paper trades.', ex: 'Logs your practice trades and grades each one for you automatically.' },
      { icon: '👕', name: 'NFC Wear-to-Earn', desc: 'Tap-to-earn VEDD rewards from VEDD clothing.', ex: 'Tap your VEDD hoodie to your phone to claim rewards.' },
    ],
  },
  {
    group: 'Build your business',
    items: [
      { icon: '🏦', name: 'Business Credit Builder', desc: 'A guided 6-phase path to building business credit.', ex: 'Walks you from EIN to fundable business credit, step by step.' },
      { icon: '🏢', name: 'Business Builder', desc: 'Formation, banking and funding, step by step.', ex: 'Form your LLC, open business banking and line up funding in one place.' },
      { icon: '💵', name: 'Grants Hub', desc: 'Discover grants across SBA, NSF, CDFI and Google.org.', ex: 'Matched to SBA and CDFI grants you actually qualify for.' },
      { icon: '🌍', name: 'Community Impact Dashboard', desc: 'Track the impact your trading and community activity create.', ex: 'See the real-world impact your activity has generated.' },
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
          <p className="lead">From reading a single chart to running your whole strategy — here's everything VEDD's AI does, with an example of each.</p>
        </div>

        {GROUPS.map((g) => (
          <div className="grp" key={g.group}>
            <div className="gh"><span className="gt">{g.group}</span><span className="gl" /></div>
            <div className="grid">
              {g.items.map((it) => (
                <div className={`card${it.star ? ' star' : ''}`} key={it.name}>
                  <div className="ic" aria-hidden="true">{it.icon}</div>
                  <div className="bd"><h3>{it.name}</h3>{it.badge && <span className="nb">{it.badge}</span>}</div>
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
