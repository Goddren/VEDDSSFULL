import { useRef, useState, useEffect } from 'react';

// ── Deterministic price data ──────────────────────────────────────────────────
const PRICES: number[] = [];
for (let i = 0; i < 100; i++) {
  const t = i / 99;
  const base = 64500 + 420 * Math.sin(t * 3.1 * Math.PI + 0.4) + 180 * Math.sin(t * 7.3 * Math.PI - 0.8);
  const n = ((i * 137 + i * i * 3 + 57) % 200) - 100;
  PRICES.push(Math.max(63900, Math.min(65200, base + n)));
}
const SIG_IDX = [18, 47, 76];

const CAPTIONS = [
  { t: 0,    v: '' },
  { t: 0.4,  v: 'Stop. BTC trapped 64–65k all week.' },
  { t: 2,    v: 'Most traders lost money—' },
  { t: 3.2,  v: 'Not because the market was impossible.' },
  { t: 4.4,  v: 'Because they were the problem.' },
  { t: 5.5,  v: "VEDD's AI Vault had none of that." },
  { t: 8,    v: 'Custom EAs — every entry & exit executed.' },
  { t: 9.8,  v: 'MT5 and TradingView. Zero emotional override.' },
  { t: 11.5, v: 'Multi-timeframe synthesis caught signals first.' },
  { t: 13,   v: 'ABBA AI locked in when charts looked ugliest.' },
  { t: 14.5, v: 'Solana rewards stacking in the background.' },
  { t: 17.2, v: 'This is not the future of trading. This is now.' },
  { t: 19,   v: 'Your vault is waiting.' },
];

const SCENES = [
  { id: 'rp-s-hook',  s: 0,   e: 1.5 },
  { id: 'rp-s-split', s: 1.5, e: 8   },
  { id: 'rp-s-chart', s: 8,   e: 14  },
  { id: 'rp-s-vault', s: 14,  e: 17  },
  { id: 'rp-s-close', s: 17,  e: 20  },
];

const TOTAL = 20;

const EXEC_ROWS = [
  'BUY  BTC @ 64,120 ✓',
  'SELL BTC @ 64,880 ✓',
  'BUY  ETH @  3,210 ✓',
  'SELL ETH @  3,295 ✓',
  'BUY  TAO @    410 ✓',
];

