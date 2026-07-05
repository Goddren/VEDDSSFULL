import { useRef, useState, useEffect } from 'react';

// ── VEDD Educational Reels ─────────────────────────────────────────────────────
// Rebuilt to match the EXACT architecture of the original vedd-reel-player.tsx:
// a phone-shell with absolutely-positioned scene divs, imperative DOM show/hide
// via classList (not React re-render per frame), and a canvas used only for the
// price-chart scene. Same 5-scene skeleton as the original: HOOK → SPLIT →
// CHART → VAULT → CLOSE, 20 seconds, same CSS transition classes.

export interface EduReel {
  id: string;
  title: string;
  accent: string;      // hex accent color
  chart: 'up' | 'chop' | 'breakout';
  hook: [string, string, string];               // 3 staggered lines
  splitLeft: { label: string; badge1: string; badge2: string; flash: string };
  splitRight: { label: string; rows: string[]; stat: string };
  chartScene: { title: string; subtitle: string; sigLabel: string; msgTitle: string; msgBody: string };
  vaultScene: { title: string; subtitle: string; cards: Array<{ name: string; row: string; bars: number[] }>; extra: { title: string; body: string } };
  close: [string, string, string, string];      // 4 lines, last is the URL
  script: string[];      // narration paragraphs for the side panel
  shareCaption: string;  // ready-to-post caption
}

