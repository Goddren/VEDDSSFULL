import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import logoImage from '@/assets/IMG_3645.png';

/* VEDD landing — AI-first: the live engine + self-learning brain are the focus.
   Dark "vault terminal" look, VEDD red accent. All styles scoped under .vlx so
   they never collide with the global index.css utility classes. */

const CSS = `
.vlx{--bg:#0B0B0E;--bg2:#101114;--card:#151619;--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);
  --tx:#F4F5F6;--tx2:#9BA1A9;--tx3:#5B616B;--red:#FF3B34;--red-deep:#B4160D;--gold:#F5C451;--green:#27D07C;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  background:var(--bg);color:var(--tx);position:relative;overflow:hidden;min-height:100vh;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;line-height:1.6}
.vlx *{box-sizing:border-box}
.vlx::before{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.5;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E")}
.vlx .ember{position:fixed;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(480px 420px at var(--mx,72%) var(--my,14%),rgba(255,59,52,.16),transparent 70%),
    radial-gradient(700px 500px at 90% -5%,rgba(255,59,52,.10),transparent 60%),
    radial-gradient(600px 400px at 5% 105%,rgba(245,196,81,.05),transparent 60%);transition:background .3s ease}
.vlx .shell{position:relative;z-index:2;max-width:1080px;margin:0 auto;padding:0 22px}
.vlx nav{display:flex;align-items:center;justify-content:space-between;padding:20px 0;position:relative}
.vlx .brand img{height:30px;width:auto;display:block}
.vlx .menu{display:flex;align-items:center;gap:24px}
.vlx .ml{color:var(--tx2);font:600 14px inherit;text-decoration:none;transition:color .18s;cursor:pointer;background:none;border:none}
.vlx .ml:hover{color:#fff}
.vlx .ml-sign{color:var(--tx);padding:8px 14px;border:1px solid var(--line2);border-radius:999px}
.vlx .ml-sign:hover{border-color:var(--red)}
.vlx .burger{display:none;background:transparent;border:1px solid var(--line2);color:var(--tx);width:42px;height:42px;border-radius:12px;font-size:18px;cursor:pointer}
.vlx .nav-cta{font:600 13px inherit;color:var(--tx);background:transparent;border:1px solid var(--line2);padding:9px 18px;border-radius:999px;cursor:pointer;transition:.2s}
.vlx .nav-cta:hover{border-color:var(--red);color:#fff;box-shadow:0 0 24px rgba(255,59,52,.25)}
.vlx .hero{display:grid;grid-template-columns:1.05fr .95fr;gap:38px;align-items:center;padding:46px 0 70px}
.vlx .eyebrow{display:inline-flex;align-items:center;gap:8px;font:600 12px var(--mono);text-transform:uppercase;letter-spacing:.22em;color:var(--red);border:1px solid rgba(255,59,52,.3);background:rgba(255,59,52,.06);padding:6px 12px;border-radius:999px;margin-bottom:22px}
.vlx .eyebrow .dot{width:6px;height:6px;border-radius:50%;background:var(--red);box-shadow:0 0 10px var(--red);animation:vlblink 1.6s infinite}
@keyframes vlblink{50%{opacity:.35}}
.vlx h1{font-size:clamp(2.5rem,6.4vw,4.5rem);line-height:.98;letter-spacing:-.035em;font-weight:850;margin:0 0 20px;text-wrap:balance}
.vlx h1 .g{background:linear-gradient(120deg,#fff 30%,var(--red) 120%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.vlx .sub{font-size:1.12rem;color:var(--tx2);max-width:30ch;margin:0 0 30px}
.vlx .cta-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.vlx .btn-primary{font:700 16px inherit;color:#fff;background:linear-gradient(150deg,var(--red),var(--red-deep));border:none;padding:15px 30px;border-radius:999px;cursor:pointer;position:relative;box-shadow:0 10px 34px rgba(255,59,52,.34);transition:transform .15s ease,box-shadow .2s}
.vlx .btn-primary:hover{box-shadow:0 14px 46px rgba(255,59,52,.5)}
.vlx .btn-ghost{font:600 15px inherit;color:var(--tx);background:transparent;border:none;padding:15px 8px;cursor:pointer;display:inline-flex;gap:8px;align-items:center}
.vlx .btn-ghost .pl{width:30px;height:30px;border-radius:50%;border:1px solid var(--line2);display:grid;place-items:center;transition:.2s}
.vlx .btn-ghost:hover .pl{border-color:var(--red);color:var(--red)}
.vlx .micro{margin-top:16px;font:500 13px inherit;color:var(--tx3)}
.vlx .panel{background:linear-gradient(180deg,var(--card),#0E0F12);border:1px solid var(--line);border-radius:20px;padding:16px;position:relative;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55)}
.vlx .panel-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font:600 12px var(--mono);color:var(--tx3);letter-spacing:.05em}
.vlx .panel-top .pair{color:var(--tx);letter-spacing:.1em}
.vlx .chartbox{position:relative;height:230px;border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent);overflow:hidden}
.vlx .scan{position:absolute;top:0;bottom:0;width:2px;left:4%;background:linear-gradient(180deg,transparent,var(--red),transparent);box-shadow:0 0 22px 3px rgba(255,59,52,.6);animation:vlsweep 4s cubic-bezier(.55,0,.45,1) infinite;z-index:3}
@keyframes vlsweep{0%{left:4%;opacity:0}8%{opacity:1}60%{left:88%;opacity:1}68%{opacity:0}100%{opacity:0}}
.vlx .verdict{position:absolute;top:14px;right:14px;z-index:4;background:rgba(12,13,15,.86);backdrop-filter:blur(8px);border:1px solid rgba(39,208,124,.4);border-radius:14px;padding:12px 14px;min-width:150px;opacity:0;animation:vlpop 4s ease infinite}
@keyframes vlpop{0%,60%{opacity:0;transform:translateY(8px) scale(.96)}70%{opacity:1;transform:none}94%{opacity:1}100%{opacity:0}}
.vlx .verdict .vh{font:600 10px var(--mono);letter-spacing:.18em;text-transform:uppercase;color:var(--tx3)}
.vlx .verdict .vv{display:flex;align-items:baseline;gap:8px;margin-top:3px}
.vlx .verdict .side{font:800 20px inherit;color:var(--green)}
.vlx .verdict .conf{font:700 13px var(--mono);color:var(--tx2)}
.vlx .meter{height:5px;border-radius:99px;background:rgba(255,255,255,.1);margin-top:9px;overflow:hidden}
.vlx .meter i{display:block;height:100%;width:82%;background:linear-gradient(90deg,var(--green),#7ef0b6);border-radius:99px}
.vlx .reason{margin-top:8px;font:500 10.5px inherit;color:var(--tx2);line-height:1.4;max-width:150px}
.vlx .panel-foot{display:flex;gap:14px;margin-top:12px;font:600 11px var(--mono);color:var(--tx3)}
.vlx .panel-foot b{color:var(--tx2);font-weight:600}
.vlx .cndl{transform-origin:bottom;animation:vlgrow .5s cubic-bezier(.2,.8,.2,1) both}
@keyframes vlgrow{from{transform:scaleY(0);opacity:0}to{transform:scaleY(1);opacity:1}}
.vlx .ticker{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:rgba(255,255,255,.015);overflow:hidden;white-space:nowrap;padding:12px 0}
.vlx .track{display:inline-block;animation:vlmarq 26s linear infinite;font:600 13px var(--mono);letter-spacing:.05em}
.vlx .track span{margin:0 22px;color:var(--tx2)}
.vlx .track .up{color:var(--green)} .vlx .track .dn{color:var(--red)}
@keyframes vlmarq{to{transform:translateX(-50%)}}
.vlx section{padding:74px 0}
.vlx .kicker{font:600 12px var(--mono);text-transform:uppercase;letter-spacing:.22em;color:var(--red);margin-bottom:12px}
.vlx h2{font-size:clamp(1.8rem,4vw,2.7rem);letter-spacing:-.02em;font-weight:800;margin:0 0 8px;text-wrap:balance}
.vlx .lead{color:var(--tx2);max-width:52ch;font-size:1.05rem}
.vlx .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:40px}
.vlx .step{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px}
.vlx .step .no{font:800 13px var(--mono);color:var(--red);letter-spacing:.1em}
.vlx .step h3{font-size:1.15rem;margin:14px 0 8px;font-weight:700}
.vlx .step p{color:var(--tx2);font-size:.96rem;margin:0}
.vlx .step .ic{width:42px;height:42px;border-radius:11px;background:rgba(255,59,52,.1);border:1px solid rgba(255,59,52,.22);display:grid;place-items:center;font-size:20px}
.vlx .feat{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:18px;margin-top:40px}
.vlx .fcard{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;position:relative;overflow:hidden}
.vlx .fcard.hero-feat{background:linear-gradient(160deg,#1a1113,var(--card))}
.vlx .fcard .tag{font:600 11px var(--mono);text-transform:uppercase;letter-spacing:.16em;color:var(--gold)}
.vlx .fcard h3{font-size:1.35rem;margin:12px 0 10px;font-weight:800;letter-spacing:-.01em}
.vlx .fcard p{color:var(--tx2);font-size:.96rem;margin:0}
.vlx .glow{position:absolute;width:200px;height:200px;border-radius:50%;top:-70px;right:-50px;background:radial-gradient(circle,rgba(255,59,52,.22),transparent 70%);pointer-events:none}
.vlx .market{display:grid;grid-template-columns:1fr .92fr;gap:36px;align-items:center}
.vlx .listing{background:linear-gradient(160deg,#1a1710,var(--card));border:1px solid rgba(245,196,81,.2);border-radius:18px;padding:24px;position:relative;overflow:hidden}
.vlx .stats{display:flex;gap:14px;flex-wrap:wrap;margin-top:36px}
.vlx .stat{flex:1;min-width:150px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px}
.vlx .stat .n{font:800 2.4rem/1 inherit;letter-spacing:-.02em}
.vlx .stat .n .u{color:var(--red)}
.vlx .stat .l{color:var(--tx2);font-size:.9rem;margin-top:6px}
.vlx .plans{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:40px}
.vlx .plan{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:26px;position:relative}
.vlx .plan.pfeat{border-color:rgba(255,59,52,.5);background:linear-gradient(180deg,#1a1113,var(--card))}
.vlx .plan .pn{font:700 12px var(--mono);text-transform:uppercase;letter-spacing:.16em;color:var(--tx2)}
.vlx .plan .pp{font:800 2.3rem/1 inherit;letter-spacing:-.02em;margin:12px 0 2px}
.vlx .plan .pp small{font:600 .85rem var(--mono);color:var(--tx3);letter-spacing:0}
.vlx .plan ul{list-style:none;padding:0;margin:18px 0 0;display:flex;flex-direction:column;gap:10px}
.vlx .plan li{color:var(--tx2);font-size:.94rem;display:flex;gap:10px;align-items:flex-start}
.vlx .plan li::before{content:"✓";color:var(--red);font-weight:800;flex-shrink:0}
.vlx .plan .badge{position:absolute;top:-11px;left:24px;background:var(--red);color:#fff;font:700 10px var(--mono);text-transform:uppercase;letter-spacing:.12em;padding:4px 11px;border-radius:999px}
.vlx .faq{margin-top:20px;border-top:1px solid var(--line)}
.vlx .faq details{border-bottom:1px solid var(--line)}
.vlx .faq summary{cursor:pointer;list-style:none;padding:20px 4px;font:600 1.08rem inherit;display:flex;justify-content:space-between;align-items:center;gap:16px}
.vlx .faq summary::-webkit-details-marker{display:none}
.vlx .faq summary::after{content:"+";color:var(--red);font-size:1.5rem;line-height:1;transition:transform .2s}
.vlx .faq details[open] summary::after{transform:rotate(45deg)}
.vlx .faq p{color:var(--tx2);margin:0 4px 20px;max-width:72ch;line-height:1.7}
.vlx .final{background:linear-gradient(150deg,#1a1012,#0c0c0f);border:1px solid rgba(255,59,52,.22);border-radius:26px;padding:56px 34px;text-align:center;position:relative;overflow:hidden;margin-bottom:20px}
.vlx .final h2{font-size:clamp(2rem,5vw,3.2rem)}
.vlx .final p{color:var(--tx2);max-width:40ch;margin:12px auto 28px;font-size:1.08rem}
.vlx footer{padding:34px 0 46px;color:var(--tx3);font-size:13px;display:flex;justify-content:space-between;border-top:1px solid var(--line);flex-wrap:wrap;gap:10px}
.vlx .reveal{opacity:0;transform:translateY(22px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.8,.2,1)}
.vlx .reveal.in{opacity:1;transform:none}
@media(max-width:820px){
  .vlx .hero{grid-template-columns:1fr;gap:30px;padding:26px 0 50px}
  .vlx .steps,.vlx .feat,.vlx .plans{grid-template-columns:1fr}
  .vlx .market{grid-template-columns:1fr;gap:24px}
  .vlx .sub{max-width:none}.vlx .panel{order:2}
  .vlx .burger{display:block}
  .vlx .menu{position:absolute;top:66px;left:0;right:0;flex-direction:column;align-items:stretch;gap:14px;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:18px;display:none;z-index:30;box-shadow:0 20px 50px rgba(0,0,0,.5)}
  .vlx .menu.open{display:flex}
  .vlx .menu .ml{padding:8px 4px;font-size:16px}
  .vlx .menu .nav-cta{width:100%}
}
@media(prefers-reduced-motion:reduce){
  .vlx .scan,.vlx .verdict,.vlx .track,.vlx .cndl,.vlx .eyebrow .dot{animation:none!important}
  .vlx .verdict{opacity:1}.vlx .scan{opacity:.5}
  .vlx .reveal{opacity:1;transform:none;transition:none}
}
`;

