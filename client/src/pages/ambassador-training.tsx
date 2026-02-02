import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { AmbassadorCertification, AmbassadorTrainingProgress } from '@shared/schema';

// Import module images
import socialMediaImg from '@assets/stock_images/social_media_marketi_1d2f1efd.jpg';
import videoCreationImg from '@assets/stock_images/professional_video_r_aada2fa4.jpg';
import liveStreamImg from '@assets/stock_images/live_streaming_video_1e9c8eed.jpg';
import chartAnalysisImg from '@assets/stock_images/trading_chart_analys_8f9ce15e.jpg';
import complianceImg from '@assets/stock_images/business_compliance__a162932c.jpg';
import platformsImg from '@assets/stock_images/trading_platforms_mu_e4e1343a.jpg';

// Import SVG diagram components for accurate pattern education
import {
  DojiDiagram,
  HammerDiagram,
  EngulfingDiagram,
  MorningStarDiagram,
  HeadShouldersDiagram,
  DoubleTopDiagram,
  TriangleDiagram,
  FlagPennantDiagram,
  CupHandleDiagram,
  WedgeDiagram,
  SupportResistanceDiagram,
  RSIDiagram,
  MACDDiagram,
  MovingAveragesDiagram,
  BollingerBandsDiagram,
  VolumeDiagram,
} from '@/components/candlestick-diagrams';
import { 
  GraduationCap, 
  Video, 
  Share2, 
  Award, 
  CheckCircle2, 
  Circle,
  Play,
  Clock,
  Star,
  Users,
  TrendingUp,
  MessageSquare,
  Camera,
  Mic,
  Monitor,
  Target,
  Lightbulb,
  BookOpen,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Lock,
  Unlock,
  Trophy,
  Megaphone,
  Heart,
  Globe,
  Wallet,
  Coins,
  ExternalLink,
  Copy,
  Shield,
  Download,
  AlertCircle,
  Zap,
  ArrowRight,
  BarChart2,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';

interface KeyPoint {
  title: string;
  description: string;
  icon?: typeof GraduationCap;
}

interface RealWorldExample {
  scenario: string;
  outcome: string;
  lesson: string;
  type: 'success' | 'warning' | 'insight';
}

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  duration: string;
  icon: typeof GraduationCap;
  image?: string;
  lessons: {
    id: string;
    title: string;
    content: string[];
    tips: string[];
    image?: string;
    imageAlt?: string;
    DiagramComponent?: React.ComponentType;
    keyPoints?: KeyPoint[];
    realWorldExamples?: RealWorldExample[];
    guideLink?: {
      text: string;
      section: string;
    };
    quiz?: {
      question: string;
      options: string[];
      correct: number;
    };
  }[];
}