export const EDU_REELS: EduReel[] = [
  {
    id: 'why-traders-lose',
    title: 'Why 90% of Traders Lose',
    accent: '#EF4444', chart: 'chop',
    hook: ['STOP.', "90% of traders lose money.", "It's not the market. It's you."],
    splitLeft: { label: 'Emotion', badge1: '✗ Fear exit — early', badge2: '✗ Greed re-entry — late', flash: 'PANIC SELL' },
    splitRight: { label: 'Discipline', rows: ['RULE  entry confirmed ✓', 'RULE  size checked ✓', 'RULE  SL/TP set ✓', 'RULE  no override ✓', 'RULE  logged & closed ✓'], stat: '0 trades on tilt' },
    chartScene: { title: 'BTC / USD', subtitle: 'RANGE: 64,000 ── 65,000 · RULES-ONLY EXECUTION', sigLabel: '↑ AI ENTRY EXECUTED — RULES ONLY', msgTitle: 'No fear. No greed.', msgBody: 'Just the plan, executed exactly.' },
    vaultScene: { title: 'AI Vault', subtitle: 'Zero emotional override.', cards: [
      { name: 'VEDD SS AI Engine', row: 'MT5 + TradeLocker · rules-only execution', bars: [8,13,10,16,12,18,14] },
      { name: 'Risk Guard EA', row: 'Auto-halts on daily loss breach', bars: [14,9,18,11,16,13] },
    ], extra: { title: 'ABBA AI Strategist', body: 'Diagnosis: fear/greed removed from execution.\nWin rate impact: measurable, compounding.' } },
    close: ['your emotions are expensive.', 'automation is free.', '→ build your vault now', 'veddbuild.com'],
    script: [
      'HOOK: 90% of traders lose money — and it has nothing to do with their strategy.',
      'The market doesn’t beat traders. Emotions do. Fear makes you exit winners early. Greed makes you hold losers too long.',
      'VEDD’s AI engine scans, enters, and exits on rules only. No fear. No greed. No revenge.',
      'Just the plan, executed exactly — every time.',
    ],
    shareCaption: '90% of traders lose — not because of strategy, because of EMOTION. Fear exits early. Greed holds too long. The fix? AI execution with zero feelings. That\'s VEDDBuild. 🧠⚡',
  },
  {
    id: 'copy-trading-101',
    title: 'Copy Trading in 20 Seconds',
    accent: '#A855F7', chart: 'up',
    hook: ['NEW HERE?', 'You don\'t need to trade to trade.', 'Copy a winner instead.'],
    splitLeft: { label: 'Trading Solo', badge1: '✗ No track record to trust', badge2: '✗ Learning on real money', flash: 'GUESSING' },
    splitRight: { label: 'Copy Trading', rows: ['LIVE  leaderboard ranked ✓', 'LIVE  win rate public ✓', 'LIVE  best trade shown ✓', 'LIVE  your risk limit set ✓', 'LIVE  mirrored instantly ✓'], stat: '◎ signal mirrored' },
    chartScene: { title: 'EUR / USD', subtitle: 'SOURCE TRADER · LIVE MIRROR ACTIVE', sigLabel: '↑ SIGNAL MIRRORED TO YOUR ACCOUNT', msgTitle: 'Their win.', msgBody: 'Your account, automatically.' },
    vaultScene: { title: 'Copy Engine', subtitle: 'You learn while you earn.', cards: [
      { name: 'Trader Leaderboard', row: 'Win rate · P&L · best trade — all public', bars: [16,14,17,12,15,18] },
      { name: 'Auto-Mirror Engine', row: 'Max lot size set by YOU', bars: [10,12,9,14,11] },
    ], extra: { title: 'Paper Mode', body: 'Start with zero risk while you learn.\nGraduate to live once you trust the process.' } },
    close: ['don\'t learn alone.', 'copy the winners.', '→ start copying now', 'veddbuild.com/copy-trading'],
    script: [
      'HOOK: You don’t need to know how to trade to start trading — you need to know WHO to copy.',
      'Copy trading means mirroring a proven trader’s moves automatically. They win, you win.',
      'On VEDD there’s a live leaderboard — real win rates, real P&L, all public. Pick a trader, set your max lot size.',
      'Start in paper mode with zero risk while you learn. That’s the on-ramp.',
    ],
    shareCaption: 'You don\'t need to master charts to start trading. Copy trading = mirror proven winners automatically. Live leaderboard, real stats, your risk limits. Start on paper, zero risk. 📋🏆',
  },
  {
    id: 'prop-firm-explained',
    title: 'Prop Firms Explained',
    accent: '#F59E0B', chart: 'breakout',
    hook: ['$100,000 ACCOUNT.', 'Using $100 of your own money.', "Here's how."],
    splitLeft: { label: 'Undisciplined', badge1: '✗ Blew the daily loss cap', badge2: '✗ Challenge over — day 4', flash: 'FAILED' },
    splitRight: { label: 'VEDD Prop Mode', rows: ['AUTO  daily loss capped ✓', 'AUTO  session filter on ✓', 'AUTO  consistency check ✓', 'AUTO  halts before breach ✓', 'AUTO  challenge protected ✓'], stat: 'Discipline: enforced' },
    chartScene: { title: 'XAU / USD', subtitle: 'CHALLENGE ACCOUNT · AUTO-GUARDED', sigLabel: '⏸ AUTO-HALT — BEFORE BREACH', msgTitle: 'Discipline,', msgBody: 'automated for you.' },
    vaultScene: { title: 'Challenge Guard', subtitle: 'Their capital. Your profits.', cards: [
      { name: 'Daily Loss Guard', row: 'Hard stop before the limit hits', bars: [12,15,9,17,11,14] },
      { name: 'Session Filter EA', row: 'London–NY overlap only', bars: [15,10,13,16,9] },
    ], extra: { title: 'Consistency Enforcer', body: 'Prevents one huge day from voiding payout.\nSmooth, fundable equity curve — by design.' } },
    close: ['their capital.', 'your profits.', '→ pass your challenge', 'veddbuild.com'],
    script: [
      'HOOK: What if you could trade a $100,000 account with only $100 of your own money?',
      'That’s the prop firm model — pass their evaluation and trade THEIR capital, keeping up to 90% of profits.',
      'The catch? Brutal rules. Daily loss caps, drawdown limits. One undisciplined day ends the challenge.',
      'VEDD’s Prop Firm Mode enforces those rules automatically — it is discipline, automated.',
    ],
    shareCaption: 'Trade $100K with $100 down — that\'s prop firms. Pass the challenge, keep up to 90% of profits. The hard part is the RULES. VEDD\'s Prop Mode enforces them automatically. 🎯💰',
  },
  {
    id: 'orb-in-20',
    title: 'The ORB Strategy in 20s',
    accent: '#22C55E', chart: 'breakout',
    hook: ['9:30 AM.', 'Same setup. Every single day.', "Here's the play."],
    splitLeft: { label: 'Chasing', badge1: '✗ Bought the spike', badge2: '✗ Got faded immediately', flash: 'FOMO' },
    splitRight: { label: 'ORB Method', rows: ['WAIT  range set 9:30–9:45 ✓', 'WAIT  breakout confirmed ✓', 'WAIT  retest of level ✓', 'WAIT  confirming candle ✓', 'WAIT  AI score ≥70 ✓'], stat: 'Target: 2:1 R:R' },
    chartScene: { title: 'US30', subtitle: 'OPENING RANGE · RETEST WATCH', sigLabel: '↑ RETEST CONFIRMED — ENTRY', msgTitle: 'Wait for the level.', msgBody: 'Not the noise.' },
    vaultScene: { title: 'ORB Scanner', subtitle: 'Same time. Same rules.', cards: [
      { name: 'ORB Live Scanner', row: 'Every morning, every instrument', bars: [9,14,11,17,13,16] },
      { name: 'AI Score Filter', row: 'Only ≥70-scored setups fire', bars: [16,12,15,10,14] },
    ], extra: { title: 'Retest Confirmation', body: 'Confirming candle + AI score = entry.\nStop just outside range · Target 2:1.' } },
    close: ['same time. same rules.', 'every morning.', '→ scan the range now', 'veddbuild.com/orb-breakout'],
    script: [
      'HOOK: The strategy day traders run at the same time every single morning.',
      'At 9:30 the market opens. The first 15 minutes set the Opening Range — the high and the low.',
      'You never chase the breakout — you wait for the retest, then a confirming candle.',
      'VEDD adds an AI score on top — 70+ means the setup is validated. VEDD scans it live every morning.',
    ],
    shareCaption: 'The ORB strategy: 9:30 open → first 15 min sets the range → trade the breakout + retest with 2:1 targets. Done by lunch. VEDD scans it live with AI scoring every morning. 🎯📈',
  },
  {
    id: 'ai-predictions',
    title: 'AI Predictions: Kalshi & Polymarket',
    accent: '#3B82F6', chart: 'up',
    hook: ['YES OR NO.', 'Literally tradable.', 'AI knows which side has the edge.'],
    splitLeft: { label: 'Guessing', badge1: '✗ No real edge', badge2: '✗ Coinflip odds', flash: 'BLIND BET' },
    splitRight: { label: 'VEDD AI Edge', rows: ['SCAN  momentum model ✓', 'SCAN  order-flow read ✓', 'SCAN  volume profile ✓', 'SCAN  ensemble score ✓', 'SCAN  win prob ranked ✓'], stat: 'Win prob: 78%' },
    chartScene: { title: 'BTC / USD', subtitle: 'PREDICTION MARKET · EDGE MODEL LIVE', sigLabel: '↑ TOP PICK IDENTIFIED', msgTitle: 'Compounding stakes', msgBody: 'as your bankroll grows.' },
    vaultScene: { title: 'Predictions Engine', subtitle: 'Yes or no. The AI knows which.', cards: [
      { name: 'Kalshi Scanner', row: 'Live contracts · edge-ranked picks', bars: [14,17,11,16,13,15] },
      { name: 'Polymarket Engine', row: 'Cross-market probability model', bars: [12,15,10,17,14] },
    ], extra: { title: 'Compounding Mode', body: 'Stakes scale with your bankroll as you win.\nSmall account, fast growth curve.' } },
    close: ['yes or no.', 'the ai knows which.', '→ see the top picks', 'veddbuild.com'],
    script: [
      'HOOK: There’s a market where you literally trade YES or NO — and AI can tell you which side has the edge.',
      'Kalshi and Polymarket are prediction markets. Contracts cost cents; winners pay out a dollar.',
      'VEDD’s AI models the real probability with momentum, order flow, and an ensemble — then ranks the best picks.',
      'Turn on compounding mode and stakes scale with your bankroll as you win.',
    ],
    shareCaption: 'Prediction markets: buy YES or NO on real events — contracts cost cents, winners pay $1. VEDD\'s AI ranks the picks with the real edge + compounds your stakes as you win. 🔮⚡',
  },
];