const EA_CARDS = [
  { id: 'rp-ec1', name: 'ABBA_FX_v3 · EA',  row: 'MT5 · BTC/USD · 15m+1H+4H synthesis', bars: [8,13,10,16,12,18,14] },
  { id: 'rp-ec2', name: 'ORB_Breakout_EA',   row: 'TradingView · ETH/USD · 30m breakout', bars: [14,9,18,11,16,13] },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function VeddReelPlayer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const animRef      = useRef({ playing: false, elapsed: 0, t0: 0, rafId: 0 });
  const actRef       = useRef({ play: () => {}, pause: () => {}, restart: () => {} });
  const [ui, setUi]  = useState({ playing: false, time: 0, done: false });

  useEffect(() => {
    const C   = containerRef.current!;
    const cvs = canvasRef.current!;
    const ctx = cvs.getContext('2d')!;
    const anim = animRef.current;

    function q(sel: string) { return C.querySelector(sel) as HTMLElement | null; }
    function qa(sel: string) { return Array.from(C.querySelectorAll(sel)) as HTMLElement[]; }
    function show(id: string, on: boolean) {
      const el = q('#' + id);
      if (el) el.classList.toggle('rp-show', on);
    }

    // Build candles
    const row = q('#rp-candle-row')!;
    [52,44,60,36,48,40,28].forEach(h => {
      const d = document.createElement('div');
      d.className = 'rp-cv';
      d.style.cssText = `width:8px;height:${h}px;border-radius:1px;background:#EF4444;opacity:0;transition:opacity .3s;flex-shrink:0;`;
      row.appendChild(d);
    });

    // ── Scene updaters ──────────────────────────────────────────────────────
    function hookUpd(t: number) {
      show('rp-h1', t > 0.3);
      show('rp-h2', t > 0.8);
      show('rp-h3', t > 1.2);
    }

    function splitUpd(t: number) {
      if (t < 1.5 || t >= 8) return;
      const s = t - 1.5;
      qa('.rp-cv').forEach((el, i) => el.classList.toggle('rp-show', s > i * 0.12));
      show('rp-bfear',  s > 0.7);
      show('rp-bgreed', s > 1.4);
      for (let i = 1; i <= 5; i++) show('rp-e' + i, s > 2 + i * 0.5);
      const solEl = q('#rp-sol');
      if (solEl) {
        const sp = Math.max(0, (s - 2.5) / 5);
        solEl.textContent = '◎ ' + (sp * 0.82).toFixed(3) + ' SOL';
        solEl.classList.toggle('rp-show', s > 2.4);
      }
    }

    function drawChart(prog: number, s: number) {
      const W = 300, H = 200, PX = 14, PY = 16;
      const MINP = 63700, MAXP = 65400;
      const pw = W - PX * 2, ph = H - PY * 2;
      const px = (i: number) => PX + (i / 99) * pw;
      const py = (p: number) => PY + (1 - (p - MINP) / (MAXP - MINP)) * ph;

      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = PY + ph * i / 4;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Level lines
      ctx.setLineDash([3, 5]);
      [64000, 65000].forEach(lv => {
        const y = py(lv);
        ctx.strokeStyle = 'rgba(148,163,184,.14)';
        ctx.beginPath(); ctx.moveTo(PX, y); ctx.lineTo(W - PX, y); ctx.stroke();
        ctx.fillStyle = 'rgba(148,163,184,.3)';
        ctx.font = '8px Courier New';
        ctx.fillText(lv === 64000 ? '64k' : '65k', W - 26, y - 3);
      });
      ctx.setLineDash([]);

      const endIdx = Math.floor(prog * 99);
      if (endIdx < 1) return;

      // Area fill
      ctx.beginPath();
      ctx.moveTo(px(0), py(PRICES[0]));
      for (let i = 1; i <= endIdx; i++) ctx.lineTo(px(i), py(PRICES[i]));
      ctx.lineTo(px(endIdx), H); ctx.lineTo(px(0), H); ctx.closePath();
      ctx.fillStyle = 'rgba(239,68,68,.05)'; ctx.fill();

      // Price line
      ctx.beginPath();
      ctx.moveTo(px(0), py(PRICES[0]));
      for (let i = 1; i <= endIdx; i++) ctx.lineTo(px(i), py(PRICES[i]));
      ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 1.5; ctx.stroke();

      // Endpoint dot
      ctx.beginPath();
      ctx.arc(px(endIdx), py(PRICES[endIdx]), 3, 0, Math.PI * 2);
      ctx.fillStyle = '#EF4444'; ctx.fill();

      // EA signal arrows
      SIG_IDX.forEach(idx => {
        if (idx / 99 > prog) return;
        const x = px(idx), y = py(PRICES[idx]);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
        g.addColorStop(0, 'rgba(34,197,94,.25)');
        g.addColorStop(1, 'rgba(34,197,94,0)');
        ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y - 18); ctx.lineTo(x - 6, y - 8); ctx.lineTo(x + 6, y - 8); ctx.closePath();
        ctx.fillStyle = '#22C55E'; ctx.fill();
        ctx.fillStyle = 'rgba(34,197,94,.8)';
        ctx.font = 'bold 7px Courier New';
        ctx.fillText('BUY', x - 8, y - 22);
      });

      const anySig = SIG_IDX.some(i => i / 99 <= prog);
      show('rp-siglbl', anySig);
      show('rp-mtfmsg', s > 3);
    }

    function chartUpd(t: number) {
      if (t < 8 || t >= 14) return;
      const s = t - 8;
      drawChart(Math.min(1, s / 2.5), s);
    }

    function vaultUpd(t: number) {
      if (t < 14 || t >= 17) return;
      const s = t - 14;
      show('rp-ec1', s > 0.2);
      show('rp-ec2', s > 0.7);
      show('rp-ec3', s > 1.3);
    }

    function closeUpd(t: number) {
      if (t < 17) return;
      const s = t - 17;
      show('rp-cl1', s > 0.3);
      show('rp-cl2', s > 1.0);
      show('rp-cl3', s > 1.7);
      show('rp-cl4', s > 2.2);
    }

    function updateAll(t: number) {
      // Progress bar
      const pf = q('#rp-pf');
      if (pf) pf.style.width = (t / TOTAL * 100) + '%';

      // Scene visibility
      SCENES.forEach(sc => {
        const el = q('#' + sc.id);
        if (el) el.classList.toggle('rp-on', t >= sc.s && t < sc.e);
      });

      // Caption
      let cap = '';
      for (let i = CAPTIONS.length - 1; i >= 0; i--) {
        if (t >= CAPTIONS[i].t) { cap = CAPTIONS[i].v; break; }
      }
      const capEl = q('#rp-cap');
      if (capEl) capEl.textContent = cap;

      hookUpd(t);
      splitUpd(t);
      chartUpd(t);
      vaultUpd(t);
      closeUpd(t);
      setUi(u => ({ ...u, time: t }));
    }

    function tick(now: number) {
      if (!anim.playing) return;
      anim.elapsed = Math.min((now - anim.t0) / 1000, TOTAL);
      updateAll(anim.elapsed);
      if (anim.elapsed >= TOTAL) {
        anim.playing = false;
        setUi(u => ({ ...u, playing: false, done: true }));
        return;
      }
      anim.rafId = requestAnimationFrame(tick);
    }

    actRef.current.play = () => {
      anim.playing = true;
      anim.t0 = performance.now() - anim.elapsed * 1000;
      anim.rafId = requestAnimationFrame(tick);
      setUi(u => ({ ...u, playing: true, done: false }));
    };
    actRef.current.pause = () => {
      anim.playing = false;
      cancelAnimationFrame(anim.rafId);
      setUi(u => ({ ...u, playing: false }));
    };
    actRef.current.restart = () => {
      anim.playing = false;
      cancelAnimationFrame(anim.rafId);
      anim.elapsed = 0;
      updateAll(0);
      setUi({ playing: false, time: 0, done: false });
    };

    updateAll(0);
    return () => { cancelAnimationFrame(anim.rafId); };
  }, []);

  const { playing, time, done } = ui;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <style>{`
        .rp-scene{position:absolute;inset:0;opacity:0;transition:opacity .25s;pointer-events:none}
        .rp-scene.rp-on{opacity:1;pointer-events:auto}
        .rp-fadeable{opacity:0;transform:translateY(12px);transition:opacity .35s,transform .35s}
        .rp-fadeable.rp-show{opacity:1;transform:translateY(0)}
        .rp-slide{opacity:0;transform:translateY(10px);transition:opacity .4s,transform .4s}
        .rp-slide.rp-show{opacity:1;transform:translateY(0)}
        .rp-badge{opacity:0;transform:translateX(-6px);transition:opacity .3s,transform .3s}
        .rp-badge.rp-show{opacity:1;transform:translateX(0)}
        .rp-noshow{opacity:0;transition:opacity .3s}
        .rp-noshow.rp-show{opacity:1}
        @keyframes rp-flash{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes rp-pp{0%,100%{opacity:1}50%{opacity:.3}}
        .rp-flash{animation:rp-flash .9s ease-in-out infinite}
        .rp-pp{animation:rp-pp 1.2s ease-in-out infinite}
      `}</style>

      {/* Phone shell */}
      <div ref={containerRef} style={{
        width:300,height:534,background:'#080B14',borderRadius:36,
        border:'2px solid #1C2235',overflow:'hidden',position:'relative',flexShrink:0,
        boxShadow:'0 0 0 6px #0A0D18,0 0 0 7px #1A2030,0 36px 90px rgba(0,0,0,.85)',
      }}>
        {/* Notch */}
        <div style={{position:'absolute',top:0,left:'50%',transform:'translateX(-50%)',width:70,height:18,background:'#060910',borderBottomLeftRadius:10,borderBottomRightRadius:10,zIndex:200}}/>

        {/* ── HOOK ── */}
        <div id="rp-s-hook" className="rp-scene" style={{background:'#000',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'36px 28px',gap:0}}>
          <div id="rp-h1" className="rp-fadeable" style={{fontSize:32,fontWeight:900,color:'#fff',textAlign:'center',marginBottom:14}}>STOP.</div>
          <div id="rp-h2" className="rp-fadeable" style={{fontSize:17,fontWeight:700,color:'#94A3B8',textAlign:'center',marginBottom:10}}>BTC trapped 64–65k all week.</div>
          <div id="rp-h3" className="rp-fadeable" style={{fontSize:21,fontWeight:900,color:'#EF4444',textAlign:'center'}}>You were the problem.</div>
        </div>

        {/* ── SPLIT ── */}
        <div id="rp-s-split" className="rp-scene" style={{display:'flex',flexDirection:'row',height:'100%'}}>
          {/* Left — Emotion */}
          <div style={{flex:1,display:'flex',flexDirection:'column',padding:'28px 10px 16px',gap:8,overflow:'hidden',background:'linear-gradient(180deg,#1a0606,#0d0202)',borderRight:'1px solid #2a0808'}}>
            <div style={{fontSize:8,fontWeight:800,letterSpacing:'0.22em',textTransform:'uppercase',color:'#EF4444'}}>● Emotion</div>
            <div id="rp-candle-row" style={{display:'flex',alignItems:'flex-end',gap:2,height:72}}/>
            <div id="rp-bfear" className="rp-badge" style={{fontSize:8,fontWeight:800,letterSpacing:'0.1em',textTransform:'uppercase',padding:'3px 7px',borderRadius:2,background:'rgba(239,68,68,.15)',color:'#fca5a5',border:'1px solid rgba(239,68,68,.3)',display:'inline-flex',width:'fit-content'}}>✗ Fear exit — early</div>
            <div id="rp-bgreed" className="rp-badge" style={{fontSize:8,fontWeight:800,letterSpacing:'0.1em',textTransform:'uppercase',padding:'3px 7px',borderRadius:2,background:'rgba(239,68,68,.15)',color:'#fca5a5',border:'1px solid rgba(239,68,68,.3)',display:'inline-flex',width:'fit-content'}}>✗ Greed re-entry — late</div>
            <div className="rp-flash" style={{marginTop:'auto',background:'#EF4444',color:'#fff',borderRadius:2,padding:'5px 10px',fontSize:9,fontWeight:800,letterSpacing:'0.1em',textTransform:'uppercase',width:'fit-content'}}>PANIC SELL</div>
          </div>
          {/* Right — System */}
          <div style={{flex:1,display:'flex',flexDirection:'column',padding:'28px 10px 16px',gap:8,overflow:'hidden',background:'linear-gradient(180deg,#031209,#010a04)'}}>
            <div style={{fontSize:8,fontWeight:800,letterSpacing:'0.22em',textTransform:'uppercase',color:'#22C55E'}}>● System</div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {EXEC_ROWS.map((row, i) => (
                <div key={i} id={`rp-e${i+1}`} className="rp-noshow" style={{display:'flex',alignItems:'center',gap:4,fontSize:8,color:'#86efac',fontFamily:'Courier New,monospace',lineHeight:1.2}}>
                  <div style={{width:4,height:4,borderRadius:'50%',background:'#22C55E',flexShrink:0}}/>
                  {row}
                </div>
              ))}
            </div>
            <div id="rp-sol" className="rp-noshow" style={{fontFamily:'Courier New,monospace',fontSize:10,fontWeight:700,color:'#A855F7',background:'rgba(168,85,247,.08)',border:'1px solid rgba(168,85,247,.2)',borderRadius:2,padding:'4px 8px',marginTop:4}}>◎ 0.000 SOL</div>
          </div>
        </div>

        {/* ── CHART ── */}
        <div id="rp-s-chart" className="rp-scene" style={{background:'#050810',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'28px 16px 4px'}}>
            <div style={{fontSize:13,fontWeight:800,color:'#94A3B8'}}>BTC / USD</div>
            <div style={{fontSize:8,color:'#4B5A72',fontFamily:'Courier New,monospace',letterSpacing:'0.06em',marginTop:1}}>RANGE: 64,000 ── 65,000 · EA SIGNALS ACTIVE</div>
          </div>
          <canvas ref={canvasRef} width={300} height={200} style={{display:'block',flexShrink:0}}/>
          <div id="rp-siglbl" className="rp-noshow" style={{margin:'6px 16px 0',fontSize:9,fontWeight:800,letterSpacing:'0.14em',color:'#22C55E',textTransform:'uppercase'}}>↑ EA SIGNAL EXECUTED — MT5 / TRADINGVIEW</div>
          <div id="rp-mtfmsg" className="rp-noshow" style={{margin:'6px 16px 0',fontSize:12,fontWeight:700,color:'#64748B',lineHeight:1.5}}>
            <b style={{color:'#F1F5F9'}}>Multi-timeframe synthesis.</b><br/>Signals caught before the crowd.
          </div>
        </div>

        {/* ── VAULT ── */}
        <div id="rp-s-vault" className="rp-scene" style={{background:'#070912',display:'flex',flexDirection:'column',padding:'22px 14px',gap:9}}>
          <div style={{fontSize:9,fontWeight:800,letterSpacing:'0.2em',textTransform:'uppercase',color:'#EF4444'}}>AI Vault</div>
          <div style={{fontSize:17,fontWeight:900,color:'#F1F5F9',marginTop:2}}>Zero emotional override.</div>
          {EA_CARDS.map(({ id, name, row, bars }) => (
            <div key={id} id={id} className="rp-slide" style={{background:'#0D1117',border:'1px solid #1A2030',borderRadius:3,padding:'10px 12px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:700,color:'#F1F5F9'}}>{name}</span>
                <span style={{fontSize:9,fontWeight:800,letterSpacing:'0.1em',color:'#22C55E',textTransform:'uppercase'}}>● Running</span>
              </div>
              <div style={{display:'flex',gap:2,alignItems:'flex-end',height:18}}>
                {bars.map((h, j) => <div key={j} style={{width:5,height:h,borderRadius:1,background:'#22C55E',opacity:0.6}}/>)}
              </div>
              <div style={{fontSize:8,color:'#64748B',fontFamily:'Courier New,monospace',marginTop:2}}>{row}</div>
            </div>
          ))}
          <div id="rp-ec3" className="rp-slide" style={{background:'linear-gradient(135deg,#0D1117,#0F0D1F)',border:'1px solid #2D1B6B',borderRadius:3,padding:'10px 12px'}}>
            <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:5}}>
              <div className="rp-pp" style={{width:6,height:6,borderRadius:'50%',background:'#A855F7'}}/>
              <span style={{fontSize:9,fontWeight:800,letterSpacing:'0.1em',color:'#A855F7',textTransform:'uppercase'}}>ABBA AI Strategist</span>
            </div>
            <div style={{fontSize:10,color:'#94A3B8',lineHeight:1.45,fontFamily:'Courier New,monospace'}}>
              Strategy <b style={{color:'#C4B5FD'}}>locked</b> through volatility spike.<br/>
              Drawdown: <b style={{color:'#86efac'}}>−0.8%</b> · Within plan. Hold.
            </div>
          </div>
        </div>

        {/* ── CLOSE ── */}
        <div id="rp-s-close" className="rp-scene" style={{background:'#000',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,gap:6}}>
          <div id="rp-cl1" className="rp-fadeable" style={{fontFamily:'Courier New,monospace',fontSize:16,fontWeight:700,color:'#fff',textAlign:'center'}}>the machine never panicked.</div>
          <div id="rp-cl2" className="rp-fadeable" style={{fontFamily:'Courier New,monospace',fontSize:14,color:'#64748B',textAlign:'center'}}>you still can.</div>
          <div id="rp-cl3" className="rp-fadeable" style={{fontFamily:'Courier New,monospace',marginTop:18,fontSize:14,fontWeight:700,color:'#22C55E',letterSpacing:'0.04em',textAlign:'center'}}>→ build your vault now</div>
          <div id="rp-cl4" className="rp-fadeable" style={{fontFamily:'Courier New,monospace',fontSize:10,color:'#374151',letterSpacing:'0.08em',textAlign:'center',marginTop:2}}>veddbuild.com</div>
        </div>

        {/* Progress bar */}
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:3,background:'rgba(255,255,255,.05)',zIndex:100}}>
          <div id="rp-pf" style={{height:'100%',width:'0%',background:'linear-gradient(90deg,#EF4444,#f97316)'}}/>
        </div>

        {/* Caption */}
        <div id="rp-cap" style={{position:'absolute',bottom:26,left:10,right:10,zIndex:90,fontSize:11,fontWeight:800,color:'#fff',textAlign:'center',lineHeight:1.45,textShadow:'0 1px 8px rgba(0,0,0,1)',minHeight:32,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}/>
      </div>

      {/* Controls */}
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        {!done ? (
          <button
            onClick={playing ? actRef.current.pause : actRef.current.play}
            style={{background:'#EF4444',color:'#fff',border:'none',borderRadius:3,padding:'10px 24px',fontSize:11,fontWeight:800,letterSpacing:'0.1em',textTransform:'uppercase',cursor:'pointer',minWidth:100}}
          >
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
        ) : (
          <button
            onClick={actRef.current.restart}
            style={{background:'rgba(255,255,255,.06)',color:'#94A3B8',border:'1px solid #1C2235',borderRadius:3,padding:'10px 24px',fontSize:11,fontWeight:700,cursor:'pointer'}}
          >
            ↺ Replay
          </button>
        )}
        <div style={{fontFamily:'Courier New,monospace',fontSize:11,color:'#4B5A72',fontVariantNumeric:'tabular-nums'}}>
          {time.toFixed(1)}s / 20s
        </div>
        {(time > 0 && !done) && (
          <button
            onClick={actRef.current.restart}
            style={{background:'transparent',color:'#374151',border:'1px solid #1C2235',borderRadius:3,padding:'9px 12px',fontSize:12,cursor:'pointer'}}
          >
            ↺
          </button>
        )}
      </div>

      {/* Share hint */}
      <p style={{fontSize:11,color:'#374151',textAlign:'center',maxWidth:280,lineHeight:1.5}}>
        Screen-record this preview to export as a real .mp4 for TikTok or IG.
      </p>
    </div>
  );
}
