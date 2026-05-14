import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import {
  X, Send, ChevronRight, Target, TrendingUp, Activity,
  Zap, BarChart2, MapPin, Loader2, AlertTriangle, ExternalLink,
  Minimize2, Maximize2, RefreshCw, Brain, Check, PenLine,
  Calendar, DollarSign, Layers, Wifi, WifiOff,
  Mic, MicOff, Volume2, VolumeX,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────────────────────
interface PlanProposal {
  pairs: string[];
  sessions: string[];
  direction: 'BUY' | 'SELL' | 'BOTH';
  strategyType: string;
  profitTarget: number | null;
  accountBalance: number | null;
  lotSize: number | null;
  riskLevel: string;
  tradingDays: string[];
  maxTradesPerDay: number | null;
  notes: string;
  missingFields: string[];
  summary: string;
}

interface AbbaMessage {
  id: string;
  role: 'user' | 'abba';
  content: string;
  timestamp: Date;
  navigateTo?: string | null;
  planProposal?: PlanProposal | null;
  suggestions?: string[];
  audioUrl?: string; // blob URL for tap-to-play
}

interface AbbaContext {
  weekPct: number;
  weekProfit: number;
  weekTarget: number;
  todayProfit: number;
  dailyTarget: number;
  unrealizedPnL: number;
  openCount: number;
  targetRemaining: number;
  pacingNeededPerDay: number;
  weekTrades: number;
  weekWinRate: number;
  balance: number;
  planPairs: string[];
  hasStrategy: boolean;
  // Goal Intelligence
  goalMode?: 'CATCH_UP' | 'ON_PACE' | 'LOCK_IN' | null;
  goalLotMultiplier?: number;
  goalPaceRatio?: number;
}

const genId = () => Math.random().toString(36).slice(2, 10);

// ── Browser speech support detection ─────────────────────────────────────────
const hasSpeechRecognition = typeof window !== 'undefined' &&
  !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
const hasSpeechSynthesis = typeof window !== 'undefined' && !!window.speechSynthesis;

// ── Async voice loader — Chrome/Edge load voices lazily; getVoices() returns [] on first call ──
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise(resolve => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) return resolve(voices);
    const handler = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler);
    // Safety: some browsers never fire voiceschanged
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(window.speechSynthesis.getVoices());
    }, 2000);
  });
}

// ── Pending TTS audio ──────────────────────────────────────────────────────────
let pendingTTSBlob: Blob | null = null;

