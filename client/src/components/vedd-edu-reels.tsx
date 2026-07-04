import { useRef, useState, useEffect } from 'react';

// ── VEDD Educational Reels — 5 caption-driven reels in the house style ─────────
// Same look as the flagship reels: 9:16 dark frame, animated price line,
// timed captions, play/pause/restart + progress. Each reel is pure config so
// new ones are cheap to add. Screen-record OR just share the script + caption.

export interface EduReel {
  id: string;
  title: string;
  duration: number; // seconds
  accent: string;   // hex accent color
  chart: 'up' | 'chop' | 'breakout';
  captions: Array<{ t: number; v: string }>;
  script: string[];       // narration paragraphs for the side panel
  closing: string[];      // closing text card lines
  shareCaption: string;   // ready-to-post caption
}

export const EDU_REELS: EduReel[] = [
  {
    id: 'why-traders-lose',
    title: 'Why 90% of Traders Lose',
    duration: 20, accent: '#ef4444', chart: 'chop',
    captions: [
      { t: 0, v: '' },
      { t: 0.4, v: '90% of traders lose money.' },
      { t: 2.2, v: "Here's the part nobody tells you —" },
      { t: 4.0, v: "it's not the strategy. It's the human." },
      { t: 6.0, v: 'Fear exits winners early.' },
      { t: 7.6, v: 'Greed holds losers too long.' },
      { t: 9.4, v: 'Revenge trading burns the rest.' },
      { t: 11.2, v: 'The fix? Remove the human from execution.' },
      { t: 13.2, v: 'VEDD AI scans, enters, exits — rules only.' },
      { t: 15.4, v: 'No fear. No greed. No revenge.' },
      { t: 17.2, v: 'Trade the plan, not the panic.' },
      { t: 18.6, v: 'veddbuild.com — start free.' },
    ],
    script: [
      'HOOK: 90% of traders lose money — and it has nothing to do with their strategy.',
      'The market doesn’t beat traders. Emotions do. Fear makes you exit winners early. Greed makes you hold losers too long. And revenge trading burns whatever is left.',
      'The professionals figured this out decades ago: remove the human from execution. That is exactly what VEDD’s AI engine does — it scans, enters and exits on rules only.',
      'No fear. No greed. No revenge. Just the plan, executed.',
    ],
    closing: ['your emotions are expensive.', 'automation is free.', '→ veddbuild.com'],
    shareCaption: '90% of traders lose — not because of strategy, because of EMOTION. Fear exits early. Greed holds too long. The fix? AI execution with zero feelings. That\'s VEDDBuild. 🧠⚡',
  },
  {
    id: 'copy-trading-101',
    title: 'Copy Trading in 20 Seconds',
    duration: 20, accent: '#a855f7', chart: 'up',
    captions: [
      { t: 0, v: '' },
      { t: 0.4, v: 'New to trading? Watch this.' },
      { t: 2.0, v: "Copy trading = mirror a winner's trades." },
      { t: 4.2, v: 'They win → you win. Automatically.' },
      { t: 6.4, v: 'On VEDD: a live leaderboard of real traders.' },
      { t: 8.6, v: 'Win rate. P&L. Best trade. All public.' },
      { t: 10.8, v: 'Pick one. Set your max lot size.' },
      { t: 12.8, v: 'Every signal they get fires on YOUR account.' },
      { t: 15.0, v: 'You learn while you earn.' },
      { t: 16.8, v: 'Start on paper — zero risk.' },
      { t: 18.4, v: 'veddbuild.com/copy-trading' },
    ],
    script: [
      'HOOK: You don’t need to know how to trade to start trading — you need to know WHO to copy.',
      'Copy trading means mirroring a proven trader’s moves automatically. They win, you win.',
      'On VEDD there’s a live leaderboard — real win rates, real P&L, best trades, all public. Pick a trader, set your max lot size, and every AI signal they get fires on your account too.',
      'Start in paper mode with zero risk while you learn. That’s the on-ramp.',
    ],
    closing: ['don’t learn alone.', 'copy the winners.', '→ veddbuild.com/copy-trading'],
    shareCaption: 'You don\'t need to master charts to start trading. Copy trading = mirror proven winners automatically. Live leaderboard, real stats, your risk limits. Start on paper, zero risk. 📋🏆',
  },
  {
    id: 'prop-firm-explained',
    title: 'Prop Firms Explained',
    duration: 20, accent: '#f59e0b', chart: 'breakout',
    captions: [
      { t: 0, v: '' },
      { t: 0.4, v: 'Trade a $100K account with $100? Yes.' },
      { t: 2.6, v: "It's called a prop firm challenge." },
      { t: 4.6, v: 'Pass their test → trade THEIR capital.' },
      { t: 6.8, v: 'You keep up to 90% of profits.' },
      { t: 8.8, v: 'The catch: strict rules. Daily loss caps.' },
      { t: 11.0, v: 'One bad day = challenge over.' },
      { t: 13.0, v: 'VEDD Prop Mode enforces the rules FOR you.' },
      { t: 15.2, v: 'Auto-halts before you breach limits.' },
      { t: 17.0, v: 'Discipline, automated.' },
      { t: 18.4, v: 'veddbuild.com/prop-firm-challenge' },
    ],
    script: [
      'HOOK: What if you could trade a $100,000 account with only $100 of your own money?',
      'That’s the prop firm model — pass their evaluation and you trade THEIR capital, keeping up to 90% of the profits.',
      'The catch? Brutal rules. Daily loss caps, max drawdown, consistency requirements. One undisciplined day ends the whole challenge.',
      'VEDD’s Prop Firm Mode enforces those rules automatically — session filters, daily halts, drawdown protection. It is discipline, automated.',
    ],
    closing: ['their capital.', 'your profits.', 'our discipline engine.', '→ veddbuild.com'],
    shareCaption: 'Trade $100K with $100 down — that\'s prop firms. Pass the challenge, keep up to 90% of profits. The hard part is the RULES. VEDD\'s Prop Mode enforces them automatically. 🎯💰',
  },
  {
    id: 'orb-in-20',
    title: 'The ORB Strategy in 20s',
    duration: 20, accent: '#22c55e', chart: 'breakout',
    captions: [
      { t: 0, v: '' },
      { t: 0.4, v: 'One strategy. Same time. Every day.' },
      { t: 2.4, v: '9:30 AM — market opens.' },
      { t: 4.2, v: 'First 15 minutes = the Opening Range.' },
      { t: 6.4, v: 'Price breaks ABOVE the range? Long setup.' },
      { t: 8.6, v: 'Breaks BELOW? Short setup.' },
      { t: 10.6, v: "Don't chase — wait for the RETEST." },
      { t: 12.8, v: 'Confirming candle + AI score ≥ 70 = entry.' },
      { t: 15.0, v: 'Stop below range. Target 2:1. Done by lunch.' },
      { t: 17.2, v: 'VEDD scans it live, every morning.' },
      { t: 18.6, v: 'veddbuild.com/orb-breakout' },
    ],
    script: [
      'HOOK: The strategy day traders run at the same time every single morning.',
      'At 9:30 the market opens. The first 15 minutes set the Opening Range — the high and the low.',
      'Break above it? Long setup. Break below? Short. But you never chase — you wait for the retest of the level, then a confirming candle.',
      'VEDD adds an AI score on top — 70+ means the setup is validated. Stop goes just outside the range, target 2:1. Usually done by lunch. VEDD scans it live every morning.',
    ],
    closing: ['same time.', 'same rules.', 'every morning.', '→ veddbuild.com/orb-breakout'],
    shareCaption: 'The ORB strategy: 9:30 open → first 15 min sets the range → trade the breakout + retest with 2:1 targets. Done by lunch. VEDD scans it live with AI scoring every morning. 🎯📈',
  },
  {
    id: 'ai-predictions',
    title: 'AI Predictions: Kalshi & Polymarket',
    duration: 20, accent: '#60a5fa', chart: 'up',
    captions: [
      { t: 0, v: '' },
      { t: 0.4, v: 'You can trade YES or NO. Literally.' },
      { t: 2.4, v: 'Prediction markets: Kalshi & Polymarket.' },
      { t: 4.6, v: '"Will BTC close above 65k?" Buy YES or NO.' },
      { t: 7.0, v: 'Contracts cost cents. Winners pay $1.' },
      { t: 9.2, v: 'The edge? Knowing the real probability.' },
      { t: 11.4, v: "VEDD's AI models it: momentum, order flow…" },
      { t: 13.6, v: 'Ranks the picks most likely to WIN.' },
      { t: 15.6, v: 'Compounding mode grows stakes as you win.' },
      { t: 17.4, v: 'Small account → fast growth curve.' },
      { t: 18.8, v: 'veddbuild.com — predictions engine.' },
    ],
    script: [
      'HOOK: There’s a market where you literally trade YES or NO — and AI can tell you which side has the edge.',
      'Kalshi and Polymarket are prediction markets. "Will Bitcoin close above 65k this hour?" You buy YES or NO. Contracts cost cents; winners pay out a dollar.',
      'The edge is knowing the REAL probability versus the market price. VEDD’s AI models it with momentum, order flow, volume profile and an ensemble — then ranks the picks most likely to win.',
      'Turn on compounding mode and stakes scale with your bankroll as you win. Small account, fast growth curve.',
    ],
    closing: ['yes or no.', 'the AI knows which.', '→ veddbuild.com'],
    shareCaption: 'Prediction markets: buy YES or NO on real events — contracts cost cents, winners pay $1. VEDD\'s AI ranks the picks with the real edge + compounds your stakes as you win. 🔮⚡',
  },
];

