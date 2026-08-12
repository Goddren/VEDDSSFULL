import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { ArrowRight, ArrowLeft, X } from 'lucide-react';

/* ── Abba's guided spotlight tour — dims the Player HUD and highlights one
   section at a time with Abba's coaching. Runs once for new users on /vault,
   and can be replayed by dispatching window event 'vedd:start-abba-tour'. ── */

const GOLD = '#f5c451';

interface Step { id: string; title: string; body: string; }
const STEPS: Step[] = [
  { id: 'hud-header',   title: 'This is you',              body: 'Your rank climbs as you trade and learn. Keep your streak alive — show up daily.' },
  { id: 'hud-score',    title: 'Your score',               body: "Today's and this week's profit, live. This is the number we're growing — steadily, not recklessly." },
  { id: 'hud-week',     title: 'The week plan',            body: 'Your target for each day. Tap Plan to set or adjust it — small daily wins compound into the week.' },
  { id: 'hud-missions', title: 'Missions and side quests', body: 'Complete these to earn VEDD. Daily missions reset nightly, side quests weekly. Free money for good habits.' },
  { id: 'hud-quick',    title: 'One tap away',             body: 'Jump straight to your Strategy, Charts, Kalshi and Wallet from here. Now go take one clean setup — I’ll be watching.' },
];

interface Rect { top: number; left: number; width: number; height: number; }

export default function AbbaTour() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const uid = (user as any)?.id;
  const flagKey = uid ? `vedd_tour_done_${uid}` : '';

  // Read the target's position ONLY — never scroll here (this runs on every
  // user scroll, and scrolling the page from inside a scroll handler traps the
  // user, snapping the page back so they can't reach the top nav).
  const recalc = useCallback((idx: number) => {
    const el = document.getElementById(STEPS[idx].id);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  useEffect(() => {
    const start = () => { setI(0); setActive(true); };
    window.addEventListener('vedd:start-abba-tour', start);
    return () => window.removeEventListener('vedd:start-abba-tour', start);
  }, []);

  useEffect(() => {
    if (!uid || location !== '/vault') return;
    let shown = true;
    try { shown = !!localStorage.getItem(flagKey); } catch { /* ignore */ }
    if (!shown) {
      const t = setTimeout(() => { setI(0); setActive(true); }, 900);
      return () => clearTimeout(t);
    }
  }, [uid, location, flagKey]);

  // On step change only: scroll the target into view once, then measure.
  useEffect(() => {
    if (!active) return;
    const el = document.getElementById(STEPS[i].id);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => recalc(i), 380);
    return () => clearTimeout(t);
  }, [active, i, recalc]);

  // On user scroll / resize: only re-measure so the spotlight follows the
  // element — never scroll the page, so the user can freely pull up/down.
  useEffect(() => {
    if (!active) return;
    const onChange = () => recalc(i);
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => { window.removeEventListener('resize', onChange); window.removeEventListener('scroll', onChange, true); };
  }, [active, i, recalc]);

  if (!active) return null;

  const finish = () => {
    try { localStorage.setItem(flagKey, '1'); } catch { /* ignore */ }
    setActive(false);
  };
  const next = () => { if (i < STEPS.length - 1) setI(i + 1); else finish(); };
  const back = () => { if (i > 0) setI(i - 1); };

  const step = STEPS[i];
  const pad = 8;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 380;

  const spotlight: React.CSSProperties | null = rect ? {
    position: 'fixed',
    top: rect.top - pad, left: rect.left - pad,
    width: rect.width + pad * 2, height: rect.height + pad * 2,
    borderRadius: 16, border: `2px solid ${GOLD}`,
    boxShadow: '0 0 0 9999px rgba(4,6,10,.82)',
    pointerEvents: 'none', zIndex: 10000, transition: 'all .3s cubic-bezier(.2,.8,.2,1)',
  } : null;

  const placeBelow = rect ? (rect.top + rect.height + 190 < vh) : true;
  const bubbleTop = rect ? (placeBelow ? rect.top + rect.height + pad + 14 : Math.max(12, rect.top - pad - 14 - 176)) : vh / 2;

  return (
    <>
      {!rect && <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,6,10,.82)', zIndex: 10000 }} onClick={finish} />}
      {spotlight && <div style={spotlight} />}

      <div style={{
        position: 'fixed', top: bubbleTop, left: '50%', transform: 'translateX(-50%)',
        width: Math.min(340, vw - 24), zIndex: 10001,
        background: '#0f141c', border: `1px solid #2a3543`, borderRadius: 16, padding: 14, color: '#e7ecf3',
        boxShadow: '0 10px 40px rgba(0,0,0,.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: GOLD, color: '#3a2c05', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>A</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>Abba · step {i + 1} of {STEPS.length}</span>
              <button onClick={finish} aria-label="Close tour" style={{ background: 'none', border: 'none', color: '#61748a', cursor: 'pointer', padding: 0, lineHeight: 0 }}><X className="w-4 h-4" /></button>
            </div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '4px 0 2px' }}>{step.title}</p>
            <p style={{ fontSize: 12.5, color: '#c2cdda', lineHeight: 1.5 }}>{step.body}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {STEPS.map((_, idx) => (
              <span key={idx} style={{
                width: idx === i ? 16 : 7, height: 7, borderRadius: 6,
                background: idx === i ? GOLD : '#3a4453', transition: 'all .2s',
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {i > 0 && (
              <button onClick={back} style={{ background: '#141a24', color: '#c2cdda', border: '1px solid #2a3543', borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
            <button onClick={next} style={{ background: GOLD, color: '#3a2c05', border: 'none', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              {i < STEPS.length - 1 ? <>Next <ArrowRight className="w-3.5 h-3.5" /></> : 'Got it'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
