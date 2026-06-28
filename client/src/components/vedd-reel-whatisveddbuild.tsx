import { useRef, useState, useEffect } from 'react';

const TOTAL = 55;

const WV_CAPS = [
  { t: 0,    v: '' },
  { t: 0.4,  v: 'What if your platform worked while you slept?' },
  { t: 5,    v: 'VEDDBuild — AI trading ecosystem.' },
  { t: 10,   v: 'Live signals. Smart filtering.' },
  { t: 14,   v: 'Auto-execution on every major broker.' },
  { t: 21,   v: "It's not just signals." },
  { t: 26,   v: 'SOL Scanner — crypto analysis, live.' },
  { t: 31,   v: '$VEDD Token — Solana · real utility.' },
  { t: 36,   v: 'NFC Streetwear — move differently.' },
  { t: 40,   v: 'Ambassador Program — earn as you grow.' },
  { t: 44,   v: 'vous êtes des dieux' },
  { t: 46,   v: '' },
  { t: 47,   v: 'Start your free trial now.' },
  { t: 51,   v: 'No excuses. Just edge.' },
];

const WV_SCENES = [
  { id: 'wv-s-hook', s: 0,  e: 5  },
  { id: 'wv-s-rev',  s: 5,  e: 21 },
  { id: 'wv-s-eco',  s: 21, e: 46 },
  { id: 'wv-s-cta',  s: 46, e: 55 },
];