// ── Voice hook — STT + TTS (OpenAI Onyx + browser fallback) ──────────────────
function useVoice(onTranscript: (text: string, isFinal: boolean) => void) {
  const recognitionRef    = useRef<any>(null);
  const audioRef          = useRef<HTMLAudioElement | null>(null);
  const primedAudioRef    = useRef<HTMLAudioElement | null>(null); // pre-unlocked element for iOS fallback
  const audioCtxRef       = useRef<AudioContext | null>(null);
  const audioSourceRef    = useRef<AudioBufferSourceNode | null>(null);
  const speakingTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isListening,  setIsListening]  = useState(false);
  const [isSpeaking,   setIsSpeaking]   = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(() => {
    try { return localStorage.getItem('abba_voice') !== 'off'; } catch { return true; }
  });

  // ── Audio unlock — MUST be called directly inside a user gesture (tap/click) ─
  // On iOS Safari and Android Chrome, audio is blocked until the AudioContext
  // is resumed AND a buffer is played while the gesture is still active.
  // Calling this in handleSubmit/handleMicClick unblocks all subsequent audio.play() calls.
  const unlockAudio = useCallback(() => {
    // ── 1. Web Audio API unlock (synchronous silent buffer during gesture) ──
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AC) {
        if (!audioCtxRef.current) audioCtxRef.current = new AC();
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
      }
    } catch { /* ignore */ }
    // ── 2. HTML5 Audio element unlock (primes element for async src swaps) ──
    // iOS Safari allows future audio.src = url; audio.play() on an element
    // that was already .play()'d during a user gesture, even after the src changes.
    try {
      if (!primedAudioRef.current) {
        // Shortest valid silent WAV as a data URI — no network request needed
        const silent = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAA=';
        const a = new Audio(silent);
        a.volume = 0.001;
        a.play().then(() => { a.pause(); a.volume = 1.0; }).catch(() => {});
        primedAudioRef.current = a;
      }
    } catch { /* ignore */ }
  }, []);

  // Safety: always clear the isSpeaking flag after a max duration
  const safeSetSpeaking = useCallback((val: boolean) => {
    setIsSpeaking(val);
    if (val) {
      if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = setTimeout(() => setIsSpeaking(false), 60_000);
    } else {
      if (speakingTimerRef.current) { clearTimeout(speakingTimerRef.current); speakingTimerRef.current = null; }
    }
  }, []);

  // ── STT ───────────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!hasSpeechRecognition) return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SpeechRec();
    rec.continuous     = false;
    rec.interimResults = true;
    rec.lang           = 'en-US';
    rec.onstart  = () => setIsListening(true);
    rec.onend    = () => setIsListening(false);
    rec.onerror  = () => setIsListening(false);
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript).join('');
      const isFinal = e.results[e.results.length - 1]?.isFinal ?? false;
      onTranscript(transcript, isFinal);
    };
    recognitionRef.current = rec;
    rec.start();
  }, [onTranscript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // ── Browser TTS fallback — loads voices async (fixes Chrome empty-array bug) ─
  const browserSpeak = useCallback(async (text: string) => {
    if (!hasSpeechSynthesis) { safeSetSpeaking(false); return; }
    try {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_~`#>]/g, '').replace(/\[.*?\]/g, '').trim().slice(0, 1000);
      if (!clean) { safeSetSpeaking(false); return; }
      const voices = await loadVoices();
      // Prioritise deep male voices for ABBA's authoritative street tone
      const preferred = voices.find(v => /microsoft guy|microsoft david|google uk english male|daniel|alex|reed|liam|james/i.test(v.name))
                     || voices.find(v => /en-US/i.test(v.lang) && /male/i.test(v.name))
                     || voices.find(v => /male/i.test(v.name))
                     || voices[0];
      const utt    = new SpeechSynthesisUtterance(clean);
      utt.rate     = 0.92; // slightly slower = more authoritative delivery
      utt.pitch    = 0.78; // lower pitch = deeper, more commanding voice
      utt.volume   = 1.0;
      if (preferred) utt.voice = preferred;
      utt.onend    = () => safeSetSpeaking(false);
      utt.onerror  = () => safeSetSpeaking(false);
      safeSetSpeaking(true);
      window.speechSynthesis.speak(utt);
    } catch {
      safeSetSpeaking(false);
    }
  }, [safeSetSpeaking]);

  // ── Primary TTS — fetches audio from server, plays via Web Audio API (mobile-safe) ──
  // Web Audio API (AudioContext) works on iOS/Android AFTER unlockAudio() has been called
  // once in a gesture. Unlike new Audio().play(), it is NOT blocked by autoplay policies
  // in subsequent async calls once the context is running.
  const speak = useCallback(async (text: string, msgId?: string, onAudioReady?: (url: string) => void) => {
    if (!voiceEnabled) return;
    if (!text?.trim()) return;

    // Stop any current playback
    if (audioSourceRef.current) { try { audioSourceRef.current.stop(); } catch {} audioSourceRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (hasSpeechSynthesis) window.speechSynthesis.cancel();

    const trimmed = text.replace(/[*_~`#>]/g, '').replace(/\[.*?\]/g, '').trim().slice(0, 1200);
    safeSetSpeaking(true);

    try {
      const res = await fetch('/api/abba/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: trimmed }),
      });

      if (!res.ok) throw new Error('TTS unavailable');
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('audio')) throw new Error('Not audio');

      const blob = await res.blob();
      if (blob.size < 100) throw new Error('Empty audio');

      // Store blob URL on message for tap-to-play button
      const url = URL.createObjectURL(blob);
      if (onAudioReady) onAudioReady(url);

      // ── Try Web Audio API first (works on iOS/Android once unlocked) ──
      // We call ctx.resume() here too — once the context was user-activated via
      // unlockAudio() during a gesture, subsequent resume() calls succeed even
      // outside a gesture. This covers the case where ctx.state is still
      // 'suspended' because the earlier resume() promise hadn't resolved yet.
      const ctx = audioCtxRef.current;
      if (ctx) {
        try {
          if (ctx.state !== 'running') await ctx.resume();
          const arrayBuffer = await blob.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          const src = ctx.createBufferSource();
          src.buffer = decoded;
          src.connect(ctx.destination);
          src.onended = () => { safeSetSpeaking(false); audioSourceRef.current = null; };
          audioSourceRef.current = src;
          src.start(0);
          return; // Successfully playing via Web Audio API
        } catch {
          // Web Audio failed — fall through to HTML5 Audio
        }
      }

      // ── Fallback: HTML5 Audio — reuse the primed element if available ──
      // The primed element was .play()'d during a user gesture so iOS allows
      // subsequent src-swap + play() calls without a new gesture.
      const audio = primedAudioRef.current || new Audio();
      primedAudioRef.current = null; // consume it — will be re-primed on next gesture
      audio.src = url;
      audio.volume = 1.0;
      audioRef.current = audio;
      audio.onended = () => { safeSetSpeaking(false); audioRef.current = null; };
      audio.onerror = () => { safeSetSpeaking(false); audioRef.current = null; browserSpeak(trimmed); };
      await audio.play().catch(async () => {
        safeSetSpeaking(false);
        audioRef.current = null;
        await browserSpeak(trimmed);
      });
    } catch {
      safeSetSpeaking(false);
      await browserSpeak(trimmed);
    }
  }, [voiceEnabled, browserSpeak, safeSetSpeaking]);

  // ── Play a stored audio URL on user tap (bypasses autoplay policy) ───────────
  const playStoredAudio = useCallback((url: string) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    const audio = new Audio(url);
    audio.volume = 1.0;
    audioRef.current = audio;
    safeSetSpeaking(true);
    audio.onended = () => { safeSetSpeaking(false); audioRef.current = null; };
    audio.onerror = () => { safeSetSpeaking(false); audioRef.current = null; };
    audio.play().catch(() => safeSetSpeaking(false));
  }, [safeSetSpeaking]);

  const stopSpeaking = useCallback(() => {
    if (audioSourceRef.current) { try { audioSourceRef.current.stop(); } catch {} audioSourceRef.current = null; }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (hasSpeechSynthesis) window.speechSynthesis.cancel();
    safeSetSpeaking(false);
  }, [safeSetSpeaking]);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('abba_voice', next ? 'on' : 'off'); } catch {}
      if (!next) {
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        window.speechSynthesis?.cancel();
        safeSetSpeaking(false);
      }
      return next;
    });
  }, [safeSetSpeaking]);

  return { isListening, isSpeaking, voiceEnabled, startListening, stopListening, speak, stopSpeaking, toggleVoice, playStoredAudio, unlockAudio, audioRef, audioCtxRef, safeSetSpeaking };
}

// ── Arc Reactor icon (JARVIS-style) ──────────────────────────────────────────
const ArcReactor = ({ size = 36, pulse = false }: { size?: number; pulse?: boolean }) => (
  <div
    style={{ width: size, height: size }}
    className="relative flex items-center justify-center flex-shrink-0"
  >
    {/* Outer glow ring */}
    {pulse && (
      <div
        className="absolute inset-0 rounded-full animate-ping"
        style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.3) 0%, transparent 70%)' }}
      />
    )}
    {/* Base */}
    <div
      className="absolute inset-0 rounded-full"
      style={{ background: 'linear-gradient(135deg, #1a0a0a 0%, #0d0d1a 100%)', border: '1.5px solid rgba(220,38,38,0.5)' }}
    />
    {/* Outer ring */}
    <div
      className="absolute rounded-full"
      style={{
        inset: size * 0.08,
        border: '1px solid rgba(220,38,38,0.7)',
        boxShadow: '0 0 6px rgba(220,38,38,0.5)',
      }}
    />
    {/* Inner ring */}
    <div
      className="absolute rounded-full"
      style={{
        inset: size * 0.25,
        border: '1px solid rgba(139,92,246,0.8)',
        boxShadow: '0 0 8px rgba(139,92,246,0.6)',
      }}
    />
    {/* Core */}
    <div
      className="absolute rounded-full"
      style={{
        inset: size * 0.38,
        background: 'radial-gradient(circle, rgba(220,38,38,1) 0%, rgba(139,92,246,1) 100%)',
        boxShadow: '0 0 10px rgba(220,38,38,0.9), 0 0 20px rgba(139,92,246,0.5)',
      }}
    />
    {/* Spokes */}
    {[0, 60, 120, 180, 240, 300].map(angle => (
      <div
        key={angle}
        className="absolute"
        style={{
          width: 1,
          height: size * 0.18,
          top: '50%',
          left: '50%',
          transformOrigin: '50% 100%',
          transform: `translateX(-50%) rotate(${angle}deg) translateY(-${size * 0.28}px)`,
          background: 'rgba(220,38,38,0.6)',
        }}
      />
    ))}
  </div>
);

