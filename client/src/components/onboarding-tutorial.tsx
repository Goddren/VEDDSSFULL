import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  X,
  ChevronRight,
  ChevronLeft,
  BarChart3,
  Brain,
  Zap,
  TrendingUp,
  Wallet,
  Radio,
  Star,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { SiSolana } from 'react-icons/si';
import { useAuth } from '@/hooks/use-auth';

const TUTORIAL_KEY = 'vedd_tutorial_completed';
const TUTORIAL_VERSION = 'v1';

interface Step {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  detail: string;
  cta?: { label: string; path: string };
  color: string;
  bgColor: string;
  borderColor: string;
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    icon: <Star className="w-8 h-8" />,
    title: 'Welcome to VEDD AI',
    description: 'Your AI-powered trading command centre.',
    detail: 'VEDD gives you two powerful engines working side by side: the EA Engine for forex/crypto trading via MT5 & TradeLocker, and the Sol Engine for autonomous Solana token trading. This quick tour will get you set up in minutes.',
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/30',
  },
  {
    id: 'chart-analysis',
    icon: <BarChart3 className="w-8 h-8" />,
    title: 'Step 1 — Upload a Chart',
    description: 'Get an AI read on any trading chart.',
    detail: 'Go to the Dashboard and upload a screenshot from MT4, MT5, or TradingView. VEDD\'s AI will analyse patterns, trends, support/resistance, and give you a clear BUY, SELL, or WAIT recommendation with reasoning.',
    cta: { label: 'Go to Dashboard', path: '/' },
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  {
    id: 'ea-engine',
    icon: <Zap className="w-8 h-8" />,
    title: 'Step 2 — Run the EA Engine',
    description: 'Autonomous forex trading with 18 strategies.',
    detail: 'The VEDD SS AI page runs a live trading engine across major forex pairs. It uses 18 HFT strategies, a self-learning brain that studies historical trades, and weekly profit goal tracking. Connect your TradeLocker or MT5 account to auto-execute.',
    cta: { label: 'Open VEDD SS AI', path: '/weekly-strategy' },
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
  },
  {
    id: 'sol-engine',
    icon: <SiSolana className="w-8 h-8" />,
    title: 'Step 3 — Launch Sol Engine',
    description: 'AI token trading on Solana — paper or live.',
    detail: 'The Sol Scanner scans trending Solana tokens every few minutes using 8 AI strategies. Start with Paper Trade (no real money, safe testing) to see how it performs. When ready, connect your Phantom wallet and switch to Live Trade to execute real Jupiter swaps.',
    cta: { label: 'Open Sol Scanner', path: '/solana-scanner' },
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
  },
  {
    id: 'live-monitor',
    icon: <Radio className="w-8 h-8" />,
    title: 'Step 4 — Monitor on the Go',
    description: 'Live updates from both engines, anywhere.',
    detail: 'The Live Monitor page shows real-time activity from the EA Engine and Sol Engine — open positions, P&L, AI consensus, and weekly goals. Add it to your phone\'s home screen (tap Share → "Add to Home Screen" in Safari/Chrome) for a widget-like experience.',
    cta: { label: 'Open Live Monitor', path: '/live-monitor' },
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/30',
  },
  {
    id: 'wallet',
    icon: <Wallet className="w-8 h-8" />,
    title: 'Step 5 — Connect Your Wallet',
    description: 'Unlock token-gated features with Phantom.',
    detail: 'Connect your Phantom wallet to unlock VEDD token features, membership tiers, governance voting, and Live Trade execution. Holding VEDD tokens gives you access to premium strategies and the VEDD Tokenomics earn section.',
    cta: { label: 'View VEDD Tokenomics', path: '/vedd-tokenomics' },
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  {
    id: 'done',
    icon: <CheckCircle2 className="w-8 h-8" />,
    title: "You're Ready",
    description: 'Start analysing, trading, and earning.',
    detail: 'You now know the core features. Start by uploading a chart for a free AI analysis, or jump straight into Paper Trading on the Sol Engine to watch it work in real time — with zero risk. The cipher is set. Word is bond.',
    cta: { label: 'Start on Dashboard', path: '/' },
    color: 'text-violet-400',
    bgColor: 'bg-violet-500/10',
    borderColor: 'border-violet-500/30',
  },
];

export function OnboardingTutorial() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;
    const key = `${TUTORIAL_KEY}_${user.id}_${TUTORIAL_VERSION}`;
    const done = localStorage.getItem(key);
    if (!done) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, [user]);

  useEffect(() => {
    function handleReplay() {
      if (!user) return;
      const key = `${TUTORIAL_KEY}_${user.id}_${TUTORIAL_VERSION}`;
      localStorage.removeItem(key);
      setStep(0);
      setDismissed(false);
      setVisible(true);
    }
    window.addEventListener('vedd:replay-tutorial', handleReplay);
    return () => window.removeEventListener('vedd:replay-tutorial', handleReplay);
  }, [user]);

  function complete() {
    if (user) {
      const key = `${TUTORIAL_KEY}_${user.id}_${TUTORIAL_VERSION}`;
      localStorage.setItem(key, '1');
    }
    setVisible(false);
    setDismissed(true);
  }

  function skipAll() {
    complete();
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      complete();
    }
  }

  function prev() {
    if (step > 0) setStep(s => s - 1);
  }

  function navigateCta(path: string) {
    complete();
    setLocation(path);
  }

  if (!visible || dismissed) return null;

  const current = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={skipAll}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`pointer-events-auto w-full max-w-md rounded-2xl border ${current.borderColor} bg-gray-950 shadow-2xl`}
          onClick={e => e.stopPropagation()}
        >
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="text-[11px] text-gray-500 font-medium tracking-wide uppercase">
              Getting Started — {step + 1} / {STEPS.length}
            </span>
            <button
              onClick={skipAll}
              className="text-gray-600 hover:text-gray-400 transition-colors"
              aria-label="Skip tutorial"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="px-5">
            <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  step === 0 ? 'bg-violet-500' :
                  step === 1 ? 'bg-blue-500' :
                  step === 2 ? 'bg-cyan-500' :
                  step === 3 ? 'bg-emerald-500' :
                  step === 4 ? 'bg-rose-500' :
                  step === 5 ? 'bg-amber-500' :
                  'bg-violet-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Content */}
          <div className="px-5 pt-5 pb-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${current.bgColor}`}>
              <span className={current.color}>{current.icon}</span>
            </div>

            <h2 className="text-xl font-bold text-white mb-1">{current.title}</h2>
            <p className={`text-sm font-medium mb-3 ${current.color}`}>{current.description}</p>
            <p className="text-sm text-gray-400 leading-relaxed">{current.detail}</p>

            {current.cta && (
              <button
                onClick={() => navigateCta(current.cta!.path)}
                className={`mt-4 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ${current.bgColor} border ${current.borderColor} ${current.color} hover:opacity-80 transition-opacity`}
              >
                {current.cta.label}
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Step dots */}
          <div className="flex justify-center gap-1.5 pb-2">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all duration-200 ${
                  i === step ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-gray-700 hover:bg-gray-500'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between px-5 pb-5 pt-2 border-t border-gray-800/60 mt-2">
            <button
              onClick={prev}
              disabled={step === 0}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>

            <button
              onClick={skipAll}
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Skip tour
            </button>

            <button
              onClick={next}
              className={`flex items-center gap-1 text-xs font-semibold px-4 py-2 rounded-lg ${current.bgColor} border ${current.borderColor} ${current.color} hover:opacity-80 transition-opacity`}
            >
              {step === STEPS.length - 1 ? "Let's go" : 'Next'}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function TutorialReplayButton() {
  const { user } = useAuth();

  function replay() {
    if (!user) return;
    const key = `${TUTORIAL_KEY}_${user.id}_${TUTORIAL_VERSION}`;
    localStorage.removeItem(key);
    window.location.reload();
  }

  return (
    <button
      onClick={replay}
      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
    >
      <Star className="w-3 h-3" />
      Replay tutorial
    </button>
  );
}
