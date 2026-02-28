import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  LineChart, Brain, Scan, Store, BarChart3,
  Clock, Webhook, Lightbulb, ChevronDown, ChevronUp,
  CheckCircle2, Circle, Copy, ExternalLink, Sparkles,
  Layers, ArrowRight, Star, Filter, BookOpen, X
} from 'lucide-react';

const SM_LABELS: Record<number, string> = {
  1: 'Knowledge',
  2: 'Wisdom',
  3: 'Understanding',
  4: 'Culture',
  5: 'Power',
  6: 'Equality',
  7: 'God',
  8: 'Build',
};

type Category = 'all' | 'forex' | 'solana' | 'passive' | 'analysis';

interface ProfitPath {
  num: number;
  icon: React.ElementType;
  title: string;
  route: string;
  categories: Category[];
  accent: string;
  accentBg: string;
  accentBorder: string;
  accentText: string;
  tagLabel: string;
  description: string;
  steps: string[];
}

const PATHS: ProfitPath[] = [
  {
    num: 1,
    icon: LineChart,
    title: 'AI Chart Analysis',
    route: '/analysis',
    categories: ['forex', 'analysis'],
    accent: 'blue',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/60',
    accentText: 'text-blue-400',
    tagLabel: 'Forex · Analysis',
    description:
      'Upload any chart from MT5, TradingView, or TradeLocker and receive instant AI analysis — pattern recognition, trend direction, entry/exit points, and confidence-scored signals. The science of reading price, turned digital.',
    steps: [
      'Navigate to Analysis and click "Upload Chart"',
      'Drop in your chart image from any platform',
      'Read the AI signal, set your levels, and execute the trade',
    ],
  },
  {
    num: 2,
    icon: Brain,
    title: 'VEDD Live Trading Engine',
    route: '/mt5-chart-data',
    categories: ['forex', 'passive'],
    accent: 'purple',
    accentBg: 'bg-purple-500/10',
    accentBorder: 'border-purple-500/60',
    accentText: 'text-purple-400',
    tagLabel: 'Forex · Passive',
    description:
      'An autonomous HFT engine that monitors live markets 24/7, computes 12+ indicators across multiple pairs, and auto-executes trades on TradeLocker. Set a weekly profit goal and let wisdom work while you rest.',
    steps: [
      'Go to MT5 Chart Data and connect your TradeLocker API token',
      'Set your weekly profit goal and choose your HFT strategy mode',
      'Start the VEDD SS AI engine — it trades, compounds, and learns automatically',
    ],
  },
  {
    num: 3,
    icon: Scan,
    title: 'Sol Engine — Solana Scanner',
    route: '/solana-scanner',
    categories: ['solana', 'passive'],
    accent: 'emerald',
    accentBg: 'bg-emerald-500/10',
    accentBorder: 'border-emerald-500/60',
    accentText: 'text-emerald-400',
    tagLabel: 'Solana · Passive',
    description:
      'AI-powered scanner that reads trending Solana tokens for buy signals using sentiment, tokenomics, whale activity, and volume — then auto-buys via your Phantom wallet with a staged volume-adjusted trailing stop managing every exit.',
    steps: [
      'Connect your Phantom wallet on the Sol Scanner page',
      'Set a weekly SOL goal, pick a strategy (e.g. Momentum Sniper), enable Auto-Trade',
      'Let the cipher run — buys, trails, and sells trigger Phantom approvals on your screen',
    ],
  },
  {
    num: 4,
    icon: Store,
    title: 'EA Marketplace',
    route: '/ea-marketplace',
    categories: ['passive'],
    accent: 'amber',
    accentBg: 'bg-amber-500/10',
    accentBorder: 'border-amber-500/60',
    accentText: 'text-amber-400',
    tagLabel: 'Passive Income',
    description:
      'Build Expert Advisors from your analysis, publish them to the marketplace, and collect subscription income from other traders using your strategies. Culture — freedom through creating systems that earn while you rest.',
    steps: [
      'Run an analysis and click "Generate EA" on the results page',
      'Go to My EAs, review the code, and click "Publish to Marketplace"',
      'Set a subscription price — collect passive earnings as traders subscribe',
    ],
  },
  {
    num: 5,
    icon: BarChart3,
    title: 'Weekly Strategy',
    route: '/weekly-strategy',
    categories: ['forex', 'analysis'],
    accent: 'red',
    accentBg: 'bg-red-500/10',
    accentBorder: 'border-red-500/60',
    accentText: 'text-red-400',
    tagLabel: 'Forex · Analysis',
    description:
      'Every week, VEDD AI generates a full tailored trading plan based on current market conditions — including 5 HFT modes: scalping, momentum surfing, session breakout, sniper, and aggressive compound. Power through preparation.',
    steps: [
      'Navigate to Weekly Strategy and click "Generate This Week\'s Plan"',
      'Review the AI-selected HFT mode and pair recommendations',
      'Follow the plan, log your trades, and track progress against your weekly goal',
    ],
  },
  {
    num: 6,
    icon: Clock,
    title: 'Multi-Timeframe Analysis',
    route: '/multi-timeframe',
    categories: ['forex', 'analysis'],
    accent: 'cyan',
    accentBg: 'bg-cyan-500/10',
    accentBorder: 'border-cyan-500/60',
    accentText: 'text-cyan-400',
    tagLabel: 'Forex · Analysis',
    description:
      'Analyze M15, H1, H4, and D1 simultaneously for a unified signal with equal weight across timeframes. High-confluence setups only — equality of evidence before any position is entered.',
    steps: [
      'Upload charts for each timeframe (M15, H1, H4, D1)',
      'Review the unified signal synthesis across all four',
      'Only execute when all timeframes align — that\'s the mathematics',
    ],
  },
  {
    num: 7,
    icon: Webhook,
    title: 'Webhook Signal System',
    route: '/webhooks',
    categories: ['forex', 'passive'],
    accent: 'violet',
    accentBg: 'bg-violet-500/10',
    accentBorder: 'border-violet-500/60',
    accentText: 'text-violet-400',
    tagLabel: 'Forex · Passive',
    description:
      'Configure webhooks to auto-receive trading signals from VEDD AI directly into TradeLocker, TradingView, or any custom endpoint. Full automation — God of your own signal pipeline.',
    steps: [
      'Go to Webhooks and create a new webhook endpoint',
      'Copy the URL into your broker or trading platform\'s alert system',
      'Signals flow automatically whenever VEDD AI generates them — no manual checks needed',
    ],
  },
  {
    num: 8,
    icon: Lightbulb,
    title: 'What-If Scenario Analysis',
    route: '/what-if',
    categories: ['analysis'],
    accent: 'orange',
    accentBg: 'bg-orange-500/10',
    accentBorder: 'border-orange-500/60',
    accentText: 'text-orange-400',
    tagLabel: 'Analysis',
    description:
      'Before committing capital, explore any trade scenario: adjust entry, stop loss, take profit, and lot size to see projected outcomes, probability assessments, and risk-reward ratios. Build the trade before you live it.',
    steps: [
      'Go to What-If Analysis and enter your planned trade parameters',
      'Adjust entry, SL, TP, and lot size to explore different outcomes',
      'Use the probability assessment to refine your levels before going live',
    ],
  },
];