// Interactive Key Point Carousel Component
function KeyPointCarousel({ keyPoints }: { keyPoints: KeyPoint[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextPoint = () => setCurrentIndex((prev) => (prev + 1) % keyPoints.length);
  const prevPoint = () => setCurrentIndex((prev) => (prev - 1 + keyPoints.length) % keyPoints.length);

  if (!keyPoints || keyPoints.length === 0) return null;

  return (
    <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border border-green-500/30 rounded-xl p-5 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-green-400 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Key Points ({currentIndex + 1}/{keyPoints.length})
        </h4>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={prevPoint}
            className="h-8 w-8 p-0 text-green-400 hover:bg-green-500/20"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={nextPoint}
            className="h-8 w-8 p-0 text-green-400 hover:bg-green-500/20"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="relative h-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0"
          >
            {(() => {
              const currentPoint = keyPoints[currentIndex];
              const IconComponent = currentPoint.icon || Target;
              return (
                <div className="flex items-start gap-4">
                  <div className="bg-green-500/20 p-3 rounded-lg shrink-0">
                    <IconComponent className="w-6 h-6 text-green-400" />
                  </div>
                  <div>
                    <h5 className="font-medium text-white mb-2">{currentPoint.title}</h5>
                    <p className="text-gray-300 text-sm leading-relaxed">{currentPoint.description}</p>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2 mt-4" role="tablist" aria-label="Key points navigation">
        {keyPoints.map((point, idx) => (
          <button
            key={idx}
            role="tab"
            aria-selected={idx === currentIndex}
            aria-label={`Go to key point ${idx + 1}: ${point.title}`}
            onClick={() => setCurrentIndex(idx)}
            className={`w-2 h-2 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-green-500/50 ${
              idx === currentIndex ? 'bg-green-400 w-6' : 'bg-gray-600 hover:bg-gray-500'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// Real World Example Card Component
function RealWorldExampleCard({ example }: { example: RealWorldExample }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const typeStyles = {
    success: {
      bg: 'from-emerald-900/40 to-green-900/20',
      border: 'border-emerald-500/40',
      icon: CheckCircle2,
      iconColor: 'text-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-300'
    },
    warning: {
      bg: 'from-amber-900/40 to-orange-900/20',
      border: 'border-amber-500/40',
      icon: AlertCircle,
      iconColor: 'text-amber-400',
      badge: 'bg-amber-500/20 text-amber-300'
    },
    insight: {
      bg: 'from-blue-900/40 to-indigo-900/20',
      border: 'border-blue-500/40',
      icon: Lightbulb,
      iconColor: 'text-blue-400',
      badge: 'bg-blue-500/20 text-blue-300'
    }
  };

  const style = typeStyles[example.type];
  const Icon = style.icon;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${example.type === 'success' ? 'Success story' : example.type === 'warning' ? 'Common mistake' : 'Key insight'}: ${example.scenario}`}
      className={`bg-gradient-to-br ${style.bg} border ${style.border} rounded-xl overflow-hidden cursor-pointer focus:outline-none focus:ring-2 focus:ring-green-500/50`}
      onClick={() => setIsExpanded(!isExpanded)}
      onKeyDown={handleKeyDown}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${style.badge}`}>
            <Icon className={`w-5 h-5 ${style.iconColor}`} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={style.badge}>
                {example.type === 'success' ? 'Success Story' : example.type === 'warning' ? 'Common Mistake' : 'Key Insight'}
              </Badge>
            </div>
            <p className="text-white font-medium text-sm">{example.scenario}</p>
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </motion.div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-4 space-y-3"
            >
              <div className="bg-black/30 rounded-lg p-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">What Happened</p>
                <p className="text-gray-200 text-sm">{example.outcome}</p>
              </div>
              <div className="bg-black/30 rounded-lg p-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">The Lesson</p>
                <p className="text-gray-200 text-sm flex items-start gap-2">
                  <ArrowRight className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  {example.lesson}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Weekly content schedule for ambassadors
const weeklySchedule = [
  { day: 'Monday', action: 'YouTube Tutorial', details: 'Deep dive: MT5 EA setup, account balance tracking, or mobile features', icon: Video },
  { day: 'Tuesday', action: 'Quick Tip Reel', details: '30-60 sec tip: gestures, news sentiment, or Daily P&L tracking', icon: Camera },
  { day: 'Wednesday', action: 'Live Session', details: 'Real-time chart analysis + demo account balance breakdown', icon: Mic },
  { day: 'Thursday', action: 'News Trading Demo', details: 'Show extreme news sentiment trading on live events', icon: TrendingUp },
  { day: 'Friday', action: 'Mobile App Showcase', details: 'Demo PWA install, gestures, push notifications', icon: Monitor },
  { day: 'Saturday', action: 'Twitter/X Space', details: 'Q&A on new features + trading strategies', icon: MessageSquare },
  { day: 'Sunday', action: 'Weekly Recap & CTA', details: 'Highlight account gains + subscription push', icon: Megaphone }
];

// Success metrics for ambassadors
const successMetrics = [
  { metric: 'Subscriber Growth', description: 'Growth on YouTube and social platforms tied to chart analysis content', icon: TrendingUp },
  { metric: 'Engagement Rate', description: 'Increase in live attendance and tutorial views', icon: Heart },
  { metric: 'Conversions', description: 'Track sign-ups to AI Trading Vault linked to ambassador content', icon: Target },
  { metric: 'Community Building', description: 'Build a following of traders who rely on you for chart insights', icon: Users }
];

// Ideal candidate traits
const idealCandidateTraits = [
  'Strong presence on live platforms; comfortable teaching technical concepts in real time',
  'Skilled at simplifying chart analysis for beginners while offering depth for advanced users',
  'Experienced in video production and editing for YouTube tutorials',
  'Active trader or analyst with credibility in financial communities',
  'Ability to consistently produce content aligned with market cycles'
];

// Core responsibilities
const coreResponsibilities = [
  {
    title: 'Content Creation',
    items: [
      'Produce weekly YouTube tutorials explaining AI Trading Vault features (chart layouts, indicators, overlays, analysis workflows)',
      'Create short-form content (TikTok/Instagram Reels) highlighting quick tips and chart hacks'
    ]
  },
  {
    title: 'Live Engagement',
    items: [
      'Host regular live sessions (YouTube Live, Instagram Live, Twitter/X Spaces) demonstrating real-time chart analysis',
      'Answer community questions and provide practical trading insights using the platform'
    ]
  },
  {
    title: 'Community Building',
    items: [
      'Spotlight user success stories and encourage participation in discussions',
      'Actively engage with comments, forums, and social groups to foster loyalty'
    ]
  },
  {
    title: 'Brand Representation',
    items: [
      'Embody AI Trading Vault\'s professional yet accessible identity',
      'Align content with product updates, campaigns, and market cycles'
    ]
  },
  {
    title: 'Growth & Conversion',
    items: [
      'Drive sign-ups and subscriptions through clear CTAs in content',
      'Track and report engagement metrics tied to ambassador activities'
    ]
  }
];

// Compensation structure
const compensationInfo = {
  base: 'Monthly stipend (negotiable based on experience and reach)',
  incentives: 'Bonuses tied to sign-ups, conversions, and engagement metrics',
  perks: ['Early access to new features', 'Branded gear', 'Opportunities to co-create educational campaigns']
};

const trainingModules: TrainingModule[] = [
  {
    id: 'intro',
    title: 'Introduction to AI Trading Vault',
    description: 'Learn what makes AI Trading Vault unique and how it helps traders',
    duration: '15 min',
    icon: BookOpen,
    image: chartAnalysisImg,
    lessons: [
      {
        id: 'intro-1',
        title: 'What is AI Trading Vault?',
        content: [
          'AI Trading Vault is a cutting-edge chart analysis platform designed to empower traders and analysts with intuitive tools for technical market insights',
          'Our mission is to make professional-grade charting accessible, educational, and community-driven',
          'Features include AI-powered chart analysis, EA generation, marketplace, and social trading',
          'Available for Forex, Stocks, Crypto, and Indices traders on MT5, TradingView, and TradeLocker'
        ],
        keyPoints: [
          { title: 'AI-Powered Analysis', description: 'Upload any chart screenshot and get instant pattern recognition, trend analysis, and trading recommendations powered by GPT-4o.', icon: Sparkles },
          { title: 'Expert Advisor Generation', description: 'Turn your chart analysis into automated trading strategies - no coding required. Generate MT5 EA code with one click.', icon: Target },
          { title: 'Marketplace & Community', description: 'Share your strategies, subscribe to top performers, and earn passive income from your trading expertise.', icon: Users }
        ],
        realWorldExamples: [
          { scenario: 'A beginner trader uploaded their first EUR/USD chart', outcome: 'The AI identified a hidden Head & Shoulders pattern they would have missed, saving them from a losing trade', lesson: 'AI analysis catches patterns that human eyes often overlook, especially for newer traders', type: 'success' },
          { scenario: 'Trying to analyze charts manually during high volatility', outcome: 'Traders often make emotional decisions when markets move fast, leading to costly mistakes', lesson: 'AI provides objective analysis without emotional bias, helping you stay disciplined', type: 'insight' }
        ],
        tips: [
          'Emphasize that AI Trading Vault makes professional-grade charting accessible to everyone',
          'Highlight the educational and community-driven aspects of the platform'
        ]
      },
      {
        id: 'intro-2',
        title: 'Key Value Propositions',
        content: [
          'Save hours of manual chart analysis with AI automation',
          'Generate professional EA code without programming knowledge',
          'Earn passive income by sharing strategies in the marketplace',
          'Join a community of like-minded traders',
          'Access intuitive tools for technical market insights'
        ],
        keyPoints: [
          { title: 'Time Savings', description: 'What used to take 30-60 minutes of manual analysis now happens in seconds. Upload your chart, get instant insights.', icon: Clock },
          { title: 'No Coding Required', description: 'Generate professional MT5 Expert Advisors without writing a single line of code. AI does the heavy lifting.', icon: Zap },
          { title: 'Passive Income', description: 'Publish your successful strategies in the marketplace. Earn recurring income when other traders subscribe.', icon: Coins }
        ],
        realWorldExamples: [
          { scenario: 'A part-time trader with a full-time job', outcome: 'Used AI analysis during lunch breaks to identify setups, then placed trades after work. Saved 2+ hours daily.', lesson: 'AI Trading Vault fits around your schedule - analyze charts anytime, anywhere', type: 'success' },
          { scenario: 'Trader paid $500 for a custom EA that didn\'t work', outcome: 'Many traders waste money on EAs that don\'t match their strategy', lesson: 'With AI Trading Vault, you generate EAs based on YOUR analysis - no wasted money on generic solutions', type: 'warning' }
        ],
        tips: [
          'Focus on time-saving benefits for busy traders',
          'Mention the earning potential through the marketplace'
        ],
        quiz: {
          question: 'What is the main benefit of AI Trading Vault for traders?',
          options: [
            'Free trading signals',
            'AI-powered chart analysis that saves time',
            'Guaranteed profits',
            'Free trading platform'
          ],
          correct: 1
        }
      }
    ]
  },
  {
    id: 'platforms-intro',
    title: 'Trading Platforms Explained',
    description: 'Introduction to MT5, TradingView, and TradeLocker for first-time traders',
    duration: '20 min',
    icon: Monitor,
    image: platformsImg,
    lessons: [
      {
        id: 'platforms-1',
        title: 'What are Trading Platforms?',
        content: [
          'Trading platforms are software applications that connect you to financial markets',
          'They let you view price charts, place buy/sell orders, and manage your trades',
          'Think of them like apps for trading - similar to how banking apps let you manage money',
          'AI Trading Vault works with charts from any of these platforms for analysis',
          'Each platform has unique features, but they all show the same market data'
        ],
        keyPoints: [
          { title: 'Your Window to Markets', description: 'Trading platforms show you real-time prices, charts, and allow you to execute trades - like a stock market dashboard.', icon: Monitor },
          { title: 'Charts Are Universal', description: 'Whether you use MT5, TradingView, or TradeLocker - price charts look the same. AI Trading Vault analyzes them all.', icon: TrendingUp },
          { title: 'Free to Start', description: 'All three major platforms offer free versions. You can start learning without any cost.', icon: Coins }
        ],
        realWorldExamples: [
          { scenario: 'First-time trader confused by platform choice', outcome: 'Spent weeks researching instead of trading, felt paralyzed by options', lesson: 'Any platform works! Start with TradingView (browser-based) and upgrade later if needed', type: 'warning' }
        ],
        tips: [
          'Use simple analogies like "trading app" or "market viewer"',
          'Emphasize that AI Trading Vault accepts screenshots from any platform'
        ]
      },
      {
        id: 'platforms-2',
        title: 'MetaTrader 5 (MT5)',
        content: [
          'MT5 is one of the most popular trading platforms worldwide, especially for Forex',
          'Created by MetaQuotes and used by millions of traders globally',
          'Offers advanced charting, multiple timeframes, and automated trading (Expert Advisors)',
          'Available as desktop software (Windows/Mac) and mobile apps (iOS/Android)',
          'Most Forex brokers provide free MT5 access when you open an account',
          'AI Trading Vault can generate MT5 Expert Advisor (EA) code from your chart analysis'
        ],
        keyPoints: [
          { title: 'Industry Standard', description: 'MT5 is used by 80%+ of Forex brokers worldwide. Learning it opens doors to almost any broker.', icon: Globe },
          { title: 'Automated Trading', description: 'Expert Advisors (EAs) can trade for you 24/7 based on your rules. AI Trading Vault generates these automatically.', icon: Zap },
          { title: 'Live Data Streaming', description: 'Our MT5 Chart Data EA streams real-time prices directly to AI Trading Vault for continuous analysis.', icon: TrendingUp }
        ],
        realWorldExamples: [
          { scenario: 'Trader wanted automated trading but couldn\'t code', outcome: 'Used AI Trading Vault to generate MT5 EA from chart analysis - trading within hours instead of weeks', lesson: 'You don\'t need programming skills to automate your trading with MT5 + AI Trading Vault', type: 'success' },
          { scenario: 'Downloaded MT5 EA from unknown source', outcome: 'The EA made unauthorized trades and depleted the account', lesson: 'Always use trusted sources for EAs. AI Trading Vault generates transparent, reviewable code', type: 'warning' }
        ],
        tips: [
          'Mention that MT5 is free to download and use',
          'Explain that our MT5 Chart Data EA can stream live data to AI Trading Vault'
        ],
        quiz: {
          question: 'What is MetaTrader 5 (MT5) primarily used for?',
          options: [
            'Social media posting',
            'Trading Forex and other financial markets',
            'Video editing',
            'Email management'
          ],
          correct: 1
        }
      },
      {
        id: 'platforms-3',
        title: 'TradingView',
        content: [
          'TradingView is a web-based charting platform with powerful analysis tools',
          'Known for its beautiful charts, social features, and huge community of traders',
          'Works directly in your browser - no software download required',
          'Offers free tier with basic features, and paid plans for advanced tools',
          'Great for sharing chart ideas and learning from other traders',
          'Supports stocks, crypto, Forex, futures, and more from many exchanges'
        ],
        keyPoints: [
          { title: 'No Download Needed', description: 'Access from any device with a browser - phone, tablet, laptop, or work computer.', icon: Globe },
          { title: 'Community Learning', description: '50+ million users share chart ideas, strategies, and market commentary. Learn from the crowd.', icon: Users },
          { title: 'Beautiful Charts', description: 'Intuitive interface with 100+ indicators. Screenshots work perfectly with AI Trading Vault analysis.', icon: Camera }
        ],
        realWorldExamples: [
          { scenario: 'Beginner learned chart patterns by following experienced traders', outcome: 'Absorbed years of knowledge in months by studying public TradingView ideas', lesson: 'TradingView\'s social features accelerate your learning curve significantly', type: 'success' },
          { scenario: 'Trader analyzed charts on work computer without installing software', outcome: 'Could check setups during lunch break without IT restrictions', lesson: 'Browser-based access means you can trade-ready analysis from anywhere', type: 'insight' }
        ],
        tips: [
          'Highlight that TradingView works on any device with a browser',
          'Mention the active community where traders share analysis'
        ]
      },
      {
        id: 'platforms-4',
        title: 'TradeLocker',
        content: [
          'TradeLocker is a modern trading platform designed for prop trading firms',
          'Features a clean, intuitive interface optimized for quick execution',
          'Popular with funded traders and prop firm participants',
          'Offers integrated TradingView charts for advanced analysis',
          'AI Trading Vault can send trading signals directly to TradeLocker via webhooks',
          'Great choice for traders who want a streamlined, professional experience'
        ],
        keyPoints: [
          { title: 'Prop Firm Ready', description: 'Designed specifically for funded traders. Many prop firms use TradeLocker as their execution platform.', icon: Award },
          { title: 'Webhook Integration', description: 'AI Trading Vault sends signals directly to TradeLocker - automate your entries and exits.', icon: Zap },
          { title: 'TradingView Built-In', description: 'Get TradingView charts integrated directly in TradeLocker for seamless analysis + execution.', icon: TrendingUp }
        ],
        realWorldExamples: [
          { scenario: 'Prop trader needed fast execution during news events', outcome: 'TradeLocker\'s clean interface allowed rapid order placement without clutter', lesson: 'A streamlined platform can mean the difference between catching a move and missing it', type: 'success' },
          { scenario: 'Trader passed prop firm challenge using AI Trading Vault + TradeLocker webhooks', outcome: 'Automated signal delivery ensured consistent execution of the strategy', lesson: 'Webhook integration removes emotion and delay from trade execution', type: 'insight' }
        ],
        tips: [
          'Explain that prop firms give traders capital to trade with',
          'Mention our webhook integration for automated signal delivery'
        ]
      },
      {
        id: 'platforms-5',
        title: 'How AI Trading Vault Works With These Platforms',
        content: [
          'Upload: Take a screenshot of your chart from any platform and upload to AI Trading Vault',
          'Analyze: Our AI examines patterns, trends, and key levels automatically',
          'Generate: Create Expert Advisor code for MT5 or set up webhooks for TradeLocker',
          'Stream: Use our MT5 EA to send live chart data for real-time AI analysis',
          'Trade: Apply the AI insights on your preferred platform'
        ],
        keyPoints: [
          { title: 'Universal Compatibility', description: 'Any chart screenshot works. MT5, TradingView, TradeLocker, or even a phone photo of your screen.', icon: Camera },
          { title: '4-Step Workflow', description: 'Upload → Analyze → Generate → Trade. Simple process that works the same regardless of your platform.', icon: Target },
          { title: 'Live Streaming Option', description: 'For MT5 users: our EA streams chart data continuously for real-time AI analysis without manual uploads.', icon: Zap }
        ],
        realWorldExamples: [
          { scenario: 'Trader switched from MT5 to TradingView mid-strategy', outcome: 'AI Trading Vault analyzed both platforms\' charts seamlessly - no learning curve', lesson: 'Platform-agnostic analysis means you can switch tools without retraining', type: 'success' }
        ],
        tips: [
          'Walk through the simple upload process step by step',
          'Show how analysis works regardless of which platform they use'
        ],
        quiz: {
          question: 'How does AI Trading Vault receive charts from these platforms?',
          options: [
            'It requires special software installation',
            'Users upload screenshots or use our MT5 EA for live data',
            'It only works with one specific platform',
            'Charts are automatically synced without user action'
          ],
          correct: 1
        }
      },
      {
        id: 'platforms-6',
        title: 'Choosing the Right Platform',
        content: [
          'MT5: Best for Forex traders who want automated trading (EAs) and broker integration',
          'TradingView: Best for visual analysis, community learning, and multi-market coverage',
          'TradeLocker: Best for prop traders and those wanting modern, streamlined execution',
          'Many traders use multiple platforms - e.g., TradingView for analysis, MT5 for execution',
          'AI Trading Vault supports all of them, so start with what feels comfortable'
        ],
        keyPoints: [
          { title: 'MT5 = Automation', description: 'Choose MT5 if you want Expert Advisors to trade for you automatically, or if your broker requires it.', icon: Zap },
          { title: 'TradingView = Learning', description: 'Choose TradingView if you\'re learning, want community insights, or trade multiple markets.', icon: Users },
          { title: 'TradeLocker = Prop Trading', description: 'Choose TradeLocker if you\'re trading with a prop firm or want webhook-based signal execution.', icon: Award }
        ],
        realWorldExamples: [
          { scenario: 'Trader uses TradingView for analysis + MT5 for execution', outcome: 'Gets best of both worlds: social learning + automated trading', lesson: 'Many successful traders use multiple platforms for different purposes', type: 'insight' }
        ],
        tips: [
          'Reassure beginners that there is no wrong choice',
          'Suggest starting with TradingView for learning since its browser-based'
        ]
      }
    ]
  },
  {
    id: 'features',
    title: 'Core Features Deep Dive',
    description: 'Master all features to explain them confidently',
    duration: '45 min',
    icon: Target,
    image: chartAnalysisImg,
    lessons: [
      {
        id: 'features-1',
        title: 'Chart Analysis Features',
        content: [
          'Upload any chart screenshot for instant AI analysis',
          'Multi-timeframe analysis combines signals from M15, H1, H4, D1',
          'Pattern recognition identifies 20+ chart patterns',
          'Entry/exit points with specific price levels',
          'Risk/reward calculations for trade planning'
        ],
        tips: [
          'Demo the upload process in your videos',
          'Show real examples of analysis results'
        ],
        guideLink: {
          text: 'See User Guide: Chart Analysis',
          section: 'chart-analysis'
        }
      },
      {
        id: 'features-1b',
        title: 'The Science Behind AI Confidence %',
        content: [
          'The AI confidence percentage reflects how strongly the analysis supports the trade recommendation',
          'GPT-4o evaluates multiple technical factors and assigns Low, Medium, or High confidence',
          'These labels are converted to percentages: Low (40-55%), Medium (56-74%), High (75-95%)',
          'Multi-timeframe analysis can boost or reduce the final score based on timeframe agreement',
          'Higher confidence = more technical factors aligning in the same direction'
        ],
        keyPoints: [
          { title: 'Pattern Confluence', description: 'When multiple patterns appear together (e.g., double bottom + bullish engulfing), confidence increases. One pattern alone = lower confidence.', icon: TrendingUp },
          { title: 'Indicator Agreement', description: 'RSI, MACD, and moving averages all pointing the same direction? Higher confidence. Mixed signals = lower confidence.', icon: Target },
          { title: 'Support/Resistance Alignment', description: 'Entry points near strong support/resistance levels with good risk-reward ratios increase confidence. Random entry levels = lower.', icon: Shield },
          { title: 'Volume Confirmation', description: 'Breakouts with high volume are more reliable. Price moves on low volume get lower confidence scores.', icon: TrendingUp },
          { title: 'Timeframe Agreement (+10% Boost)', description: 'When 60%+ of analyzed timeframes agree on direction, AI adds a 10% confidence boost. Conflicting timeframes reduce the score.', icon: Zap }
        ],
        realWorldExamples: [
          { scenario: 'EUR/USD shows Head & Shoulders on H4 with RSI divergence and MACD crossover', outcome: 'AI assigns 85% confidence - multiple strong signals align for a bearish reversal', lesson: 'Pattern + indicator confluence = high confidence. The more factors agree, the higher the score', type: 'success' },
          { scenario: 'GBP/JPY has a hammer candle but RSI is neutral and no clear trend', outcome: 'AI assigns 52% confidence - one bullish signal but nothing else confirms', lesson: 'Single patterns without confirmation get low confidence. Wait for more alignment', type: 'warning' },
          { scenario: 'Multi-timeframe analysis: M15 bullish, H1 bullish, H4 bullish, D1 neutral', outcome: '3 of 4 timeframes agree (75%) - AI adds +10% confidence boost to base score', lesson: 'Multi-timeframe alignment is powerful. When most timeframes agree, the trade has higher probability', type: 'insight' }
        ],
        tips: [
          'Explain that confidence is NOT a prediction of profit - it measures signal quality',
          'Higher confidence = more evidence, but risk management is still essential',
          'Use the 70%+ threshold as a starting point for quality trade setups',
          'Show how multi-timeframe analysis increases confidence when timeframes align'
        ],
        quiz: {
          question: 'What happens to AI confidence when 60%+ of timeframes agree on direction?',
          options: [
            'Confidence stays the same',
            'Confidence gets a +10% boost',
            'Confidence is reduced by 10%',
            'The analysis is rejected'
          ],
          correct: 1
        }
      },
      {
        id: 'features-1c',
        title: 'How Stop Loss (SL) Is Determined',
        content: [
          'The AI analyzes the chart to suggest Stop Loss levels based on visible technical structure',
          'SL placement considers: recent swing highs/lows, support/resistance levels, and pattern boundaries',
          'For multi-timeframe analysis, the dominant timeframe (highest confidence) influences SL distance',
          'Longer timeframes (H4, D1) typically have wider SLs to account for normal price fluctuation',
          'Shorter timeframes (M15, H1) have tighter SLs for scalping and intraday trades'
        ],
        keyPoints: [
          { title: 'Pattern-Based SL', description: 'For a Head & Shoulders, SL goes above the right shoulder. For Double Bottom, SL goes below the second low. Pattern structure defines logical invalidation points.', icon: TrendingUp },
          { title: 'Timeframe-Appropriate', description: 'H4/D1 signals have wider stops (50-150 pips) to avoid noise. M15/H1 signals have tighter stops (20-50 pips) for faster trades.', icon: Clock },
          { title: 'Support/Resistance Placement', description: 'AI places SL just beyond key S/R levels - a few pips past support for longs, past resistance for shorts. This protects against false breakouts.', icon: Shield },
          { title: 'ATR Consideration', description: 'When ATR (Average True Range) data is available from live MT5 feed, the AI factors in current volatility to avoid stops that are too tight.', icon: BarChart2 },
          { title: 'Risk-Reward Alignment', description: 'SL is balanced against Take Profit to maintain at least 1:2 risk-reward ratio. If SL would be too wide, the AI may suggest waiting for better entry.', icon: Target }
        ],
        realWorldExamples: [
          { scenario: 'H4 EUR/USD bullish signal during high volatility week', outcome: 'AI suggests 80-pip SL below recent swing low, wider than usual due to increased ATR', lesson: 'Volatile markets need wider stops. Tight SLs get stopped out by normal price noise.', type: 'insight' },
          { scenario: 'M15 scalp trade with 15-pip stop loss', outcome: 'Trade stopped out by a brief spike before reversing in the expected direction', lesson: 'Very tight SLs on short timeframes are risky. Consider the timeframe\'s typical range before trading.', type: 'warning' },
          { scenario: 'Multi-timeframe analysis with H1 as dominant bullish signal', outcome: 'SL placed 35 pips below H1 support, matching the H1 timeframe\'s average range', lesson: 'The dominant timeframe determines SL distance. This ensures the SL matches the signal\'s expected holding period.', type: 'success' }
        ],
        tips: [
          'Explain that SL is AI-suggested, not guaranteed - always verify with your own analysis',
          'Show how dominant timeframe affects SL distance in multi-timeframe analysis',
          'Remind users that wider SLs need smaller position sizes to maintain proper risk',
          'Emphasize: never trade without a stop loss, and never move it further away from entry'
        ],
        quiz: {
          question: 'Why do longer timeframes (H4, D1) typically have wider stop losses?',
          options: [
            'Because the AI makes mistakes on higher timeframes',
            'To account for normal price fluctuation and avoid getting stopped out by noise',
            'Because higher timeframes are more profitable',
            'Stop loss distance is always the same regardless of timeframe'
          ],
          correct: 1
        }
      },
      {
        id: 'features-2',
        title: 'EA Generation',
        content: [
          'One-click EA code generation from any analysis',
          'Supports MT5, TradingView Pine Script, and TradeLocker',
          'Code includes proper risk management',
          'Customizable parameters for your trading style'
        ],
        tips: [
          'Explain that no coding knowledge is required',
          'Show how easy it is to download and use the code'
        ],
        guideLink: {
          text: 'See User Guide: EA Code Generation',
          section: 'ea-generation'
        }
      },
      {
        id: 'features-3',
        title: 'Marketplace & Social',
        content: [
          'EA Marketplace for buying and selling strategies',
          'Social Hub for following traders and sharing analyses',
          'Referral program for earning credits',
          'Achievement system for gamified progress'
        ],
        tips: [
          'Highlight the passive income opportunity',
          'Explain the social proof from community engagement'
        ],
        guideLink: {
          text: 'See User Guide: EA Marketplace',
          section: 'marketplace'
        },
        quiz: {
          question: 'How many platforms can AI Trading Vault generate EA code for?',
          options: ['1', '2', '3', '5'],
          correct: 2
        }
      },
      {
        id: 'features-4',
        title: 'Webhook Signal System & MT5 Trade Copier',
        content: [
          'Webhook Signal System: Send trading signals to TradeLocker, TradingView, or custom endpoints',
          'Triggers include: chart analysis completion, multi-timeframe synthesis, MT5 trade signals, or manual',
          'MT5 Trade Copier: Download EA that monitors your MT5 trades and relays them to other platforms',
          'EA AI Live Refresh: EAs can request fresh AI analysis using real-time market data',
          'API tokens authenticate your EAs securely - same token works for both features',
          'Test webhooks before going live with services like webhook.site'
        ],
        tips: [
          'Show how easy it is to set up trade copying from MT5 to TradeLocker',
          'Demonstrate the webhook testing feature in your tutorials',
          'Explain how automation saves time and reduces missed opportunities'
        ]
      },
      {
        id: 'features-5',
        title: 'MT5 Chart Data EA for Live AI Refresh',
        content: [
          'Chart Data EA (v3.60) sends live price data directly from MT5 to AI Trading Vault',
          'Dedicated page at /mt5-chart-data with full setup guide, token generation, and EA download',
          'Multi-Timeframe Analysis: ANALYZE_* settings control which timeframes send data to AI (M5, M15, H1, H4, D1, W1)',
          'Allowed Chart Timeframes: TRADE_ON_* settings control which chart timeframes can execute trades',
          'Connected Pairs Display: View all active MT5 connections on Dashboard with prices, hourly breakouts, and volume',
          'Sends OHLCV candle data plus technical indicators (RSI, MACD, ATR, Bollinger Bands, Moving Averages)',
          'Uses your broker\'s actual price feed for more accurate AI analysis',
          'When 60%+ of timeframes align with the signal, AI confidence gets a +10% boost!',
          'Auto-Trading capability (disabled by default) with risk management and daily loss limits',
          'Same API token used for MT5 Trade Copier works for Chart Data EA'
        ],
        tips: [
          'Direct viewers to /mt5-chart-data for the complete setup experience',
          'Highlight the Multi-Timeframe Analysis feature as a key differentiator',
          'Demo the setup process: visit page, create token, download EA, configure in MT5',
          'Show how timeframe alignment boosts confidence for stronger signals',
          'Explain M5 is great for scalpers, W1 is ideal for swing traders',
          'Show the Connected Pairs display on Dashboard - great for monitoring multiple pairs'
        ]
      },
      {
        id: 'features-5b',
        title: 'Trading Hours Filter (UTC)',
        content: [
          'NEW: Control exactly when the EA is allowed to trade',
          'Set Start Hour and End Hour in UTC (e.g., 8-20 for London/NY overlap)',
          'Enable/Disable trading for each day of the week (Sunday through Saturday)',
          'Useful for avoiding low-liquidity overnight sessions',
          'Perfect for session-based strategies (Asian, London, New York)'
        ],
        tips: [
          'Explain that UTC 8-20 covers both London and New York sessions',
          'Show how to disable Sunday/Saturday for Forex trading',
          'Demonstrate different session setups for various strategies'
        ]
      },
      {
        id: 'features-6',
        title: 'News-Aware Smart Trading (Expanded)',
        content: [
          'NEW v3.60: Expanded News Filter with 4 sub-categories:',
          '',
          '📊 IMPACT LEVEL FILTERS:',
          '  • Block on HIGH Impact News (NFP, FOMC - default ON)',
          '  • Block on MEDIUM Impact News',
          '  • Block on LOW Impact News',
          '',
          '⏰ TIMING SETTINGS:',
          '  • Minutes BEFORE News to pause trading (default: 30)',
          '  • Minutes AFTER News to resume trading (default: 15)',
          '  • Close open trades before news (optional)',
          '',
          '📈 SENTIMENT SETTINGS:',
          '  • Block on Conflicting Sentiment',
          '  • Require Aligned News (only trade when news confirms)',
          '  • Min News Score threshold (0-100 for bullish news)',
          '  • Min Absolute Score (0-100, trades on +/- extremes)',
          '  • Trade On Extreme News (only trade on significant sentiment)',
          '',
          '📅 EVENT TYPE FILTERS:',
          '  • Block on NFP (Non-Farm Payrolls)',
          '  • Block on FOMC/Fed Decisions',
          '  • Block on CPI/Inflation Data',
          '  • Block on GDP Releases',
          '  • Block on Interest Rate Decisions',
          '  • Block on Employment Data'
        ],
        tips: [
          'Show viewers the 4 categories in MT5 EA inputs',
          'Emphasize NFP and FOMC as the most important to block',
          'Explain the timing settings - 30 min before, 15 min after is a good default',
          'Demo how the Close Trades Before News feature protects open positions'
        ]
      },
      {
        id: 'features-7',
        title: 'Active Trade Management (v3.60)',
        content: [
          'EA actively manages open trades based on momentum, volume, and trailing stops',
          'TRAILING STOP: 3 modes available - Fixed pips, ATR-based (adapts to volatility), or Breakeven+Trail',
          'BREAKEVEN: Auto-moves stop loss to entry + lock pips once profit target is reached',
          'MOMENTUM EXITS: Closes trades when RSI hits overbought/oversold or MACD reverses',
          'VOLUME MANAGEMENT: Optionally close trades when market volume drops significantly',
          'All settings fully configurable - traders can enable/disable each feature individually'
        ],
        tips: [
          'Highlight how trailing stops automatically lock in profits as trades move favorably',
          'Explain ATR-based trailing adapts to market volatility - wider stops in volatile markets',
          'Show momentum exits help avoid giving back profits when markets reverse',
          'Emphasize this is like having a professional trade manager watching 24/7'
        ]
      },
      {
        id: 'features-8',
        title: 'Live Account Balance Tracking',
        content: [
          'NEW: Real-time account balance and performance metrics streamed from MT5',
          'View your complete account breakdown without switching to MT5 terminal:',
          '',
          '💰 BALANCE METRICS:',
          '  • Account Balance - Current account balance',
          '  • Equity - Balance + unrealized profit/loss',
          '  • Margin Used - Amount reserved for open positions',
          '  • Free Margin - Available margin for new trades',
          '',
          '📊 DAILY PERFORMANCE:',
          '  • Daily P&L - Profit/loss for the current trading day',
          '  • Daily P&L Percentage - Performance as a percentage of balance',
          '  • Unrealized P&L - Floating profit/loss on open positions',
          '',
          '📈 POSITION BREAKDOWN:',
          '  • Open Positions Count - Total number of active trades',
          '  • Buy vs Sell Breakdown - Positions by direction',
          '  • Total Lots - Combined lot size for buy and sell trades',
          '  • Pending Orders - Orders waiting to execute',
          '',
          '🏦 ACCOUNT INFO:',
          '  • Account Number and Name',
          '  • Broker and Server details',
          '  • Leverage ratio',
          '  • Margin Level percentage'
        ],
        tips: [
          'Show the account breakdown section on the MT5 Chart Data page',
          'Emphasize traders can monitor their account without going back to MT5',
          'Highlight the Daily P&L feature for tracking daily performance',
          'Demo how the data refreshes every 10 seconds automatically',
          'Explain margin level colors: green (>200%), yellow (100-200%), red (<100%)'
        ]
      },
      {
        id: 'features-9',
        title: 'Mobile App Features',
        content: [
          'AI Trading Vault works as a Progressive Web App (PWA) on mobile devices',
          'Install on your home screen for a native app experience',
          '',
          '👆 GESTURE CONTROLS:',
          '  • Pull-to-Refresh - Swipe down on any page to refresh data',
          '  • Swipe Navigation - Swipe left/right to navigate between pages',
          '  • Long-Press Actions - Hold on cards for quick action menus',
          '  • Haptic Feedback - Tactile feedback for touch interactions',
          '',
          '🔔 PUSH NOTIFICATIONS:',
          '  • Trade Alerts - Get notified when AI identifies trading opportunities',
          '  • Analysis Complete - Notifications when chart analysis finishes',
          '  • EA Signals - Alerts when your EAs generate signals',
          '  • News Events - High-impact economic event reminders',
          '  • Granular Controls - Enable/disable each notification type individually',
          '',
          '📱 MOBILE-OPTIMIZED UI:',
          '  • Touch-friendly chart viewer',
          '  • Floating Action Button (FAB) for quick access to common actions',
          '  • Drag-to-reposition FAB anywhere on screen',
          '  • Responsive design adapts to any screen size',
          '  • Offline support - access cached data without internet'
        ],
        tips: [
          'Show how to install the PWA from the browser menu (Add to Home Screen)',
          'Demo the pull-to-refresh gesture in your mobile tutorials',
          'Highlight the notification settings page for customizing alerts',
          'Emphasize the app works offline for viewing saved analyses',
          'Show the draggable FAB feature for accessing actions quickly'
        ]
      },
      {
        id: 'features-10',
        title: 'Extreme News Sentiment Trading',
        content: [
          'Trade on extreme news sentiment in BOTH directions - bullish AND bearish',
          'Perfect for traders who want to capitalize on significant market-moving news',
          '',
          '📊 HOW IT WORKS:',
          '  • AI analyzes financial news and assigns sentiment scores from -100 to +100',
          '  • Scores near +100 indicate strongly bullish news',
          '  • Scores near -100 indicate strongly bearish news',
          '  • Scores near 0 are neutral or mixed sentiment',
          '',
          '⚙️ KEY SETTINGS:',
          '  • Min Absolute Score (0-100): Filter for extreme sentiment in either direction',
          '    Example: Setting 80 allows trades when sentiment is +80 OR -80',
          '  • Trade On Extreme News: Only open trades when news sentiment is significant',
          '    Combines with Min Absolute Score for news-based trading strategies',
          '',
          '💡 USE CASES:',
          '  • NFP Trading: Catch big moves on Non-Farm Payrolls in either direction',
          '  • FOMC Decisions: Trade rate decision surprises (hawkish or dovish)',
          '  • Earnings Releases: React to better/worse than expected company results',
          '  • Economic Data: GDP, CPI, employment data surprises'
        ],
        tips: [
          'Explain the difference between Min News Score (bullish only) and Min Absolute Score (both directions)',
          'Show that a Min Absolute Score of 80 catches both +80 and -80 sentiment',
          'Demo the Trade On Extreme News toggle in the EA settings',
          'Emphasize this is for experienced traders who understand news volatility',
          'Warn about wider spreads and slippage during major news events'
        ],
        quiz: {
          question: 'What does setting Min Absolute Score to 80 allow?',
          options: [
            'Only bullish news with score above 80',
            'Only bearish news with score below -80',
            'Both bullish (+80) AND bearish (-80) extreme sentiment',
            'Blocks all trades during news'
          ],
          correct: 2
        }
      }
    ]
  },
  {
    id: 'technical-analysis',
    title: 'Chart Patterns & Technical Analysis',
    description: 'Understand common patterns AI Trading Vault identifies and what they mean',
    duration: '40 min',
    icon: TrendingUp,
    image: chartAnalysisImg,
    lessons: [
      {
        id: 'ta-1a',
        title: 'Doji Candlestick Pattern',
        content: [
          'A Doji forms when open and close prices are nearly equal',
          'The pattern shows indecision between buyers and sellers',
          'Long wicks indicate volatility but no clear winner',
          'Often signals potential trend reversal when appearing at tops or bottoms',
          'Confirmation from next candle is important before trading'
        ],
        tips: [
          'Explain that a Doji alone is not a trade signal - context matters',
          'Show examples of Doji at market tops and bottoms'
        ],
        DiagramComponent: DojiDiagram,
        imageAlt: 'Doji candlestick pattern showing market indecision'
      },
      {
        id: 'ta-1b',
        title: 'Hammer & Hanging Man',
        content: [
          'Small body with long lower wick (shadow) - at least 2x the body length',
          'Hammer appears at the bottom of a downtrend - bullish reversal signal',
          'Hanging Man appears at the top of an uptrend - bearish warning',
          'The long lower wick shows buyers stepping in (for hammer) or selling pressure building',
          'Color of the body is less important than the pattern location'
        ],
        tips: [
          'Emphasize that location determines if its a hammer or hanging man',
          'Show real chart examples from AI Trading Vault'
        ],
        DiagramComponent: HammerDiagram,
        imageAlt: 'Hammer candlestick pattern at market bottom'
      },
      {
        id: 'ta-1c',
        title: 'Engulfing Patterns',
        content: [
          'Bullish Engulfing: Large green candle completely covers previous red candle',
          'Bearish Engulfing: Large red candle completely covers previous green candle',
          'The second candle "engulfs" the entire body of the first',
          'Shows strong momentum shift from one side to the other',
          'More reliable at key support/resistance levels'
        ],
        tips: [
          'Use side-by-side comparison of bullish vs bearish engulfing',
          'Explain that the bigger the engulfing candle, the stronger the signal'
        ],
        DiagramComponent: EngulfingDiagram,
        imageAlt: 'Bullish and bearish engulfing candlestick patterns'
      },
      {
        id: 'ta-1d',
        title: 'Morning & Evening Star',
        content: [
          'Three-candle reversal patterns at trend extremes',
          'Morning Star: Large red candle → small body (any color) → large green candle',
          'Evening Star: Large green candle → small body (any color) → large red candle',
          'The middle candle often gaps away from the first (shows exhaustion)',
          'Third candle confirms the reversal direction'
        ],
        tips: [
          'Walk through each candle in the pattern step by step',
          'Show how AI Trading Vault highlights these automatically'
        ],
        DiagramComponent: MorningStarDiagram,
        imageAlt: 'Morning Star and Evening Star reversal patterns'
      },
      {
        id: 'ta-2a',
        title: 'Head and Shoulders Pattern',
        content: [
          'Three peaks with the middle peak (head) being the highest',
          'Left and right peaks (shoulders) are roughly equal height',
          'Neckline connects the lows between the peaks',
          'Break below neckline confirms the bearish reversal',
          'Inverse Head and Shoulders is the bullish version (three troughs)'
        ],
        tips: [
          'Draw the neckline clearly when explaining',
          'Mention that AI Trading Vault auto-detects this pattern'
        ],
        DiagramComponent: HeadShouldersDiagram,
        imageAlt: 'Head and Shoulders reversal pattern',
        quiz: {
          question: 'What does a Head and Shoulders pattern typically signal?',
          options: [
            'Strong bullish continuation',
            'Market indecision',
            'Trend reversal from bullish to bearish',
            'Sideways movement'
          ],
          correct: 2
        }
      },
      {
        id: 'ta-2b',
        title: 'Double Top & Double Bottom',
        content: [
          'Double Top: Price hits resistance twice then reverses down',
          'Forms an "M" shape - bearish reversal signal',
          'Double Bottom: Price hits support twice then reverses up',
          'Forms a "W" shape - bullish reversal signal',
          'Break of the middle swing point confirms the pattern'
        ],
        tips: [
          'Compare the M and W shapes for easy recognition',
          'Show entry points after confirmation'
        ],
        DiagramComponent: DoubleTopDiagram,
        imageAlt: 'Double Top and Double Bottom patterns'
      },
      {
        id: 'ta-2c',
        title: 'Triangle Patterns',
        content: [
          'Ascending Triangle: Flat resistance with rising support - bullish bias',
          'Descending Triangle: Flat support with falling resistance - bearish bias',
          'Symmetrical Triangle: Converging trendlines - breakout direction uncertain',
          'Volume typically decreases during formation',
          'Breakout often occurs 2/3 into the pattern'
        ],
        tips: [
          'Draw both trendlines to show the triangle formation',
          'Explain that breakout direction matters most'
        ],
        DiagramComponent: TriangleDiagram,
        imageAlt: 'Triangle chart patterns'
      },
      {
        id: 'ta-2d',
        title: 'Flag & Pennant Patterns',
        content: [
          'Both are continuation patterns after strong moves',
          'Flag: Rectangular consolidation against the trend',
          'Pennant: Small symmetrical triangle after a strong move',
          'The "pole" is the initial strong move before consolidation',
          'Breakout continues in the direction of the original move'
        ],
        tips: [
          'Show the pole + flag/pennant structure',
          'Explain these are short-term consolidation patterns'
        ],
        DiagramComponent: FlagPennantDiagram,
        imageAlt: 'Flag and Pennant continuation patterns'
      },
      {
        id: 'ta-2e',
        title: 'Cup and Handle Pattern',
        content: [
          'Rounded bottom (cup) followed by small pullback (handle)',
          'Cup should be U-shaped, not V-shaped for reliability',
          'Handle forms in the upper third of the cup',
          'Breakout above handle resistance is the buy signal',
          'Target: Height of cup added to breakout point'
        ],
        tips: [
          'Emphasize the rounded nature of the cup',
          'Show how this is a bullish continuation pattern'
        ],
        DiagramComponent: CupHandleDiagram,
        imageAlt: 'Cup and Handle bullish pattern'
      },
      {
        id: 'ta-2f',
        title: 'Wedge Patterns',
        content: [
          'Rising Wedge: Both trendlines slope up but converge - bearish',
          'Falling Wedge: Both trendlines slope down but converge - bullish',
          'Unlike triangles, wedges have both lines moving in same direction',
          'Breakout typically goes opposite to the wedge direction',
          'Often appear as continuation patterns in trends'
        ],
        tips: [
          'Compare wedges to triangles to show the difference',
          'Explain why rising wedge is bearish despite going up'
        ],
        DiagramComponent: WedgeDiagram,
        imageAlt: 'Rising and Falling Wedge patterns'
      },
      {
        id: 'ta-3',
        title: 'Support & Resistance',
        content: [
          'Support: Price level where buying pressure exceeds selling - price tends to bounce up from this level',
          'Resistance: Price level where selling pressure exceeds buying - price tends to fall from this level',
          'Breakout: When price moves through support/resistance with strong momentum - often leads to significant moves',
          'Retest: Price returns to broken level to confirm the breakout - common entry point for traders',
          'Key Levels: Round numbers, previous highs/lows, and psychological levels often act as S/R'
        ],
        tips: [
          'Show how AI Trading Vault identifies these levels automatically',
          'Explain why these levels matter for setting stop-loss and take-profit'
        ],
        DiagramComponent: SupportResistanceDiagram,
        imageAlt: 'Support and Resistance levels example'
      },
      {
        id: 'ta-4a',
        title: 'RSI Indicator',
        content: [
          'RSI measures momentum on a scale of 0 to 100',
          'Above 70 is considered overbought - potential sell signal',
          'Below 30 is considered oversold - potential buy signal',
          'Divergence between price and RSI can signal reversals',
          'Works best in ranging markets, less reliable in strong trends'
        ],
        tips: [
          'Show the 70/30 levels clearly on the indicator',
          'Explain that overbought doesnt always mean sell immediately'
        ],
        DiagramComponent: RSIDiagram,
        imageAlt: 'RSI indicator with overbought and oversold zones',
        quiz: {
          question: 'What does an RSI reading above 70 typically indicate?',
          options: [
            'Strong buy signal',
            'Market is oversold',
            'Market is overbought (potential sell)',
            'No trading signal'
          ],
          correct: 2
        }
      },
      {
        id: 'ta-4b',
        title: 'MACD Indicator',
        content: [
          'MACD = 12-period EMA minus 26-period EMA',
          'Signal Line = 9-period EMA of MACD',
          'Histogram shows the difference between MACD and Signal Line',
          'Bullish signal: MACD crosses above Signal Line',
          'Bearish signal: MACD crosses below Signal Line'
        ],
        tips: [
          'Focus on the crossover signals for simplicity',
          'Show histogram expansion as trend strength indicator'
        ],
        DiagramComponent: MACDDiagram,
        imageAlt: 'MACD indicator with signal line crossovers'
      },
      {
        id: 'ta-4c',
        title: 'Moving Averages',
        content: [
          'SMA (Simple Moving Average): Average of closing prices over period',
          'EMA (Exponential Moving Average): Gives more weight to recent prices',
          'Price above MA = bullish, below = bearish',
          'Golden Cross: Short MA crosses above long MA - bullish signal',
          'Death Cross: Short MA crosses below long MA - bearish signal'
        ],
        tips: [
          'Common periods: 20, 50, 100, 200 days',
          'Show golden cross and death cross examples'
        ],
        DiagramComponent: MovingAveragesDiagram,
        imageAlt: 'Moving Averages with crossover signals'
      },
      {
        id: 'ta-4d',
        title: 'Bollinger Bands',
        content: [
          'Middle band = 20-period SMA',
          'Upper band = Middle + 2 standard deviations',
          'Lower band = Middle - 2 standard deviations',
          'Price at upper band may be overbought, at lower may be oversold',
          'Band squeeze indicates low volatility - breakout often follows'
        ],
        tips: [
          'Explain bands expand in volatile markets, contract in quiet markets',
          'Show the squeeze pattern before breakouts'
        ],
        DiagramComponent: BollingerBandsDiagram,
        imageAlt: 'Bollinger Bands indicator with squeeze pattern'
      },
      {
        id: 'ta-4e',
        title: 'Volume Analysis',
        content: [
          'Volume confirms price moves - high volume = strong conviction',
          'Breakouts with high volume are more reliable',
          'Pullbacks on low volume suggest the trend remains intact',
          'Volume divergence can warn of potential reversals',
          'Always check volume when evaluating chart patterns'
        ],
        tips: [
          'Show volume bars below price chart',
          'Explain volume as the fuel behind price moves'
        ],
        DiagramComponent: VolumeDiagram,
        imageAlt: 'Volume indicator confirming price breakouts'
      },
      {
        id: 'ta-5',
        title: 'Trend Analysis',
        content: [
          'Uptrend: Series of higher highs and higher lows - look for buy opportunities on pullbacks',
          'Downtrend: Series of lower highs and lower lows - look for sell opportunities on rallies',
          'Sideways/Range: Price bounces between support and resistance - trade the range or wait for breakout',
          'Trendlines: Lines connecting swing highs or lows - act as dynamic support/resistance',
          'Trend Strength: Strong trends have steep angles, weak trends are shallow - AI Trading Vault confidence reflects this'
        ],
        tips: [
          'Always mention "the trend is your friend" concept',
          'Show how AI Trading Vault identifies trend direction automatically'
        ]
      },
      {
        id: 'ta-6',
        title: 'Risk Management Basics',
        content: [
          'Stop-Loss: Predetermined exit point to limit losses - AI Trading Vault suggests these based on analysis',
          'Take-Profit: Target price to lock in gains - based on support/resistance and risk-reward',
          'Risk-Reward Ratio: Comparison of potential profit to potential loss - 1:2 or higher is ideal',
          'Position Sizing: Amount to risk per trade - typically 1-2% of account per trade',
          'Entry Point: Optimal price to enter a trade - AI Trading Vault provides specific levels'
        ],
        tips: [
          'Emphasize that even the best analysis requires proper risk management',
          'Show how AI Trading Vault calculates risk-reward automatically'
        ],
        quiz: {
          question: 'What is considered a good minimum risk-reward ratio?',
          options: [
            '1:0.5 (risk more than you gain)',
            '1:1 (equal risk and reward)',
            '1:2 or higher (gain more than you risk)',
            'Risk-reward doesn\'t matter'
          ],
          correct: 2
        }
      }
    ]
  },
  {
    id: 'social-media',
    title: 'Social Media Promotion',
    description: 'Strategies for promoting AI Trading Vault on social platforms',
    duration: '25 min',
    icon: Share2,
    image: socialMediaImg,
    lessons: [
      {
        id: 'social-1',
        title: 'Platform-Specific Strategies',
        content: [
          'Twitter/X: Share quick analysis screenshots with your referral link',
          'Instagram: Create carousel posts showing before/after analysis',
          'TikTok: Short videos demonstrating the upload and analysis process',
          'YouTube: In-depth tutorials and trading education content',
          'LinkedIn: Professional content targeting serious traders'
        ],
        tips: [
          'Use platform-native features (Reels, Stories, Threads)',
          'Post consistently at optimal times for your audience'
        ]
      },
      {
        id: 'social-2',
        title: 'Content Ideas That Work',
        content: [
          'Before/after analysis comparisons',
          '"Day in the life" of using AI Trading Vault',
          'Weekly market analysis using the platform',
          'Tutorial walkthroughs for new features',
          'Success stories and testimonials',
          'Live trading sessions using AI insights'
        ],
        tips: [
          'Always include a clear call-to-action',
          'Use your branded referral link in bio/description'
        ]
      },
      {
        id: 'social-3',
        title: 'Hashtags & SEO',
        content: [
          'Use trading-related hashtags: #forex #trading #crypto #stocks',
          'Add AI hashtags: #AI #tradingAI #automation',
          'Include platform tags: #MT5 #TradingView',
          'Create a unique hashtag for your content'
        ],
        tips: [
          'Research trending hashtags in the trading niche',
          'Mix popular and niche hashtags for reach'
        ],
        quiz: {
          question: 'What should always be included in your social media posts?',
          options: [
            'Your personal trading results',
            'A clear call-to-action with referral link',
            'Criticism of other platforms',
            'Guaranteed profit claims'
          ],
          correct: 1
        }
      }
    ]
  },
  {
    id: 'video-creation',
    title: 'Creating Explainer Videos',
    description: 'Learn to create compelling video content',
    duration: '35 min',
    icon: Video,
    image: videoCreationImg,
    lessons: [
      {
        id: 'video-1',
        title: 'Video Equipment & Setup',
        content: [
          'Smartphone camera is sufficient for starting out',
          'Use good lighting - natural light or ring light',
          'Clear audio is essential - consider a lapel mic',
          'Clean, professional background',
          'Screen recording software for demos (OBS, Loom, etc.)'
        ],
        tips: [
          'Test your setup before recording',
          'Record in a quiet environment'
        ]
      },
      {
        id: 'video-2',
        title: 'Video Structure',
        content: [
          'Hook (0-5 sec): Grab attention with a bold statement or question',
          'Problem (5-15 sec): Address the pain point of manual analysis',
          'Solution (15-45 sec): Introduce AI Trading Vault as the answer',
          'Demo (45-90 sec): Show the platform in action',
          'CTA (last 10 sec): Direct viewers to sign up'
        ],
        tips: [
          'Keep videos under 2 minutes for social media',
          'Longer tutorials can be 5-10 minutes for YouTube'
        ]
      },
      {
        id: 'video-3',
        title: 'Scripting Your Videos',
        content: [
          'Start with: "Are you tired of spending hours analyzing charts?"',
          'Transition: "What if AI could do it for you in seconds?"',
          'Demo: "Let me show you how AI Trading Vault works..."',
          'Benefits: "This saves me X hours every week"',
          'Close: "Click the link below to try it yourself"'
        ],
        tips: [
          'Speak naturally - don\'t read word-for-word',
          'Show your personality and enthusiasm'
        ],
        quiz: {
          question: 'How long should social media explainer videos be?',
          options: [
            'Under 30 seconds',
            'Under 2 minutes',
            '5-10 minutes',
            '30+ minutes'
          ],
          correct: 1
        }
      },
      {
        id: 'video-4',
        title: 'Editing Tips',
        content: [
          'Use jump cuts to keep pace engaging',
          'Add text overlays for key points',
          'Include the AI Trading Vault logo/branding',
          'Add background music (royalty-free)',
          'Use transitions between sections'
        ],
        tips: [
          'Free editing apps: CapCut, DaVinci Resolve, iMovie',
          'Keep branding consistent across videos'
        ]
      }
    ]
  },
  {
    id: 'live-demos',
    title: 'Live Demonstration Skills',
    description: 'Master live presentations and demos',
    duration: '20 min',
    icon: Monitor,
    image: liveStreamImg,
    lessons: [
      {
        id: 'live-1',
        title: 'Preparing for Live Demos',
        content: [
          'Have sample charts ready to upload',
          'Pre-load the platform and log in',
          'Test your internet connection',
          'Prepare talking points for each feature',
          'Have backup content if something fails'
        ],
        tips: [
          'Practice your demo multiple times',
          'Anticipate common questions'
        ]
      },
      {
        id: 'live-2',
        title: 'Engaging Your Audience',
        content: [
          'Ask questions to involve viewers',
          'Respond to comments in real-time',
          'Use polls and Q&A features',
          'Share personal experiences and results',
          'Create urgency with limited-time offers'
        ],
        tips: [
          'Have a co-host to manage chat',
          'Acknowledge viewers by name when possible'
        ]
      },
      {
        id: 'live-3',
        title: 'Handling Objections',
        content: [
          '"Is this a scam?" - Explain the legitimate AI technology',
          '"Does it guarantee profits?" - Never guarantee, focus on analysis quality',
          '"Why should I pay?" - Highlight time savings and value',
          '"Is my data safe?" - Explain security measures'
        ],
        tips: [
          'Stay calm and professional',
          'Redirect to positive aspects'
        ],
        quiz: {
          question: 'How should you respond to profit guarantee questions?',
          options: [
            'Promise high returns',
            'Never guarantee, focus on analysis quality',
            'Ignore the question',
            'Show past trade results'
          ],
          correct: 1
        }
      }
    ]
  },
  {
    id: 'compliance',
    title: 'Compliance & Best Practices',
    description: 'Stay compliant and build trust',
    duration: '15 min',
    icon: Award,
    image: complianceImg,
    lessons: [
      {
        id: 'compliance-1',
        title: 'What NOT to Do',
        content: [
          'Never guarantee profits or returns',
          'Don\'t make false claims about the AI',
          'Avoid showing fake testimonials',
          'Don\'t pressure people aggressively',
          'Never share others\' personal trading data'
        ],
        tips: [
          'When in doubt, keep claims modest',
          'Focus on features, not unrealistic promises'
        ]
      },
      {
        id: 'compliance-2',
        title: 'Building Trust',
        content: [
          'Be transparent about how the AI works',
          'Share your own genuine experience',
          'Acknowledge limitations honestly',
          'Provide value before asking for signups',
          'Respond promptly to questions and concerns'
        ],
        tips: [
          'Trust leads to long-term followers',
          'Quality over quantity in referrals'
        ]
      },
      {
        id: 'compliance-3',
        title: 'Disclosure Requirements',
        content: [
          'Always disclose affiliate/referral relationships',
          'Use #ad or #sponsored when required',
          'Be clear that you earn from referrals',
          'Follow platform-specific guidelines'
        ],
        tips: [
          'Transparency builds credibility',
          'Check local regulations for financial promotions'
        ],
        quiz: {
          question: 'What must you always disclose in your promotions?',
          options: [
            'Your personal trading results',
            'Your affiliate/referral relationship',
            'Your trading strategy',
            'Your real name'
          ],
          correct: 1
        }
      }
    ]
  },
  {
    id: 'solana-scanner',
    title: 'Solana Token Scanner',
    description: 'How to use the AI-powered Solana token scanner for crypto trading signals',
    duration: '20 min',
    icon: Wallet,
    image: platformsImg,
    lessons: [
      {
        id: 'solana-1',
        title: 'Understanding the Solana Scanner',
        content: [
          'The Solana Token Scanner uses AI to analyze trending tokens on the Solana blockchain',
          'It scans DexScreener for real-time token data including price, volume, and liquidity',
          'AI calculates sentiment, tokenomics, and whale activity scores for each token',
          'Generates signals: STRONG_BUY, BUY, HOLD, SELL, or STRONG_SELL with confidence %',
          'Shows recommended hold duration, risk level, entry price, target, and stop-loss',
          'Perfect for traders who want to catch trending Solana memecoins and tokens'
        ],
        tips: [
          'Emphasize the AI-powered analysis - this is unique in the crypto space',
          'Show how the scanner updates with fresh trending tokens',
          'Highlight the risk level indicator for responsible trading'
        ]
      },
      {
        id: 'solana-2',
        title: 'Connecting Your Phantom Wallet',
        content: [
          'The scanner integrates with Phantom wallet for live trading',
          'On desktop: Install the Phantom browser extension and click Connect Phantom',
          'On mobile: Open the page inside the Phantom app browser',
          'Once connected, your real SOL balance is displayed',
          'This enables one-click buying of tokens directly from signal cards',
          'Trades execute through Jupiter DEX for best swap rates on Solana'
        ],
        tips: [
          'Walk users through Phantom wallet installation step-by-step',
          'Remind them to never share seed phrases or private keys',
          'Mobile users need to use the Phantom in-app browser'
        ]
      },
      {
        id: 'solana-3',
        title: 'Auto-Trading & Rebalancing',
        content: [
          'Auto-Trade mode automatically buys tokens with strong buy signals',
          'Set trade amount in SOL, take profit %, and stop loss % thresholds',
          'Auto-Rebalance sells losing tokens and replaces with better performers',
          'Configure rebalance threshold (e.g., -10%) to limit losses',
          'Pump/Dump Protection monitors for rapid price drops and auto-exits',
          'All settings are customizable in the Settings tab'
        ],
        tips: [
          'Start with small trade amounts to test the system',
          'Explain that crypto is highly volatile - use risk management',
          'Auto-rebalance helps recover from bad trades automatically'
        ],
        quiz: {
          question: 'What does Auto-Rebalance do when a token drops below the threshold?',
          options: [
            'Sends you a notification only',
            'Automatically sells it and buys a better-performing token',
            'Doubles down on the position',
            'Pauses all trading'
          ],
          correct: 1
        }
      }
    ]
  },
  {
    id: 'platform-essentials',
    title: 'Platform Essentials',
    description: 'What you need to know about MT5, TradeLocker, and TradingView',
    duration: '30 min',
    icon: Monitor,
    image: platformsImg,
    lessons: [
      {
        id: 'platform-1',
        title: 'MetaTrader 5 (MT5) Essentials',
        content: [
          'MT5 is the industry-standard platform for Forex and CFD trading worldwide',
          'Key features: Advanced charting, Expert Advisors (EAs), multi-asset trading, built-in strategy tester',
          'Chart timeframes: M1, M5, M15, M30, H1, H4, D1, W1, MN (month)',
          'To export charts: Right-click chart → Save as Picture, or use Print Screen',
          'EA installation: File → Open Data Folder → MQL5 → Experts → paste .mq5 file → Compile in MetaEditor',
          'Enable WebRequest: Tools → Options → Expert Advisors → Allow WebRequest for listed URLs',
          'Common brokers using MT5: IC Markets, Pepperstone, OANDA, XM, FXCM'
        ],
        tips: [
          'Many traders are familiar with MT5 - focus on how AI Trading Vault enhances their workflow',
          'Emphasize the EA download and one-click installation process',
          'Show how to enable WebRequest for webhooks in your tutorials'
        ],
        guideLink: {
          text: 'See User Guide: EA Code Generation',
          section: 'ea-generation'
        }
      },
      {
        id: 'platform-2',
        title: 'TradeLocker Essentials',
        content: [
          'TradeLocker is a modern, web-based trading platform with sleek UI and powerful features',
          'Key features: Clean interface, one-click trading, advanced order types, webhook integrations',
          'No download required - runs in any modern web browser',
          'Chart export: Use the screenshot tool or browser screenshot',
          'Webhook setup: Settings → API → Create Webhook → Copy URL',
          'TradeLocker supports receiving signals via webhooks from AI Trading Vault',
          'Growing platform popular with prop firms and modern brokers'
        ],
        tips: [
          'Highlight TradeLocker\'s modern design and ease of use',
          'Show the webhook setup process for trade copying',
          'Mention that AI Trading Vault generates TradeLocker-compatible code'
        ],
        guideLink: {
          text: 'See User Guide: Chart Analysis',
          section: 'chart-analysis'
        }
      },
      {
        id: 'platform-3',
        title: 'TradingView Essentials',
        content: [
          'TradingView is the most popular charting platform with a massive community',
          'Key features: Cloud-based, social features, Pine Script, extensive indicators, real-time data',
          'Over 50 million traders use TradingView worldwide',
          'Chart export: Click camera icon at top-right of chart, or right-click → Take Snapshot',
          'Pine Script: TradingView\'s programming language for custom indicators and strategies',
          'Alerts: TradingView can send webhook alerts when conditions are met',
          'Free tier available with paid plans for more features'
        ],
        tips: [
          'TradingView users are often active on social media - great audience for content',
          'Show how to export high-quality chart screenshots',
          'Explain that AI Trading Vault generates Pine Script code they can paste directly'
        ],
        guideLink: {
          text: 'See User Guide: EA Code Generation',
          section: 'ea-generation'
        }
      },
      {
        id: 'platform-4',
        title: 'Platform Comparison for Your Content',
        content: [
          'MT5: Best for automated trading with Expert Advisors, requires desktop software',
          'TradeLocker: Best for web-based trading and webhook integrations, modern interface',
          'TradingView: Best for charting and social features, great for analysis sharing',
          'AI Trading Vault supports ALL THREE platforms for chart upload and EA code generation',
          'Webhook Signal System can relay signals to any platform with webhook support',
          'MT5 Trade Copier: Unique feature to copy trades from MT5 to other platforms'
        ],
        tips: [
          'Create comparison content to help traders choose the right platform',
          'Emphasize that AI Trading Vault is platform-agnostic - works with their preferred tool',
          'Show cross-platform workflows (analyze on TradingView, trade on MT5, etc.)'
        ],
        guideLink: {
          text: 'See User Guide: Getting Started',
          section: 'getting-started'
        },
        quiz: {
          question: 'Which platform is best known for its Pine Script programming language?',
          options: [
            'MetaTrader 5',
            'TradeLocker',
            'TradingView',
            'All of the above'
          ],
          correct: 2
        }
      }
    ]
  },
  {
    id: 'community-building',
    title: 'Building Your VEDD Community',
    description: 'Learn how to build, grow, and nurture a thriving trading community around VEDD AI',
    duration: '35 min',
    icon: Users,
    image: socialMediaImg,
    lessons: [
      {
        id: 'community-1',
        title: 'The Power of Community in Trading',
        content: [
          'Trading can be isolating - community provides support, accountability, and shared learning',
          'VEDD AI is more than a tool - it\'s an Online University-style community experience',
          'Successful traders often credit their community for helping them stay disciplined and motivated',
          'Your role as an ambassador is to foster this sense of belonging and mutual growth',
          'Community members who feel connected stay longer and refer more people'
        ],
        keyPoints: [
          { title: 'Shared Learning', description: 'When one trader learns something new, the whole community benefits. Share insights, strategies, and lessons learned - especially from losses.', icon: BookOpen },
          { title: 'Accountability Partners', description: 'Trading buddies help you stick to your rules. Encourage members to partner up and check in with each other on trading discipline.', icon: Target },
          { title: 'Emotional Support', description: 'Drawdowns hit different when you have people who understand. Create space for traders to share struggles without judgment.', icon: Heart }
        ],
        realWorldExamples: [
          { scenario: 'A new trader was about to revenge trade after a loss', outcome: 'Posted in the community first, received support and talked out of it, saved their account', lesson: 'Community accountability can literally save accounts. Encourage posting before impulsive decisions.', type: 'success' },
          { scenario: 'Trader felt alone and about to quit after a losing month', outcome: 'Saw others sharing similar struggles in the community chat, realized losses are part of the journey', lesson: 'Knowing you\'re not alone keeps traders in the game. Normalize the struggle while encouraging persistence.', type: 'insight' }
        ],
        tips: [
          'Emphasize that VEDD is building a supportive trading family, not just users',
          'Share your own trading struggles to normalize the learning process',
          'Create welcoming spaces where beginners feel safe to ask "dumb" questions'
        ]
      },
      {
        id: 'community-2',
        title: 'What Makes VEDD Community Special',
        content: [
          'VEDD AI combines cutting-edge AI technology with faith-based principles',
          'Our community values: Integrity, Continuous Learning, Generosity, and Excellence',
          'Host Dashboard enables live events, training sessions, and community gatherings',
          'EA Marketplace allows members to share and monetize their strategies',
          'Ambassador program creates leaders who mentor the next generation',
          'Token rewards and gamification keep engagement high and progress visible'
        ],
        keyPoints: [
          { title: 'Online University Experience', description: 'VEDD is structured like an online university with courses, certifications, live classes, and a campus community feel.', icon: GraduationCap },
          { title: 'Faith & Finance', description: 'We uniquely blend trading education with biblical wisdom. This attracts traders seeking purpose beyond profits.', icon: Star },
          { title: 'Leader Development', description: 'VEDD doesn\'t just create users - we develop ambassadors and leaders who can host their own events and train others.', icon: Award }
        ],
        realWorldExamples: [
          { scenario: 'Ambassador hosted their first live trading session', outcome: 'Had 25 attendees, generated 8 new sign-ups, earned bonus tokens', lesson: 'The Host Dashboard empowers members to become leaders. Encourage aspiring ambassadors to use these tools.', type: 'success' }
        ],
        tips: [
          'Highlight the unique faith-based aspect when talking to spiritually-minded traders',
          'Show how the platform creates multiple income opportunities',
          'Emphasize the path from member to ambassador to leader'
        ],
        quiz: {
          question: 'What makes VEDD AI community different from other trading platforms?',
          options: [
            'Just another trading signals group',
            'Online University-style experience with faith-based principles and leader development',
            'Only for professional traders',
            'No community features at all'
          ],
          correct: 1
        }
      },
      {
        id: 'community-3',
        title: 'Growing Your Local VEDD Tribe',
        content: [
          'Start with your existing network - friends, family, colleagues interested in trading or investing',
          'Create a WhatsApp or Telegram group for your local VEDD members',
          'Host weekly virtual meetups to discuss charts, share wins, and support through losses',
          'Find your niche: crypto traders, forex folks, swing traders, or day traders',
          'Partner with other ambassadors to cross-promote and grow faster together'
        ],
        keyPoints: [
          { title: 'Start Small, Think Big', description: 'Begin with 5-10 committed members. Quality over quantity builds a stronger foundation for growth.', icon: Target },
          { title: 'Consistent Touchpoints', description: 'Weekly check-ins, daily chart shares, and monthly celebrations keep your tribe engaged and growing.', icon: Calendar },
          { title: 'Collaborative Growth', description: 'Partner with other ambassadors for joint events. Two audiences coming together creates explosive growth.', icon: Users }
        ],
        realWorldExamples: [
          { scenario: 'Ambassador started with just 5 friends learning VEDD together', outcome: 'Each friend referred 3 more people, group grew to 50+ within 3 months', lesson: 'Small focused groups become referral machines. Quality members refer quality members.', type: 'success' },
          { scenario: 'Two ambassadors in different time zones partnered up', outcome: 'Created 24/7 coverage for their combined community, doubled engagement', lesson: 'Collaboration beats competition. Find partner ambassadors to grow together.', type: 'insight' }
        ],
        tips: [
          'Create a simple onboarding process for new members in your group',
          'Assign roles: chart analyzer, motivation poster, question answerer',
          'Celebrate every win, no matter how small - this builds momentum'
        ]
      },
      {
        id: 'community-4',
        title: 'Hosting Engaging Community Events',
        content: [
          'Use VEDD\'s Host Dashboard to create and manage live events',
          'Event types: Live Chart Analysis, Q&A Sessions, Strategy Deep-Dives, Beginner Bootcamps',
          'AI-powered presentation slides help you look professional without hours of prep',
          'Record events for replay - content that keeps working while you sleep',
          'Promote events across social media, email, and community groups'
        ],
        keyPoints: [
          { title: 'Event Planning', description: 'Schedule events at least 1 week ahead. Promote consistently. Send reminders 24 hours and 1 hour before.', icon: Calendar },
          { title: 'Professional Delivery', description: 'Use the AI presentation generator to create branded slides. Practice your talking points. Test your audio/video.', icon: Monitor },
          { title: 'Follow-Up Magic', description: 'Post-event follow-up converts attendees to active members. Share recordings, answer questions, invite to next event.', icon: MessageSquare }
        ],
        realWorldExamples: [
          { scenario: 'Ambassador hosted weekly "Chart Review Friday" sessions', outcome: 'Built a loyal audience of 100+ regular attendees, became known as the go-to chart expert in their niche', lesson: 'Consistency creates authority. Pick a regular time slot and stick to it.', type: 'success' }
        ],
        tips: [
          'Start with biweekly events and increase frequency as you get comfortable',
          'Always have a clear call-to-action: sign up, try a feature, refer a friend',
          'Engage with chat during live events - make people feel seen'
        ],
        guideLink: {
          text: 'See User Guide: Host Dashboard',
          section: 'host-dashboard'
        }
      },
      {
        id: 'community-5',
        title: 'Creating Community Content',
        content: [
          'Share member success stories (with permission) - testimonials build trust',
          'Create "Day in the Life" content showing VEDD community activities',
          'Spotlight different members each week to make people feel valued',
          'Document community events, wins, and milestones',
          'Encourage user-generated content - members sharing their VEDD experiences'
        ],
        keyPoints: [
          { title: 'Testimonial Power', description: 'Real member stories are your best marketing. Ask happy members if they\'ll share their experience on video or text.', icon: Star },
          { title: 'Behind-the-Scenes', description: 'Show the community vibe: screenshots of helpful chats, clips from live events, celebration posts. Make people want to be part of it.', icon: Camera },
          { title: 'User-Generated Content', description: 'Encourage members to share their own wins and tag VEDD. Reshare their content to make them feel like stars.', icon: Share2 }
        ],
        tips: [
          'Create a simple template for member spotlights',
          'Always ask permission before sharing someone\'s story or results',
          'Celebrate the process, not just the profits - learning is a win too'
        ]
      },
      {
        id: 'community-6',
        title: 'Nurturing and Retaining Members',
        content: [
          'Welcome new members personally - a simple DM goes a long way',
          'Create a clear path: New Member → Active Learner → Contributor → Ambassador',
          'Recognize milestones: first chart analysis, first EA, 30-day streak, certification',
          'Address issues quickly - unhappy members talk louder than happy ones',
          'Create exclusive perks for long-term members to reward loyalty'
        ],
        keyPoints: [
          { title: 'Personal Touch', description: 'Send a personal welcome message to every new member. Ask about their trading goals. This simple act creates lasting loyalty.', icon: Heart },
          { title: 'Clear Progression', description: 'Show members the path from beginner to ambassador. People stay when they see a journey ahead, not just a destination.', icon: TrendingUp },
          { title: 'Quick Response', description: 'When someone has a problem, solve it fast. Turn complaints into opportunities to show you care.', icon: Zap }
        ],
        realWorldExamples: [
          { scenario: 'New member felt lost and was about to cancel', outcome: 'Ambassador reached out, offered a 1-on-1 walkthrough, member became one of the most active contributors', lesson: 'Personal attention saves members. That 15-minute call can create a lifelong advocate.', type: 'success' },
          { scenario: 'Member complained publicly about a feature', outcome: 'Ambassador responded quickly, escalated the issue, and the feature was improved', lesson: 'Feedback is a gift. Handle complaints well and critics become champions.', type: 'insight' }
        ],
        tips: [
          'Set aside 30 minutes daily for community engagement and DMs',
          'Create a recognition program for top contributors',
          'Ask for feedback regularly - people feel valued when you ask their opinion'
        ],
        quiz: {
          question: 'What is the most effective way to retain new community members?',
          options: [
            'Send automated emails only',
            'Wait for them to figure things out',
            'Send a personal welcome message and check in on their goals',
            'Ignore them until they complain'
          ],
          correct: 2
        }
      }
    ]
  }
];

export default function AmbassadorTrainingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeModule, setActiveModule] = useState<string>(trainingModules[0].id);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [showCertificate, setShowCertificate] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [showNFTSection, setShowNFTSection] = useState(false);

  // Handle URL parameters for deep linking from training calendar
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const moduleParam = urlParams.get('module');
    if (moduleParam) {
      const moduleExists = trainingModules.find(m => m.id === moduleParam);
      if (moduleExists) {
        setActiveModule(moduleParam);
      }
    }
  }, []);

  const totalLessons = trainingModules.reduce((acc, m) => acc + m.lessons.length, 0);
  const progress = (completedLessons.size / totalLessons) * 100;
  const isComplete = completedLessons.size === totalLessons;

  // Fetch training progress
  const { data: trainingProgress, refetch: refetchProgress } = useQuery<AmbassadorTrainingProgress | null>({
    queryKey: ['/api/ambassador/training/progress'],
    enabled: !!user,
  });

  // Initialize local state from saved progress
  useEffect(() => {
    if (trainingProgress) {
      if (trainingProgress.completedLessons && trainingProgress.completedLessons.length > 0) {
        setCompletedLessons(new Set(trainingProgress.completedLessons));
      }
      if (trainingProgress.quizScores) {
        setQuizAnswers(trainingProgress.quizScores as Record<string, number>);
      }
    }
  }, [trainingProgress]);

  // Fetch certification data
  const { data: certification, refetch: refetchCertification } = useQuery<AmbassadorCertification | null>({
    queryKey: ['/api/ambassador/certification'],
    enabled: !!user,
  });

  // Fetch 44-Day Content Flow stats and lessons
  const { data: contentFlowStats } = useQuery<{
    currentDay: number;
    completedDays: number;
    totalTokensEarned: number;
    currentStreak: number;
  }>({
    queryKey: ['/api/ambassador/content-flow/stats'],
    enabled: !!user,
  });

  const { data: contentFlowLessons } = useQuery<Array<{
    dayNumber: number;
    title: string;
    tradingTopic: string;
    scriptureReference: string;
    tokenReward: number;
    weekNumber: number;
  }>>({
    queryKey: ['/api/ambassador/content-flow/lessons'],
    enabled: !!user,
  });

  // Get today's lesson from the content flow
  const todaysLesson = contentFlowLessons?.find(
    lesson => lesson.dayNumber === (contentFlowStats?.currentDay || 1)
  );

  // Save progress mutation
  const saveProgressMutation = useMutation({
    mutationFn: async (data: { completedLessons: string[]; quizScores: Record<string, number> }) => {
      const res = await apiRequest('POST', '/api/ambassador/training/progress', data);
      return res.json();
    },
    onSuccess: () => {
      refetchProgress();
    },
    onError: (err: Error) => {
      toast({
        title: 'Error saving progress',
        description: err.message,
        variant: 'destructive'
      });
    }
  });

  // Issue certification mutation
  const issueCertificationMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/ambassador/certification/issue');
      return res.json();
    },
    onSuccess: () => {
      refetchCertification();
      toast({
        title: 'Certification Issued!',
        description: 'You are now a certified AI Trading Vault Ambassador!'
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive'
      });
    }
  });

  // Connect wallet mutation
  const connectWalletMutation = useMutation({
    mutationFn: async (address: string) => {
      const res = await apiRequest('POST', '/api/ambassador/certification/connect-wallet', { walletAddress: address });
      return res.json();
    },
    onSuccess: () => {
      refetchCertification();
      toast({
        title: 'Wallet Connected!',
        description: 'Your Solana wallet has been linked to your certification.'
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive'
      });
    }
  });

  // Claim tokens mutation
  const claimTokensMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/ambassador/certification/claim-tokens');
      return res.json();
    },
    onSuccess: (data) => {
      refetchCertification();
      toast({
        title: 'Tokens Claimed!',
        description: data.message
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive'
      });
    }
  });

  const markLessonComplete = (lessonId: string) => {
    const newCompleted = new Set(Array.from(completedLessons).concat(lessonId));
    setCompletedLessons(newCompleted);
    
    // Save to backend
    saveProgressMutation.mutate({
      completedLessons: Array.from(newCompleted),
      quizScores: quizAnswers
    });
    
    toast({
      title: 'Lesson Complete!',
      description: 'Keep going to earn your Ambassador certificate.'
    });
  };

  const handleQuizAnswer = (lessonId: string, answerIndex: number, correctIndex: number) => {
    const isCorrect = answerIndex === correctIndex;
    // Store 100 for correct, 0 for incorrect (for percentage calculation)
    const newQuizAnswers = { ...quizAnswers, [lessonId]: isCorrect ? 100 : 0 };
    setQuizAnswers(newQuizAnswers);
    
    // Always save quiz result to backend
    saveProgressMutation.mutate({
      completedLessons: Array.from(completedLessons),
      quizScores: newQuizAnswers
    });
    
    if (isCorrect) {
      toast({
        title: 'Correct!',
        description: 'Great job! You can now mark this lesson complete.'
      });
    } else {
      toast({
        title: 'Not quite right',
        description: 'Review the content and try again.',
        variant: 'destructive'
      });
    }
  };

  const handleClaimCertification = async () => {
    if (!isComplete) {
      toast({
        title: 'Training Incomplete',
        description: 'Complete all lessons to claim your certification.',
        variant: 'destructive'
      });
      return;
    }
    issueCertificationMutation.mutate();
  };

  const handleConnectWallet = () => {
    if (!walletAddress || walletAddress.length < 32) {
      toast({
        title: 'Invalid Wallet',
        description: 'Please enter a valid Solana wallet address.',
        variant: 'destructive'
      });
      return;
    }
    connectWalletMutation.mutate(walletAddress);
  };

  const copyVerificationLink = () => {
    if (certification) {
      navigator.clipboard.writeText(`https://veddbuild.com/verify/${certification.certificateNumber}`);
      toast({
        title: 'Copied!',
        description: 'Verification link copied to clipboard.'
      });
    }
  };

  const currentModule = trainingModules.find(m => m.id === activeModule);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-gray-950 py-8 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-amber-500/20 text-amber-400 border-amber-500/30">
            Ambassador Program
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-training-title">
            AI Trading Vault Ambassador Training
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Complete this training to become a certified AI Trading Vault Ambassador. 
            Serve as the public educator and promoter of AI Trading Vault's chart analysis capabilities through live social presence and clear video tutorials.
          </p>

          {/* Quick Access Shortcuts */}
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <Link href="/training-calendar">
              <Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
                <Calendar className="w-4 h-4 mr-2" />
                Training Calendar
              </Button>
            </Link>
            <Link href="/ambassador/content-flow">
              <Button variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10">
                <Calendar className="w-4 h-4 mr-2" />
                44-Day Content Journey
              </Button>
            </Link>
            <Link href="/host-dashboard">
              <Button variant="outline" className="border-green-500/50 text-green-400 hover:bg-green-500/10">
                <Users className="w-4 h-4 mr-2" />
                Host Dashboard
              </Button>
            </Link>
            <Link href="/user-guide">
              <Button variant="outline" className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
                <BookOpen className="w-4 h-4 mr-2" />
                User Guide
              </Button>
            </Link>
          </div>
        </div>

        {/* Position Overview Section */}
        <Card className="mb-8 bg-gradient-to-r from-amber-900/30 to-gray-900 border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-3">
              <Target className="w-7 h-7 text-amber-400" />
              Position Overview
            </CardTitle>
            <CardDescription className="text-base">
              We are seeking a dynamic Ambassador to represent AI Trading Vault across social platforms
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300 mb-6">
              This individual will serve as the face and voice of the platform, educating users through tutorials, live sessions, and community engagement. The Ambassador will simplify complex charting concepts, showcase platform features, and inspire traders to adopt AI Trading Vault as their go-to analysis tool.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 text-gray-400">
                <Video className="w-5 h-5 text-amber-400" />
                <span>YouTube tutorials & educational content</span>
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <Mic className="w-5 h-5 text-amber-400" />
                <span>Live sessions on YouTube, Instagram, Twitter/X</span>
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <Camera className="w-5 h-5 text-amber-400" />
                <span>Short-form content (TikTok/Instagram Reels)</span>
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <Users className="w-5 h-5 text-amber-400" />
                <span>Community building & engagement</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Core Responsibilities Section */}
        <Card className="mb-8 bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <Megaphone className="w-6 h-6 text-blue-400" />
              Core Responsibilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {coreResponsibilities.map((resp, idx) => (
                <Card key={idx} className="bg-gray-800/50 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-amber-400">{resp.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {resp.items.map((item, itemIdx) => (
                        <li key={itemIdx} className="flex items-start gap-2 text-sm text-gray-400">
                          <ChevronRight className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Schedule Section */}
        <Card className="mb-8 bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <Clock className="w-6 h-6 text-green-400" />
              Suggested Weekly Content Flow
            </CardTitle>
            <CardDescription>
              Follow this schedule to maintain consistent engagement with your audience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {weeklySchedule.map((day, idx) => (
                <Card key={idx} className="bg-gray-800/50 border-gray-700 text-center">
                  <CardContent className="p-4">
                    <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-green-500/20 flex items-center justify-center">
                      <day.icon className="w-5 h-5 text-green-400" />
                    </div>
                    <h4 className="font-semibold text-sm text-gray-200">{day.day}</h4>
                    <p className="text-xs text-amber-400 font-medium mt-1">{day.action}</p>
                    <p className="text-xs text-gray-500 mt-1">{day.details}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Training Program Progress */}
            <div className="mt-6 p-5 bg-gradient-to-r from-purple-900/40 via-indigo-900/30 to-gray-900/50 border border-purple-500/30 rounded-xl mb-4">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="w-5 h-5 text-purple-400" />
                <h3 className="font-semibold text-white">Ambassador Training Program</h3>
                <Badge className={`ml-auto ${isComplete ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-purple-500/20 text-purple-400 border-purple-500/30'}`}>
                  {isComplete ? 'Completed' : `${Math.round(progress)}% Complete`}
                </Badge>
              </div>

              {/* Training Progress Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center p-2 bg-gray-800/50 rounded-lg">
                  <p className="text-lg font-bold text-purple-400">{completedLessons.size}</p>
                  <p className="text-xs text-gray-400">Lessons Done</p>
                </div>
                <div className="text-center p-2 bg-gray-800/50 rounded-lg">
                  <p className="text-lg font-bold text-indigo-400">{totalLessons}</p>
                  <p className="text-xs text-gray-400">Total Lessons</p>
                </div>
                <div className="text-center p-2 bg-gray-800/50 rounded-lg">
                  <p className="text-lg font-bold text-green-400">{trainingModules.length}</p>
                  <p className="text-xs text-gray-400">Modules</p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <Progress value={progress} className="h-2 bg-gray-800" />
              </div>

              {/* Current Module Card */}
              {(() => {
                const currentModuleData = trainingModules.find(m => 
                  m.lessons.some(l => !completedLessons.has(l.id))
                ) || trainingModules[trainingModules.length - 1];
                const nextLesson = currentModuleData?.lessons.find(l => !completedLessons.has(l.id));
                
                return currentModuleData && nextLesson ? (
                  <Card className="bg-gray-800/70 border-purple-500/20 mb-4">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="text-purple-400 border-purple-500/30 text-xs">
                              Module {trainingModules.indexOf(currentModuleData) + 1}
                            </Badge>
                            <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 text-xs">
                              {currentModuleData.title}
                            </Badge>
                          </div>
                          <h4 className="font-semibold text-white mb-1">{nextLesson.title}</h4>
                          <p className="text-sm text-gray-400">{nextLesson.content?.[0] || 'Continue your training'}</p>
                        </div>
                        <Button 
                          size="sm" 
                          className="bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600"
                          onClick={() => {
                            setActiveModule(currentModuleData.id);
                            setExpandedLesson(nextLesson.id);
                            setTimeout(() => {
                              document.getElementById('training-modules')?.scrollIntoView({ behavior: 'smooth' });
                            }, 100);
                          }}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          Continue
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : isComplete ? (
                  <Card className="bg-gray-800/70 border-green-500/20 mb-4">
                    <CardContent className="p-4 text-center">
                      <Trophy className="w-8 h-8 text-green-400 mx-auto mb-2" />
                      <p className="text-green-400 font-semibold">Training Complete!</p>
                      <p className="text-sm text-gray-400">You've finished all modules</p>
                    </CardContent>
                  </Card>
                ) : null;
              })()}

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  6 comprehensive modules with quizzes & certification
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                  onClick={() => document.getElementById('training-modules')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  View Modules
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* 44-Day Content Journey - Today's Lesson */}
            <div className="p-5 bg-gradient-to-r from-amber-900/40 via-orange-900/30 to-gray-900/50 border border-amber-500/30 rounded-xl">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-white">44-Day Content Journey</h3>
                {contentFlowStats && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 ml-auto">
                    Day {contentFlowStats.currentDay} of 44
                  </Badge>
                )}
              </div>

              {/* Progress Stats */}
              {contentFlowStats && (
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="text-center p-2 bg-gray-800/50 rounded-lg">
                    <p className="text-lg font-bold text-amber-400">{contentFlowStats.completedDays}</p>
                    <p className="text-xs text-gray-400">Completed</p>
                  </div>
                  <div className="text-center p-2 bg-gray-800/50 rounded-lg">
                    <p className="text-lg font-bold text-green-400">{contentFlowStats.totalTokensEarned}</p>
                    <p className="text-xs text-gray-400">Tokens</p>
                  </div>
                  <div className="text-center p-2 bg-gray-800/50 rounded-lg">
                    <p className="text-lg font-bold text-orange-400">{contentFlowStats.currentStreak}</p>
                    <p className="text-xs text-gray-400">Streak</p>
                  </div>
                  <div className="text-center p-2 bg-gray-800/50 rounded-lg">
                    <p className="text-lg font-bold text-purple-400">{Math.round((contentFlowStats.completedDays / 44) * 100)}%</p>
                    <p className="text-xs text-gray-400">Progress</p>
                  </div>
                </div>
              )}

              {/* Today's Lesson Card */}
              {todaysLesson ? (
                <Card className="bg-gray-800/70 border-amber-500/20 mb-4">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-xs">
                            Day {todaysLesson.dayNumber}
                          </Badge>
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                            +{todaysLesson.tokenReward} tokens
                          </Badge>
                        </div>
                        <h4 className="font-semibold text-white mb-1">{todaysLesson.title}</h4>
                        <p className="text-sm text-gray-400 mb-2">{todaysLesson.tradingTopic}</p>
                        <p className="text-xs text-amber-400/80 italic">{todaysLesson.scriptureReference}</p>
                      </div>
                      <Link href={`/ambassador/content-flow/day/${todaysLesson.dayNumber}`}>
                        <Button size="sm" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
                          <Sparkles className="w-4 h-4 mr-1" />
                          Start
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-gray-800/70 border-gray-700 mb-4">
                  <CardContent className="p-4 text-center">
                    <p className="text-gray-400">Loading today's lesson...</p>
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  AI-generated social content with trading + biblical wisdom
                </p>
                <Link href="/ambassador/content-flow">
                  <Button variant="outline" size="sm" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                    View Full Calendar
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Success Metrics & Ideal Candidate */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-purple-400" />
                Success Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {successMetrics.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-200">{item.metric}</h4>
                    <p className="text-sm text-gray-400">{item.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-3">
                <Star className="w-6 h-6 text-yellow-400" />
                Ideal Candidate Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {idealCandidateTraits.map((trait, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-gray-400">
                    <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    {trait}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Compensation Section */}
        <Card className="mb-8 bg-gradient-to-r from-green-900/30 to-gray-900 border-green-500/30">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <Award className="w-6 h-6 text-green-400" />
              Compensation & Perks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-gray-800/50 rounded-lg">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-400" />
                </div>
                <h4 className="font-semibold text-gray-200 mb-1">Base Compensation</h4>
                <p className="text-sm text-gray-400">{compensationInfo.base}</p>
              </div>
              <div className="text-center p-4 bg-gray-800/50 rounded-lg">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Target className="w-6 h-6 text-amber-400" />
                </div>
                <h4 className="font-semibold text-gray-200 mb-1">Performance Incentives</h4>
                <p className="text-sm text-gray-400">{compensationInfo.incentives}</p>
              </div>
              <div className="text-center p-4 bg-gray-800/50 rounded-lg">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-purple-400" />
                </div>
                <h4 className="font-semibold text-gray-200 mb-1">Additional Perks</h4>
                <ul className="text-sm text-gray-400">
                  {compensationInfo.perks.map((perk, idx) => (
                    <li key={idx}>• {perk}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-8" />
        
        <h2 id="training-modules" className="text-2xl font-bold mb-6 flex items-center gap-3">
          <GraduationCap className="w-7 h-7 text-amber-400" />
          Training Modules
        </h2>

        <div className="grid lg:grid-cols-4 gap-6 mb-8">
          <Card className="lg:col-span-1 bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-amber-400" />
                Your Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">Overall Progress</span>
                    <span className="text-amber-400">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
                <div className="text-sm text-gray-400">
                  {completedLessons.size} of {totalLessons} lessons completed
                </div>
                {isComplete && (
                  <Button 
                    onClick={() => setShowCertificate(true)}
                    className="w-full bg-amber-600 hover:bg-amber-700"
                    data-testid="button-view-certificate"
                  >
                    <Trophy className="w-4 h-4 mr-2" />
                    View Certificate
                  </Button>
                )}
              </div>
              <Separator className="my-4" />
              <div className="space-y-2">
                {trainingModules.map((module) => {
                  const moduleLessons = module.lessons.length;
                  const moduleCompleted = module.lessons.filter(l => completedLessons.has(l.id)).length;
                  const isModuleComplete = moduleCompleted === moduleLessons;
                  
                  return (
                    <button
                      key={module.id}
                      onClick={() => setActiveModule(module.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                        activeModule === module.id 
                          ? 'bg-amber-500/20 text-amber-400' 
                          : 'text-gray-400 hover:text-white hover:bg-gray-800'
                      }`}
                      data-testid={`nav-module-${module.id}`}
                    >
                      {isModuleComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                      <span className="flex-1 truncate">{module.title}</span>
                      <span className="text-xs opacity-60">{moduleCompleted}/{moduleLessons}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-3">
            {currentModule && (
              <Card className="bg-gray-900/50 border-gray-800">
                {currentModule.image && (
                  <div className="relative h-48 overflow-hidden rounded-t-lg">
                    <img 
                      src={currentModule.image} 
                      alt={currentModule.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 to-transparent" />
                  </div>
                )}
                <CardHeader className={currentModule.image ? '-mt-16 relative z-10' : ''}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center backdrop-blur-sm">
                      <currentModule.icon className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-xl" data-testid={`text-module-${currentModule.id}`}>
                        {currentModule.title}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {currentModule.duration}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {currentModule.lessons.map((lesson, idx) => {
                    const isLessonComplete = completedLessons.has(lesson.id);
                    const isExpanded = expandedLesson === lesson.id;
                    const hasQuiz = !!lesson.quiz;
                    const quizPassed = hasQuiz && quizAnswers[lesson.id] === lesson.quiz?.correct;

                    return (
                      <Card 
                        key={lesson.id}
                        className={`border transition-colors ${
                          isLessonComplete 
                            ? 'bg-green-500/10 border-green-500/30' 
                            : 'bg-gray-800/50 border-gray-700'
                        }`}
                      >
                        <CardHeader 
                          className="cursor-pointer"
                          onClick={() => setExpandedLesson(isExpanded ? null : lesson.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {isLessonComplete ? (
                                <CheckCircle2 className="w-5 h-5 text-green-400" />
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-gray-600 flex items-center justify-center text-xs">
                                  {idx + 1}
                                </div>
                              )}
                              <CardTitle className="text-base">{lesson.title}</CardTitle>
                            </div>
                            <ChevronRight className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>
                        </CardHeader>
                        {isExpanded && (
                          <CardContent className="pt-0">
                            <div className="space-y-4">
                              <div>
                                <h4 className="font-medium mb-2 text-gray-300">Key Points:</h4>
                                <ul className="space-y-2">
                                  {lesson.content.map((point, pIdx) => (
                                    <li key={pIdx} className="flex items-start gap-2 text-gray-400">
                                      <ChevronRight className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
                                      {point}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              {lesson.keyPoints && lesson.keyPoints.length > 0 && (
                                <KeyPointCarousel keyPoints={lesson.keyPoints} />
                              )}

                              {lesson.realWorldExamples && lesson.realWorldExamples.length > 0 && (
                                <div className="space-y-3">
                                  <h4 className="font-medium text-gray-300 flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-blue-400" />
                                    Real-World Examples
                                  </h4>
                                  {lesson.realWorldExamples.map((example, eIdx) => (
                                    <RealWorldExampleCard key={eIdx} example={example} />
                                  ))}
                                </div>
                              )}

                              {(lesson.DiagramComponent || lesson.image) && (
                                <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                                  <h4 className="font-medium mb-3 text-gray-300 flex items-center gap-2">
                                    <Camera className="w-4 h-4 text-green-400" />
                                    Pattern Example
                                  </h4>
                                  {lesson.DiagramComponent ? (
                                    <div className="w-full rounded-lg border border-gray-600 shadow-lg overflow-hidden">
                                      <lesson.DiagramComponent />
                                    </div>
                                  ) : lesson.image ? (
                                    <img 
                                      src={lesson.image} 
                                      alt={lesson.imageAlt || 'Chart pattern example'} 
                                      className="w-full rounded-lg border border-gray-600 shadow-lg"
                                    />
                                  ) : null}
                                  {lesson.imageAlt && (
                                    <p className="text-sm text-gray-500 mt-2 text-center italic">{lesson.imageAlt}</p>
                                  )}
                                </div>
                              )}

                              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                                <h4 className="font-medium mb-2 text-amber-400 flex items-center gap-2">
                                  <Lightbulb className="w-4 h-4" />
                                  Ambassador Tips
                                </h4>
                                <ul className="space-y-1">
                                  {lesson.tips.map((tip, tIdx) => (
                                    <li key={tIdx} className="text-sm text-amber-200/80">
                                      • {tip}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              {lesson.guideLink && (
                                <Link href={`/user-guide#${lesson.guideLink.section}`}>
                                  <div className="bg-blue-600/20 border border-blue-500/40 rounded-lg p-3 flex items-center gap-3 hover:bg-blue-600/30 transition-colors cursor-pointer">
                                    <BookOpen className="w-5 h-5 text-blue-400" />
                                    <span className="text-blue-300 font-medium">{lesson.guideLink.text}</span>
                                    <ChevronRight className="w-4 h-4 text-blue-400 ml-auto" />
                                  </div>
                                </Link>
                              )}

                              {lesson.quiz && (
                                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                                  <h4 className="font-medium mb-3 text-blue-400 flex items-center gap-2">
                                    <Award className="w-4 h-4" />
                                    Quick Quiz
                                  </h4>
                                  <p className="text-gray-300 mb-3">{lesson.quiz.question}</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {lesson.quiz.options.map((option, oIdx) => {
                                      const isSelected = quizAnswers[lesson.id] === oIdx;
                                      const isCorrect = oIdx === lesson.quiz?.correct;
                                      const showResult = quizAnswers[lesson.id] !== undefined;

                                      return (
                                        <Button
                                          key={oIdx}
                                          variant="outline"
                                          onClick={() => handleQuizAnswer(lesson.id, oIdx, lesson.quiz!.correct)}
                                          disabled={showResult}
                                          className={`justify-start ${
                                            showResult && isCorrect 
                                              ? 'border-green-500 bg-green-500/20 text-green-400' 
                                              : showResult && isSelected && !isCorrect
                                                ? 'border-red-500 bg-red-500/20 text-red-400'
                                                : ''
                                          }`}
                                          data-testid={`quiz-option-${lesson.id}-${oIdx}`}
                                        >
                                          {option}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {!isLessonComplete && (!hasQuiz || quizPassed) && (
                                <Button
                                  onClick={() => markLessonComplete(lesson.id)}
                                  className="w-full bg-green-600 hover:bg-green-700"
                                  data-testid={`button-complete-${lesson.id}`}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-2" />
                                  Mark as Complete
                                </Button>
                              )}

                              {!isLessonComplete && hasQuiz && !quizPassed && (
                                <p className="text-sm text-gray-400 text-center">
                                  Complete the quiz above to mark this lesson as done
                                </p>
                              )}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-2">
                <Share2 className="w-6 h-6 text-blue-400" />
              </div>
              <CardTitle>Social Media Assets</CardTitle>
              <CardDescription>Ready-to-use promotional materials</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Branded graphics & templates
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Caption templates
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Hashtag lists
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" disabled={!isComplete}>
                {isComplete ? 'Access Assets' : 'Complete Training First'}
              </Button>
            </CardFooter>
          </Card>

          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mb-2">
                <TrendingUp className="w-6 h-6 text-green-400" />
              </div>
              <CardTitle>Referral Benefits</CardTitle>
              <CardDescription>Earn while promoting</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Earn credits per referral
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Recurring commissions
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Exclusive ambassador perks
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/social-hub" className="w-full">
                <Button variant="outline" className="w-full">
                  View Referral Program
                </Button>
              </Link>
            </CardFooter>
          </Card>

          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-2">
                <Globe className="w-6 h-6 text-purple-400" />
              </div>
              <CardTitle>Community Support</CardTitle>
              <CardDescription>Connect with other ambassadors</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Private ambassador group
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Monthly strategy calls
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Direct support channel
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" disabled={!isComplete}>
                {isComplete ? 'Join Community' : 'Complete Training First'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {showCertificate && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <Card className="max-w-3xl w-full bg-gradient-to-br from-amber-900/50 to-gray-900 border-amber-500/50 my-8">
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Trophy className="w-10 h-10 text-amber-400" />
                  </div>
                  <Badge className="mb-4 bg-amber-500/20 text-amber-400 border-amber-500/30">
                    Certificate of Completion
                  </Badge>
                  <h2 className="text-3xl font-bold mb-2">Congratulations!</h2>
                  <p className="text-xl text-gray-300 mb-2">{user?.fullName || user?.username || 'Trader'}</p>
                  <p className="text-sm italic text-amber-400/80">Vous Etes Des Dieux</p>
                </div>

                {certification ? (
                  <>
                    <div className="bg-gray-800/50 rounded-lg p-4 mb-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-amber-400">{certification.modulesCompleted}</div>
                          <div className="text-xs text-gray-400">Modules</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-amber-400">{certification.finalScore}%</div>
                          <div className="text-xs text-gray-400">Score</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-amber-400">{certification.veddTokenBalance}</div>
                          <div className="text-xs text-gray-400">VEDD Tokens</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-400">
                            <Shield className="w-6 h-6 inline" />
                          </div>
                          <div className="text-xs text-gray-400">Verified</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 mb-6">
                      <div className="flex items-center justify-between bg-gray-800/30 rounded-lg p-3">
                        <div>
                          <div className="text-sm text-gray-400">Certificate Number</div>
                          <div className="font-mono text-amber-400">{certification.certificateNumber}</div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={copyVerificationLink}
                          className="gap-2"
                        >
                          <Copy className="w-4 h-4" />
                          Copy Link
                        </Button>
                      </div>

                      {certification.certificateImageUrl && (
                        <div className="text-center">
                          <img 
                            src={certification.certificateImageUrl} 
                            alt="Certificate" 
                            className="max-w-full rounded-lg border border-amber-500/30 mx-auto"
                            style={{ maxHeight: '200px' }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 gap-2"
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = certification.certificateImageUrl!;
                              link.download = `VEDD-Ambassador-${certification.certificateNumber}.png`;
                              link.click();
                            }}
                          >
                            <Download className="w-4 h-4" />
                            Download Certificate
                          </Button>
                        </div>
                      )}
                    </div>

                    <Separator className="my-6" />

                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-purple-400" />
                        NFT & Token Rewards
                      </h3>

                      {!certification.solanaWalletAddress ? (
                        <div className="bg-purple-900/20 rounded-lg p-4 border border-purple-500/30">
                          <p className="text-sm text-gray-400 mb-3">
                            Connect your Solana wallet to receive your Ambassador NFT and claim your VEDD tokens.
                          </p>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Enter Solana wallet address..."
                              value={walletAddress}
                              onChange={(e) => setWalletAddress(e.target.value)}
                              className="flex-1"
                            />
                            <Button 
                              onClick={handleConnectWallet}
                              disabled={connectWalletMutation.isPending}
                              className="bg-purple-600 hover:bg-purple-700"
                            >
                              {connectWalletMutation.isPending ? 'Connecting...' : 'Connect'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between bg-green-900/20 rounded-lg p-3 border border-green-500/30">
                            <div>
                              <div className="text-sm text-gray-400">Connected Wallet</div>
                              <div className="font-mono text-sm text-green-400 truncate max-w-xs">
                                {certification.solanaWalletAddress}
                              </div>
                            </div>
                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <Card className="bg-gray-800/50 border-gray-700">
                              <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <Coins className="w-5 h-5 text-amber-400" />
                                  <span className="font-semibold">VEDD Tokens</span>
                                </div>
                                <div className="text-2xl font-bold text-amber-400 mb-2">
                                  {certification.veddTokenBalance}
                                </div>
                                {certification.veddTokenClaimed ? (
                                  <Badge variant="outline" className="text-green-400 border-green-500/30">
                                    Claimed
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    onClick={() => claimTokensMutation.mutate()}
                                    disabled={claimTokensMutation.isPending}
                                    className="w-full bg-amber-600 hover:bg-amber-700"
                                  >
                                    {claimTokensMutation.isPending ? 'Claiming...' : 'Claim Tokens'}
                                  </Button>
                                )}
                              </CardContent>
                            </Card>

                            <Card className="bg-gray-800/50 border-gray-700">
                              <CardContent className="p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <Sparkles className="w-5 h-5 text-purple-400" />
                                  <span className="font-semibold">NFT Certificate</span>
                                </div>
                                {certification.nftMintAddress ? (
                                  <>
                                    <div className="text-sm text-gray-400 mb-2">Minted</div>
                                    <a
                                      href={`https://solscan.io/token/${certification.nftMintAddress}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-purple-400 hover:text-purple-300 text-sm flex items-center gap-1"
                                    >
                                      View on Solscan
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </>
                                ) : (
                                  <>
                                    <div className="text-sm text-gray-400 mb-2">Coming Soon</div>
                                    <Badge variant="outline" className="text-gray-400 border-gray-500/30">
                                      Pending Mint
                                    </Badge>
                                  </>
                                )}
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center">
                    <p className="text-gray-400 mb-6">
                      You have completed all training modules! Claim your digital certificate and NFT now.
                    </p>
                    <Button
                      onClick={handleClaimCertification}
                      disabled={issueCertificationMutation.isPending || !isComplete}
                      className="bg-amber-600 hover:bg-amber-700 gap-2"
                    >
                      {issueCertificationMutation.isPending ? (
                        'Issuing Certificate...'
                      ) : (
                        <>
                          <Award className="w-5 h-5" />
                          Claim Ambassador Certification
                        </>
                      )}
                    </Button>
                  </div>
                )}

                <div className="flex gap-4 justify-center mt-6">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowCertificate(false)}
                    data-testid="button-close-certificate"
                  >
                    Close
                  </Button>
                  <Link href="/social-hub">
                    <Button className="bg-amber-600 hover:bg-amber-700">
                      Start Promoting
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
