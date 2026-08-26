import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Play, X, ChevronLeft, ChevronRight, BookOpen, Share2, Video, Circle, Square, ExternalLink, Rocket, GraduationCap, Users } from "lucide-react";
import logoImage from "@/assets/IMG_3645.png";

// VEDD brand tokens (from the landing "vault terminal" look)
const VEDD_RED = "#FF3B34";
const VEDD_GOLD = "#F5C451";
// Dark vault background with the signature red radial glow, top-right.
const VAULT_BG = "radial-gradient(520px 440px at 78% 8%, rgba(255,59,52,.14), transparent 70%), radial-gradient(600px 400px at 5% 105%, rgba(245,196,81,.05), transparent 60%), #070707";

// ── Deck model ───────────────────────────────────────────────────────────────
// Each slide has a headline + bullets (what the AUDIENCE sees), `notes` (the
// speaker script — what to SAY / what the new user should DO), and an optional
// `link` that jumps the viewer straight to that area of the app. Pitch decks are
// for presenting the business; setup decks walk a brand-new user through getting
// fully set up, one screen at a time, with a "Take me there" button per step.
type SlideLink = { label: string; href: string };
type Slide = { title: string; bullets: string[]; notes: string; link?: SlideLink };
type DeckKind = "pitch" | "setup";
type Deck = { id: string; name: string; tag: string; minutes: number; accent: string; kind: DeckKind; summary: string; slides: Slide[] };