const QUIZ_QUESTIONS = [
  {
    id: 'activity',
    question: 'How active do you want to be?',
    options: [
      { label: 'Hands-on — I want to read every signal', value: 'active' },
      { label: 'Set and forget — let AI do the work', value: 'passive' },
      { label: 'Both — depends on the day', value: 'both' },
    ],
  },
  {
    id: 'market',
    question: 'Which market speaks to you?',
    options: [
      { label: 'Forex — currency pairs, charts, patterns', value: 'forex' },
      { label: 'Solana — crypto tokens, wallets, pumps', value: 'solana' },
      { label: 'Both markets', value: 'both' },
    ],
  },
  {
    id: 'goal',
    question: 'What is your primary goal?',
    options: [
      { label: 'Fast gains — active compounding', value: 'fast' },
      { label: 'Passive income — systems that run themselves', value: 'passive' },
      { label: 'Learning — sharpen my edge first', value: 'learn' },
    ],
  },
];

function getRecommendedPath(answers: Record<string, string>): number {
  const { activity, market, goal } = answers;
  if (market === 'solana') return 3;
  if (goal === 'passive' || activity === 'passive') {
    if (market === 'forex') return 2;
    return 4;
  }
  if (goal === 'learn') return 6;
  if (goal === 'fast' && activity === 'active') return 1;
  if (goal === 'fast') return 5;
  return 1;
}