export default function LandingPage() {
  const [, navigate] = useLocation();
  const start = () => navigate('/auth');

  useEffect(() => {
    const root = document.querySelector('.vlx');
    if (!root) return;

    // candlestick chart
    const svg = document.getElementById('vl-chart');
    if (svg) {
      const closes = [40,39,41,43,42,44,47,45,48,51,50,53,52,55,58,57,60,63,62,66];
      const W = 560, H = 230, pad = 14, n = closes.length, cw = (W - pad * 2) / n;
      const min = Math.min(...closes) - 4, max = Math.max(...closes) + 4;
      const y = (v: number) => H - pad - (v - min) / (max - min) * (H - pad * 2);
      const jit = [1.4,1,1.7,1.2,1.5,1,1.3,1.6,1.1,1.4,1,1.5,1.2,1.6,1.1,1.4,1,1.3,1.5,1.2];
      let pts = '';
      for (let i = 0; i < n; i++) pts += (pad + i * cw + cw / 2) + ',' + y(closes[i]) + ' ';
      let frag = '<polyline points="' + pts + '" fill="none" stroke="rgba(255,59,52,.35)" stroke-width="1.5"/>';
      for (let i = 0; i < n; i++) {
        const o = i ? closes[i - 1] : closes[i], c = closes[i], up = c >= o;
        const top = y(Math.max(o, c)), bot = y(Math.min(o, c));
        const hi = y(Math.max(o, c) + jit[i]), lo = y(Math.min(o, c) - jit[i]);
        const x = pad + i * cw + cw / 2, col = up ? '#27D07C' : '#FF3B34', bh = Math.max(2, bot - top);
        frag += '<g class="cndl" style="animation-delay:' + (i * 0.045) + 's">';
        frag += '<line x1="' + x + '" y1="' + hi + '" x2="' + x + '" y2="' + lo + '" stroke="' + col + '" stroke-width="1" opacity=".55"/>';
        frag += '<rect x="' + (x - cw * 0.3) + '" y="' + top + '" width="' + (cw * 0.6) + '" height="' + bh + '" rx="1.5" fill="' + col + '" opacity="' + (up ? .9 : .85) + '"/></g>';
      }
      svg.innerHTML = frag;
    }

    // ticker
    const tk = document.getElementById('vl-tk');
    if (tk) {
      const d: [string, string, number][] = [['EUR/USD','+0.42%',1],['BTC','+3.1%',1],['XAU/USD','-0.18%',0],['GBP/JPY','+0.66%',1],['NAS100','+1.24%',1],['SOL','+5.2%',1],['USD/CAD','-0.31%',0],['ETH','+2.4%',1],['US30','+0.55%',1]];
      const one = d.map(r => '<span>' + r[0] + ' <b class="' + (r[2] ? 'up' : 'dn') + '">' + r[1] + '</b></span>').join('');
      tk.innerHTML = one + one;
    }

    // cursor ember
    const ember = document.getElementById('vl-ember');
    const onMove = (ev: PointerEvent) => {
      if (!ember) return;
      ember.style.setProperty('--mx', (ev.clientX / window.innerWidth * 100) + '%');
      ember.style.setProperty('--my', (ev.clientY / window.innerHeight * 100) + '%');
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    // scroll reveal
    const io = new IntersectionObserver((es) => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: 0.16 });
    root.querySelectorAll('.reveal').forEach((el, i) => { (el as HTMLElement).style.transitionDelay = (i % 3 * 0.06) + 's'; io.observe(el); });

    return () => { window.removeEventListener('pointermove', onMove); io.disconnect(); };
  }, []);

  const toggleMenu = () => document.getElementById('vl-menu')?.classList.toggle('open');
  const closeMenu = () => document.getElementById('vl-menu')?.classList.remove('open');

  return (
    <div className="vlx">
      <style>{CSS}</style>
      <div className="ember" id="vl-ember" />

      <div className="shell">
        <nav>
          <Link href="/" className="brand"><img src={logoImage} alt="VEDD" /></Link>
          <div className="menu" id="vl-menu">
            <Link href="/features" className="ml" onClick={closeMenu}>Features</Link>
            <Link href="/pricing" className="ml" onClick={closeMenu}>Plans</Link>
            <a className="ml" href="#faq" onClick={closeMenu}>FAQ</a>
            <Link href="/blog" className="ml" onClick={closeMenu}>Blog</Link>
            <Link href="/auth" className="ml ml-sign" onClick={closeMenu}>Sign in</Link>
            <button className="nav-cta" onClick={start}>Start free</button>
          </div>
          <button className="burger" id="vl-burger" aria-label="Open menu" onClick={toggleMenu}>☰</button>
        </nav>

        <div className="hero">
          <div>
            <span className="eyebrow"><span className="dot" /> Live engine · self-learning brain</span>
            <h1>The brain that trades<br /><span className="g">while you sleep.</span></h1>
            <p className="sub">VEDD's live engine reads the markets, takes the trades, and gets smarter with every win and loss. You just watch the vault.</p>
            <div className="cta-row">
              <button className="btn-primary" id="vl-cta" onClick={start}>Start free</button>
              <button className="btn-ghost" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>
                <span className="pl">▶</span> See how it works</button>
            </div>
            <div className="micro">No card needed · Free forever plan · Works on any pair</div>
          </div>

          <div className="panel">
            <div className="panel-top"><span className="pair">BTC / USD · 15M</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#27D07C' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27D07C', boxShadow: '0 0 8px #27D07C' }} /> LIVE ENGINE</span></div>
            <div className="chartbox">
              <svg id="vl-chart" viewBox="0 0 560 230" width="100%" height={230} preserveAspectRatio="none" aria-hidden="true" />
              <div className="scan" />
              <div className="verdict">
                <div className="vh">AI verdict</div>
                <div className="vv"><span className="side">BUY</span><span className="conf">82%</span></div>
                <div className="meter"><i /></div>
                <div className="reason">Bullish break + retest. Brain confidence up after 3 similar wins.</div>
              </div>
            </div>
            <div className="panel-foot"><span>engine <b>live</b></span><span>brain <b>learning ↑</b></span><span>win-rate <b>68%</b></span></div>
          </div>
        </div>
      </div>

      <div className="ticker"><span className="track" id="vl-tk" /></div>

      <div className="shell">
        <section id="how">
          <div className="reveal">
            <div className="kicker">How it works</div>
            <h2>Set it up once. It runs itself.</h2>
            <p className="lead">No indicators to learn, no setup. The brain decides, the engine trades — you watch.</p>
          </div>
          <div className="steps">
            <div className="step reveal"><div className="ic">🔗</div><div className="no">01</div><h3>Connect or snap</h3><p>Link your account or drop in a chart. Takes about a minute.</p></div>
            <div className="step reveal"><div className="ic">🧠</div><div className="no">02</div><h3>The brain decides</h3><p>Reads structure, momentum and news, then makes the call — and remembers it.</p></div>
            <div className="step reveal"><div className="ic">⚡</div><div className="no">03</div><h3>The engine trades</h3><p>Takes the trade, manages it, and learns from the result to get sharper.</p></div>
          </div>
        </section>

        <section id="features">
          <div className="reveal">
            <div className="kicker">Engine + brain</div>
            <h2>It trades. It learns. It repeats.</h2>
            <p className="lead">A live engine that runs your strategy around the clock, and a brain that grades every trade and gets sharper over time.</p>
          </div>
          <div className="feat">
            <div className="fcard hero-feat reveal"><div className="glow" /><div className="tag">Core · Live engine</div><h3>Trades while you sleep</h3><p>The engine reads the markets, takes the trades, and manages them 24/7 — completely hands-off.</p></div>
            <div className="fcard reveal"><div className="tag">Self-learning</div><h3>A brain that improves</h3><p>Grades every win and loss and gets sharper with each trade it takes.</p></div>
            <div className="fcard reveal"><div className="tag">Reads anything</div><h3>Any chart, any market</h3><p>Forex, Kalshi and crypto — one brain across them all.</p></div>
          </div>
          <div className="stats">
            <div className="stat reveal"><div className="n">~2<span className="u">s</span></div><div className="l">to read a chart</div></div>
            <div className="stat reveal"><div className="n">24<span className="u">/7</span></div><div className="l">engine never sleeps</div></div>
            <div className="stat reveal"><div className="n">$0<span className="u">.</span></div><div className="l">to start, free forever plan</div></div>
          </div>
          <div style={{ marginTop: 26 }} className="reveal">
            <button className="btn-ghost" style={{ paddingLeft: 0 }} onClick={() => navigate('/features')}><span className="pl">→</span> See every feature</button>
          </div>
        </section>

        <section>
          <div className="market reveal">
            <div>
              <div className="kicker" style={{ color: 'var(--gold)' }}>Brain marketplace</div>
              <h2>Outgrown your brain? Sell it.</h2>
              <p className="lead">Once your brain gets sharp, list it. Traders just getting started plug in a proven brain to skip the learning curve — and you earn a reward every time yours gets used.</p>
              <button className="btn-ghost" style={{ marginTop: 18, paddingLeft: 0 }} onClick={start}><span className="pl">→</span> List a brain, earn VEDD</button>
            </div>
            <div className="listing">
              <div className="glow" style={{ background: 'radial-gradient(circle,rgba(245,196,81,.2),transparent 70%)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245,196,81,.12)', border: '1px solid rgba(245,196,81,.3)', display: 'grid', placeItems: 'center', fontSize: 19 }}>🧠</span>
                  <div><div style={{ fontWeight: 800 }}>Momentum Brain</div><div style={{ font: '600 11px var(--mono)', color: 'var(--tx3)' }}>v3 · 1,240 trades learned</div></div>
                </div>
                <span style={{ font: '700 10px var(--mono)', textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gold)', border: '1px solid rgba(245,196,81,.35)', padding: '4px 8px', borderRadius: 999 }}>For sale</span>
              </div>
              <div style={{ display: 'flex', gap: 20, margin: '16px 0 10px' }}>
                <div><div style={{ font: '800 1.5rem inherit', color: 'var(--green)' }}>71%</div><div style={{ font: '500 11px inherit', color: 'var(--tx3)' }}>win rate</div></div>
                <div><div style={{ font: '800 1.5rem inherit', color: 'var(--gold)' }}>+250</div><div style={{ font: '500 11px inherit', color: 'var(--tx3)' }}>VEDD to seller</div></div>
              </div>
              <div className="meter"><i style={{ width: '71%', background: 'linear-gradient(90deg,var(--gold),#ffe29a)' }} /></div>
              <button className="btn-primary" style={{ width: '100%', marginTop: 16, background: 'linear-gradient(150deg,var(--gold),#caa02f)', color: '#241a02', boxShadow: '0 10px 30px rgba(245,196,81,.28)' }} onClick={start}>Add this brain to my engine</button>
            </div>
          </div>
        </section>

        <section id="plans">
          <div className="reveal">
            <div className="kicker">Plans</div>
            <h2>Start free. Upgrade when it's paying off.</h2>
            <p className="lead">The free plan reads your charts. Paid plans hand the trades to the live engine and let the brain run around the clock.</p>
          </div>
          <div className="plans">
            <div className="plan reveal">
              <div className="pn">Free</div><div className="pp">$0<small>/forever</small></div>
              <ul><li>AI chart analysis</li><li>Community and devotionals</li><li>Free-to-Pro rewards path</li></ul>
              <button className="nav-cta" style={{ width: '100%', marginTop: 20 }} onClick={start}>Start free</button>
            </div>
            <div className="plan pfeat reveal">
              <span className="badge">Most popular</span>
              <div className="pn">Starter</div><div className="pp">$49.95<small>/mo</small></div>
              <ul><li>Live trading engine, 24/7</li><li>Self-learning brain</li><li>Forex, Kalshi and crypto</li></ul>
              <button className="btn-primary" style={{ width: '100%', marginTop: 20 }} onClick={() => navigate('/pricing')}>Get Starter</button>
            </div>
            <div className="plan reveal">
              <div className="pn">Premium</div><div className="pp">$149.99<small>/mo</small></div>
              <ul><li>Everything in Starter</li><li>Sell brains on the marketplace</li><li>Priority AI and higher limits</li></ul>
              <button className="nav-cta" style={{ width: '100%', marginTop: 20 }} onClick={() => navigate('/pricing')}>Get Premium</button>
            </div>
          </div>
          <p style={{ textAlign: 'center', marginTop: 22, color: 'var(--tx3)', fontSize: '.92rem' }}>
            Save with $999.99/yr · <Link href="/pricing" style={{ color: 'var(--tx2)' }}>See full plans and features →</Link>
          </p>
        </section>

        <section id="faq">
          <div className="reveal"><div className="kicker">FAQ</div><h2>Questions, answered.</h2></div>
          <div className="faq reveal">
            <details><summary>Do I need trading experience?</summary><p>No. The brain reads the charts and the live engine takes the trades — you can let it run or approve each call. It's built for someone opening their first chart.</p></details>
            <details><summary>Is it really free to start?</summary><p>Yes — the free plan needs no card. Paid plans unlock the live trading engine, the self-learning brain, and higher limits when you're ready.</p></details>
            <details><summary>What markets does it work on?</summary><p>Forex, Kalshi and crypto, through your own MT5, TradeLocker or connected accounts. One brain works across all of them.</p></details>
            <details><summary>Is my money safe?</summary><p>VEDD never holds your funds. It connects to your own broker or exchange through your keys, and the trades happen in your account — you stay in control.</p></details>
            <details><summary>What's the "brain," and can I really sell it?</summary><p>Your brain is the self-learning model behind your engine — it grades every trade and gets sharper over time. Once it's proven, list it on the marketplace and earn VEDD every time a new trader uses it.</p></details>
            <details><summary>Can I cancel anytime?</summary><p>Yes. Upgrade, downgrade or cancel whenever — no lock-in.</p></details>
          </div>
        </section>

        <div className="final reveal">
          <div className="glow" style={{ top: -90, left: '40%', width: 260, height: 260 }} />
          <h2>Let the engine take it from here.</h2>
          <p>Create your account and the brain starts learning your first setup in minutes.</p>
          <button className="btn-primary" onClick={start}>Start free — no card</button>
        </div>

        <footer>
          <span>© 2026 VEDD AI Trading Vault · seize the day divine</span>
          <span>veddbuild.com</span>
        </footer>
      </div>
    </div>
  );
}