// ── Pitch decks (present the business) ───────────────────────────────────────
const PITCH_DECKS: Deck[] = [
  {
    id: "overview", name: "VEDD Business Overview", tag: "Start here", minutes: 8, accent: VEDD_RED, kind: "pitch",
    summary: "The 30,000-ft pitch — what VEDD is, who it's for, and why now.",
    slides: [
      { title: "What is VEDD?", bullets: ["An AI-powered trading vault", "Analyzes the market 24/7 so you don't have to", "Built for real traders, not gamblers"],
        notes: "Open with the problem: most traders lose because they trade emotionally and can't watch charts all day. VEDD is the AI co-pilot that watches for you and only acts on high-confidence setups. Keep it simple — you're selling relief, not software.",
        link: { label: "Show the live features page", href: "/features" } },
      { title: "The Core Idea", bullets: ["Live AI engines find setups", "You approve or let it auto-execute", "Every trade is risk-managed"],
        notes: "Explain the loop: the engine scans, an AI confirms the read, risk is sized per trade, and it fires on your connected account. Emphasize discipline — the AI never breaks the rules a human breaks.",
        link: { label: "Open the FX SS AI Engine", href: "/mt5-chart-data" } },
      { title: "Who it's for", bullets: ["New traders who want a system", "Busy people who can't watch charts", "Prop-firm challengers who need consistency"],
        notes: "Ask the room: 'Who here has blown an account or a challenge?' Hands go up. That's your hook — VEDD's consistency tools exist exactly for that person." },
      { title: "Why now", bullets: ["AI is the edge — most retail traders don't have it", "Multi-market: FX, options, futures, crypto", "You get in early as an ambassador"],
        notes: "Create urgency without hype: the tools that used to be institution-only are now in their pocket. Position them as early.",
        link: { label: "Show pricing", href: "/pricing" } },
    ],
  },
  {
    id: "engines", name: "The AI Engines", tag: "The product", minutes: 10, accent: VEDD_RED, kind: "pitch",
    summary: "One brain, many markets — a tour of every live engine.",
    slides: [
      { title: "One platform, many engines", bullets: ["FX SS AI Engine", "Options AI Engine", "Futures Engine", "Crypto AI Engine", "DXtrade (Velotrade) FX"],
        notes: "Frame it as 'one brain, many markets.' They don't have to pick — they use the engine that fits their account and broker." },
      { title: "FX SS AI Engine", bullets: ["Trades MT5, TradeLocker & DXtrade", "AI confirms every setup before it fires", "Auto risk-sizing + trailing protection"],
        notes: "This is the flagship. Stress the AI confirmation layer — it's a second opinion on every trade, and it sizes risk as a % of the account automatically.",
        link: { label: "Open the FX engine", href: "/mt5-chart-data" } },
      { title: "Options & Futures", bullets: ["Options: credit spreads + premium selling on Alpaca", "Futures: order-flow & breakout strategies", "Both learn from results"],
        notes: "Keep it high-level for a general audience. The learning brain is the wow factor — the engines get smarter from real outcomes.",
        link: { label: "Open the Options engine", href: "/options-engine" } },
      { title: "Crypto & DeFi", bullets: ["CeFi: Coinbase, Kraken, Gemini, Crypto.com", "DeFi: on-chain swaps via a hot wallet", "Same AI reasoning as FX"],
        notes: "For a younger/crypto crowd this is the hook. Note it reasons like the FX SS AI — consistency across every market.",
        link: { label: "Open the Crypto AI engine", href: "/crypto-engine" } },
      { title: "The Self-Learning Brain", bullets: ["Every closed trade teaches the engine", "Sizes up what works, blocks what loses", "Gets better the more it runs"],
        notes: "Close the deck on the moat: it's not a static bot, it's a system that compounds its own edge over time.",
        link: { label: "Open the Brain Marketplace", href: "/brain-marketplace" } },
    ],
  },
  {
    id: "propfirm", name: "The Prop Firm Path", tag: "Funded trading", minutes: 9, accent: VEDD_RED, kind: "pitch",
    summary: "How VEDD helps traders pass challenges and stay funded.",
    slides: [
      { title: "Trade someone else's capital", bullets: ["Pass a challenge → get funded", "Keep the profit split", "No risking your own big capital"],
        notes: "Explain prop firms simply: prove you can trade on a demo/eval, then trade real firm money and split profits. VEDD helps you PASS and STAY funded.",
        link: { label: "Open Prop Firm Challenge", href: "/prop-firm-challenge" } },
      { title: "Why traders fail challenges", bullets: ["Blow the daily loss limit", "Break the consistency rule", "Over-leverage on one trade"],
        notes: "Name the 3 killers. Every funded trader in the room has hit at least one. This is the pain you solve." },
      { title: "How VEDD keeps you funded", bullets: ["Ruin Guard: hard daily-loss halt", "Consistency enforcement", "Auto risk-sizing per trade"],
        notes: "Map each protection to each failure mode from the last slide. That 1:1 mapping is persuasive — you're not selling features, you're removing their specific risks.",
        link: { label: "Show the Ruin Cone", href: "/ruin-cone" } },
      { title: "The Profit Split Program", bullets: ["VEDD takes 30% of your prop net profit", "No subscription — you only pay when you win", "Full platform access included"],
        notes: "This is the aligned-incentive close: VEDD only makes money when the trader makes money. Contrast with subscriptions that charge whether you win or lose." },
    ],
  },
  {
    id: "ambassador", name: "The Ambassador Opportunity", tag: "Earn & duplicate", minutes: 8, accent: VEDD_RED, kind: "pitch",
    summary: "Recruit builders — get paid to share and duplicate VEDD.",
    slides: [
      { title: "Get paid to share VEDD", bullets: ["Refer traders, earn commissions", "Build a team, earn on duplication", "Tools + training provided"],
        notes: "This deck is for recruiting builders, not just users. Lead with: you're already telling people about tools you love — get paid for it.",
        link: { label: "Open your Referral hub", href: "/referral" } },
      { title: "Why it duplicates", bullets: ["A simple, repeatable pitch (this deck!)", "Everyone gets the same outlines", "Present from your phone, anywhere"],
        notes: "Point at the hub itself — 'what I'm doing right now, you'll do too.' Duplication is the whole game; the system removes the guesswork." },
      { title: "Where to present", bullets: ["Zoom / Google Meet seminars", "TikTok & Instagram Live", "1-on-1 from your phone"],
        notes: "Meet people where they are. A 10-minute Live with this deck can reach more than a room ever could." },
      { title: "Your first 5", bullets: ["Run one live seminar this week", "Invite 5 people", "Hand them this same hub"],
        notes: "End with a clear action: book a Live, invite 5, duplicate. Small, specific, this-week. That's how momentum starts.",
        link: { label: "Open Ambassador Training", href: "/ambassador-training" } },
    ],
  },
  {
    id: "seminar", name: "Run a Live Mobile Seminar", tag: "How-to", minutes: 6, accent: VEDD_RED, kind: "pitch",
    summary: "Present live from your phone — Zoom, TikTok/IG Live, or 1-on-1.",
    slides: [
      { title: "You can do this from your phone", bullets: ["No studio, no laptop needed", "Present mode is built for mobile", "Read the outline as you go"],
        notes: "Reassure first-timers. Tap Present, go fullscreen, swipe. The outline tells you what to say — you can't get lost." },
      { title: "On Zoom / Meet", bullets: ["Share your screen → open a deck → Present", "Swipe through slides", "Keep the outline on a second device"],
        notes: "Walk them through the exact clicks. Suggest keeping the outline open on a laptop or second phone while they screen-share the deck." },
      { title: "On TikTok / IG Live", bullets: ["Go Live, talk to camera", "Hold up / screen-record the slides", "Post the replay as content"],
        notes: "For social, energy > polish. Do one slide's idea per short. Repurpose every Live into clips — one seminar becomes a week of content." },
      { title: "The follow-up", bullets: ["Drop your referral link", "Invite to a 1-on-1", "Send them this hub"],
        notes: "Always close with a next step and the link. The presentation opens the door — the follow-up is where people join.",
        link: { label: "Open your Referral hub", href: "/referral" } },
    ],
  },
];

