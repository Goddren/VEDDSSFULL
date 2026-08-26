import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Play, X, ChevronLeft, ChevronRight, BookOpen, Presentation, Share2, Video } from "lucide-react";

// ── Preset decks ─────────────────────────────────────────────────────────────
// Each slide has a headline + bullets (what the AUDIENCE sees) and `notes` (the
// ambassador's speaker script — what to SAY). Ambassadors present these live via
// screen-share (Zoom) or on-camera (TikTok/IG Live) and read the outline.
type Slide = { title: string; bullets: string[]; notes: string };
type Deck = { id: string; name: string; tag: string; minutes: number; accent: string; slides: Slide[] };

const DECKS: Deck[] = [
  {
    id: "overview", name: "VEDD Business Overview", tag: "Start here", minutes: 8, accent: "#ef4444",
    slides: [
      { title: "What is VEDD?", bullets: ["An AI-powered trading vault", "Analyzes the market 24/7 so you don't have to", "Built for real traders, not gamblers"],
        notes: "Open with the problem: most traders lose because they trade emotionally and can't watch charts all day. VEDD is the AI co-pilot that watches for you and only acts on high-confidence setups. Keep it simple — you're selling relief, not software." },
      { title: "The Core Idea", bullets: ["Live AI engines find setups", "You approve or let it auto-execute", "Every trade is risk-managed"],
        notes: "Explain the loop: the engine scans, an AI confirms the read, risk is sized per trade, and it fires on your connected account. Emphasize discipline — the AI never breaks the rules a human breaks." },
      { title: "Who it's for", bullets: ["New traders who want a system", "Busy people who can't watch charts", "Prop-firm challengers who need consistency"],
        notes: "Ask the room: 'Who here has blown an account or a challenge?' Hands go up. That's your hook — VEDD's consistency tools exist exactly for that person." },
      { title: "Why now", bullets: ["AI is the edge — most retail traders don't have it", "Multi-market: FX, options, futures, crypto", "You get in early as an ambassador"],
        notes: "Create urgency without hype: the tools that used to be institution-only are now in their pocket. Position them as early." },
    ],
  },
  {
    id: "engines", name: "The AI Engines", tag: "The product", minutes: 10, accent: "#22c55e",
    slides: [
      { title: "One platform, many engines", bullets: ["FX SS AI Engine", "Options AI Engine", "Futures Engine", "Crypto AI Engine", "DXtrade (Velotrade) FX"],
        notes: "Frame it as 'one brain, many markets.' They don't have to pick — they use the engine that fits their account and broker." },
      { title: "FX SS AI Engine", bullets: ["Trades MT5, TradeLocker & DXtrade", "AI confirms every setup before it fires", "Auto risk-sizing + trailing protection"],
        notes: "This is the flagship. Stress the AI confirmation layer — it's a second opinion on every trade, and it sizes risk as a % of the account automatically." },
      { title: "Options & Futures", bullets: ["Options: credit spreads + premium selling on Alpaca", "Futures: order-flow & breakout strategies", "Both learn from results"],
        notes: "Keep it high-level for a general audience. The learning brain is the wow factor — the engines get smarter from real outcomes." },
      { title: "Crypto & DeFi", bullets: ["CeFi: Coinbase, Kraken, Gemini, Crypto.com", "DeFi: on-chain swaps via a hot wallet", "Same AI reasoning as FX"],
        notes: "For a younger/crypto crowd this is the hook. Note it reasons like the FX SS AI — consistency across every market." },
      { title: "The Self-Learning Brain", bullets: ["Every closed trade teaches the engine", "Sizes up what works, blocks what loses", "Gets better the more it runs"],
        notes: "Close the deck on the moat: it's not a static bot, it's a system that compounds its own edge over time." },
    ],
  },
  {
    id: "propfirm", name: "The Prop Firm Path", tag: "Funded trading", minutes: 9, accent: "#f59e0b",
    slides: [
      { title: "Trade someone else's capital", bullets: ["Pass a challenge → get funded", "Keep the profit split", "No risking your own big capital"],
        notes: "Explain prop firms simply: prove you can trade on a demo/eval, then trade real firm money and split profits. VEDD helps you PASS and STAY funded." },
      { title: "Why traders fail challenges", bullets: ["Blow the daily loss limit", "Break the consistency rule", "Over-leverage on one trade"],
        notes: "Name the 3 killers. Every funded trader in the room has hit at least one. This is the pain you solve." },
      { title: "How VEDD keeps you funded", bullets: ["Ruin Guard: hard daily-loss halt", "Consistency enforcement", "Auto risk-sizing per trade"],
        notes: "Map each protection to each failure mode from the last slide. That 1:1 mapping is persuasive — you're not selling features, you're removing their specific risks." },
      { title: "The Profit Split Program", bullets: ["VEDD takes 30% of your prop net profit", "No subscription — you only pay when you win", "Full platform access included"],
        notes: "This is the aligned-incentive close: VEDD only makes money when the trader makes money. Contrast with subscriptions that charge whether you win or lose." },
    ],
  },
  {
    id: "ambassador", name: "The Ambassador Opportunity", tag: "Earn & duplicate", minutes: 8, accent: "#6366f1",
    slides: [
      { title: "Get paid to share VEDD", bullets: ["Refer traders, earn commissions", "Build a team, earn on duplication", "Tools + training provided"],
        notes: "This deck is for recruiting builders, not just users. Lead with: you're already telling people about tools you love — get paid for it." },
      { title: "Why it duplicates", bullets: ["A simple, repeatable pitch (this deck!)", "Everyone gets the same outlines", "Present from your phone, anywhere"],
        notes: "Point at the hub itself — 'what I'm doing right now, you'll do too.' Duplication is the whole game; the system removes the guesswork." },
      { title: "Where to present", bullets: ["Zoom / Google Meet seminars", "TikTok & Instagram Live", "1-on-1 from your phone"],
        notes: "Meet people where they are. A 10-minute Live with this deck can reach more than a room ever could." },
      { title: "Your first 5", bullets: ["Run one live seminar this week", "Invite 5 people", "Hand them this same hub"],
        notes: "End with a clear action: book a Live, invite 5, duplicate. Small, specific, this-week. That's how momentum starts." },
    ],
  },
  {
    id: "seminar", name: "Run a Live Mobile Seminar", tag: "How-to", minutes: 6, accent: "#06b6d4",
    slides: [
      { title: "You can do this from your phone", bullets: ["No studio, no laptop needed", "Present mode is built for mobile", "Read the outline as you go"],
        notes: "Reassure first-timers. Tap Present, go fullscreen, swipe. The outline tells you what to say — you can't get lost." },
      { title: "On Zoom / Meet", bullets: ["Share your screen → open a deck → Present", "Swipe through slides", "Keep the outline on a second device"],
        notes: "Walk them through the exact clicks. Suggest keeping the outline open on a laptop or second phone while they screen-share the deck." },
      { title: "On TikTok / IG Live", bullets: ["Go Live, talk to camera", "Hold up / screen-record the slides", "Post the replay as content"],
        notes: "For social, energy > polish. Do one slide's idea per short. Repurpose every Live into clips — one seminar becomes a week of content." },
      { title: "The follow-up", bullets: ["Drop your referral link", "Invite to a 1-on-1", "Send them this hub"],
        notes: "Always close with a next step and the link. The presentation opens the door — the follow-up is where people join." },
    ],
  },
];

