import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import {
  X, Send, ChevronRight, Target, TrendingUp, Activity,
  Zap, BarChart2, MapPin, Loader2, AlertTriangle, ExternalLink,
  Minimize2, Maximize2, RefreshCw, Brain,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface TravisMessage {
  id: string;
  role: 'user' | 'travis';
  content: string;
  timestamp: Date;
  navigateTo?: string | null;
}

interface TravisContext {
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
  msg, onNavigate,
}: { msg: TravisMessage; onNavigate: (path: string) => void }) => {
  const isTravis = msg.role === 'travis';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2.5 ${isTravis ? '' : 'flex-row-reverse'}`}
    >
      {isTravis && (
        <div className="flex-shrink-0 mt-1">
          <ArcReactor size={26} />
        </div>
      )}
      <div className={`max-w-[82%] flex flex-col gap-1 ${isTravis ? '' : 'items-end'}`}>
        {isTravis && (
          <span className="text-[10px] font-bold tracking-widest uppercase"
            style={{ background: 'linear-gradient(90deg, #ef4444, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            TRAVIS
          </span>
        )}
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
            isTravis
              ? 'bg-[#12121f] border border-red-900/40 text-gray-100'
              : 'text-white'
          }`}
          style={isTravis ? {} : { background: 'linear-gradient(135deg, #dc2626, #7c3aed)' }}
        >
          {msg.content}
        </div>
        {msg.navigateTo && (
          <button
            onClick={() => onNavigate(msg.navigateTo!)}
            className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 font-medium mt-0.5"
          >
            <MapPin className="h-2.5 w-2.5" /> Navigate → {msg.navigateTo}
          </button>
        )}
        <span className="text-[10px] text-gray-600">
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
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
const ContextBar = ({ ctx }: { ctx: TravisContext | null }) => {
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

// ── Main TRAVIS component ─────────────────────────────────────────────────────
export function TravisAssistant() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<TravisMessage[]>([]);
  const [context, setContext] = useState<TravisContext | null>(null);
  const [showQuick, setShowQuick] = useState(true);
  const [needsKey, setNeedsKey] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Greeting on open
  useEffect(() => {
    if (open && messages.length === 0) {
      const firstName = user?.username?.split(' ')[0] || 'Trader';
      setMessages([{
        id: genId(),
        role: 'travis',
        content: `Good ${getTimeOfDay()}, ${firstName}. TRAVIS online.\n\nI have access to your live trading data — weekly goal, open positions, today's P&L, and your pair plan. How can I assist you?`,
        timestamp: new Date(),
      }]);
    }
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // Auto-scroll
  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Fetch live context when opened
  const { refetch: refetchContext } = useQuery<TravisContext>({
    queryKey: ['/api/travis/context'],
    enabled: open && !!user,
    refetchInterval: open ? 30000 : false,
    onSuccess: (data: TravisContext) => setContext(data),
  });

  const chatMutation = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest('POST', '/api/travis/chat', {
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
          id: genId(), role: 'travis',
          content: 'I need an AI key to operate. Go to Settings → AI API Keys and add your OpenAI, Groq, or Anthropic key.',
          timestamp: new Date(), navigateTo: '/ai-api-keys',
        }]);
        return;
      }
      // Update context if returned
      if (data.context) setContext(data.context);
      setMessages(prev => [...prev, {
        id: genId(), role: 'travis',
        content: data.response,
        timestamp: new Date(),
        navigateTo: data.navigateTo || null,
      }]);
      // Auto-navigate if Travis gave a nav command
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
        id: genId(), role: 'travis', content: detail, timestamp: new Date(),
      }]);
    },
  });

  const sendMessage = useCallback((msg: string) => {
    if (!msg.trim() || chatMutation.isPending) return;
    setMessages(prev => [...prev, {
      id: genId(), role: 'user', content: msg, timestamp: new Date(),
    }]);
    setShowQuick(false);
    chatMutation.mutate(msg);
    setInput('');
  }, [chatMutation]);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
    setOpen(false);
  }, [navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  if (!user) return null;

  const panelWidth = expanded ? 'min(96vw, 600px)' : 'min(92vw, 400px)';

  return (
    <>
      {/* ── Floating trigger button ─────────────────────────────────────── */}
      <AnimatePresence>
        {!open && (
          <motion.button
            key="travis-fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => setOpen(true)}
            className="fixed z-[9998] flex items-center justify-center rounded-full shadow-2xl"
            style={{
              bottom: 82,
              right: 16,
              width: 54,
              height: 54,
              background: 'linear-gradient(135deg, #1a0a0a 60%, #0d0d1a 100%)',
              border: '1.5px solid rgba(220,38,38,0.6)',
              boxShadow: '0 0 20px rgba(220,38,38,0.35), 0 0 40px rgba(139,92,246,0.15)',
            }}
          >
            <ArcReactor size={38} pulse />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Panel ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="travis-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.div
              key="travis-panel"
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
                      TRAVIS
                    </h2>
                    <span
                      className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#ef4444' }}
                    >
                      VEDD AI
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 tracking-wide">Personal Trading Intelligence</p>
                </div>
                <div className="flex items-center gap-1">
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

              {/* AI key nudge */}
              {needsKey && (
                <div className="mx-3 mt-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-300 flex-1">No AI key. TRAVIS needs a key to operate.</p>
                  <a href="/ai-api-keys" onClick={() => setOpen(false)} className="text-[10px] text-amber-400 underline font-semibold whitespace-nowrap">
                    Add Key →
                  </a>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 min-h-0">
                <AnimatePresence>
                  {messages.map(msg => (
                    <MsgBubble key={msg.id} msg={msg} onNavigate={handleNavigate} />
                  ))}
                </AnimatePresence>
                {chatMutation.isPending && (
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
                      <span className="text-[11px] text-gray-500 ml-1">TRAVIS is analyzing...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick prompts */}
              {showQuick && messages.length <= 1 && !chatMutation.isPending && (
                <div className="px-3 pb-2">
                  <p className="text-[10px] text-gray-600 mb-1.5 flex items-center gap-1">
                    <Zap className="h-2.5 w-2.5 text-red-500" /> Quick commands
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_PROMPTS.map((qp, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(qp.prompt)}
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
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Ask TRAVIS anything..."
                    disabled={chatMutation.isPending}
                    className="flex-1 bg-[#12121f] border border-red-900/30 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-gray-600 outline-none focus:border-red-700/60 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || chatMutation.isPending}
                    className="flex items-center justify-center w-10 h-10 rounded-xl transition-all flex-shrink-0 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #dc2626, #7c3aed)' }}
                  >
                    {chatMutation.isPending
                      ? <Loader2 className="h-4 w-4 text-white animate-spin" />
                      : <Send className="h-4 w-4 text-white" />
                    }
                  </button>
                </form>
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

export default TravisAssistant;