// ── Setup walkthroughs (get a brand-new user fully set up, step by step) ──────
// These are "do-it-with-me" decks: each slide is one setup step, the notes tell
// the user exactly what to do, and the link drops them on the exact screen.
const SETUP_DECKS: Deck[] = [
  {
    id: "faststart", name: "New User Fast Start", tag: "Do this first", minutes: 15, accent: VEDD_GOLD, kind: "setup",
    summary: "The full 15-minute path from sign-up to your first AI-managed trade.",
    slides: [
      { title: "Welcome — here's the plan", bullets: ["We'll set you up in ~15 minutes", "Connect a broker → turn on an engine → let AI trade", "Follow each step; tap the button to jump there"],
        notes: "Set expectations: this is the whole setup start to finish. Tell them to keep this deck open on one device and do each step on the app. Don't skip — order matters.",
        link: { label: "Open your Dashboard", href: "/dashboard" } },
      { title: "Step 1 — Add your AI key", bullets: ["The engines use AI to confirm every trade", "Add an OpenAI / Anthropic / Google key", "One paste, done — it's stored securely"],
        notes: "Without a vision-capable AI key the confirmation runs weak and blocks trades. Have them paste a key here first. This is the #1 thing new users miss.",
        link: { label: "Add your AI key", href: "/ai-api-keys" } },
      { title: "Step 2 — Pick your AI model", bullets: ["Choose a vision-capable model", "This is the 'second opinion' on every setup", "Default is fine if unsure"],
        notes: "Confirm they pick a vision model so the AI can actually read the chart. If unsure, leave the default — it's already vision-capable.",
        link: { label: "Choose your AI model", href: "/ai-trading-models" } },
      { title: "Step 3 — Connect your broker", bullets: ["FX: MT5, TradeLocker, or DXtrade (Velotrade)", "You only need one to start", "Read-only connect first, then enable trading"],
        notes: "Pick the broker they already have. If they have none, DXtrade/Velotrade is the fastest to open. Connect read-only first so they see it working before enabling live trades.",
        link: { label: "Connect DXtrade (Velotrade)", href: "/dxtrade" } },
      { title: "Step 4 — Turn on the FX engine", bullets: ["Open the FX SS AI Engine", "Set your risk % per trade", "Enable auto-trade when ready"],
        notes: "Walk them to the engine, set a conservative risk % (e.g. 0.5–1% per trade), and explain auto-trade fires only on AI-confirmed setups. Start small.",
        link: { label: "Open the FX SS AI Engine", href: "/mt5-chart-data" } },
      { title: "Step 5 — Set your safety limits", bullets: ["Ruin Guard: daily-loss halt", "Consistency enforcement", "Per-trade risk sizing"],
        notes: "This is what keeps a prop account alive. Turn on Ruin Guard and set a daily loss cap before they ever go live. Non-negotiable for funded traders.",
        link: { label: "Open Prop Firm tools", href: "/prop-firm-challenge" } },
      { title: "Step 6 — Watch it work", bullets: ["The engine scans and logs every read", "Check the action feed + weekly results", "Let it run — don't micromanage"],
        notes: "Point them to the feed so they can watch the AI reason in real time, and the weekly page for results. Reassure: their job now is to let it run.",
        link: { label: "Open Weekly Results", href: "/weekly-strategy" } },
      { title: "You're live 🎉", bullets: ["AI is now managing your trades", "Add more markets any time", "Questions? Open the User Guide"],
        notes: "Congratulate them — they're set up. Invite them to add Options/Futures/Crypto when ready, and point to the User Guide for anything deeper.",
        link: { label: "Open the User Guide", href: "/user-guide" } },
    ],
  },
  {
    id: "setup-fx", name: "Connect an FX Broker", tag: "FX setup", minutes: 8, accent: VEDD_GOLD, kind: "setup",
    summary: "MT5, TradeLocker, or DXtrade (Velotrade) — connect and enable trading.",
    slides: [
      { title: "Which broker do you have?", bullets: ["MetaTrader 5 (MT5)", "TradeLocker", "DXtrade — broker: Velotrade"],
        notes: "Ask what they already trade on. You only need one. If they're starting fresh, DXtrade/Velotrade opens fast and connects with just a login.",
        link: { label: "Open the FX engine", href: "/mt5-chart-data" } },
      { title: "MT5 — install the EA", bullets: ["Download the VEDD EA", "Drop it on a chart in MT5", "It links your account to VEDD"],
        notes: "For MT5, the Expert Advisor is the bridge. Walk them to the EA download and how to attach it. Once it reports in, the engine can trade.",
        link: { label: "Get your EA", href: "/my-eas" } },
      { title: "DXtrade (Velotrade) — connect", bullets: ["Enter username + password", "Domain is 'default'", "Connects read-only first"],
        notes: "For DXtrade, use the Velotrade login. Domain stays 'default'. It connects read-only so they can confirm the balance is right before enabling trades.",
        link: { label: "Connect DXtrade (Velotrade)", href: "/dxtrade" } },
      { title: "Set risk per trade", bullets: ["Risk as a % of the account", "Same on every broker", "Start at 0.5–1%"],
        notes: "Explain risk is sized as a % of account so it scales automatically. Recommend starting conservative — they can raise it once they trust the engine.",
        link: { label: "Open the FX engine", href: "/mt5-chart-data" } },
      { title: "Enable auto-trade", bullets: ["Flip auto-trade on", "AI confirms before every entry", "Modify SL/TP any time"],
        notes: "Now turn on auto-trade. Reiterate: it only fires on AI-confirmed setups and every trade is risk-managed. They stay in control and can modify stops.",
        link: { label: "Open the FX engine", href: "/mt5-chart-data" } },
    ],
  },
  {
    id: "setup-options", name: "Set Up Options & Futures", tag: "More markets", minutes: 7, accent: VEDD_GOLD, kind: "setup",
    summary: "Add the Options AI engine (Alpaca) and the Futures engine.",
    slides: [
      { title: "Options AI Engine", bullets: ["Credit spreads + premium selling", "Runs on your Alpaca account", "AI-confirmed, risk-managed"],
        notes: "Introduce options as income-style trades. Connect Alpaca, and the engine handles spread selection and sizing.",
        link: { label: "Open the Options engine", href: "/options-engine" } },
      { title: "Connect Alpaca", bullets: ["Paste your Alpaca API keys", "Paper first, then live", "Stored securely"],
        notes: "Have them start on Alpaca paper to watch it work, then switch to live keys when confident.",
        link: { label: "Open the Options engine", href: "/options-engine" } },
      { title: "Futures Engine", bullets: ["Order-flow & breakout strategies", "Connect your futures account", "Self-learning like the rest"],
        notes: "For futures traders, walk them to the futures connect flow and enable a strategy. Same learning brain applies.",
        link: { label: "Connect Futures", href: "/futures-connect" } },
      { title: "Let them learn", bullets: ["Each engine learns from results", "Check the live feed", "Add one market at a time"],
        notes: "Encourage adding one market at a time so they understand each. The engines improve the longer they run.",
        link: { label: "Open the Futures engine", href: "/futures-engine" } },
    ],
  },
  {
    id: "setup-crypto", name: "Set Up Crypto (CeFi + DeFi)", tag: "Crypto setup", minutes: 6, accent: VEDD_GOLD, kind: "setup",
    summary: "Connect an exchange or a DeFi hot wallet and turn on the crypto brain.",
    slides: [
      { title: "Open the Crypto AI Engine", bullets: ["Reasons like the FX SS AI", "CeFi exchanges or on-chain DeFi", "Self-learning crypto brain"],
        notes: "Frame it as the same AI applied to crypto. They choose CeFi (an exchange) or DeFi (on-chain wallet).",
        link: { label: "Open the Crypto AI engine", href: "/crypto-engine" } },
      { title: "CeFi — connect an exchange", bullets: ["Coinbase, Kraken, Gemini, Crypto.com", "Paste API keys", "Pick your symbols to scan"],
        notes: "For most people CeFi is easiest. Connect the exchange they use and multi-select the coins to scan.",
        link: { label: "Open the Crypto AI engine", href: "/crypto-engine" } },
      { title: "DeFi — hot wallet swaps", bullets: ["On-chain swaps via a hot wallet", "Choose the DeFi execution venue", "Same AI confirmation"],
        notes: "For the crypto-native crowd, DeFi runs on-chain swaps. Make sure they select the DeFi venue in execution settings, or it stays on CeFi.",
        link: { label: "Open the Crypto AI engine", href: "/crypto-engine" } },
      { title: "Turn on the brain", bullets: ["Enable the self-learning brain", "It sizes up what works", "Watch the consensus + feed"],
        notes: "Enable the crypto brain and point them to the gamified consensus/feed tabs so they can see it reasoning.",
        link: { label: "Open the Crypto AI engine", href: "/crypto-engine" } },
    ],
  },
  {
    id: "setup-earn", name: "Start Earning as an Ambassador", tag: "Earn setup", minutes: 6, accent: VEDD_GOLD, kind: "setup",
    summary: "Grab your link, learn the pitch, and book your first live seminar.",
    slides: [
      { title: "Get your referral link", bullets: ["Your unique share link", "Track clicks + signups", "Share it everywhere"],
        notes: "First step to earning: get the link. Have them copy it now and pin it in their notes.",
        link: { label: "Open your Referral hub", href: "/referral" } },
      { title: "Learn the pitch", bullets: ["Use the pitch decks in this hub", "Read the speaker outlines", "Practice one out loud"],
        notes: "Point back to the pitch decks. Have them run through the Business Overview once out loud before going live.",
        link: { label: "Open Ambassador Training", href: "/ambassador-training" } },
      { title: "Grab the Event Kit", bullets: ["Print-ready host materials", "Agreement + pitch script", "Everything to run an event"],
        notes: "The Event Kit is the printable companion to these decks — great for in-person events. Show them where it lives.",
        link: { label: "Open the Event Kit", href: "/event-kit" } },
      { title: "Book your first Live", bullets: ["Pick a date this week", "Invite 5 people", "Present a deck from your phone"],
        notes: "Close with action: a date, 5 invites, one deck. Momentum comes from doing it once this week — not from preparing forever.",
        link: { label: "Open the Presentation Hub", href: "/ambassador/present" } },
    ],
  },
];