export default function AmbassadorPresentPage() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [idx, setIdx] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const [showNotes, setShowNotes] = useState(true);

  const openDeck = (d: Deck) => { setDeck(d); setIdx(0); setPresenting(false); };
  const next = () => setIdx((i) => Math.min((deck?.slides.length ?? 1) - 1, i + 1));
  const prev = () => setIdx((i) => Math.max(0, i - 1));

  // Keyboard arrows in present mode (for Zoom/desktop)
  useEffect(() => {
    if (!presenting) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") setPresenting(false);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [presenting, deck]);

  // ── Present (fullscreen) mode ──────────────────────────────────────────────
  if (deck && presenting) {
    const s = deck.slides[idx];
    return (
      <div className="fixed inset-0 z-50 bg-black text-white flex flex-col" style={{ background: `radial-gradient(circle at 30% 0%, ${deck.accent}22, #000 60%)` }}>
        <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-400">
          <span>{deck.name}</span>
          <span>{idx + 1} / {deck.slides.length}</span>
          <button onClick={() => setPresenting(false)} className="flex items-center gap-1 text-gray-300 hover:text-white"><X className="w-4 h-4" /> Exit</button>
        </div>
        <div className="flex-1 flex flex-col justify-center px-6 sm:px-16 max-w-4xl mx-auto w-full" onClick={next}>
          <h1 className="text-3xl sm:text-5xl font-extrabold mb-6 sm:mb-10 leading-tight" style={{ color: deck.accent }}>{s.title}</h1>
          <ul className="space-y-3 sm:space-y-5">
            {s.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3 text-lg sm:text-2xl font-medium">
                <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: deck.accent }} />{b}
              </li>
            ))}
          </ul>
        </div>
        {showNotes && (
          <div className="border-t border-white/10 bg-black/60 px-5 py-3 max-h-[32%] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 flex items-center gap-1"><BookOpen className="w-3 h-3" /> Say this</p>
            <p className="text-sm text-gray-200 leading-relaxed">{s.notes}</p>
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
          <button onClick={prev} disabled={idx === 0} className="flex items-center gap-1 text-sm px-3 py-2 rounded-lg bg-white/10 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /> Back</button>
          <button onClick={() => setShowNotes((v) => !v)} className="text-xs text-gray-400 hover:text-white">{showNotes ? "Hide notes" : "Show notes"}</button>
          <button onClick={next} disabled={idx === deck.slides.length - 1} className="flex items-center gap-1 text-sm px-3 py-2 rounded-lg text-black font-bold disabled:opacity-40" style={{ background: deck.accent }}>Next <ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    );
  }

  // ── Deck detail (slide-by-slide with outline) ──────────────────────────────
  if (deck) {
    const s = deck.slides[idx];
    return (
      <div className="min-h-screen bg-black text-white pb-24">
        <div className="max-w-3xl mx-auto px-4 pt-6">
          <button onClick={() => setDeck(null)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-4"><ArrowLeft className="w-3.5 h-3.5" /> All presentations</button>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl font-bold">{deck.name}</h1>
              <p className="text-xs text-gray-500">{deck.slides.length} slides · ~{deck.minutes} min · swipe or tap Present</p>
            </div>
            <button onClick={() => setPresenting(true)} className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg text-black shrink-0" style={{ background: deck.accent }}><Play className="w-4 h-4" /> Present</button>
          </div>

          {/* Slide preview */}
          <div className="rounded-2xl border p-5 mb-3" style={{ borderColor: `${deck.accent}55`, background: `linear-gradient(160deg, ${deck.accent}14, #0a0a0a)` }}>
            <p className="text-[10px] text-gray-500 mb-2">Slide {idx + 1} of {deck.slides.length}</p>
            <h2 className="text-2xl font-extrabold mb-4" style={{ color: deck.accent }}>{s.title}</h2>
            <ul className="space-y-2">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm"><span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: deck.accent }} />{b}</li>
              ))}
            </ul>
          </div>

          {/* Speaker outline */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 mb-4">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 flex items-center gap-1"><BookOpen className="w-3 h-3" /> Speaker outline — what to say</p>
            <p className="text-sm text-gray-200 leading-relaxed">{s.notes}</p>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={prev} disabled={idx === 0} className="flex items-center gap-1 text-sm px-3 py-2 rounded-lg bg-gray-800 text-gray-300 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /> Prev</button>
            <div className="flex gap-1">{deck.slides.map((_, i) => <span key={i} onClick={() => setIdx(i)} className={`w-2 h-2 rounded-full cursor-pointer ${i === idx ? "" : "opacity-30"}`} style={{ background: deck.accent }} />)}</div>
            <button onClick={next} disabled={idx === deck.slides.length - 1} className="flex items-center gap-1 text-sm px-3 py-2 rounded-lg bg-gray-800 text-gray-300 disabled:opacity-40">Next <ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    );
  }

  // ── Hub (deck list) ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-4"><ArrowLeft className="w-3.5 h-3.5" /> Back</Link>
        <div className="flex items-center gap-2.5 mb-1">
          <Presentation className="w-6 h-6 text-red-400" />
          <h1 className="text-xl font-bold">Ambassador Presentation Hub</h1>
        </div>
        <p className="text-sm text-gray-500 mb-5">Ready-to-present VEDD decks with speaker outlines. Present live from your phone — Zoom, TikTok/IG Live, or 1-on-1 — and duplicate the pitch.</p>

        {/* How to go live strip */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[{ i: Video, t: "Go Live", d: "TikTok / IG" }, { i: Share2, t: "Screen-share", d: "Zoom / Meet" }, { i: BookOpen, t: "Read outline", d: "Never freeze" }].map(({ i: Icon, t, d }) => (
            <div key={t} className="rounded-xl border border-gray-800 bg-gray-900 p-2.5 text-center">
              <Icon className="w-4 h-4 mx-auto text-gray-400 mb-1" />
              <p className="text-[11px] font-semibold text-white">{t}</p>
              <p className="text-[9px] text-gray-500">{d}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {DECKS.map((d) => (
            <button key={d.id} onClick={() => openDeck(d)} className="w-full text-left rounded-2xl border p-4 hover:brightness-110 transition" style={{ borderColor: `${d.accent}55`, background: `linear-gradient(160deg, ${d.accent}12, #0a0a0a)` }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: `${d.accent}22`, color: d.accent }}>{d.tag}</span>
                    <span className="text-[10px] text-gray-500">{d.slides.length} slides · ~{d.minutes} min</span>
                  </div>
                  <h3 className="text-base font-bold text-white">{d.name}</h3>
                </div>
                <span className="flex items-center gap-1 text-sm font-bold px-3 py-2 rounded-lg text-black shrink-0" style={{ background: d.accent }}><Play className="w-4 h-4" /> Present</span>
              </div>
            </button>
          ))}
        </div>

        <p className="text-[11px] text-gray-600 mt-6">Tip: run one Live per week, invite 5 people, and hand them this hub. That's how the team duplicates and grows.</p>
      </div>
    </div>
  );
}