export function VeddReelWhatIsVedd() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef({ playing: false, elapsed: 0, t0: 0, rafId: 0 });
  const actRef    = useRef({ play: () => {}, pause: () => {}, restart: () => {} });
  const [ui, setUi] = useState({ playing: false, time: 0, done: false });

  useEffect(() => {
    // draw basic chart once
    const cv = canvasRef.current;
    if (cv) {
      const ctx = cv.getContext('2d')!;
      const pts = [25,30,22,35,28,40,32,25,38,30,35,28,42,35,30,38,32,28,35,30];
      ctx.strokeStyle = '#3A3830'; ctx.lineWidth = 1.5; ctx.beginPath();
      pts.forEach((v, i) => {
        const x = i * (cv.width / 19), y = cv.height - v;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    const q = (id: string) => document.getElementById(id);
    const up = (id: string, on: boolean) => q(id)?.classList.toggle('wv-up', on);

    function hookUpd(t: number) {
      up('wv-pglow', t > 0.2);
      up('wv-n1', t > 0.4);
      up('wv-n2', t > 1.2);
      up('wv-n3', t > 2.0);
      up('wv-htext', t > 2.6);
    }
    function revUpd(t: number) {
      if (t < 5 || t >= 21) return;
      const s = t - 5;
      up('wv-vblogo', s > 0.3);
      up('wv-fr1', s > 1.5);
      up('wv-fr2', s > 3.5);
      up('wv-fr3', s > 5.5);
      up('wv-vover', s > 7);
    }
    function ecoUpd(t: number) {
      if (t < 21 || t >= 46) return;
      const s = t - 21;
      up('wv-ec1', s > 0.5);
      up('wv-ec2', s > 4.0);
      up('wv-ec3', s > 8.5);
      up('wv-ec4', s > 13.0);
      up('wv-dieu', s > 20.0);
    }
    function ctaUpd(t: number) {
      if (t < 46) return;
      const s = t - 46;
      up('wv-cbrand', s > 0.3);
      up('wv-cglow',  s > 0.8);
      up('wv-cstart', s > 1.5);
      up('wv-curl',   s > 2.8);
      up('wv-csub',   s > 4.2);
    }

    function updateAll(t: number) {
      const pf = q('wv-pf');
      if (pf) (pf as HTMLDivElement).style.width = (t / TOTAL * 100) + '%';
      const cap = q('wv-cap');
      let capTxt = '';
      for (let i = WV_CAPS.length - 1; i >= 0; i--) {
        if (t >= WV_CAPS[i].t) { capTxt = WV_CAPS[i].v; break; }
      }
      if (cap) cap.textContent = capTxt;

      WV_SCENES.forEach(sc => {
        q(sc.id)?.classList.toggle('wv-on', t >= sc.s && t < sc.e);
      });

      hookUpd(t); revUpd(t); ecoUpd(t); ctaUpd(t);
    }

    const anim = animRef.current;

    function tick(now: number) {
      if (!anim.playing) return;
      anim.elapsed = Math.min((now - anim.t0) / 1000, TOTAL);
      updateAll(anim.elapsed);
      setUi(u => ({ ...u, time: anim.elapsed }));
      if (anim.elapsed >= TOTAL) {
        anim.playing = false;
        setUi({ playing: false, time: TOTAL, done: true });
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
    return () => cancelAnimationFrame(anim.rafId);
  }, []);

  return (
    <>
      <style>{`
        .wv-phone{width:300px;height:534px;background:#0A0A0B;border-radius:36px;border:6px solid #1A1820;position:relative;overflow:hidden;box-shadow:0 0 0 1px #0D0C14,0 32px 80px rgba(0,0,0,.95),0 0 60px rgba(240,210,105,.06);flex-shrink:0}
        .wv-notch{position:absolute;top:0;left:50%;transform:translateX(-50%);width:80px;height:22px;background:#0E0D16;border-radius:0 0 14px 14px;z-index:50}
        .wv-sc{position:absolute;inset:0;opacity:0;transition:opacity .5s;pointer-events:none;overflow:hidden}
        .wv-sc.wv-on{opacity:1}
        .wv-fd{opacity:0;transform:translateY(10px);transition:opacity .5s,transform .5s}
        .wv-fd.wv-up{opacity:1;transform:translateY(0)}
        .wv-fs{opacity:0;transition:opacity .6s}
        .wv-fs.wv-up{opacity:1}
        .wv-pf-bar{position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,.04);z-index:100}
        .wv-pf{height:100%;width:0%;background:linear-gradient(90deg,#7A6010,#F0D269,#F8E890);transition:none}
        .wv-cap{position:absolute;bottom:14px;left:12px;right:12px;z-index:90;font-size:10px;font-weight:700;color:#fff;text-align:center;line-height:1.4;text-shadow:0 1px 10px rgba(0,0,0,1),0 0 30px rgba(0,0,0,1);pointer-events:none;font-family:system-ui,sans-serif}
        /* S1 */
        #wv-s-hook{background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 28px}
        .wv-notifs{position:absolute;top:60px;right:20px;display:flex;flex-direction:column;gap:7px}
        .wv-notif{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.04);border:1px solid rgba(34,197,94,.2);border-radius:6px;padding:6px 10px;font-family:'Courier New',monospace;font-size:9px}
        .wv-notif-dot{width:6px;height:6px;border-radius:50%;background:#22C55E;flex-shrink:0;box-shadow:0 0 6px #22C55E}
        .wv-notif-txt{color:#86efac}
        .wv-pglow{position:absolute;bottom:100px;left:50%;transform:translateX(-50%);width:120px;height:70px;background:rgba(240,210,105,.04);border:1px solid rgba(240,210,105,.15);border-radius:8px;display:flex;align-items:center;justify-content:center}
        .wv-psi{width:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px;padding:0 12px}
        .wv-psi-row{height:3px;border-radius:2px;background:rgba(240,210,105,.2);width:80%}
        .wv-psi-row.g{background:rgba(34,197,94,.4)}
        .wv-htext{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;color:#F0EDE6;text-align:center;line-height:1.5;margin-top:auto;margin-bottom:60px;padding:0 8px}
        .wv-htext em{color:#F0D269;font-style:normal;font-weight:700}
        /* S2 */
        #wv-s-rev{background:#0A0A0B;display:flex;flex-direction:column}
        .wv-stag{position:absolute;top:28px;left:14px;font-family:'Courier New',monospace;font-size:7px;font-weight:700;letter-spacing:.18em;color:#8B8030;text-transform:uppercase;z-index:10}
        .wv-split{flex:1;display:flex;position:relative;overflow:hidden}
        .wv-sl{flex:1;background:#141414;border-right:2px solid rgba(240,210,105,.6);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;overflow:hidden}
        .wv-sl-lbl{font-family:'Courier New',monospace;font-size:7px;color:#2A2828;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}
        .wv-sr{flex:1;background:#0A0A0B;display:flex;flex-direction:column;justify-content:center;padding:8px 10px;gap:6px}
        .wv-vblogo{font-family:'Arial Narrow',Arial,sans-serif;font-weight:900;font-size:11px;color:#F0D269;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
        .wv-fr{display:flex;align-items:center;gap:6px}
        .wv-fl{height:1px;width:16px;background:#F0D269;flex-shrink:0}
        .wv-fd2{width:4px;height:4px;border-radius:50%;background:#F0D269;flex-shrink:0}
        .wv-flbl{font-family:'Courier New',monospace;font-size:8px;font-weight:700;letter-spacing:.08em;color:#F0D269;text-transform:uppercase}
        .wv-fsub{font-family:'Courier New',monospace;font-size:7px;color:#4A4840;margin-left:22px;letter-spacing:.04em}
        .wv-svover{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(10,10,11,.95));padding:12px 14px 16px}
        .wv-vot{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:10.5px;color:#C8C4BC;line-height:1.5}
        .wv-vot em{color:#F0D269;font-style:normal;font-weight:700}
        /* S3 */
        #wv-s-eco{background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 18px 0}
        .wv-elbl{font-family:'Courier New',monospace;font-size:7.5px;font-weight:700;letter-spacing:.22em;color:#6B6040;text-transform:uppercase;margin-bottom:10px;align-self:flex-start}
        .wv-ecards{width:100%;display:flex;flex-direction:column;gap:8px;flex:1;justify-content:center}
        .wv-ecard{background:rgba(255,255,255,.025);border:1px solid #1C1C1E;border-radius:6px;padding:10px 12px;display:flex;align-items:center;gap:10px}
        .wv-eicon{width:28px;height:28px;border-radius:4px;background:rgba(240,210,105,.06);border:1px solid rgba(240,210,105,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;position:relative;overflow:hidden}
        .wv-einfo{flex:1}
        .wv-ename{font-family:Georgia,'Times New Roman',serif;font-size:11px;font-weight:700;color:#F0EDE6;line-height:1.2}
        .wv-esub{font-family:'Courier New',monospace;font-size:8px;color:#4A4840;letter-spacing:.04em;margin-top:2px}
        .wv-ebadge{font-family:'Courier New',monospace;font-size:7px;font-weight:700;padding:2px 5px;border-radius:2px;border:1px solid rgba(240,210,105,.3);color:#F0D269;background:rgba(240,210,105,.06);letter-spacing:.08em;text-transform:uppercase;flex-shrink:0}
        .wv-sglow{position:absolute;inset:0;border-radius:4px;background:radial-gradient(circle,rgba(153,69,255,.3),transparent 70%);animation:wv-pulse 1.5s ease-in-out infinite}
        @keyframes wv-pulse{0%,100%{opacity:.3}50%{opacity:.9}}
        .wv-nring{position:absolute;inset:-2px;border-radius:6px;border:1px solid rgba(240,210,105,.4);animation:wv-nfc 1s ease-out infinite}
        @keyframes wv-nfc{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(1.5)}}
        .wv-dieu{margin-top:10px;width:100%;padding:8px 0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:11px;color:#F0D269;text-align:center;letter-spacing:.08em;border-top:1px solid rgba(240,210,105,.15)}
        /* S4 */
        #wv-s-cta{background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 24px;gap:0}
        .wv-cbrand{font-family:'Arial Narrow',Arial,sans-serif;font-weight:900;font-size:28px;color:#F0D269;letter-spacing:.08em;text-transform:uppercase;text-align:center}
        .wv-cglow{width:120px;height:2px;background:linear-gradient(90deg,transparent,#F0D269,transparent);margin:10px auto}
        .wv-cstart{font-family:'Arial Narrow',Arial,sans-serif;font-weight:900;font-size:38px;color:#F0D269;text-transform:uppercase;letter-spacing:.04em;text-align:center;line-height:1}
        .wv-curl{font-family:'Courier New',monospace;font-size:11px;color:#F0EDE6;text-align:center;letter-spacing:.1em;margin-top:8px}
        .wv-csub{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:12px;color:#6B6040;text-align:center;margin-top:14px;line-height:1.5}
        /* net dots */
        .wv-nd{position:absolute;width:4px;height:4px;border-radius:50%;background:#F0D269}
        .wv-nl{position:absolute;height:1px;background:rgba(240,210,105,.3);transform-origin:left center}
      `}</style>

      <div className="wv-phone">
        <div className="wv-notch" />

        {/* S1: HOOK */}
        <div id="wv-s-hook" className="wv-sc wv-on">
          <div className="wv-notifs">
            <div id="wv-n1" className="wv-notif wv-fs"><div className="wv-notif-dot" /><span className="wv-notif-txt">+$84.20 closed</span></div>
            <div id="wv-n2" className="wv-notif wv-fs"><div className="wv-notif-dot" /><span className="wv-notif-txt">+$127.50 closed</span></div>
            <div id="wv-n3" className="wv-notif wv-fs"><div className="wv-notif-dot" /><span className="wv-notif-txt">+$46.80 closed</span></div>
          </div>
          <div id="wv-pglow" className="wv-pglow wv-fs">
            <div className="wv-psi">
              <div className="wv-psi-row" style={{ width: '80%' }} />
              <div className="wv-psi-row g" style={{ width: '60%' }} />
              <div className="wv-psi-row" style={{ width: '70%' }} />
              <div className="wv-psi-row g" style={{ width: '40%' }} />
            </div>
          </div>
          <div id="wv-htext" className="wv-htext wv-fd">
            "What if your platform<br />worked while <em>you slept?</em>"
          </div>
        </div>

        {/* S2: PLATFORM REVEAL */}
        <div id="wv-s-rev" className="wv-sc">
          <div className="wv-stag">Platform Reveal</div>
          <div className="wv-split">
            <div className="wv-sl">
              <div className="wv-sl-lbl">Basic Chart App</div>
              <canvas ref={canvasRef} width={110} height={50} />
            </div>
            <div className="wv-sr">
              <div id="wv-vblogo" className="wv-vblogo wv-fd">VEDDBuild.com</div>
              <div id="wv-fr1" className="wv-fr wv-fd">
                <div className="wv-fl" /><div className="wv-fd2" />
                <div><div className="wv-flbl">Live AI Signals</div><div className="wv-fsub">Real-time · Multi-TF</div></div>
              </div>
              <div id="wv-fr2" className="wv-fr wv-fd">
                <div className="wv-fl" /><div className="wv-fd2" />
                <div><div className="wv-flbl">SS AI Filter</div><div className="wv-fsub">Smart confluence</div></div>
              </div>
              <div id="wv-fr3" className="wv-fr wv-fd">
                <div className="wv-fl" /><div className="wv-fd2" />
                <div><div className="wv-flbl">EA Auto-Execution</div><div className="wv-fsub">MT4 · MT5 · TradeLocker</div></div>
              </div>
            </div>
          </div>
          <div className="wv-svover">
            <div id="wv-vover" className="wv-vot wv-fd">
              "VEDDBuild is an AI trading ecosystem. Live signals. Smart filtering. <em>Auto-execution on every major broker.</em>"
            </div>
          </div>
        </div>

        {/* S3: ECOSYSTEM */}
        <div id="wv-s-eco" className="wv-sc">
          <div className="wv-elbl">Full Ecosystem</div>
          <div className="wv-ecards">
            <div id="wv-ec1" className="wv-ecard wv-fd">
              <div className="wv-eicon">
                <div className="wv-sglow" />
                <span style={{ position: 'relative', zIndex: 1 }}>◈</span>
              </div>
              <div className="wv-einfo">
                <div className="wv-ename">SOL Scanner</div>
                <div className="wv-esub">Crypto analysis · live signals</div>
              </div>
              <div className="wv-ebadge">LIVE</div>
            </div>
            <div id="wv-ec2" className="wv-ecard wv-fd">
              <div className="wv-eicon" style={{ fontSize: 14 }}>
                <div className="wv-sglow" style={{ animationDelay: '.4s' }} />
                <span style={{ position: 'relative', zIndex: 1, color: '#9945FF' }}>◎</span>
              </div>
              <div className="wv-einfo">
                <div className="wv-ename">$VEDD Token</div>
                <div className="wv-esub">Solana · real utility · staking</div>
              </div>
              <div className="wv-ebadge" style={{ color: '#9945FF', borderColor: 'rgba(153,69,255,.4)', background: 'rgba(153,69,255,.06)' }}>SOL</div>
            </div>
            <div id="wv-ec3" className="wv-ecard wv-fd">
              <div className="wv-eicon" style={{ fontSize: 11, overflow: 'visible' }}>
                <div className="wv-nring" />
                <span style={{ position: 'relative', zIndex: 1 }}>⬡</span>
              </div>
              <div className="wv-einfo">
                <div className="wv-ename">NFC Streetwear</div>
                <div className="wv-esub">Move differently</div>
              </div>
              <div className="wv-ebadge">NFC</div>
            </div>
            <div id="wv-ec4" className="wv-ecard wv-fd">
              <div className="wv-eicon" style={{ position: 'relative' }}>
                <span className="wv-nd" style={{ top: 6, left: 6 }} />
                <span className="wv-nd" style={{ top: 6, right: 6, left: 'auto' }} />
                <span className="wv-nd" style={{ bottom: 6, left: '50%', transform: 'translateX(-50%)' }} />
                <span className="wv-nl" style={{ top: 9, left: 10, width: 10 }} />
                <span className="wv-nl" style={{ top: 9, right: 2, left: 'auto', width: 8, transform: 'rotate(30deg)' }} />
              </div>
              <div className="wv-einfo">
                <div className="wv-ename">Ambassador Program</div>
                <div className="wv-esub">Earn as you grow the movement</div>
              </div>
              <div className="wv-ebadge">EARN</div>
            </div>
          </div>
          <div id="wv-dieu" className="wv-dieu wv-fs">vous êtes des dieux</div>
        </div>

        {/* S4: CTA */}
        <div id="wv-s-cta" className="wv-sc">
          <div id="wv-cbrand" className="wv-cbrand wv-fd">VEDDBuild</div>
          <div id="wv-cglow"  className="wv-cglow wv-fs" />
          <div id="wv-cstart" className="wv-cstart wv-fd">START<br />FREE</div>
          <div id="wv-curl"   className="wv-curl wv-fd">VEDDBuild.com</div>
          <div id="wv-csub"   className="wv-csub wv-fd">"No excuses.<br />Just edge."</div>
        </div>

        <div className="wv-pf-bar"><div className="wv-pf" id="wv-pf" /></div>
        <div className="wv-cap" id="wv-cap" />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        {!ui.done ? (
          <button
            onClick={() => ui.playing ? actRef.current.pause() : actRef.current.play()}
            style={{ background: 'linear-gradient(135deg,#6B5010,#F0D269)', color: '#06060A', border: 'none', borderRadius: 3, padding: '9px 22px', fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer', minWidth: 90 }}
          >
            {ui.playing ? '⏸ Pause' : '▶ Play'}
          </button>
        ) : (
          <button
            onClick={() => actRef.current.restart()}
            style={{ background: 'transparent', color: '#F0D269', border: '1px solid rgba(240,210,105,.3)', borderRadius: 3, padding: '9px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', cursor: 'pointer' }}
          >
            ↺ Replay
          </button>
        )}
        <span style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: '#3A3840', fontVariantNumeric: 'tabular-nums', width: 72 }}>
          {ui.time.toFixed(1)}s / :55
        </span>
      </div>
      <p style={{ fontSize: 10, color: '#1E1C2A', fontFamily: "'Courier New',monospace", letterSpacing: '.04em', marginTop: 4 }}>
        Screen-record to export · YouTube Shorts · IG Reels
      </p>
    </>
  );
}