// ── Reel player — canvas price line + timed captions, house style ─────────────
export function VeddEduReel({ reel }: { reel: EduReel }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef({ playing: false, elapsed: 0, t0: 0, rafId: 0 });
  const [ui, setUi] = useState({ playing: false, time: 0, done: false });

  // Deterministic price path per chart style
  const prices = useRef<number[]>([]);
  useEffect(() => {
    const pts: number[] = [];
    for (let i = 0; i < 110; i++) {
      const t = i / 109;
      let v = 50;
      if (reel.chart === 'up') v = 30 + 45 * t + 6 * Math.sin(t * 9 * Math.PI) + (((i * 131 + 17) % 14) - 7) * 0.6;
      if (reel.chart === 'chop') v = 50 + 9 * Math.sin(t * 11 * Math.PI) + (((i * 173 + 31) % 18) - 9) * 0.7;
      if (reel.chart === 'breakout') v = t < 0.55 ? 42 + 6 * Math.sin(t * 13 * Math.PI) : 46 + (t - 0.55) * 78 + 4 * Math.sin(t * 17 * Math.PI);
      pts.push(v);
    }
    prices.current = pts;
  }, [reel.chart]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const W = cvs.width, H = cvs.height;

    const draw = (elapsed: number) => {
      const prog = Math.min(1, elapsed / reel.duration);
      ctx.fillStyle = '#060910';
      ctx.fillRect(0, 0, W, H);
      // grid
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      for (let y = 0; y < H; y += 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      // price line revealed over time
      const pts = prices.current;
      const n = Math.max(2, Math.floor(pts.length * prog));
      const min = Math.min(...pts), max = Math.max(...pts);
      const px = (i: number) => (i / (pts.length - 1)) * (W - 24) + 12;
      const py = (v: number) => H * 0.78 - ((v - min) / (max - min || 1)) * H * 0.5;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = px(i), y = py(pts[i]); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.strokeStyle = reel.accent; ctx.lineWidth = 2.2; ctx.stroke();
      // glow dot at the tip
      const tipX = px(n - 1), tipY = py(pts[n - 1]);
      ctx.beginPath(); ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
      ctx.fillStyle = reel.accent; ctx.shadowColor = reel.accent; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
      // caption
      const cap = [...reel.captions].reverse().find(c => elapsed >= c.t)?.v || '';
      if (cap) {
        ctx.font = '700 19px -apple-system, Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        // word-wrap into max 2 lines
        const words = cap.split(' ');
        const lines: string[] = [];
        let line = '';
        for (const w of words) {
          if (ctx.measureText(line + ' ' + w).width > W - 44 && line) { lines.push(line); line = w; }
          else line = line ? line + ' ' + w : w;
        }
        lines.push(line);
        lines.slice(0, 3).forEach((l, i) => {
          const y = H * 0.30 + i * 27;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          const tw = ctx.measureText(l).width;
          ctx.fillRect(W / 2 - tw / 2 - 10, y - 19, tw + 20, 27);
          ctx.fillStyle = '#fff';
          ctx.fillText(l, W / 2, y);
        });
      }
      // watermark + progress
      ctx.font = '800 12px -apple-system, Segoe UI, sans-serif';
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('VEDDBUILD.COM', 14, H - 14);
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, H - 4, W, 4);
      ctx.fillStyle = reel.accent; ctx.fillRect(0, H - 4, W * prog, 4);
    };

    draw(animRef.current.elapsed);

    const loop = (ts: number) => {
      const a = animRef.current;
      if (!a.playing) return;
      const elapsed = a.elapsed + (ts - a.t0) / 1000;
      if (elapsed >= reel.duration) {
        a.playing = false; a.elapsed = reel.duration;
        draw(reel.duration);
        setUi({ playing: false, time: reel.duration, done: true });
        return;
      }
      draw(elapsed);
      setUi(u => ({ ...u, time: elapsed }));
      a.rafId = requestAnimationFrame((t2) => { a.elapsed = elapsed; a.t0 = t2; loop(t2); });
    };

    const a = animRef.current;
    if (a.playing) { a.rafId = requestAnimationFrame((t) => { a.t0 = t; loop(t); }); }
    return () => cancelAnimationFrame(animRef.current.rafId);
  }, [ui.playing, reel]);

  const play = () => { const a = animRef.current; if (a.elapsed >= reel.duration) a.elapsed = 0; a.playing = true; setUi(u => ({ ...u, playing: true, done: false })); };
  const pause = () => { animRef.current.playing = false; setUi(u => ({ ...u, playing: false })); };
  const restart = () => { const a = animRef.current; a.elapsed = 0; a.playing = true; setUi({ playing: true, time: 0, done: false }); };

  return (
    <div style={{ width: 270 }}>
      <div className="rounded-2xl overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,.10)' }}>
        <canvas ref={canvasRef} width={270} height={480} style={{ display: 'block', width: 270, height: 480 }} />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={ui.playing ? pause : play}
          className="flex-1 py-2 rounded-xl text-xs font-black text-white"
          style={{ background: reel.accent }}>
          {ui.playing ? '⏸ Pause' : ui.done ? '▶ Replay' : '▶ Play Reel'}
        </button>
        <button onClick={restart} className="px-3 py-2 rounded-xl text-xs font-bold text-gray-300" style={{ background: 'rgba(255,255,255,.07)' }}>↻</button>
        <span className="text-[10px] text-gray-500 font-mono w-12 text-right">{ui.time.toFixed(0)}s/{reel.duration}s</span>
      </div>
    </div>
  );
}