// Deterministic price paths per chart style (shared canvas scene)
function buildPrices(style: 'up' | 'chop' | 'breakout'): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 100; i++) {
    const t = i / 99;
    let v: number;
    if (style === 'up') v = 64200 + 900 * t + 120 * Math.sin(t * 9 * Math.PI) + (((i * 131 + 17) % 140) - 70);
    else if (style === 'breakout') v = t < 0.55 ? 64300 + 150 * Math.sin(t * 13 * Math.PI) : 64450 + (t - 0.55) * 1900 + 100 * Math.sin(t * 17 * Math.PI);
    else v = 64500 + 420 * Math.sin(t * 3.1 * Math.PI + 0.4) + 180 * Math.sin(t * 7.3 * Math.PI - 0.8) + (((i * 137 + i * i * 3 + 57) % 200) - 100);
    pts.push(v);
  }
  return pts;
}
const SIG_IDX = [18, 47, 76];
const TOTAL = 20;
const SCENES = [
  { id: 's-hook',  s: 0,   e: 1.5 },
  { id: 's-split', s: 1.5, e: 8   },
  { id: 's-chart', s: 8,   e: 14  },
  { id: 's-vault', s: 14,  e: 17  },
  { id: 's-close', s: 17,  e: 20  },
];

// ── Component — identical architecture to the original VeddReelPlayer ─────────
export function VeddEduReel({ reel }: { reel: EduReel }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef({ playing: false, elapsed: 0, t0: 0, rafId: 0 });
  const actRef = useRef({ play: () => {}, pause: () => {}, restart: () => {} });
  const [ui, setUi] = useState({ playing: false, time: 0, done: false });
  const PRICES = useRef<number[]>(buildPrices(reel.chart));

  useEffect(() => {
    PRICES.current = buildPrices(reel.chart);
  }, [reel.chart]);

  useEffect(() => {
    const C = containerRef.current!;
    const cvs = canvasRef.current!;
    const ctx = cvs.getContext('2d')!;
    const anim = animRef.current;
    anim.playing = false; anim.elapsed = 0;

    function q(sel: string) { return C.querySelector(sel) as HTMLElement | null; }
    function qa(sel: string) { return Array.from(C.querySelectorAll(sel)) as HTMLElement[]; }
    function show(id: string, on: boolean) {
      const el = q('#' + id);
      if (el) el.classList.toggle('rp-show', on);
    }

    // Build candles for the split scene (left panel)
    const row = q('.er-candle-row');
    if (row) {
      row.innerHTML = '';
      [52, 44, 60, 36, 48, 40, 28].forEach(h => {
        const d = document.createElement('div');
        d.style.cssText = `width:8px;height:${h}px;border-radius:1px;background:${reel.accent};opacity:0;transition:opacity .3s;flex-shrink:0;`;
        d.className = 'er-cv';
        row.appendChild(d);
      });
    }

    function hookUpd(t: number) {
      show('er-h1', t > 0.3);
      show('er-h2', t > 0.8);
      show('er-h3', t > 1.2);
    }

    function splitUpd(t: number) {
      if (t < 1.5 || t >= 8) return;
      const s = t - 1.5;
      qa('.er-cv').forEach((el, i) => el.classList.toggle('rp-show', s > i * 0.12));
      show('er-b1', s > 0.7);
      show('er-b2', s > 1.4);
      for (let i = 1; i <= reel.splitRight.rows.length; i++) show('er-e' + i, s > 2 + i * 0.5);
      show('er-stat', s > 2.4 + reel.splitRight.rows.length * 0.5);
    }

    function drawChart(prog: number, s: number) {
      const W = 300, H = 200, PX = 14, PY = 16;
      const prices = PRICES.current;
      const min = Math.min(...prices), max = Math.max(...prices);
      const pw = W - PX * 2, ph = H - PY * 2;
      const px = (i: number) => PX + (i / 99) * pw;
      const py = (p: number) => PY + (1 - (p - min) / (max - min || 1)) * ph;

      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = PY + ph * i / 4;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      const endIdx = Math.floor(prog * 99);
      if (endIdx < 1) return;

      ctx.beginPath();
      ctx.moveTo(px(0), py(prices[0]));
      for (let i = 1; i <= endIdx; i++) ctx.lineTo(px(i), py(prices[i]));
      ctx.lineTo(px(endIdx), H); ctx.lineTo(px(0), H); ctx.closePath();
      ctx.fillStyle = reel.accent + '0d'; ctx.fill();

      ctx.beginPath();
      ctx.moveTo(px(0), py(prices[0]));
      for (let i = 1; i <= endIdx; i++) ctx.lineTo(px(i), py(prices[i]));
      ctx.strokeStyle = reel.accent; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.beginPath();
      ctx.arc(px(endIdx), py(prices[endIdx]), 3, 0, Math.PI * 2);
      ctx.fillStyle = reel.accent; ctx.fill();

      SIG_IDX.forEach(idx => {
        if (idx / 99 > prog) return;
        const x = px(idx), y = py(prices[idx]);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
        g.addColorStop(0, 'rgba(34,197,94,.25)');
        g.addColorStop(1, 'rgba(34,197,94,0)');
        ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y - 18); ctx.lineTo(x - 6, y - 8); ctx.lineTo(x + 6, y - 8); ctx.closePath();
        ctx.fillStyle = '#22C55E'; ctx.fill();
      });

      const anySig = SIG_IDX.some(i => i / 99 <= prog);
      show('er-siglbl', anySig);
      show('er-mtfmsg', s > 3);
    }

    function chartUpd(t: number) {
      if (t < 8 || t >= 14) return;
      const s = t - 8;
      drawChart(Math.min(1, s / 2.5), s);
    }

    function vaultUpd(t: number) {
      if (t < 14 || t >= 17) return;
      const s = t - 14;
      reel.vaultScene.cards.forEach((_, i) => show('er-c' + i, s > 0.2 + i * 0.5));
      show('er-extra', s > 0.2 + reel.vaultScene.cards.length * 0.5 + 0.3);
    }

    function closeUpd(t: number) {
      if (t < 17) return;
      const s = t - 17;
      reel.close.forEach((line, i) => { if (line) show('er-cl' + i, s > 0.3 + i * 0.6); });
    }

    const CAPTIONS = reel.script.length
      ? [{ t: 0, v: '' }, ...reel.script.map((v, i) => ({ t: 0.4 + i * 4.5, v }))]
      : [{ t: 0, v: '' }];

    function updateAll(t: number) {
      const pf = q('.er-pf');
      if (pf) pf.style.width = (t / TOTAL * 100) + '%';

      SCENES.forEach(sc => {
        const el = q('.' + sc.id);
        if (el) el.classList.toggle('rp-on', t >= sc.s && t < sc.e);
      });

      let cap = '';
      for (let i = CAPTIONS.length - 1; i >= 0; i--) {
        if (t >= CAPTIONS[i].t) { cap = CAPTIONS[i].v; break; }
      }
      const capEl = q('.er-cap');
      if (capEl) capEl.textContent = cap;

      hookUpd(t);
      splitUpd(t);
      chartUpd(t);
      vaultUpd(t);
      closeUpd(t);
    }

    function tick(now: number) {
      if (!anim.playing) return;
      anim.elapsed = Math.min((now - anim.t0) / 1000, TOTAL);
      updateAll(anim.elapsed);
      setUi(u => ({ ...u, time: anim.elapsed }));
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
  }, [reel]);

  const { playing, time, done } = ui;
  const A = reel.accent;

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
        width: 300, height: 534, background: '#080B14', borderRadius: 36,
        border: '2px solid #1C2235', overflow: 'hidden', position: 'relative', flexShrink: 0,
        boxShadow: '0 0 0 6px #0A0D18,0 0 0 7px #1A2030,0 36px 90px rgba(0,0,0,.85)',
      }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 70, height: 18, background: '#060910', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, zIndex: 200 }} />

        {/* HOOK */}
        <div className="rp-scene s-hook" style={{ background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 28px' }}>
          <div id="er-h1" className="rp-fadeable" style={{ fontSize: 30, fontWeight: 900, color: '#fff', textAlign: 'center', marginBottom: 14 }}>{reel.hook[0]}</div>
          <div id="er-h2" className="rp-fadeable" style={{ fontSize: 16, fontWeight: 700, color: '#94A3B8', textAlign: 'center', marginBottom: 10 }}>{reel.hook[1]}</div>
          <div id="er-h3" className="rp-fadeable" style={{ fontSize: 19, fontWeight: 900, color: A, textAlign: 'center' }}>{reel.hook[2]}</div>
        </div>

        {/* SPLIT */}
        <div className="rp-scene s-split" style={{ display: 'flex', flexDirection: 'row', height: '100%' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 10px 16px', gap: 8, overflow: 'hidden', background: 'linear-gradient(180deg,#1a0606,#0d0202)', borderRight: '1px solid #2a0808' }}>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#EF4444' }}>● {reel.splitLeft.label}</div>
            <div className="er-candle-row" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 72 }} />
            <div id="er-b1" className="rp-badge" style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 2, background: 'rgba(239,68,68,.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,.3)', display: 'inline-flex', width: 'fit-content' }}>{reel.splitLeft.badge1}</div>
            <div id="er-b2" className="rp-badge" style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 2, background: 'rgba(239,68,68,.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,.3)', display: 'inline-flex', width: 'fit-content' }}>{reel.splitLeft.badge2}</div>
            <div className="rp-flash" style={{ marginTop: 'auto', background: '#EF4444', color: '#fff', borderRadius: 2, padding: '5px 10px', fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', width: 'fit-content' }}>{reel.splitLeft.flash}</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 10px 16px', gap: 8, overflow: 'hidden', background: `linear-gradient(180deg,${A}14,#010a04)` }}>
            <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: A }}>● {reel.splitRight.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {reel.splitRight.rows.map((row, i) => (
                <div key={i} id={`er-e${i + 1}`} className="rp-noshow" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, color: '#86efac', fontFamily: 'Courier New,monospace', lineHeight: 1.2 }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: A, flexShrink: 0 }} />
                  {row}
                </div>
              ))}
            </div>
            <div id="er-stat" className="rp-noshow" style={{ fontFamily: 'Courier New,monospace', fontSize: 10, fontWeight: 700, color: A, background: A + '14', border: `1px solid ${A}33`, borderRadius: 2, padding: '4px 8px', marginTop: 4 }}>{reel.splitRight.stat}</div>
          </div>
        </div>

        {/* CHART */}
        <div className="rp-scene s-chart" style={{ background: '#050810', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '28px 16px 4px' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#94A3B8' }}>{reel.chartScene.title}</div>
            <div style={{ fontSize: 8, color: '#4B5A72', fontFamily: 'Courier New,monospace', letterSpacing: '0.06em', marginTop: 1 }}>{reel.chartScene.subtitle}</div>
          </div>
          <canvas ref={canvasRef} width={300} height={200} style={{ display: 'block', flexShrink: 0 }} />
          <div id="er-siglbl" className="rp-noshow" style={{ margin: '6px 16px 0', fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: '#22C55E', textTransform: 'uppercase' }}>{reel.chartScene.sigLabel}</div>
          <div id="er-mtfmsg" className="rp-noshow" style={{ margin: '6px 16px 0', fontSize: 12, fontWeight: 700, color: '#64748B', lineHeight: 1.5 }}>
            <b style={{ color: '#F1F5F9' }}>{reel.chartScene.msgTitle}</b><br />{reel.chartScene.msgBody}
          </div>
        </div>

        {/* VAULT */}
        <div className="rp-scene s-vault" style={{ background: '#070912', display: 'flex', flexDirection: 'column', padding: '22px 14px', gap: 9 }}>
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: A }}>{reel.vaultScene.title}</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#F1F5F9', marginTop: 2 }}>{reel.vaultScene.subtitle}</div>
          {reel.vaultScene.cards.map((c, i) => (
            <div key={i} id={`er-c${i}`} className="rp-slide" style={{ background: '#0D1117', border: '1px solid #1A2030', borderRadius: 3, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#F1F5F9' }}>{c.name}</span>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: '#22C55E', textTransform: 'uppercase' }}>● Running</span>
              </div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 18 }}>
                {c.bars.map((h, j) => <div key={j} style={{ width: 5, height: h, borderRadius: 1, background: '#22C55E', opacity: 0.6 }} />)}
              </div>
              <div style={{ fontSize: 8, color: '#64748B', fontFamily: 'Courier New,monospace', marginTop: 2 }}>{c.row}</div>
            </div>
          ))}
          <div id="er-extra" className="rp-slide" style={{ background: 'linear-gradient(135deg,#0D1117,#0F0D1F)', border: '1px solid #2D1B6B', borderRadius: 3, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <div className="rp-pp" style={{ width: 6, height: 6, borderRadius: '50%', background: '#A855F7' }} />
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: '#A855F7', textTransform: 'uppercase' }}>{reel.vaultScene.extra.title}</span>
            </div>
            <div style={{ fontSize: 10, color: '#94A3B8', lineHeight: 1.45, fontFamily: 'Courier New,monospace', whiteSpace: 'pre-line' }}>{reel.vaultScene.extra.body}</div>
          </div>
        </div>

        {/* CLOSE */}
        <div className="rp-scene s-close" style={{ background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 6 }}>
          {reel.close.map((line, i) => line ? (
            <div key={i} id={`er-cl${i}`} className="rp-fadeable" style={{
              fontFamily: 'Courier New,monospace',
              fontSize: i === 0 ? 16 : i === 3 ? 10 : 14,
              fontWeight: i === 3 ? 400 : 700,
              color: i === 2 ? A : i === 3 ? '#374151' : i === 1 ? '#64748B' : '#fff',
              letterSpacing: i === 2 ? '0.04em' : i === 3 ? '0.08em' : 'normal',
              textAlign: 'center',
              marginTop: i === 2 ? 18 : i === 3 ? 2 : 0,
            }}>{line}</div>
          ) : null)}
        </div>

        {/* Progress bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(255,255,255,.05)', zIndex: 100 }}>
          <div className="er-pf" style={{ height: '100%', width: '0%', background: `linear-gradient(90deg,${A},#f97316)` }} />
        </div>

        {/* Caption */}
        <div className="er-cap" style={{ position: 'absolute', bottom: 26, left: 10, right: 10, zIndex: 90, fontSize: 11, fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: 1.45, textShadow: '0 1px 8px rgba(0,0,0,1)', minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {!done ? (
          <button
            onClick={playing ? actRef.current.pause : actRef.current.play}
            style={{ background: A, color: '#fff', border: 'none', borderRadius: 3, padding: '10px 24px', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', minWidth: 100 }}
          >
            {playing ? '⏸ Pause' : '▶ Play'}
          </button>
        ) : (
          <button
            onClick={actRef.current.restart}
            style={{ background: 'rgba(255,255,255,.06)', color: '#94A3B8', border: '1px solid #1C2235', borderRadius: 3, padding: '10px 24px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            ↺ Replay
          </button>
        )}
        <div style={{ fontFamily: 'Courier New,monospace', fontSize: 11, color: '#4B5A72', fontVariantNumeric: 'tabular-nums' }}>
          {time.toFixed(1)}s / 20s
        </div>
        {(time > 0 && !done) && (
          <button
            onClick={actRef.current.restart}
            style={{ background: 'transparent', color: '#374151', border: '1px solid #1C2235', borderRadius: 3, padding: '9px 12px', fontSize: 12, cursor: 'pointer' }}
          >
            ↺
          </button>
        )}
      </div>

      <p style={{ fontSize: 11, color: '#374151', textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
        Screen-record this preview to export as a real .mp4 for TikTok or IG.
      </p>
    </div>
  );
}