export default function AmbassadorPresentPage() {
  const [, navigate] = useLocation();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [idx, setIdx] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [recording, setRecording] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const openDeck = (d: Deck) => { setDeck(d); setIdx(0); setPresenting(false); };
  const next = () => setIdx((i) => Math.min((deck?.slides.length ?? 1) - 1, i + 1));
  const prev = () => setIdx((i) => Math.max(0, i - 1));

  // Jump to an app area from a slide. If we're in fullscreen present mode, exit
  // it first so the destination page renders normally.
  const go = (href: string) => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    setPresenting(false);
    navigate(href);
  };

  const enterPresent = () => {
    setPresenting(true);
    // Real fullscreen so the phone's browser chrome hides and a native screen
    // recording captures a clean, correctly-sized deck. Best-effort (some browsers
    // reject without a user gesture / on iOS Safari — the dvh layout still fits).
    setTimeout(() => { stageRef.current?.requestFullscreen?.().catch(() => {}); }, 50);
  };
  const exitPresent = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    setPresenting(false);
  };

  // In-app screen recording (desktop / anywhere getDisplayMedia is supported).
  // On phones browsers can't screen-record — we tell the user to use the device's
  // built-in recorder, which now captures cleanly because Present is fullscreen.
  const toggleRecord = async () => {
    if (recording) { recRef.current?.stop(); return; }
    const md: any = navigator.mediaDevices;
    if (!md?.getDisplayMedia) {
      alert("To record on your phone: use your device's built-in screen recorder (iPhone: Control Center ● ; Android: Quick Settings → Screen record). The deck is fullscreen, so it'll capture clean. Then go Live or post the clip to TikTok/IG.");
      return;
    }
    try {
      const stream: MediaStream = await md.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `VEDD-presentation-${Date.now()}.webm`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        setRecording(false);
      };
      // If the user stops sharing from the browser UI, reflect it.
      stream.getVideoTracks()[0].addEventListener("ended", () => { try { mr.stop(); } catch { /* noop */ } });
      recRef.current = mr;
      mr.start();
      setRecording(true);
    } catch { /* user cancelled the picker */ }
  };

  // Keyboard arrows in present mode (for Zoom/desktop)
  useEffect(() => {
    if (!presenting) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") exitPresent();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [presenting, deck]);

  // ── Present (fullscreen) mode ──────────────────────────────────────────────
  if (deck && presenting) {
    const s = deck.slides[idx];
    return (
      <div ref={stageRef} className="fixed inset-0 z-[70] text-white flex flex-col overflow-hidden" style={{ height: "100dvh", background: `radial-gradient(circle at 30% 0%, ${deck.accent}22, #000 60%)` }}>
        <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-400 shrink-0">
          <span className="flex items-center gap-2 min-w-0"><img src={logoImage} alt="VEDD" className="h-5 w-auto shrink-0" /> <span className="hidden sm:inline truncate">{deck.name}</span></span>
          <span className="shrink-0">{idx + 1} / {deck.slides.length}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={toggleRecord} className={`flex items-center gap-1 px-2 py-1 rounded-lg ${recording ? "bg-red-600 text-white animate-pulse" : "bg-white/10 text-gray-200"}`}>
              {recording ? <><Square className="w-3.5 h-3.5" /> Stop</> : <><Circle className="w-3.5 h-3.5 fill-current" /> Record</>}
            </button>
            <button onClick={exitPresent} className="flex items-center gap-1 text-gray-300 hover:text-white"><X className="w-4 h-4" /> Exit</button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-center px-6 sm:px-16 max-w-4xl mx-auto w-full py-4" onClick={next}>
          <h1 className="text-2xl sm:text-5xl font-extrabold mb-5 sm:mb-10 leading-tight" style={{ color: deck.accent }}>{s.title}</h1>
          <ul className="space-y-3 sm:space-y-5">
            {s.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3 text-base sm:text-2xl font-medium">
                <span className="mt-1.5 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0" style={{ background: deck.accent }} />{b}
              </li>
            ))}
          </ul>
          {s.link && (
            <button onClick={(e) => { e.stopPropagation(); go(s.link!.href); }} className="mt-6 self-start flex items-center gap-2 text-sm sm:text-base font-bold px-4 py-2.5 rounded-xl text-black" style={{ background: deck.accent }}>
              <ExternalLink className="w-4 h-4" /> {s.link.label}
            </button>
          )}
        </div>
        {showNotes && (
          <div className="shrink-0 border-t border-white/10 bg-black/60 px-5 py-3 max-h-[32%] overflow-y-auto">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 flex items-center gap-1"><BookOpen className="w-3 h-3" /> {deck.kind === "setup" ? "Do this" : "Say this"}</p>
            <p className="text-sm text-gray-200 leading-relaxed">{s.notes}</p>
          </div>
        )}
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-white/10" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
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
    const isSetup = deck.kind === "setup";
    return (
      <div className="min-h-screen text-white pb-24" style={{ background: VAULT_BG }}>
        <div className="max-w-3xl mx-auto px-4 pt-6">
          <button onClick={() => setDeck(null)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-4"><ArrowLeft className="w-3.5 h-3.5" /> All presentations</button>
          <img src={logoImage} alt="VEDD" className="h-6 w-auto mb-3 opacity-90" />
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl font-bold">{deck.name}</h1>
              <p className="text-xs text-gray-500">{deck.slides.length} {isSetup ? "steps" : "slides"} · ~{deck.minutes} min · swipe or tap Present</p>
            </div>
            <button onClick={enterPresent} className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-lg text-black shrink-0" style={{ background: deck.accent }}><Play className="w-4 h-4" /> Present</button>
          </div>

          {/* Slide preview */}
          <div className="rounded-2xl border p-5 mb-3" style={{ borderColor: `${deck.accent}55`, background: `linear-gradient(160deg, ${deck.accent}14, #0a0a0a)` }}>
            <p className="text-[10px] text-gray-500 mb-2">{isSetup ? "Step" : "Slide"} {idx + 1} of {deck.slides.length}</p>
            <h2 className="text-2xl font-extrabold mb-4" style={{ color: deck.accent }}>{s.title}</h2>
            <ul className="space-y-2">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm"><span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: deck.accent }} />{b}</li>
              ))}
            </ul>
            {s.link && (
              <button onClick={() => go(s.link!.href)} className="mt-4 flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl text-black" style={{ background: deck.accent }}>
                <ExternalLink className="w-4 h-4" /> {s.link.label}
              </button>
            )}
          </div>

          {/* Speaker outline / do-this */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 mb-4">
            <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1 flex items-center gap-1"><BookOpen className="w-3 h-3" /> {isSetup ? "What to do" : "Speaker outline — what to say"}</p>
            <p className="text-sm text-gray-200 leading-relaxed">{s.notes}</p>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={prev} disabled={idx === 0} className="flex items-center gap-1 text-sm px-3 py-2 rounded-lg bg-gray-800 text-gray-300 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /> Prev</button>
            <div className="flex gap-1 flex-wrap justify-center max-w-[50%]">{deck.slides.map((_, i) => <span key={i} onClick={() => setIdx(i)} className={`w-2 h-2 rounded-full cursor-pointer ${i === idx ? "" : "opacity-30"}`} style={{ background: deck.accent }} />)}</div>
            <button onClick={next} disabled={idx === deck.slides.length - 1} className="flex items-center gap-1 text-sm px-3 py-2 rounded-lg bg-gray-800 text-gray-300 disabled:opacity-40">Next <ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    );
  }

  // ── Hub (deck list) ────────────────────────────────────────────────────────
  const DeckCard = ({ d }: { d: Deck }) => (
    <button onClick={() => openDeck(d)} className="w-full text-left rounded-2xl border p-4 hover:brightness-110 transition" style={{ borderColor: `${d.accent}55`, background: `linear-gradient(160deg, ${d.accent}12, #0a0a0a)` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: `${d.accent}22`, color: d.accent }}>{d.tag}</span>
            <span className="text-[10px] text-gray-500">{d.slides.length} {d.kind === "setup" ? "steps" : "slides"} · ~{d.minutes} min</span>
          </div>
          <h3 className="text-base font-bold text-white">{d.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{d.summary}</p>
        </div>
        <span className="flex items-center gap-1 text-sm font-bold px-3 py-2 rounded-lg text-black shrink-0" style={{ background: d.accent }}><Play className="w-4 h-4" /> {d.kind === "setup" ? "Start" : "Present"}</span>
      </div>
    </button>
  );

  return (
    <div className="min-h-screen text-white pb-24" style={{ background: VAULT_BG }}>
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-4"><ArrowLeft className="w-3.5 h-3.5" /> Back</Link>
        <div className="flex items-center gap-2.5 mb-1">
          <img src={logoImage} alt="VEDD" className="h-7 w-auto" />
          <h1 className="text-xl font-bold">Presentation Hub</h1>
        </div>
        <p className="text-sm text-gray-500 mb-5">Present the business live from your phone, and walk brand-new users through setup step by step. Every slide can jump straight into the app.</p>

        {/* Quick links to the rest of the ambassador toolkit */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {[
            { i: BookOpen, t: "Event Kit", d: "Print & host", href: "/event-kit" },
            { i: GraduationCap, t: "Training", d: "Learn the pitch", href: "/ambassador-training" },
            { i: Users, t: "Referral", d: "Your link", href: "/referral" },
          ].map(({ i: Icon, t, d, href }) => (
            <button key={t} onClick={() => go(href)} className="rounded-xl border border-gray-800 bg-gray-900 p-2.5 text-center hover:border-gray-600 transition">
              <Icon className="w-4 h-4 mx-auto text-gray-400 mb-1" />
              <p className="text-[11px] font-semibold text-white">{t}</p>
              <p className="text-[9px] text-gray-500">{d}</p>
            </button>
          ))}
        </div>

        {/* Setup walkthroughs — get a new user going */}
        <div className="flex items-center gap-2 mb-2">
          <Rocket className="w-4 h-4" style={{ color: VEDD_GOLD }} />
          <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: VEDD_GOLD }}>Setup Walkthroughs</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">Do-it-with-me guides for new users. Each step drops them on the exact screen.</p>
        <div className="space-y-3 mb-8">
          {SETUP_DECKS.map((d) => <DeckCard key={d.id} d={d} />)}
        </div>

        {/* Pitch decks — present the business */}
        <div className="flex items-center gap-2 mb-2">
          <Video className="w-4 h-4" style={{ color: VEDD_RED }} />
          <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: VEDD_RED }}>Business Presentations</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">Ready-to-present decks with speaker outlines — Zoom, TikTok/IG Live, or 1-on-1.</p>
        <div className="space-y-3">
          {PITCH_DECKS.map((d) => <DeckCard key={d.id} d={d} />)}
        </div>

        <p className="text-[11px] text-gray-600 mt-6">Tip: onboard a new user with a Setup Walkthrough, then hand them the Business Presentations so they can duplicate. Run one Live per week and invite 5 people.</p>
      </div>
    </div>
  );
}
