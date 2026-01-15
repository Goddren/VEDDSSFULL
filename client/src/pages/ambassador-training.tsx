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
  Download
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';

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
        id: 'ta-1',
        title: 'Candlestick Patterns',
        content: [
          'Doji: A candle with nearly equal open/close prices - signals indecision and potential reversal',
          'Hammer/Hanging Man: Small body with long lower wick - hammer is bullish at bottoms, hanging man is bearish at tops',
          'Engulfing: Large candle completely covers previous candle - bullish engulfing signals upward reversal, bearish signals downward',
          'Morning/Evening Star: Three-candle reversal pattern - morning star is bullish, evening star is bearish',
          'Spinning Top: Small body with wicks on both sides - indicates market indecision'
        ],
        tips: [
          'Always explain these patterns in simple terms for beginners',
          'Show real examples from AI Trading Vault analysis in your content'
        ]
      },
      {
        id: 'ta-2',
        title: 'Chart Patterns',
        content: [
          'Head and Shoulders: Three peaks with middle highest - signals trend reversal from bullish to bearish',
          'Inverse Head and Shoulders: Three troughs with middle lowest - signals reversal from bearish to bullish',
          'Double Top/Bottom: Price hits same level twice then reverses - double top is bearish, double bottom is bullish',
          'Triangle (Ascending/Descending/Symmetrical): Price consolidates before breakout - direction depends on pattern type',
          'Flag/Pennant: Brief consolidation after strong move - typically signals continuation of the trend',
          'Cup and Handle: Rounded bottom followed by small pullback - bullish continuation pattern',
          'Wedge (Rising/Falling): Converging trendlines - rising wedge is bearish, falling wedge is bullish'
        ],
        tips: [
          'Use visual diagrams when explaining these patterns',
          'Emphasize that AI Trading Vault automatically identifies these for users'
        ],
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
        ]
      },
      {
        id: 'ta-4',
        title: 'Technical Indicators',
        content: [
          'RSI (Relative Strength Index): Measures momentum 0-100 - above 70 is overbought (potential sell), below 30 is oversold (potential buy)',
          'MACD (Moving Average Convergence Divergence): Shows trend direction and momentum - crossovers signal potential trades',
          'Moving Averages (SMA/EMA): Smooths price data to show trend - price above MA is bullish, below is bearish',
          'Bollinger Bands: Volatility indicator - price touching upper band may be overbought, lower band may be oversold',
          'Volume: Confirms price moves - high volume validates breakouts, low volume suggests weak moves',
          'ATR (Average True Range): Measures volatility - helps set appropriate stop-loss distances'
        ],
        tips: [
          'Explain indicators in plain language without jargon',
          'Show how AI Trading Vault combines multiple indicators for better signals'
        ],
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
        
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
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