const FILTER_TABS: { label: string; value: Category }[] = [
  { label: 'All 8', value: 'all' },
  { label: 'Forex', value: 'forex' },
  { label: 'Solana', value: 'solana' },
  { label: 'Passive', value: 'passive' },
  { label: 'Analysis', value: 'analysis' },
];

export default function SevenEightPage() {
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<Category>('all');
  const [started, setStarted] = useState<Record<number, boolean>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<number | null>(null);
  const [recommended, setRecommended] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const cardRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    const savedStarted = localStorage.getItem('vedd_seven_eight_started');
    const savedChecks = localStorage.getItem('vedd_seven_eight_checks');
    if (savedStarted) setStarted(JSON.parse(savedStarted));
    if (savedChecks) setChecks(JSON.parse(savedChecks));
    setTimeout(() => setMounted(true), 50);
  }, []);

  const saveStarted = (next: Record<number, boolean>) => {
    setStarted(next);
    localStorage.setItem('vedd_seven_eight_started', JSON.stringify(next));
  };

  const saveChecks = (next: Record<string, boolean>) => {
    setChecks(next);
    localStorage.setItem('vedd_seven_eight_checks', JSON.stringify(next));
  };

  const toggleStarted = (num: number) => {
    const next = { ...started, [num]: !started[num] };
    saveStarted(next);
    if (!started[num]) {
      toast({ title: `Path ${num} activated`, description: `${SM_LABELS[num]} — ${PATHS[num - 1].title} added to your cipher` });
    }
  };

  const toggleCheck = (num: number, step: number) => {
    const key = `${num}_${step}`;
    const next = { ...checks, [key]: !checks[key] };
    saveChecks(next);
    const allDone = [0, 1, 2].every(s => next[`${num}_${s}`]);
    if (allDone) {
      toast({ title: '✓ All steps complete', description: `Word is bond — ${PATHS[num - 1].title} cipher unlocked` });
    }
  };

  const copyLink = (route: string) => {
    const url = `${window.location.origin}${route}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: 'Link copied', description: url });
    });
  };

  const toggleExpanded = (num: number) => {
    setExpanded(prev => ({ ...prev, [num]: !prev[num] }));
  };

  const runQuiz = () => {
    if (Object.keys(quizAnswers).length < 3) {
      toast({ title: 'Answer all 3 questions first', description: 'The cipher needs complete input' });
      return;
    }
    const result = getRecommendedPath(quizAnswers);
    setQuizResult(result);
    setRecommended(result);
    setQuizOpen(false);
    setTimeout(() => {
      cardRefs.current[result]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setRecommended(null), 3000);
    }, 300);
  };

  const startedCount = Object.values(started).filter(Boolean).length;
  const allStarted = startedCount === 8;

  const filtered = activeFilter === 'all'
    ? PATHS
    : PATHS.filter(p => p.categories.includes(activeFilter));

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-amber-500/20 bg-gradient-to-b from-gray-900 to-gray-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-transparent to-transparent pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-1.5 text-amber-400 text-sm font-medium mb-6">
            <BookOpen className="w-4 h-4" />
            Ecclesiastes 11:2
          </div>
          <h1 className="text-6xl md:text-8xl font-black mb-4 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 bg-clip-text text-transparent tracking-tight">
            7 ye even 8
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-2 italic">
            "Give a portion to seven, and also to eight; for thou knowest not what evil shall be upon the earth."
          </p>
          <p className="text-gray-500 text-sm mb-8">
            God (7) even Build/Destroy (8) — eight ciphers of profit, all live and operational
          </p>

          {/* Progress banner */}
          <div className={`inline-flex items-center gap-3 px-6 py-3 rounded-2xl border transition-all duration-500 ${
            allStarted
              ? 'bg-amber-500/20 border-amber-500/50 shadow-lg shadow-amber-500/20'
              : 'bg-gray-800/60 border-gray-700/50'
          }`}>
            <div className="flex gap-1">
              {PATHS.map(p => (
                <div
                  key={p.num}
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                    started[p.num] ? 'bg-amber-400 scale-110' : 'bg-gray-600'
                  }`}
                />
              ))}
            </div>
            <span className={`text-sm font-semibold ${allStarted ? 'text-amber-400' : 'text-gray-400'}`}>
              {allStarted ? '✓ Cipher complete — peace' : `${startedCount} of 8 paths activated`}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">

        {/* Quiz panel */}
        <div className="mb-8 rounded-2xl border border-gray-700/50 bg-gray-900/60 overflow-hidden">
          <button
            onClick={() => setQuizOpen(o => !o)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-800/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-white text-sm">Which path finds you?</p>
                <p className="text-gray-500 text-xs">3 questions — AI recommends your cipher</p>
              </div>
            </div>
            {quizOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {quizOpen && (
            <div className="px-6 pb-6 border-t border-gray-700/50">
              <div className="grid gap-6 mt-5">
                {QUIZ_QUESTIONS.map(q => (
                  <div key={q.id}>
                    <p className="text-sm font-medium text-gray-300 mb-3">{q.question}</p>
                    <div className="grid gap-2">
                      {q.options.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setQuizAnswers(prev => ({ ...prev, [q.id]: opt.value }))}
                          className={`text-left px-4 py-2.5 rounded-xl border text-sm transition-all ${
                            quizAnswers[q.id] === opt.value
                              ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                              : 'border-gray-700/50 bg-gray-800/40 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <Button
                  onClick={runQuiz}
                  className="bg-amber-500 hover:bg-amber-600 text-black font-bold w-full mt-2"
                >
                  Find my path <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                {quizResult && (
                  <p className="text-center text-amber-400 text-sm font-medium">
                    ✓ Scrolled to path {quizResult} — {SM_LABELS[quizResult]}: {PATHS[quizResult - 1].title}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 mb-8 flex-wrap">
          <Filter className="w-4 h-4 text-gray-500 flex-shrink-0" />
          {FILTER_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                activeFilter === tab.value
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
          {activeFilter !== 'all' && (
            <button
              onClick={() => setActiveFilter('all')}
              className="ml-1 text-gray-600 hover:text-gray-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((path, idx) => {
            const allChecked = [0, 1, 2].every(s => checks[`${path.num}_${s}`]);
            const isStarted = started[path.num];
            const isExpanded = expanded[path.num];
            const isRecommended = recommended === path.num;
            const delay = `${idx * 80}ms`;

            return (
              <div
                key={path.num}
                ref={el => { cardRefs.current[path.num] = el; }}
                style={{
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? 'translateY(0)' : 'translateY(20px)',
                  transition: `opacity 0.4s ease ${delay}, transform 0.4s ease ${delay}`,
                }}
                className={`group relative rounded-2xl border bg-gray-900/60 overflow-hidden
                  hover:-translate-y-1 hover:shadow-xl transition-all duration-300 cursor-default
                  ${allChecked ? `border-l-4 ${path.accentBorder} shadow-lg` : 'border-gray-700/50 border-l-4 border-l-transparent'}
                  ${isRecommended ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-gray-950' : ''}
                `}
              >
                {/* Recommended badge */}
                {isRecommended && (
                  <div className="absolute top-3 right-3 z-10">
                    <Badge className="bg-amber-500 text-black text-xs font-bold animate-pulse">
                      <Star className="w-3 h-3 mr-1" /> Your Path
                    </Badge>
                  </div>
                )}

                {/* Card header */}
                <div className={`px-5 pt-5 pb-4 border-l-4 ${path.accentBorder}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {/* Number badge */}
                      <div className={`w-11 h-11 rounded-xl ${path.accentBg} border ${path.accentBorder} flex items-center justify-center flex-shrink-0`}>
                        <span className={`text-lg font-black ${path.accentText}`}>{path.num}</span>
                      </div>
                      <div>
                        <p className={`text-xs font-bold tracking-widest uppercase ${path.accentText} opacity-80`}>
                          {SM_LABELS[path.num]}
                        </p>
                        <h3 className="text-white font-bold text-base leading-tight">{path.title}</h3>
                      </div>
                    </div>
                    <div className={`w-9 h-9 rounded-xl ${path.accentBg} flex items-center justify-center flex-shrink-0`}>
                      <path.icon className={`w-4 h-4 ${path.accentText}`} />
                    </div>
                  </div>

                  <Badge variant="outline" className={`text-[10px] ${path.accentText} border-current opacity-70 mb-3`}>
                    {path.tagLabel}
                  </Badge>

                  <p className="text-gray-400 text-sm leading-relaxed">{path.description}</p>
                </div>

                {/* Steps section — expandable */}
                <div className="px-5 pb-2">
                  <button
                    onClick={() => toggleExpanded(path.num)}
                    className="w-full flex items-center justify-between py-3 border-t border-gray-700/40 hover:text-gray-300 text-gray-500 transition-colors text-sm"
                  >
                    <span className="font-medium">
                      How to start
                      {[0, 1, 2].filter(s => checks[`${path.num}_${s}`]).length > 0 && (
                        <span className={`ml-2 text-xs ${path.accentText}`}>
                          ({[0, 1, 2].filter(s => checks[`${path.num}_${s}`]).length}/3 done)
                        </span>
                      )}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {isExpanded && (
                    <div className="pb-3 space-y-2">
                      {path.steps.map((step, si) => {
                        const key = `${path.num}_${si}`;
                        const checked = checks[key];
                        return (
                          <button
                            key={si}
                            onClick={() => toggleCheck(path.num, si)}
                            className="w-full flex items-start gap-3 text-left py-2 px-3 rounded-xl hover:bg-gray-800/50 transition-colors group/step"
                          >
                            {checked
                              ? <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${path.accentText}`} />
                              : <Circle className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-600 group-hover/step:text-gray-400 transition-colors" />
                            }
                            <span className={`text-sm transition-colors ${checked ? `${path.accentText} line-through opacity-60` : 'text-gray-400 group-hover/step:text-gray-300'}`}>
                              <span className={`font-semibold mr-1 ${path.accentText}`}>{si + 1}.</span>
                              {step}
                            </span>
                          </button>
                        );
                      })}
                      {allChecked && (
                        <div className={`mt-1 px-3 py-2 rounded-xl ${path.accentBg} border ${path.accentBorder}`}>
                          <p className={`text-xs font-semibold ${path.accentText}`}>
                            ✓ That's the mathematics — cipher unlocked. Word is bond.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="px-5 pb-5 flex items-center gap-2 flex-wrap border-t border-gray-700/30 pt-4">
                  <Link href={path.route}>
                    <Button
                      size="sm"
                      className={`${path.accentBg} ${path.accentText} border ${path.accentBorder} hover:opacity-90 transition-all font-semibold group/btn`}
                      variant="outline"
                    >
                      Open
                      <ExternalLink className="w-3 h-3 ml-1.5 group-hover/btn:translate-x-0.5 transition-transform" />
                    </Button>
                  </Link>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-gray-500 hover:text-gray-300 text-xs px-2"
                    onClick={() => copyLink(path.route)}
                  >
                    <Copy className="w-3 h-3 mr-1.5" />
                    Copy link
                  </Button>

                  <div className="ml-auto">
                    <button
                      onClick={() => toggleStarted(path.num)}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                        isStarted
                          ? `${path.accentBg} ${path.accentText} ${path.accentBorder}`
                          : 'border-gray-700/50 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                      }`}
                    >
                      {isStarted
                        ? <><CheckCircle2 className="w-3 h-3" /> In the cipher</>
                        : <><Circle className="w-3 h-3" /> Mark started</>
                      }
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cipher complete banner */}
        <div className={`mt-12 rounded-2xl border p-8 text-center transition-all duration-700 ${
          allStarted
            ? 'border-amber-500/50 bg-gradient-to-r from-amber-900/20 via-yellow-900/10 to-amber-900/20 shadow-xl shadow-amber-500/10'
            : 'border-gray-700/40 bg-gray-900/30'
        }`}>
          <div className="flex items-center justify-center gap-3 mb-3">
            <Layers className={`w-6 h-6 ${allStarted ? 'text-amber-400' : 'text-gray-600'}`} />
            <h2 className={`text-xl font-bold ${allStarted ? 'text-amber-300' : 'text-gray-600'}`}>
              {allStarted ? 'Cipher Complete' : 'Complete the Cipher'}
            </h2>
            <Layers className={`w-6 h-6 ${allStarted ? 'text-amber-400' : 'text-gray-600'}`} />
          </div>
          <p className={`text-sm max-w-lg mx-auto ${allStarted ? 'text-amber-200/80' : 'text-gray-600'}`}>
            {allStarted
              ? 'Peace — the cipher is complete. You hold knowledge of all 8 paths. Word is bond — the only wrong move is standing still.'
              : `Mark all 8 paths as started to unlock the cipher. ${8 - startedCount} path${8 - startedCount !== 1 ? 's' : ''} remaining.`
            }
          </p>
          {allStarted && (
            <div className="flex justify-center gap-3 mt-5 flex-wrap">
              <Link href="/analysis">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold">
                  Start building <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link href="/solana-scanner">
                <Button variant="outline" className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                  Open Sol cipher
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