// ── Quick action prompts ──────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { icon: Target,     label: 'Am I on pace?',         prompt: 'Am I on pace to hit my weekly profit goal? Give me a pacing breakdown.' },
  { icon: TrendingUp, label: 'Best entry now?',        prompt: "What's the best trade entry right now based on my weekly plan pairs and the current session?" },
  { icon: Activity,   label: "Today's summary",        prompt: "Give me a full summary of today's trading performance and what I should focus on for the rest of the day." },
  { icon: BarChart2,  label: 'My week plan',           prompt: "Walk me through my current weekly strategy — pairs, daily target, and where I stand." },
  { icon: Zap,        label: 'Protect my gains',       prompt: "I'm ahead on my weekly goal. What should I do to protect my gains and finish the week strong?" },
  { icon: MapPin,     label: 'Take me to Analysis',   prompt: "Take me to the Analysis page." },
];

// ── Message bubble ────────────────────────────────────────────────────────────
const MsgBubble = ({
  msg, onNavigate, onCreatePlan, creatingPlan, onSuggestion, isLast, onPlayAudio, onFetchAndPlayTTS,
}: {
  msg: AbbaMessage;
  onNavigate: (path: string) => void;
  onCreatePlan: (p: PlanProposal) => void;
  creatingPlan: boolean;
  onSuggestion: (text: string) => void;
  isLast: boolean;
  onPlayAudio: (url: string) => void;
  onFetchAndPlayTTS: (text: string, msgId: string) => void;
}) => {
  const isAbba = msg.role === 'abba';
  const [fetchingAudio, setFetchingAudio] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2.5 ${isAbba ? '' : 'flex-row-reverse'}`}
    >
      {isAbba && (
        <div className="flex-shrink-0 mt-1">
          <ArcReactor size={26} />
        </div>
      )}
      <div className={`max-w-[82%] flex flex-col gap-1 ${isAbba ? '' : 'items-end'}`}>
        {isAbba && (
          <span className="text-[10px] font-bold tracking-widest uppercase"
            style={{ background: 'linear-gradient(90deg, #ef4444, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ABBA
          </span>
        )}
        {msg.content && (
          <div
            className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              isAbba
                ? 'bg-[#12121f] border border-red-900/40 text-gray-100'
                : 'text-white'
            }`}
            style={isAbba ? {} : { background: 'linear-gradient(135deg, #dc2626, #7c3aed)' }}
          >
            {msg.content}
          </div>
        )}
        {/* Plan proposal card — rendered below the message bubble */}
        {isAbba && msg.planProposal && (
          <div className="w-full mt-1">
            <PlanProposalCard
              proposal={msg.planProposal}
              onConfirm={onCreatePlan}
              onEdit={() => {}}
              creating={creatingPlan}
            />
          </div>
        )}
        {msg.navigateTo && (
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 mt-1 cursor-pointer group"
            style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)' }}
            onClick={() => onNavigate(msg.navigateTo!)}
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-[11px] font-semibold text-white leading-tight">Take me there?</p>
                <p className="text-[10px] text-gray-400">{msg.navigateTo}</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-red-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600">
            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {/* Hear button — plays stored audio or fetches TTS on demand */}
          {isAbba && msg.content && msg.content.length > 5 && (
            <button
              onClick={() => {
                if (msg.audioUrl) {
                  onPlayAudio(msg.audioUrl);
                } else {
                  setFetchingAudio(true);
                  onFetchAndPlayTTS(msg.content, msg.id);
                  setTimeout(() => setFetchingAudio(false), 3000);
                }
              }}
              disabled={fetchingAudio}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all disabled:opacity-50"
              style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', color: '#a855f7' }}
              title="Tap to hear ABBA"
            >
              <Volume2 className="h-2.5 w-2.5" /> {fetchingAudio ? '…' : 'Hear'}
            </button>
          )}
        </div>
        {/* Continuation chips — only on last ABBA message */}
        {isAbba && isLast && msg.suggestions && msg.suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col gap-1.5 mt-2 w-full"
          >
            <span className="text-[9px] text-gray-600 uppercase tracking-wider font-medium flex items-center gap-1">
              <ChevronRight className="h-2.5 w-2.5 text-red-700" /> Keep the cipher going
            </span>
            {msg.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestion(s)}
                className="text-left text-[11px] text-gray-300 hover:text-white px-2.5 py-1.5 rounded-xl transition-all"
                style={{
                  background: 'rgba(220,38,38,0.06)',
                  border: '1px solid rgba(220,38,38,0.18)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.45)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.12)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,38,38,0.18)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,38,38,0.06)'; }}
              >
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

// ── Plan Proposal Confirmation Card ──────────────────────────────────────────
const PlanProposalCard = ({
  proposal, onConfirm, onEdit, creating,
}: {
  proposal: PlanProposal;
  onConfirm: (p: PlanProposal) => void;
  onEdit: (field: string) => void;
  creating: boolean;
}) => {
  const [target, setTarget] = useState(proposal.profitTarget?.toString() ?? '');
  const [balance, setBalance] = useState(proposal.accountBalance?.toString() ?? '');
  const [lots, setLots] = useState(proposal.lotSize?.toString() ?? '');
  const hasMissing = proposal.missingFields?.length > 0;

  const handleConfirm = () => {
    const updated = {
      ...proposal,
      profitTarget: target ? parseFloat(target) : proposal.profitTarget,
      accountBalance: balance ? parseFloat(balance) : proposal.accountBalance,
      lotSize: lots ? parseFloat(lots) : proposal.lotSize,
      missingFields: [],
    };
    onConfirm(updated);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden text-sm"
      style={{ border: '1px solid rgba(220,38,38,0.4)', background: 'linear-gradient(135deg, #0d0d1a 0%, #130a0a 100%)' }}
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(220,38,38,0.2)', background: 'rgba(220,38,38,0.08)' }}>
        <Calendar className="h-3.5 w-3.5 text-red-400 shrink-0" />
        <span className="text-xs font-bold text-white">Weekly Plan Ready</span>
        <span className="ml-auto text-[10px] text-gray-500">{proposal.strategyType?.toUpperCase()}</span>
      </div>

      {/* Plan details */}
      <div className="px-3 py-2.5 space-y-1.5">
        <div className="flex flex-wrap gap-1.5 mb-2">
          {proposal.pairs?.map(p => (
            <span key={p} className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
              style={{ background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.4)' }}>
              {p}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <span className="text-gray-500">Sessions:</span>
          <span className="text-white font-medium">{proposal.sessions?.join(', ') || 'All'}</span>
          <span className="text-gray-500">Direction:</span>
          <span className="text-white font-medium">{proposal.direction}</span>
          <span className="text-gray-500">Trading days:</span>
          <span className="text-white font-medium">{proposal.tradingDays?.length || 5}d/week</span>
          <span className="text-gray-500">Risk level:</span>
          <span className="text-white font-medium capitalize">{proposal.riskLevel}</span>
        </div>

        {/* Missing fields — quick input */}
        {proposal.missingFields?.includes('profitTarget') && (
          <div className="mt-2">
            <label className="text-[10px] text-amber-400 mb-1 block">Weekly profit target ($)</label>
            <input value={target} onChange={e => setTarget(e.target.value)} type="number" placeholder="e.g. 500"
              className="w-full bg-[#1a1a2e] border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-amber-500/60" />
          </div>
        )}
        {proposal.missingFields?.includes('accountBalance') && (
          <div className="mt-2">
            <label className="text-[10px] text-amber-400 mb-1 block">Account balance ($)</label>
            <input value={balance} onChange={e => setBalance(e.target.value)} type="number" placeholder="e.g. 5000"
              className="w-full bg-[#1a1a2e] border border-amber-500/30 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-amber-500/60" />
          </div>
        )}
        {proposal.missingFields?.includes('lotSize') && (
          <div className="mt-2">
            <label className="text-[10px] text-gray-400 mb-1 block">Lot size (optional — AI will calculate if blank)</label>
            <input value={lots} onChange={e => setLots(e.target.value)} type="number" step="0.01" placeholder="e.g. 0.10"
              className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-white placeholder:text-gray-600 outline-none" />
          </div>
        )}

        {proposal.notes && (
          <p className="text-[10px] text-gray-500 italic mt-1">Note: {proposal.notes}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-3 pb-3 flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={creating || (proposal.missingFields?.includes('profitTarget') && !target) || (proposal.missingFields?.includes('accountBalance') && !balance)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #dc2626, #7c3aed)' }}
        >
          {creating ? <><Loader2 className="h-3 w-3 animate-spin" /> Creating...</> : <><Check className="h-3 w-3" /> Create Plan</>}
        </button>
        <button
          onClick={() => onEdit('modify')}
          className="px-3 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Modify
        </button>
      </div>
    </motion.div>
  );
};

// ── Goal mode badge ───────────────────────────────────────────────────────────
const GOAL_MODE_CONFIG = {
  CATCH_UP:  { label: '⚡ CATCH UP',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)' },
  ON_PACE:   { label: '✅ ON PACE',    color: '#10b981', bg: 'rgba(16,185,129,0.10)',  border: 'rgba(16,185,129,0.30)' },
  LOCK_IN:   { label: '🔒 LOCK IN',   color: '#a855f7', bg: 'rgba(168,85,247,0.10)',  border: 'rgba(168,85,247,0.30)' },
};

// ── Live context header bar ────────────────────────────────────────────────────
const ContextBar = ({ ctx }: { ctx: AbbaContext | null }) => {
  if (!ctx) return null;
  const pct = ctx.weekPct;
  const barColor = pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const goalCfg = ctx.goalMode ? GOAL_MODE_CONFIG[ctx.goalMode] : null;
  const dailyPct = ctx.dailyTarget > 0 ? Math.min(100, Math.round(((ctx.todayProfit ?? 0) / ctx.dailyTarget) * 100)) : 0;

  return (
    <div className="px-3 py-2 border-b border-red-900/20 space-y-1.5">
      {/* Goal Intelligence mode badge */}
      {goalCfg && (
        <div className="flex items-center justify-between">
          <span
            className="text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full"
            style={{ color: goalCfg.color, background: goalCfg.bg, border: `1px solid ${goalCfg.border}` }}
          >
            {goalCfg.label}
          </span>
          {ctx.goalLotMultiplier && ctx.goalLotMultiplier !== 1.0 && (
            <span className="text-[9px] text-gray-500">
              Lots ×<span style={{ color: goalCfg.color }} className="font-bold">{ctx.goalLotMultiplier.toFixed(2)}</span>
            </span>
          )}
        </div>
      )}
      {/* Weekly progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: barColor }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, pct)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <span className="text-[10px] font-bold" style={{ color: barColor }}>{pct}%</span>
      </div>
      {/* Stats row */}
      <div className="flex items-center gap-3 text-[10px] flex-wrap">
        <span className="text-gray-400">
          Week: <span className={ctx.weekProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
            ${ctx.weekProfit.toFixed(2)}
          </span>
          <span className="text-gray-600">/${ctx.weekTarget}</span>
        </span>
        <span className="text-gray-600">·</span>
        <span className="text-gray-400">
          Today: <span className={ctx.todayProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
            ${ctx.todayProfit?.toFixed(2) ?? '0.00'}
          </span>
          {ctx.dailyTarget > 0 && (
            <span className="text-gray-600">/{ctx.dailyTarget.toFixed(0)} ({dailyPct}%)</span>
          )}
        </span>
        {ctx.openCount > 0 && (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-amber-400 font-semibold">{ctx.openCount} open</span>
          </>
        )}
      </div>
    </div>
  );
};

// ── Platform Sync Status Bar ──────────────────────────────────────────────────
const PlatformSyncBar = ({ userId }: { userId: number }) => {
  const { data } = useQuery<any>({
    queryKey: ['/api/abba/platform-sync'],
    enabled: !!userId,
    refetchInterval: 60000,
  });

  if (!data?.hasPlan) return null;

  const platforms = data.platforms || {};
  const entries = [
    { key: 'mt5',         label: 'MT5',          synced: platforms.mt5?.synced,         connected: platforms.mt5?.connected },
    { key: 'tradelocker', label: 'TradeLocker',   synced: platforms.tradelocker?.synced, connected: platforms.tradelocker?.connected },
    { key: 'tradovate',   label: 'Futures',       synced: platforms.tradovate?.synced,   connected: platforms.tradovate?.connected },
  ].filter(p => p.connected);

  if (entries.length === 0) return null;

  return (
    <div className="px-3 py-1.5 flex items-center gap-2 flex-wrap" style={{ borderBottom: '1px solid rgba(220,38,38,0.1)', background: 'rgba(0,0,0,0.2)' }}>
      <Wifi className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
      <span className="text-[9px] text-gray-600 font-medium uppercase tracking-wider">Plan active on:</span>
      {entries.map(p => (
        <span
          key={p.key}
          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{
            color: p.synced ? '#10b981' : '#6b7280',
            background: p.synced ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
            border: `1px solid ${p.synced ? 'rgba(16,185,129,0.3)' : 'rgba(107,114,128,0.2)'}`,
          }}
        >
          {p.synced ? '✓' : '○'} {p.label}
        </span>
      ))}
      {data.syncedAt && (
        <span className="text-[8px] text-gray-700 ml-auto">
          synced {new Date(data.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
};

// ── Main ABBA component ─────────────────────────────────────────────────────
export function AbbaAssistant() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem('abba_dismissed') === '1'; } catch { return false; }
  });
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AbbaMessage[]>([]);
  const [context, setContext] = useState<AbbaContext | null>(null);
  const [showQuick, setShowQuick] = useState(true);
  const [needsKey, setNeedsKey] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [interimText, setInterimText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const audioPlayingRef = useRef(false);
  const voiceSendRef = useRef<(msg: string) => void>(() => {});
  const { toast } = useToast();

  // Voice hook — STT + TTS
  const { isListening, isSpeaking, voiceEnabled, startListening, stopListening, speak, stopSpeaking, toggleVoice, playStoredAudio, unlockAudio, audioRef, audioCtxRef, safeSetSpeaking } = useVoice(
    useCallback((transcript: string, isFinal: boolean) => {
      setInput(transcript);
      setInterimText(isFinal ? '' : transcript);
      if (isFinal && transcript.trim()) {
        if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
        autoSendTimerRef.current = setTimeout(() => {
          setInterimText('');
          setInput('');
          voiceSendRef.current(transcript.trim());
        }, 600);
      }
    }, [])
  );

  // Pre-warm browser voices so they're ready when first text event arrives
  useEffect(() => {
    if (hasSpeechSynthesis) loadVoices().catch(() => {});
  }, []);

  // Listen for external open-ABBA events (e.g., from dashboard card)
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('open-ABBA', handler);
    return () => window.removeEventListener('open-ABBA', handler);
  }, []);

  // Stop listening/speaking when panel closes
  useEffect(() => {
    if (!open) { stopListening(); stopSpeaking(); }
  }, [open, stopListening, stopSpeaking]);

  // Greeting on open — auto-speaks when ABBA opens
  const greetingSpokenRef = useRef(false);
  useEffect(() => {
    if (open && messages.length === 0 && !greetingSpokenRef.current) {
      greetingSpokenRef.current = true;
      const firstName = (user?.fullName || user?.username || 'God').split(' ')[0];
      const greetingContent = `Peace, ${firstName}. ABBA standing in the cipher.\n\nWord is bond — I got your live numbers right here. Balance, weekly goal, every open position. Knowledge (1) is the foundation and yours is locked in.\n\nWhat you building today?`;
      setMessages([{
        id: genId(),
        role: 'abba',
        content: greetingContent,
        timestamp: new Date(),
      }]);
      // Auto-speak greeting — audio context was unlocked when user tapped the ABBA orb
      if (voiceEnabled) {
        setTimeout(() => speak(greetingContent), 150);
      }
    }
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open, voiceEnabled, speak]);

  // Auto-scroll
  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Fetch live context when opened
  const { refetch: refetchContext, data: contextData } = useQuery<AbbaContext>({
    queryKey: ['/api/abba/context'],
    enabled: open && !!user,
    refetchInterval: open ? 30000 : false,
  });

  // Sync context state whenever query data updates
  useEffect(() => {
    if (contextData) setContext(contextData);
  }, [contextData]);

  const chatMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest('POST', '/api/abba/chat', {
        message: msg,
        history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
        currentPage: location,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.needsApiKey) {
        setNeedsKey(true);
        setMessages(prev => [...prev, {
          id: genId(), role: 'abba',
          content: "Peace. I need an AI key to build with you. Head to Settings → AI API Keys and drop in your OpenAI, Groq, or Anthropic key. Word is bond, once that's set — I'm fully online.",
          timestamp: new Date(), navigateTo: '/ai-api-keys',
        }]);
        return;
      }
      // Update context if returned
      if (data.context) setContext(data.context);
      const newMsgId = genId();

      // Decode inline audio that came bundled with the chat response (no 2nd fetch needed)
      let inlineAudioUrl: string | undefined;
      if (data.audioBase64 && voiceEnabled) {
        try {
          const bytes = atob(data.audioBase64);
          const arr = new Uint8Array(bytes.length);
          for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
          const blob = new Blob([arr], { type: 'audio/mpeg' });
          inlineAudioUrl = URL.createObjectURL(blob);
        } catch { /* ignore decode errors */ }
      }

      setMessages(prev => [...prev, {
        id: newMsgId, role: 'abba',
        content: data.response,
        timestamp: new Date(),
        navigateTo: data.navigateTo || null,
        planProposal: data.planProposal || null,
        suggestions: data.suggestions || [],
        audioUrl: inlineAudioUrl,
      }]);

      // Try autoplay immediately with inline audio (no extra fetch)
      if (inlineAudioUrl) {
        const audio = new Audio(inlineAudioUrl);
        audio.volume = 1.0;
        audioRef.current = audio;
        safeSetSpeaking(true);
        audio.onended = () => { safeSetSpeaking(false); audioRef.current = null; };
        audio.onerror = () => { safeSetSpeaking(false); audioRef.current = null; };
        audio.play().catch(() => {
          // Autoplay blocked — Hear button is visible on the message
          safeSetSpeaking(false);
          audioRef.current = null;
        });
      } else if (data.response && voiceEnabled) {
        // Fallback: fetch TTS separately (Edge TTS may have timed out inline)
        speak(data.response, newMsgId, (audioUrl) => {
          setMessages(prev => prev.map(m => m.id === newMsgId ? { ...m, audioUrl } : m));
        });
      }
      // Auto-navigate if ABBA gave a nav command
      if (data.navigateTo) {
        setTimeout(() => {
          navigate(data.navigateTo);
        }, 1200);
      }
    },
    onError: (err: any) => {
      const msg = err?.message || '';
      let detail = 'Systems temporarily offline. Please try again.';
      try {
        const jsonStart = msg.indexOf('{');
        if (jsonStart !== -1) {
          const parsed = JSON.parse(msg.slice(jsonStart));
          detail = parsed.error || detail;
          if (parsed.needsApiKey) setNeedsKey(true);
        }
      } catch { /* ignore */ }
      setMessages(prev => [...prev, {
        id: genId(), role: 'abba', content: detail, timestamp: new Date(),
      }]);
    },
  });

  const handleCreatePlan = useCallback(async (proposal: PlanProposal) => {
    setCreatingPlan(true);
    try {
      const res = await apiRequest('POST', '/api/abba/create-plan', { proposal });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Build platform sync summary
      const sync = data.platformSync as {
        mt5: boolean; tradelocker: boolean; tradelockerAccount?: string;
        tradovate: boolean; tradovateAccount?: string;
        webhooksTriggered: number; syncedPairs: string[];
      } | undefined;

      const syncLines: string[] = [];
      if (sync?.mt5)         syncLines.push('✅ MT5 EA');
      if (sync?.tradelocker) syncLines.push(`✅ TradeLocker${sync.tradelockerAccount ? ` (${sync.tradelockerAccount})` : ''}`);
      if (sync?.tradovate)   syncLines.push(`✅ Futures${sync.tradovateAccount ? ` (${sync.tradovateAccount})` : ''}`);
      if ((sync?.webhooksTriggered ?? 0) > 0) syncLines.push(`✅ ${sync!.webhooksTriggered} webhook${sync!.webhooksTriggered > 1 ? 's' : ''}`);
      const noSync = syncLines.length === 0;

      const syncBlock = noSync
        ? '\n\n⚠️ No platforms connected yet. Connect MT5, TradeLocker, or Futures in Settings to push the plan live.'
        : `\n\n📡 Plan pushed to the cipher:\n${syncLines.join('\n')}`;

      toast({
        title: '✅ Weekly Plan Created!',
        description: `Your ${proposal.pairs?.join(', ')} plan is live and synced to ${syncLines.length} platform${syncLines.length !== 1 ? 's' : ''}.`,
      });

      // Follow-up ABBA confirmation message with sync details
      setMessages(prev => [...prev, {
        id: genId(), role: 'abba',
        content: `Peace — the plan is Born (9). 🎯\n\nPairs: ${proposal.pairs?.join(', ')}\nSessions: ${proposal.sessions?.join(', ') || 'All'}\nDirection: ${proposal.direction}${syncBlock}\n\nThe cipher is complete. I'm watching these pairs across every connected account — only plan signals move. Build on this. Ask me "Best entry now?" when you're ready.`,
        timestamp: new Date(),
        navigateTo: '/weekly-strategy',
      }]);

      // Refresh context + sync status + weekly strategy page
      refetchContext();
      queryClient.invalidateQueries({ queryKey: ['/api/abba/platform-sync'] });
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-strategy'] });
    } catch (err: any) {
      toast({
        title: 'Plan creation failed',
        description: err?.message || 'Could not create plan. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCreatingPlan(false);
    }
  }, [toast, refetchContext]);

  // ── Sequential audio queue player ────────────────────────────────────────
  const playNextQueued = useCallback(() => {
    if (audioPlayingRef.current || audioQueueRef.current.length === 0) return;
    audioPlayingRef.current = true;
    const url = audioQueueRef.current.shift()!;
    const audio = new Audio(url);
    audio.volume = 1.0;
    audioRef.current = audio;
    safeSetSpeaking(true);
    audio.onended = () => {
      safeSetSpeaking(false);
      audioRef.current = null;
      audioPlayingRef.current = false;
      URL.revokeObjectURL(url);
      playNextQueued();
    };
    audio.onerror = () => {
      safeSetSpeaking(false);
      audioRef.current = null;
      audioPlayingRef.current = false;
      URL.revokeObjectURL(url);
      playNextQueued();
    };
    audio.play().catch(() => {
      audioPlayingRef.current = false;
      safeSetSpeaking(false);
    });
  }, [audioRef, safeSetSpeaking]);

  // ── Browser speech queue — speaks each streamed sentence instantly ──────────
  const speechQueueRef = useRef<string[]>([]);
  const speechBusyRef  = useRef(false);

  const speakNext = useCallback(async () => {
    if (!hasSpeechSynthesis) return;
    if (speechBusyRef.current || speechQueueRef.current.length === 0) return;
    const text = speechQueueRef.current.shift()!;
    speechBusyRef.current = true;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate   = 1.0;
    utt.pitch  = 0.85;
    utt.volume = 1.0;
    // Use async loadVoices() — Chrome/Edge return empty array on first sync call
    const voices = await loadVoices();
    const best = voices.find(v => /microsoft guy|microsoft david|microsoft mark|google uk english male|daniel|alex|reed|liam|james/i.test(v.name))
              || voices.find(v => v.lang === 'en-US' && /male|man/i.test(v.name))
              || voices.find(v => v.lang === 'en-US')
              || voices[0];
    if (best) utt.voice = best;
    utt.onend = utt.onerror = () => { speechBusyRef.current = false; speakNext(); };
    safeSetSpeaking(true);
    window.speechSynthesis.speak(utt);
  }, [safeSetSpeaking]);

  const queueSpeak = useCallback((text: string) => {
    if (!voiceEnabled || !hasSpeechSynthesis) return;
    const clean = text.replace(/[*_~`#>]/g, '').replace(/\[.*?\]/g, '').trim();
    if (!clean) return;
    speechQueueRef.current.push(clean);
    speakNext();
  }, [voiceEnabled, speakNext]);

  const sendMessage = useCallback(async (msg: string) => {
    if (!msg.trim() || isStreaming) return;
    setMessages(prev => [...prev, { id: genId(), role: 'user', content: msg, timestamp: new Date() }]);
    setShowQuick(false);
    setInput('');

    // Stop any in-progress speech
    if (hasSpeechSynthesis) window.speechSynthesis.cancel();
    speechQueueRef.current = [];
    speechBusyRef.current = false;
    audioQueueRef.current = [];
    audioPlayingRef.current = false;

    const msgId = genId();
    // Add empty ABBA bubble that fills in as stream arrives
    setMessages(prev => [...prev, { id: msgId, role: 'abba', content: '', timestamp: new Date() }]);
    setIsStreaming(true);

    try {
      const res = await fetch('/api/abba/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: msg,
          history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
          currentPage: location,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Stream unavailable');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let fullText = '';

      // ── Instant TTS: fire as soon as the first complete sentence arrives ──
      // This gives immediate audio feedback instead of waiting for the full stream.
      let earlyTTSFired = false;
      let sentenceBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const parts = sseBuffer.split('\n\n');
        sseBuffer = parts.pop() || '';

        for (const part of parts) {
          let eventType = 'message';
          let dataStr = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;
          let parsed: any;
          try { parsed = JSON.parse(dataStr); } catch { continue; }

          if (eventType === 'text') {
            fullText += parsed.text;
            sentenceBuffer += parsed.text;
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));

            // ── Fire TTS as soon as we detect the first sentence boundary (30+ chars) ──
            // This starts audio 2-4 seconds sooner than waiting for the full response.
            if (voiceEnabled && !earlyTTSFired) {
              const match = sentenceBuffer.match(/^[\s\S]{30,}?[.!?]+(?:\s|$)/);
              if (match) {
                earlyTTSFired = true;
                // Clear browser speech queue
                if (hasSpeechSynthesis) { window.speechSynthesis.cancel(); speechQueueRef.current = []; speechBusyRef.current = false; }
                speak(match[0].trim(), msgId, (audioUrl) => {
                  setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audioUrl } : m));
                });
              }
            }
          }

          if (eventType === 'done') {
            if (parsed.context) setContext(parsed.context);
            setMessages(prev => prev.map(m => m.id === msgId ? {
              ...m,
              // ── navigateTo stored on message — MsgBubble shows "Take me there" button ──
              // We do NOT auto-navigate. User must tap the button to confirm.
              navigateTo: parsed.navigateTo || null,
              planProposal: parsed.planProposal || null,
              suggestions: parsed.suggestions || [],
            } : m));
            // NO auto-navigate — removed intentionally
          }

          if (eventType === 'error') {
            if (parsed.needsApiKey) setNeedsKey(true);
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: parsed.error || 'Something went wrong.' } : m));
          }
        }
      }

      // ── After full stream: if early TTS didn't fire (very short response), speak now ──
      if (voiceEnabled && fullText && !earlyTTSFired) {
        if (hasSpeechSynthesis) { window.speechSynthesis.cancel(); speechQueueRef.current = []; speechBusyRef.current = false; }
        speak(fullText, msgId, (audioUrl) => {
          setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audioUrl } : m));
        });
      }

    } catch {
      // Fallback to non-streaming chat
      try {
        const fallback = await fetch('/api/abba/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message: msg, history: messages.slice(-8).map(m => ({ role: m.role, content: m.content })), currentPage: location }),
        });
        const data = await fallback.json();
        if (data.context) setContext(data.context);
        setMessages(prev => prev.map(m => m.id === msgId ? {
          ...m, content: data.response || 'Systems offline.',
          navigateTo: data.navigateTo || null, planProposal: data.planProposal || null, suggestions: data.suggestions || [],
        } : m));
        if (data.response && voiceEnabled) speak(data.response, msgId, (url) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, audioUrl: url } : m)));
      } catch {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: 'Connection lost. Please try again.' } : m));
      }
    } finally {
      setIsStreaming(false);
      // If no speech queued, clear speaking indicator
      if (speechQueueRef.current.length === 0 && !speechBusyRef.current) safeSetSpeaking(false);
    }
  }, [isStreaming, messages, location, voiceEnabled, navigate, queueSpeak, speak, safeSetSpeaking]);

  // Keep voiceSendRef in sync so voice callback can call sendMessage without stale closure
  voiceSendRef.current = sendMessage;

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
    setOpen(false);
  }, [navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // ── Unlock Web Audio API during this user gesture so subsequent audio.play()
    // calls work on iOS Safari and Android Chrome without being blocked. ──
    if (voiceEnabled) unlockAudio();
    sendMessage(input);
  };

  if (!user) return null;
  if (dismissed) return null;

  const panelWidth = expanded ? 'min(96vw, 600px)' : 'min(92vw, 400px)';

  return (
    <>
      {/* ── Floating trigger button ─────────────────────────────────────── */}
      <AnimatePresence>
        {!open && (
          <motion.div
            key="ABBA-fab-wrap"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed z-[9998]"
            style={{ bottom: 82, right: 16 }}
          >
            {/* Dismiss X — top-right corner of the orb */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDismissed(true);
                try { sessionStorage.setItem('abba_dismissed', '1'); } catch {}
              }}
              className="absolute -top-1.5 -right-1.5 z-10 flex items-center justify-center rounded-full transition-all hover:scale-110"
              style={{
                width: 18, height: 18,
                background: 'rgba(20,20,32,0.95)',
                border: '1px solid rgba(220,38,38,0.5)',
              }}
              title="Hide ABBA"
            >
              <X className="h-2.5 w-2.5 text-gray-400" />
            </button>
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                // Unlock audio DURING this tap gesture — required for iOS Safari + Android Chrome
                // so the greeting auto-plays without being blocked by autoplay policy
                if (voiceEnabled) unlockAudio();
                greetingSpokenRef.current = false; // reset so greeting re-speaks on fresh open
                setOpen(true);
              }}
              className="flex items-center justify-center rounded-full shadow-2xl"
              style={{
                width: 54,
                height: 54,
                background: 'linear-gradient(135deg, #1a0a0a 60%, #0d0d1a 100%)',
                border: '1.5px solid rgba(220,38,38,0.6)',
                boxShadow: '0 0 20px rgba(220,38,38,0.35), 0 0 40px rgba(139,92,246,0.15)',
              }}
            >
              <ArcReactor size={38} pulse />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Panel ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="ABBA-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.div
              key="ABBA-panel"
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed right-0 top-0 bottom-0 z-[9999] flex flex-col overflow-hidden"
              style={{
                width: panelWidth,
                background: 'linear-gradient(180deg, #0a0a14 0%, #080812 100%)',
                borderLeft: '1px solid rgba(220,38,38,0.25)',
                boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
              }}
            >
              {/* Header */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 flex-shrink-0"
                style={{ borderBottom: '1px solid rgba(220,38,38,0.2)' }}
              >
                <ArcReactor size={36} pulse />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2
                      className="text-base font-black tracking-[0.15em]"
                      style={{ background: 'linear-gradient(90deg, #ef4444, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                    >
                      ABBA
                    </h2>
                    <span
                      className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#ef4444' }}
                    >
                      VEDD AI
                    </span>
                  </div>
                  <p className="text-[10px] tracking-wide" style={{ color: isSpeaking ? '#a855f7' : '#6b7280' }}>
                    {isSpeaking ? '🔊 Speaking…' : 'Personal Trading Intelligence'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {/* Voice output toggle — always visible */}
                  <button
                    onClick={toggleVoice}
                    className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    style={{ color: voiceEnabled ? '#a855f7' : '#4b5563' }}
                    title={voiceEnabled ? 'ABBA voice ON — click to mute' : 'Voice OFF — click to enable'}
                  >
                    {voiceEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => { refetchContext(); }}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                    title="Refresh live data"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setExpanded(!expanded)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                    title={expanded ? 'Compact' : 'Expand'}
                  >
                    {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Live context bar */}
              <ContextBar ctx={context} />
              {/* Platform sync status */}
              {user && <PlatformSyncBar userId={user.id} />}

              {/* AI key nudge */}
              {needsKey && (
                <div className="mx-3 mt-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-300 flex-1">No AI key. ABBA needs a key to operate.</p>
                  <a href="/ai-api-keys" onClick={() => setOpen(false)} className="text-[10px] text-amber-400 underline font-semibold whitespace-nowrap">
                    Add Key →
                  </a>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 min-h-0">
                <AnimatePresence>
                  {messages.map((msg, idx) => (
                    <MsgBubble
                      key={msg.id}
                      msg={msg}
                      onNavigate={handleNavigate}
                      onCreatePlan={handleCreatePlan}
                      creatingPlan={creatingPlan}
                      onSuggestion={(text) => { if (voiceEnabled) unlockAudio(); sendMessage(text); }}
                      isLast={idx === messages.length - 1 && !isStreaming}
                      onPlayAudio={playStoredAudio}
                      onFetchAndPlayTTS={(text, id) => { unlockAudio(); speak(text, id, (url) =>
                        setMessages(prev => prev.map(m => m.id === id ? { ...m, audioUrl: url } : m))
                      ); }}
                    />
                  ))}
                </AnimatePresence>
                {isStreaming && messages[messages.length - 1]?.content === '' && (
                  <div className="flex items-center gap-2.5">
                    <ArcReactor size={24} pulse />
                    <div className="flex gap-1 items-center">
                      {[0, 0.2, 0.4].map((d, i) => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-red-500"
                          animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 0.8, repeat: Infinity, delay: d }}
                        />
                      ))}
                      <span className="text-[11px] text-gray-500 ml-1">ABBA is analyzing...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick prompts */}
              {showQuick && messages.length <= 1 && !isStreaming && (
                <div className="px-3 pb-2">
                  <p className="text-[10px] text-gray-600 mb-1.5 flex items-center gap-1">
                    <Zap className="h-2.5 w-2.5 text-red-500" /> Quick commands
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_PROMPTS.map((qp, i) => (
                      <button
                        key={i}
                        onClick={() => { if (voiceEnabled) unlockAudio(); sendMessage(qp.prompt); }}
                        className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-left text-[11px] font-medium text-gray-300 hover:text-white transition-all"
                        style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(220,38,38,0.4)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(220,38,38,0.15)')}
                      >
                        <qp.icon className="h-3 w-3 text-red-500 shrink-0" />
                        {qp.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="px-3 pb-3 pt-1 flex-shrink-0" style={{ borderTop: '1px solid rgba(220,38,38,0.15)' }}>
                {/* Listening indicator */}
                {isListening && (
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="flex gap-0.5 items-end h-4">
                      {[1,2,3,4,5].map(i => (
                        <motion.div
                          key={i}
                          className="w-0.5 rounded-full bg-red-500"
                          animate={{ height: ['4px','12px','4px'] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-red-400 font-medium">Listening…</span>
                    {interimText && (
                      <span className="text-[11px] text-gray-500 italic truncate flex-1">"{interimText}"</span>
                    )}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={isListening ? 'Listening…' : hasSpeechRecognition ? 'Ask ABBA or tap mic…' : 'Ask ABBA anything…'}
                    disabled={isStreaming}
                    className="flex-1 bg-[#12121f] border border-red-900/30 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-red-700/60 transition-colors"
                    style={isListening ? { borderColor: 'rgba(239,68,68,0.6)' } : {}}
                  />
                  {/* Mic button — only shown on supporting browsers */}
                  {hasSpeechRecognition && (
                    <button
                      type="button"
                      onClick={() => {
                        // Unlock audio on mic tap (user gesture) so TTS plays on mobile
                        if (!isListening && voiceEnabled) unlockAudio();
                        isListening ? stopListening() : startListening();
                      }}
                      disabled={isStreaming}
                      className="flex items-center justify-center w-10 h-10 rounded-xl transition-all flex-shrink-0 disabled:opacity-40"
                      style={{
                        background: isListening
                          ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                          : 'rgba(220,38,38,0.12)',
                        border: `1px solid ${isListening ? 'rgba(220,38,38,0.8)' : 'rgba(220,38,38,0.3)'}`,
                        boxShadow: isListening ? '0 0 16px rgba(220,38,38,0.5)' : 'none',
                      }}
                      title={isListening ? 'Stop listening' : 'Talk to ABBA'}
                    >
                      {isListening
                        ? <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
                            <MicOff className="h-4 w-4 text-white" />
                          </motion.div>
                        : <Mic className="h-4 w-4 text-red-400" />
                      }
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!input.trim() || isStreaming}
                    className="flex items-center justify-center w-10 h-10 rounded-xl transition-all flex-shrink-0 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #dc2626, #7c3aed)' }}
                  >
                    {isStreaming
                      ? <Loader2 className="h-4 w-4 text-white animate-spin" />
                      : <Send className="h-4 w-4 text-white" />
                    }
                  </button>
                </form>
                {/* Browser support note */}
                {!hasSpeechRecognition && (
                  <p className="text-[9px] text-gray-700 mt-1.5 text-center">
                    Voice input available in Chrome / Edge / Safari
                  </p>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export default AbbaAssistant;
