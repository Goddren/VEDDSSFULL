import { useState } from 'react';
import {
  BookOpen,
  Upload,
  BarChart2,
  Zap,
  Store,
  Share2,
  Users,
  Trophy,
  Bell,
  CreditCard,
  Shield,
  Cpu,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Search,
  Play,
  Camera,
  TrendingUp,
  Calendar,
  MessageSquare,
  Settings,
  Star,
  Code2,
  ShieldCheck,
  Bot,
  Wallet,
  Coins,
  Heart,
  Globe,
  Layers,
  Target,
  ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Link } from 'wouter';

interface GuideSection {
  id: string;
  title: string;
  icon: typeof BookOpen;
  description: string;
  content: {
    heading: string;
    steps: string[];
    tips?: string[];
  }[];
}

const guideSections: GuideSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Play,
    description: 'Learn the basics of using VEDD for your trading analysis',
    content: [
      {
        heading: 'Creating Your Account',
        steps: [
          'Visit the VEDD homepage and click "Get Started"',
          'Fill in your username, email, and create a secure password',
          'You\'re in immediately — no email verification step',
          'Connect your MT5 or TradeLocker account to start seeing live AI signals'
        ],
        tips: ['Use a password with at least 6 characters', 'Your username will be visible to other traders in the community']
      },
      {
        heading: 'Navigating the Dashboard',
        steps: [
          'After logging in, you\'ll see your personal dashboard',
          'View your recent analyses and trading statistics',
          'Access the economic calendar for upcoming market events',
          'Get personalized tips from the AI Trading Coach'
        ]
      }
    ]
  },
  {
    id: 'chart-analysis',
    title: 'Chart Analysis',
    icon: BarChart2,
    description: 'Upload and analyze trading charts with AI-powered insights',
    content: [
      {
        heading: 'Uploading a Chart',
        steps: [
          'Go to the Analysis page from the navigation menu',
          'Click "Upload Chart" or drag and drop your chart image',
          'Supported formats: PNG, JPG, JPEG (max 10MB)',
          'You can upload charts from MT4, MT5, TradingView, or TradeLocker'
        ],
        tips: ['Ensure your chart shows clear price action and indicators', 'Include relevant timeframes in the screenshot']
      },
      {
        heading: 'Understanding Your Analysis Results',
        steps: [
          'Trend Direction: Shows if the market is bullish, bearish, or ranging',
          'Pattern Recognition: Identifies chart patterns like head & shoulders, flags, etc.',
          'Entry/Exit Points: Suggested entry, stop loss, and take profit levels',
          'Risk/Reward Ratio: Calculates the potential reward vs risk',
          'Confidence Score: AI confidence level in the analysis'
        ]
      },
      {
        heading: 'Multi-Timeframe Analysis',
        steps: [
          'Upload charts from multiple timeframes (M15, H1, H4, D1)',
          'Experience the immersive full-page processing view with animated progress steps',
          'The AI synthesizes signals across all timeframes in real-time',
          'Read the Daily Scripture devotion while AI processes your charts',
          'Receive a consolidated trading recommendation',
          'Generate EA code based on the combined analysis'
        ],
        tips: ['The processing view shows 6 steps: chart processing, timeframe analysis, pattern cross-referencing, AI synthesis, signal merging, and unified signal generation']
      }
    ]
  },
  {
    id: 'ea-generation',
    title: 'EA Code Generation',
    icon: Zap,
    description: 'Create Expert Advisors from your analysis',
    content: [
      {
        heading: 'Generating EA Code',
        steps: [
          'Complete a chart analysis first',
          'Click "Generate EA" on your analysis results',
          'Choose your platform: MT5, TradingView, or TradeLocker',
          'The AI creates ready-to-use trading code'
        ],
        tips: ['Always backtest generated EAs before live trading', 'Customize risk parameters to match your trading style']
      },
      {
        heading: 'Managing Your EAs',
        steps: [
          'Access "My EAs" from the navigation menu',
          'View, edit, or delete your saved EAs',
          'Download EA code for use on your trading platform',
          'Use "Live AI Refresh" to update EAs with current market data'
        ]
      },
      {
        heading: 'MT5 Chart Data EA for Live AI Refresh',
        steps: [
          'Visit the dedicated MT5 Chart Data EA page at /mt5-chart-data for full setup',
          'Create an API token on the page (or use existing one from Trade Copier)',
          'Download the Chart Data EA (v3.60) and install in MT5: File → Open Data Folder → MQL5 → Experts',
          'Enable WebRequest: Tools → Options → Expert Advisors → Allow WebRequest',
          'Configure the EA with your API URL and token, then attach to any chart',
          'Enable Multi-Timeframe Analysis for M5, M15, H1, H4, D1, and W1 data collection',
          'The EA sends live OHLCV data and indicators every 60 seconds',
          'When 60%+ of timeframes align, AI confidence gets a +10% boost!',
          'View Connected Pairs on the Dashboard sidebar to monitor all active MT5 connections'
        ],
        tips: ['Enable Multi-Timeframe for stronger signals', 'M5 and W1 are ideal for scalping and swing trading respectively', 'Visit /mt5-chart-data for the complete setup guide', 'Connected Pairs shows hourly breakout levels and volume data']
      },
      {
        heading: 'Trading Hours Filter (UTC)',
        steps: [
          'Enable "Use Trading Hours Filter" to restrict when the EA trades',
          'Set Start and End hours in UTC (e.g., 8-20 for London/NY session overlap)',
          'Configure which days of the week to allow trading (Sunday through Saturday)',
          'The EA will only execute trades within your specified hours',
          'Useful for avoiding low-liquidity overnight sessions'
        ],
        tips: ['UTC 8-20 covers both London and New York sessions', 'Disable Sunday and Saturday for Forex trading', 'Overnight sessions can be enabled for specific strategies']
      },
      {
        heading: 'Allowed Chart Timeframes vs AI Analysis Timeframes',
        steps: [
          'ANALYZE_* settings control which timeframes send data to AI for analysis (M5, M15, H1, H4, D1, W1)',
          'TRADE_ON_* settings control which chart timeframes are allowed to execute trades (M1 through W1)',
          'Example: Analyze H1, H4, D1 for signals but only trade on M15 and M30 charts',
          'This allows higher timeframe trend analysis while executing on lower timeframes',
          'Separating these gives you full control over data collection vs execution'
        ],
        tips: ['Use higher timeframes for analysis (H1+) and lower timeframes for execution (M15-M30)', 'Disable M1 execution to avoid noise-based trades', 'W1 analysis is great for swing trading direction']
      },
      {
        heading: 'News-Aware Smart Trading (Expanded)',
        steps: [
          'The EA has 4 categories of news filtering controls:',
          '',
          '📊 IMPACT LEVEL FILTERS:',
          '  • Block on HIGH Impact News (NFP, FOMC - enabled by default)',
          '  • Block on MEDIUM Impact News (optional)',
          '  • Block on LOW Impact News (optional)',
          '',
          '⏰ TIMING SETTINGS:',
          '  • Minutes BEFORE News to stop trading (default: 30 min)',
          '  • Minutes AFTER News to resume trading (default: 15 min)',
          '  • Close open trades before news (optional safety feature)',
          '',
          '📈 SENTIMENT SETTINGS:',
          '  • Block on Conflicting Sentiment (news vs technical signal)',
          '  • Require Aligned News (only trade when news confirms signal)',
          '  • Min News Score (0-100 threshold for bullish news)',
          '  • Min Absolute Score (0-100, trades on BOTH +/- extremes)',
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
        tips: ['Start with HIGH impact blocking only, then add more as needed', 'The 30 min before / 15 min after timing works well for most traders', 'NFP and FOMC are the most market-moving events - keep those blocked', 'Check MT5 Experts tab to see news analysis in real-time']
      },
      {
        heading: 'Active Trade Management',
        steps: [
          'The EA (v3.60) actively manages open trades based on market conditions',
          'TRAILING STOP OPTIONS: Choose from 3 modes:',
          '  • Fixed: Trail by a set number of pips (default 15 pips)',
          '  • ATR-based: Trail using ATR multiplier for volatility-adjusted stops',
          '  • Breakeven + Trail: Move to breakeven first, then trail from there',
          'BREAKEVEN: Automatically move stop loss to entry + lock pips when in profit',
          'MOMENTUM MANAGEMENT: EA monitors RSI and MACD in real-time',
          '  • Closes long trades when RSI hits overbought (70+)',
          '  • Closes short trades when RSI hits oversold (30-)',
          '  • Detects MACD crossover reversals and exits in profit',
          'VOLUME MANAGEMENT: Optionally close trades when market volume drops',
          'All settings are configurable in the EA input parameters'
        ],
        tips: ['Start with conservative settings: 20 pip trail start, 15 pip distance', 'ATR-based trailing adapts to market volatility automatically', 'Momentum exits help lock in profits before reversals']
      },
      {
        heading: 'Connected Pairs Display',
        steps: [
          'View all your active MT5 connections on the Dashboard sidebar',
          'Each connected pair shows: Symbol, Current Price, Status (Live/Stale)',
          'Hourly Breakout Levels: High and Low for the current hour',
          'Volume Metrics: Current volume, Average volume, Volume ratio',
          'HIGH VOL badge appears when volume is 1.5x above average',
          'Broker info shows which MT5 account is connected',
          'Also visible on the MT5 Chart Data page (/mt5-chart-data)',
          'Data refreshes every 10 seconds while EA is connected'
        ],
        tips: ['Use breakout levels to identify intraday support/resistance', 'High volume often precedes significant price moves', 'Multiple pairs can connect simultaneously from different charts']
      },
      {
        heading: 'Market Open Breakout Strategy',
        steps: [
          'Automatically detects breakouts at the 3 major session opens: London, New York, and Tokyo',
          '',
          'SESSION OPEN TIMES & PRE-SESSION RANGES:',
          '  London: 7:00 AM UTC — scans midnight to 7 AM (7 hours lookback)',
          '  New York: 1:00 PM UTC — scans 7 AM to 1 PM (6 hours lookback)',
          '  Tokyo: 12:00 AM UTC — scans 9 PM to midnight (3 hours lookback)',
          '',
          'HOW IT WORKS:',
          '  1. Finds the highest high and lowest low from the pre-session period',
          '  2. Within the first 30 minutes of session open, checks if price broke above or below the range by 10%+',
          '  3. Rates breakout strength as Strong (+3 votes), Moderate (+2), or Weak (+1)',
          '  4. Volume confirmation (1.2x above average) adds +1 bonus vote',
          '',
          'LIVE STATUS (on MT5 Chart Data page):',
          '  Shows current server time, active breakout window, time remaining',
          '  Displays next session countdown when no window is active',
          '  Per-pair breakout detection results with direction, strength, and range levels',
          '',
          'PER-PAIR TOGGLES:',
          '  Each connected pair has its own on/off switch for breakout detection',
          '  Toggle switch appears next to each pair in the Live Breakout Status section',
          '  Disabled pairs skip breakout analysis in trade decisions (all other indicators still apply)',
          '  Default is ON for all pairs'
        ],
        tips: [
          'London and New York sessions typically have the strongest breakouts due to institutional volume',
          'Strong + Volume Confirmed breakouts are the highest probability setups',
          'Use per-pair toggles to disable breakout detection for pairs where sessions matter less (e.g., crypto)',
          'The number of candles scanned adjusts automatically based on your chart timeframe'
        ]
      }
    ]
  },
  {
    id: 'marketplace',
    title: 'EA Marketplace',
    icon: Store,
    description: 'Buy, sell, and discover trading strategies',
    content: [
      {
        heading: 'Discovering Strategies',
        steps: [
          'Browse the EA Marketplace from the navigation',
          'Filter by asset type, timeframe, or rating',
          'View performance statistics and user reviews',
          'Subscribe to strategies that match your trading style'
        ]
      },
      {
        heading: 'Publishing Your EAs',
        steps: [
          'Go to "My EAs" and select an EA to share',
          'Click "Share to Marketplace"',
          'Set your subscription price',
          'Add a description and performance notes',
          'Your EA becomes available for other traders to subscribe'
        ],
        tips: ['Provide detailed strategy descriptions to attract subscribers', 'Keep your EAs updated with market changes']
      }
    ]
  },
  {
    id: 'social-features',
    title: 'Social & Community',
    icon: Users,
    description: 'Connect with other traders and share insights',
    content: [
      {
        heading: 'Social Hub Features',
        steps: [
          'Follow traders whose strategies you admire',
          'Share your analyses to the community feed',
          'Like, comment, and save analyses from others',
          'Build your trading reputation and Trade Grade'
        ]
      },
      {
        heading: 'Sharing Analysis Cards',
        steps: [
          'Generate branded share cards from your analyses',
          'Cards include VEDD branding and key metrics',
          'Share directly to social media platforms',
          'Track engagement on your shared content'
        ]
      },
      {
        heading: 'Referral Program',
        steps: [
          'Find your unique referral code in the Social Hub',
          'Share your code with fellow traders',
          'Earn credits when they sign up and subscribe',
          'Use credits for premium features'
        ]
      }
    ]
  },
  {
    id: 'market-tools',
    title: 'Market Tools',
    icon: TrendingUp,
    description: 'Stay informed with real-time market insights',
    content: [
      {
        heading: 'News Sentiment Analysis',
        steps: [
          'View real-time financial news for your trading pairs',
          'AI analyzes news sentiment (Bullish/Bearish/Neutral)',
          'Receive trading signals based on news flow',
          'Filter news by symbol or impact level'
        ]
      },
      {
        heading: 'Economic Calendar',
        steps: [
          'View upcoming high-impact economic events',
          'See events 3-5 days ahead',
          'Understand potential market impact',
          'Plan trades around major announcements'
        ]
      },
      {
        heading: 'Volatility Meter',
        steps: [
          'Monitor current market volatility levels',
          'Adjust position sizes based on volatility',
          'Identify optimal trading windows'
        ]
      }
    ]
  },
  {
    id: 'achievements',
    title: 'Achievements & Progress',
    icon: Trophy,
    description: 'Track your trading journey and earn rewards',
    content: [
      {
        heading: 'Achievement System',
        steps: [
          'Complete analyses to earn achievement badges',
          'Level up your trader profile',
          'Unlock special features as you progress',
          'Compare your achievements with other traders'
        ]
      },
      {
        heading: 'Trade Grade',
        steps: [
          'Your Trade Grade reflects your analysis accuracy',
          'Improve by making successful predictions',
          'Higher grades increase visibility in the community',
          'Top traders get featured in the marketplace'
        ]
      }
    ]
  },
  {
    id: 'subscription',
    title: 'Subscription Plans',
    icon: CreditCard,
    description: 'Choose the right plan for your trading needs',
    content: [
      {
        heading: 'Plan Features',
        steps: [
          'Free Plan: Limited analyses per month',
          'Pro Plan: Unlimited analyses, EA generation',
          'Elite Plan: All features plus priority support',
          'Compare plans on the Subscription page'
        ]
      },
      {
        heading: 'Managing Your Subscription',
        steps: [
          'View current usage in the header bar',
          'Upgrade or downgrade anytime',
          'Payment processed securely through Stripe',
          'Cancel anytime with no hidden fees'
        ]
      }
    ]
  },
  {
    id: 'ai-provider-setup',
    title: 'AI Provider Setup',
    icon: Cpu,
    description: 'Choose and configure your AI model for chart analysis — from free Groq to premium GPT-4o',
    content: [
      {
        heading: 'Understanding AI Providers',
        steps: [
          'VEDD uses AI to analyze your charts — but which AI model it uses is up to you',
          'By default, the platform shares a built-in GPT-4o Mini key across all users',
          'Shared keys can hit rate limits during high-traffic periods (you\'ll see a 429 error)',
          'Adding your own AI key gives you dedicated capacity and lets you choose your preferred model',
          'Go to Profile → AI Provider Keys to manage your keys and model selection'
        ],
        tips: [
          'A 429 "rate limit" error means too many users are hitting the shared key at once — adding your own key fixes this permanently',
          'Your keys are stored encrypted and never shared with other users'
        ]
      },
      {
        heading: 'Budget Route — Free Groq Key + Qwen 3 VL',
        steps: [
          'Step 1: Visit console.groq.com and create a free account',
          'Step 2: Generate a new API key (starts with gsk_...)',
          'Step 3: On the AI Provider Keys page, click Add Provider → Groq ⚡',
          'Step 4: Paste your key and save',
          'Step 5: In the AI Agent selector on the same page, choose Qwen 3 VL (Budget)',
          'That\'s it — chart analysis now routes through your free Groq key first',
          'If Groq is temporarily rate-limited, the platform automatically falls back to GPT-4o Mini'
        ],
        tips: [
          'Groq keys are completely free — no credit card required',
          'Qwen 3 VL is a vision-capable model that reads your chart images accurately',
          'The automatic fallback to GPT-4o Mini means you always get an answer, even during Groq outages'
        ]
      },
      {
        heading: 'Premium Route — OpenAI Key + GPT-4o',
        steps: [
          'Step 1: Visit platform.openai.com and add billing to your account',
          'Step 2: Create an API key at platform.openai.com/api-keys',
          'Step 3: On the AI Provider Keys page, click Add Provider → OpenAI 🤖',
          'Step 4: Paste your key and save, then click Validate to confirm it works',
          'Step 5: In the AI Agent selector, choose GPT-4o (Premium)',
          'Chart analysis now uses GPT-4o — the highest accuracy vision model available'
        ],
        tips: [
          'GPT-4o has much higher rate limits than the shared platform key',
          'OpenAI charges per token — typical chart analysis costs fractions of a cent',
          'GPT-4o is the best choice for complex multi-timeframe chart analysis'
        ]
      },
      {
        heading: 'Economy Mode vs Model Selector',
        steps: [
          'Economy Mode (the Full Power / Economy toggle) controls ALL AI features platform-wide',
          'Economy mode routes every AI call — chart analysis, news sentiment, EA generation — to free Groq models',
          'The AI Agent model selector only controls chart analysis and second opinion features',
          'Using Economy Mode + your own Groq key = maximum cost savings across the entire platform',
          'Using Full Power + your own OpenAI key + GPT-4o = maximum accuracy for chart analysis',
          'You can mix: Economy Mode on (to save on text AI) while your model selector uses Qwen 3 VL (for vision)'
        ],
        tips: [
          'Economy Mode is a quick toggle — great for turning on during casual browsing and off for serious analysis sessions',
          'The Platform AI Cost Mode and the AI Agent selector are independent controls — both matter'
        ]
      }
    ]
  },
  {
    id: 'futures-trading',
    title: 'Futures Trading',
    icon: TrendingUp,
    description: 'Connect Tradovate, trade futures with prop firm rules, and generate NinjaTrader 8 strategies',
    content: [
      {
        heading: 'Connecting Your Tradovate Account',
        steps: [
          'Go to Futures Connect from the More menu in the header (or navigate to /futures-connect)',
          'Enter your Tradovate username and password — demo or live accounts are both supported',
          'Select your account type: Demo (paper trading) or Live',
          'Optionally select a Prop Firm Preset (Topstep, Apex, Bulenox, etc.) if you are trading a funded account',
          'Choose your account size — this auto-fills the correct daily loss limit for your prop firm',
          'Click Connect — VEDD verifies your credentials against the Tradovate API and fetches your account balance',
          'Once connected, your live account balance, open P&L, and closed P&L refresh automatically'
        ],
        tips: [
          'Use Demo mode first to verify the connection before switching to Live',
          'Your Tradovate password is encrypted (AES-256) before being stored — it is never stored in plain text',
          'If you see "Authentication failed", double-check you are using your Tradovate web login credentials, not an API key'
        ]
      },
      {
        heading: 'Prop Firm Drawdown Gauge',
        steps: [
          'When a prop firm preset is selected, the drawdown gauge appears below your account balance',
          'Three bars track the key risk limits in real time:',
          '  1. Trailing Drawdown Buffer — distance between your current equity and the trailing floor (floor moves with peak equity)',
          '  2. Daily Loss Budget — how much of today\'s daily loss limit you have used',
          '  3. Profit Target Progress — progress toward the account\'s required profit target',
          'SAFE (green): All limits have healthy headroom — normal trading',
          'WARNING (amber): Approaching a limit — reduce position size and trade cautiously',
          'DANGER (red): Very close to a breach — consider stopping for the day',
          'BREACHED (pulsing red): A rule has been violated — the account is at risk. Stop trading immediately',
          'The trailing drawdown floor moves UP when your peak equity increases — it never moves back down'
        ],
        tips: [
          'Topstep has the strictest trailing drawdown: once equity peaks, your floor is locked at peak − trailing limit',
          'Always check the drawdown gauge before placing a trade during a poor day',
          'The daily loss limit resets at midnight — the trailing drawdown does NOT reset'
        ]
      },
      {
        heading: 'Futures Instruments Reference',
        steps: [
          'VEDD supports 18 futures instruments across 4 asset classes:',
          'INDEX FUTURES: NQ (Nasdaq E-Mini $5/tick), MNQ (Micro Nasdaq $0.50/tick), ES (S&P E-Mini $12.50/tick), MES (Micro S&P $1.25/tick), YM (Dow E-Mini $5/tick), MYM (Micro Dow $0.50/tick), RTY (Russell E-Mini $5/tick), M2K (Micro Russell $0.50/tick)',
          'METALS: GC (Gold $10/tick at $0.10), MGC (Micro Gold $1/tick)',
          'ENERGY: CL (Crude Oil $10/tick at $0.01), MCL (Micro Crude $1/tick)',
          'BONDS: ZN (10-Year T-Note $15.625/tick), ZB (30-Year T-Bond $31.25/tick)',
          'OTHER: SI (Silver $25/tick), SIL (Micro Silver $12.50/tick), NG (Natural Gas $10/tick)',
          'Tick values shown above are per-tick dollar value — critical for position sizing and risk calculation',
          'Use the Contract Size Calculator on the Futures Connect page to calculate how many contracts to trade based on your account balance, risk %, entry, and stop loss'
        ],
        tips: [
          'Micro contracts (MNQ, MES, MYM, M2K, MGC, MCL) are 1/10th the size of their standard counterpart — ideal for small accounts and prop firm challenges',
          'Gold (GC) tick value is $10 per tick — one full point move = $100. Very different from forex pip values',
          'NQ moves fast — one 1-point move on NQ = $20. Always verify your stop loss distance in ticks before placing orders'
        ]
      },
      {
        heading: 'Executing Futures Trades via VEDD',
        steps: [
          'With an active Tradovate connection, go to Futures Connect → scroll to the Execute section',
          'Select your instrument (e.g., NQ), direction (Long/Short), and number of contracts',
          'Optionally set a stop loss price and take profit price',
          'VEDD runs a pre-flight drawdown check before every order — if your daily limit or trailing drawdown is too close, the trade is blocked with a clear message',
          'On success, the order is sent to Tradovate and logged in your trade history',
          'View all executed trades in the Trade History table on the Futures Connect page'
        ],
        tips: [
          'The pre-flight drawdown check uses your live account balance pulled fresh from Tradovate — not cached data',
          'Orders are market orders by default. Limit order support is planned for a future release',
          'Trade logs store: symbol, direction, contracts, stop loss, take profit, Tradovate order ID, and execution status'
        ]
      },
      {
        heading: 'Futures AI Live Feed',
        steps: [
          'Go to Futures Live Feed from the More menu (or navigate to /futures-live-feed)',
          'Click "Start Scanner" — the AI immediately begins scanning NQ, ES, YM, GC, CL and micro equivalents every 2 minutes',
          'Live signals appear in real time showing: symbol, BUY/SELL direction, confidence %, entry price, stop loss, take profit, and the AI\'s reasoning',
          'The Activity Log shows exactly what the scanner is doing at each step',
          'Symbol Performance cards track win rate and average confidence per instrument as the scanner learns',
          'If your daily prop firm loss limit is hit, the scanner automatically halts and displays a red warning banner',
          'Click "Stop" at any time to pause scanning — all signals and activity history remain visible'
        ],
        tips: [
          'Signals auto-refresh every 5 seconds — no need to manually reload the page',
          'High confidence signals (80%+) show a green badge, medium (65-79%) yellow, lower signals gray',
          'Use the Live Feed alongside the Futures Connect page to execute the signals that match your setup',
          'The scanner self-learns from recorded trade outcomes — use /api/tradovate/scanner/outcome to feed results back'
        ]
      },
      {
        heading: 'NinjaTrader 8 EA Generator',
        steps: [
          'Go to Futures EA Generator from the More menu (or /futures-ea-generator)',
          'Select your futures instrument (NQ, ES, YM, GC, CL, or any micro equivalent)',
          'Choose a strategy type: Day Trading, Scalping, Swing Trading, or News Breakout',
          'Set your trade parameters: contracts, ATR stop loss multiplier, risk:reward ratio',
          'Select your prop firm preset — daily loss limits are auto-filled based on your account size',
          'Toggle optional features: Trailing Stop (with configurable tick distance), Exit on Session Close, Both Long & Short entries',
          'Click "Download .cs File" — a complete C# NinjaScript strategy file downloads immediately',
          'The generated code includes: EMA 20/50, RSI 14, ATR 14, ADX 14 indicators, daily P&L circuit breaker, max trades per day guard, and full OnExecutionUpdate tracking'
        ],
        tips: [
          'The daily loss circuit breaker is embedded in OnBarUpdate — the strategy halts and flattens positions when the limit is hit',
          'NinjaScript uses Calculate.OnBarClose by default — suitable for most day trading and swing strategies',
          'Always test with NinjaTrader Simulation Mode first. Go to Accounts → Simulation in NT8 to paper trade'
        ]
      },
      {
        heading: 'Installing Your NinjaScript in NinjaTrader 8',
        steps: [
          'Open NinjaTrader 8 and connect to your data provider',
          'Go to: Tools → Edit NinjaScript → Strategy',
          'Click "New" and enter your strategy class name exactly as shown in the generator (e.g., VEDD_NQ_Strategy)',
          'Delete the default template code and paste the full contents of your downloaded .cs file',
          'Press F5 to compile — fix any errors (usually just namespace mismatches)',
          'Open a chart for your instrument (e.g., NQ 03-25, 5 Minute)',
          'Right-click the chart → Strategies → Add Strategy → select your strategy',
          'Configure parameters in the dialog: contracts, daily loss limit, ATR multiplier, R:R ratio',
          'Click OK — the strategy is now live on your chart. Monitor the strategy panel below the chart'
        ],
        tips: [
          'The strategy name in the NinjaScript dialog must exactly match the class name in the code',
          'For prop firm accounts: enable IsExitOnSessionCloseStrategy for Topstep (auto-set when Topstep preset is selected)',
          'NinjaTrader log output (Control Center → Log) shows real-time strategy messages including daily limit hits'
        ]
      }
    ]
  },
  {
    id: 'micro-growth',
    title: 'Micro Account Growth Engine',
    icon: TrendingUp,
    description: 'Higher-risk, concentrated-pair AI engine built to grow small FX accounts fast — separate from prop-firm accounts',
    content: [
      {
        heading: 'What This Engine Is For',
        steps: [
          'Micro Growth is purpose-built to grow SMALL accounts ($25–$500+) quickly using a higher risk tolerance than the standard SS AI Engine',
          'It concentrates risk into 1–2 pairs at a time instead of spreading across many pairs — concentration is what lets a small account compound fast',
          'It is intentionally HIGH RISK — this is the speed-focused engine, not the capital-preservation engine',
          'It is kept fully separate from Prop Firm Challenge accounts: if Prop Firm Mode is active on your SS AI Engine, Micro Growth refuses to dispatch signals to protect your funded account',
          'On weekends, when the FX market is closed, the engine automatically switches to crypto pairs (BTC, ETH, SOL, XRP vs. USD) so your account keeps working 7 days a week'
        ],
        tips: [
          'Use Micro Growth on a small standalone account, not your prop-firm or main funded account',
          'The higher risk-per-trade is the whole point — this is not the engine to run on capital you cannot afford to lose fast'
        ]
      },
      {
        heading: '7-Tier Scaling System',
        steps: [
          'Your tier is determined automatically by your entered account balance',
          'Tier 1 — $25–$49: 0.01 lots | 1 max trade | 3–5 pip target | 5 pip SL',
          'Tier 2 — $50–$99: 0.01 lots | 2 max trades | 4–6 pip target | 6 pip SL',
          'Tier 3 — $100–$149: 0.02 lots | 3 max trades | 5–8 pip target | 7 pip SL',
          'Tier 4 — $150–$249: 0.03 lots | 4 max trades | 6–10 pip target | 8 pip SL',
          'Tier 5 — $250–$349: 0.05 lots | 5 max trades | 8–12 pip target | 10 pip SL',
          'Tier 6 — $350–$499: 0.07 lots | 6 max trades | 10–13 pip target | 12 pip SL',
          'Tier 7 — $500+: 0.10 lots | 7 max trades | 12–15 pip target | 14 pip SL',
          'Each tier also sets a session duration (3–10 minutes) — sessions are short and focused, not all-day'
        ],
        tips: [
          'Re-enter your balance after wins/losses so the engine recalculates your correct tier before the next session',
          'As your balance crosses a tier threshold, lot size and max trades scale up automatically'
        ]
      },
      {
        heading: 'Choosing Pairs & Starting a Session',
        steps: [
          'Select 1–2 pairs to trade this session (hard cap — the picker will not let you select a 3rd)',
          'On weekdays, choose from FX pairs (EURUSD, GBPUSD, XAUUSD, US30, NAS100, USDJPY, GBPJPY)',
          'On weekends, FX pairs are grayed out and disabled — only the crypto pairs (BTCUSD, ETHUSD, SOLUSD, XRPUSD) are selectable',
          'Choose a Risk Mode — Conservative, Standard, or Aggressive — which shifts you toward the lower or upper end of your tier\'s pip target range',
          'Tap Start Session to begin — the timer and live signal panel activate for your tier\'s session duration'
        ],
        tips: [
          'Fewer pairs means sharper focus — the engine is designed around 1–2 pairs, not a wide watchlist',
          'The weekend crypto switch is automatic — you do not need to remember to change anything on a Saturday'
        ]
      },
      {
        heading: 'Reading the Live Signal Panel',
        steps: [
          'Each selected pair shows a Volume Profile (VP) read: current Price, POC (point of control), VAH, and VAL',
          'An order-type recommendation (Market / Stop Entry / Limit Entry) and direction (BUY/SELL) is derived from where price sits relative to the value area',
          'If your SS AI Engine is also running, a "🧠 SS Engine" bias line appears showing its live trend and RSI read for the same pair — this is a REAL signal pulled from your running SS Engine, not a duplicate calculation',
          'A green "✓ confirms VP signal" tag means the SS Engine and the VP signal agree on direction; an amber "⚠ diverges" tag means they disagree — treat divergence as a reason to wait',
          'If a pair shows "No data," your MT5 EA is not currently sending chart data for that symbol'
        ],
        tips: [
          'Signal agreement between VP and the SS Engine is the highest-confidence setup — that is when concentration pays off most',
          'Run your SS AI Engine alongside Micro Growth when possible so you get the confirmation layer, not just the VP read alone'
        ]
      }
    ]
  },
  {
    id: 'weekly-strategy',
    title: 'Weekly Strategy & SS AI Engine',
    icon: Bot,
    description: 'AI weekly trading plans, the autonomous SS AI Engine, and ORB breakout tracking',
    content: [
      {
        heading: 'Generating Your Weekly AI Plan',
        steps: [
          'Navigate to Weekly Strategy from the main menu',
          'Select your trading pairs (XAUUSD, GBPUSD, EURUSD, etc.)',
          'Enter your account balance (or use the Connected Account Picker to auto-fill from your live account)',
          'Select risk level: Conservative / Moderate / Aggressive',
          'Click "Generate Weekly Plan" — GPT-4o produces a full trading plan',
          'The plan includes: market direction, key pairs to watch, specific entry conditions, risk parameters, and recommended HFT mode',
          'Plans include weekly profit target, optimal trading days, and session-specific guidance',
          'Share your plan to X (Twitter), Facebook, or LinkedIn using the share icons'
        ],
        tips: [
          'Regenerate your plan every Monday to stay aligned with the week\'s market conditions',
          'Use the "What-If" tool to stress-test your plan\'s entry assumptions before committing'
        ]
      },
      {
        heading: 'SS AI Engine — Engine Configuration',
        steps: [
          'The SS AI Engine is the autonomous HFT engine that runs 18 strategies simultaneously',
          'Select your execution account using the Connected Account Picker at the top of the page',
          'The engine reads your live account balance and loads your saved per-account settings automatically',
          'Available engine modes: Scalping | Momentum Surfing | Session Breakout | Sniper | Aggressive Compound',
          'Set your weekly profit target — the engine\'s intensity scales based on distance to goal',
          'Set Direction Filter: Buy Only / Sell Only / Both',
          'Set Risk Per Trade %: default 1% of account balance',
          'Set Max Daily Trades: hard limit on trades per 24-hour window',
          'Set Stop-Order Price Levels: price thresholds that trigger or pause trading',
          'Click Start to activate — the engine scans every 60 seconds'
        ],
        tips: [
          'Start with paper mode to test the engine before connecting a live account',
          'Each connected account stores its own engine settings — switching accounts loads the correct settings automatically',
          'The Brain Enforcer pre-filters every trade using per-pair learned knowledge — losing-streak pairs are skipped automatically'
        ]
      },
      {
        heading: 'SS AI Engine — Phase System',
        steps: [
          'The engine operates through 6 goal phases that adjust lot sizes automatically:',
          'warming_up: conservative lots, building baseline confidence (start of week)',
          'building: slight increase as early wins confirm strategy is working',
          'accelerating: larger lots as the profit curve climbs toward target',
          'cruising: maintains pace when near target — no unnecessary risk',
          'pushing: final sprint to reach target by end of week',
          'target_reached: engine scales back to hold profit, avoids giving back gains',
          'The current phase and weekly progress are visible in real time on the engine panel'
        ],
        tips: [
          'The phase system prevents the common mistake of over-trading early, then revenge-trading to catch up',
          'Use the 5 trail stop methods (Parabolic SAR, Fixed Pip, Profit Lock %, Stepped Fixed, None) to protect open positions server-side'
        ]
      },
      {
        heading: 'Engine Backtest',
        steps: [
          'Click the "Backtest" button inside the Engine Configuration panel',
          'Select the pair to backtest (e.g., XAUUSD)',
          'Choose a lookback period: 30, 60, or 90 days of historical price data',
          'Click Run — VEDD replays price history through your current strategy settings',
          'Results show: simulated win rate, profit factor, max drawdown, total P&L',
          'Use backtest results to validate your configuration before switching from paper to live mode'
        ],
        tips: [
          'Always backtest before going live on a new pair or after changing strategy mode',
          'A profit factor above 1.5 with max drawdown below 15% is a healthy baseline to look for'
        ]
      },
      {
        heading: 'ORB (Opening Range Breakout) Panel',
        steps: [
          'The ORB panel tracks price relative to the opening range for your selected strategy pairs',
          'Each pair shows its current ORB phase: Pre-Market → Building → Range Set → Breakout Long / Short → Retest → Trade Taken → Window Closed',
          'Pre-Market Bias shows the AI\'s directional lean before the session opens',
          'The AI Score (via SS AI Bot) rates each pair\'s breakout setup quality in real time',
          'MT5 live price polling updates the phase automatically when your EA is connected',
          'Candlestick patterns (e.g., Bullish Engulfing, Doji) detected on the opening range are flagged per pair',
          'Use the ORB panel alongside Stop Orders to pre-set breakout entries before the session'
        ],
        tips: [
          'ORB setups are strongest on Monday and Tuesday when weekly ranges are being established',
          'A "Trade Taken" status on the ORB means a signal has been sent to the engine — no manual entry needed'
        ]
      }
    ]
  },
  {
    id: 'stop-orders',
    title: 'Stop Orders',
    icon: Target,
    description: 'Set pending breakout orders that trigger automatically when price reaches your level',
    content: [
      {
        heading: 'What Are Stop Orders?',
        steps: [
          'Stop Orders let you pre-set trades that execute automatically when price hits a specific level',
          'BUY STOP: triggers when price rises above your set level (used for bullish breakouts)',
          'SELL STOP: triggers when price falls below your set level (used for bearish breakouts)',
          'Orders remain pending until: (a) price hits the trigger level, (b) you cancel manually, or (c) the session closes',
          'The MT5 Chart Data EA sends live price ticks to VEDD — when a tick crosses your trigger, the order fires',
          'Perfect for session breakout trading without watching the charts'
        ],
        tips: [
          'Combine Stop Orders with the ORB panel: identify the opening range, then set your BUY STOP just above the high and SELL STOP just below the low',
          'Stop Orders work while you sleep — set them before the London open and let the system execute'
        ]
      },
      {
        heading: 'Creating a Stop Order',
        steps: [
          'Navigate to Stop Orders from the navigation menu',
          'Click "New Stop Order"',
          'Select Symbol (e.g., XAUUSD, GBPUSD)',
          'Select Direction: BUY STOP or SELL STOP',
          'Enter Trigger Price: the price level at which the order fires',
          'Enter Current Price: used for validation — prevents invalid orders (e.g., BUY STOP below current price)',
          'Set Lot Size',
          'Set Stop Loss price and Take Profit price',
          'Optionally add a Breakout Level Reference and Notes',
          'Click "Create Order" — the order enters PENDING status and monitoring begins'
        ],
        tips: [
          'Set your BUY STOP at least 5–10 pips above resistance to avoid being triggered by a fake breakout',
          'Always include a Stop Loss on every stop order — if the breakout fails, you need protection'
        ]
      },
      {
        heading: 'Managing and Tracking Orders',
        steps: [
          'The Stop Orders page shows tabs: All / Pending / Triggered / Cancelled — each with a count badge',
          'Pending orders show: symbol, direction, trigger price, distance to trigger (in pips), lot size, SL, TP',
          'The page auto-refreshes every 15 seconds — triggered orders surface quickly',
          'When an order triggers, its status changes to TRIGGERED and a timestamp is recorded',
          'Cancel any pending order with one click from the order card',
          'Triggered orders remain in history — review them to measure breakout effectiveness'
        ],
        tips: [
          'Review triggered orders weekly as part of your trading review — did the breakout follow through to TP, or did it reverse?',
          'Use the Notes field to log your reasoning: "London session range high was 2350 — setting BUY STOP at 2360 with volume confirmation"'
        ]
      }
    ]
  },
  {
    id: 'solana-scanner',
    title: 'Solana Token Scanner',
    icon: Zap,
    description: 'AI-powered crypto scanner with live Phantom wallet integration and autonomous trading',
    content: [
      {
        heading: 'Understanding the Scanner',
        steps: [
          'Navigate to Solana Scanner from the main menu',
          'The scanner monitors tokens across 5 major Solana DEXes: Raydium, Orca, Meteora, Pump.fun, Jupiter',
          'For each token, AI scores: social sentiment, tokenomics quality, whale wallet activity, volume trends, price momentum',
          'Signal ratings: STRONG_BUY / BUY / HOLD / SELL / STRONG_SELL with a confidence percentage',
          'Each token card shows: entry price, price target, stop loss, recommended hold duration, and risk level',
          'Filter tokens by DEX source: All / Raydium / Orca / Meteora / Pumpfun / Jupiter',
          'Enable the bell icon on any token to receive browser notifications for signal changes'
        ],
        tips: [
          'Start with Paper Trading mode — all real-time data, zero risk. Build confidence before going live',
          'Risk Level indicators (Low / Medium / High / Extreme) are the fastest way to filter out tokens that don\'t match your tolerance'
        ]
      },
      {
        heading: 'Connecting Phantom Wallet',
        steps: [
          'Desktop: install the Phantom browser extension from phantom.app, then click "Connect Phantom" on the scanner',
          'Mobile: open the Solana Scanner page inside the Phantom app\'s built-in browser',
          'Once connected, your real SOL balance is displayed in the header',
          'Connecting your wallet enables one-click buying of tokens via Jupiter DEX at best available swap rates',
          'Your portfolio value auto-fills the scanner\'s position sizer for risk calculations'
        ],
        tips: [
          'NEVER share your seed phrase or private key with anyone — VEDD never asks for them',
          'Use a separate trading wallet (funded with only what you are willing to risk) rather than your main wallet'
        ]
      },
      {
        heading: 'Sol Engine Risk Controls',
        steps: [
          'Open the Settings tab inside the Solana Scanner to access the 4 risk controls:',
          'Direction Filter: Buy Only — only enter LONG positions on BUY signals | Sell Only — only enter on SELL signals | Both — trade both directions',
          'Risk Per Trade %: cap the SOL amount per trade as a percentage of your portfolio (e.g., 5% = 0.05 SOL per trade on a 1 SOL portfolio)',
          'Max Daily Trades: hard limit on positions the scanner can open per 24-hour window — prevents FOMO over-trading',
          'Stop-Order Price Floor: if SOL price drops below this level, the engine pauses all new entries (acts as a portfolio circuit breaker)',
          'All four controls work independently and stack together for layered protection'
        ],
        tips: [
          'In a confirmed bull market, set Direction Filter to "Buy Only" to ignore SELL signals that fight the trend',
          'Max Daily Trades of 3–5 is a good starting point — forces selectivity rather than trading every signal',
          'The Stop-Order Price Floor is your emergency brake — set it at a level where you would want to reassess the market'
        ]
      },
      {
        heading: 'Auto-Trade & Auto-Rebalance',
        steps: [
          'Auto-Trade mode automatically buys tokens when strong buy signals appear',
          'Configure: trade amount in SOL, take profit %, and stop loss % per trade',
          'Auto-Rebalance sells underperforming tokens and replaces them with higher-confidence signals',
          'Set a Rebalance Threshold (e.g., -10%) — any token below this is eligible for replacement',
          'Pump/Dump Protection monitors for rapid price drops and auto-exits before major losses',
          'All auto-trade activity appears in the My Trades tab with full AI reasoning'
        ],
        tips: [
          'Start with small trade amounts (0.05–0.1 SOL) to test Auto-Trade behavior before scaling up',
          'Auto-Rebalance is powerful but aggressive — start with a wide threshold (-20%) until you understand the pace'
        ]
      },
      {
        heading: 'Wallet Monitoring & Sell Signals',
        steps: [
          'The scanner monitors ALL tokens in your connected Phantom wallet — not just AI-purchased ones',
          'AI analyzes each wallet token for sell signals every 60 seconds when monitoring is enabled',
          'Color-coded badges appear next to each token showing BUY/SELL signal with confidence %',
          'SELL signals pulse red with animation to immediately draw attention',
          'Browser notifications fire when sell signals are detected for your holdings',
          'The "My Trades" tab shows AI reasoning, sparkline price charts, entry price, current price, and P&L % for every position'
        ],
        tips: [
          'Enable wallet monitoring even if you don\'t use Auto-Trade — the AI sell signals on your existing holdings are extremely valuable',
          'Sparkline charts in My Trades show price movement since your entry — a downward slope after a sell signal is your confirmation to exit'
        ]
      },
      {
        heading: 'Trade Performance & Social Sharing',
        steps: [
          'Each trade in the My Trades tab shows: live P&L %, entry vs current price, hold time, exit reason',
          'Exit reasons logged: take_profit / stop_loss / pump_detected / manual_sell',
          'Generate branded VEDD share cards for any trade — includes entry price, current price, P&L, and confidence score',
          'Share directly to Twitter or copy the link for other platforms',
          'AI reasoning is visible for every trade — see which factors (sentiment, whale activity, tokenomics) drove each decision'
        ],
        tips: [
          'Share winning trades with AI reasoning attached — it builds credibility by showing the logic, not just the result',
          'A "pump_detected" exit reason means the AI flagged suspicious price action and exited to protect profit'
        ]
      }
    ]
  },
  {
    id: 'webhooks',
    title: 'Webhooks & Automation',
    icon: Globe,
    description: 'Connect VEDD signals to any platform — TradeLocker, Telegram, Discord, or custom endpoints',
    content: [
      {
        heading: 'Setting Up a Webhook',
        steps: [
          'Navigate to Webhooks from the navigation menu (or /webhooks)',
          'Click "Create Webhook"',
          'Enter your endpoint URL (e.g., your TradeLocker webhook URL, a Telegram bot URL, or any HTTPS endpoint)',
          'Select the platform: TradeLocker / TradingView / Custom',
          'Choose trigger events: Chart Analysis Complete | AI Signal Generated | MT5 Trade Copied | Weekly Strategy Published | SS Engine Trade Opened | SS Engine Trade Closed',
          'Optionally add a Secret Key for payload signature verification',
          'Click "Activate Webhook"',
          'Use the "Test" button to send a sample payload to your endpoint immediately — verify the connection before a real trade fires'
        ],
        tips: [
          'Use webhook.site (free) to inspect and debug webhook payloads before connecting your real endpoint',
          'The Secret Key adds HMAC-SHA256 signature verification — verify it on your server for security'
        ]
      },
      {
        heading: 'MT5 Trade Copier',
        steps: [
          'The MT5 Trade Copier relays every MT5 trade (open, modify, close) to any webhook endpoint in real-time',
          'Go to the MT5 Chart Data page (/mt5-chart-data) and download the Trade Copier EA',
          'Install in MT5: File → Open Data Folder → MQL5 → Experts → paste .mq5 file → compile in MetaEditor',
          'In MT5 EA inputs: paste your VEDD API URL and API Token',
          'Attach the EA to any chart — it monitors ALL trades on your account, not just the chart\'s pair',
          'Each trade event (open/close/modify) is sent to your configured webhook endpoint within seconds',
          'Your TradeLocker or custom server receives the trade and can mirror it automatically'
        ],
        tips: [
          'One API token works for both the Chart Data EA and the Trade Copier EA',
          'The copier sends: symbol, direction, lot size, entry price, SL, TP, ticket number, and event type (open/close/modify)'
        ]
      },
      {
        heading: 'Webhook Payload Format & Delivery History',
        steps: [
          'All VEDD webhooks send JSON payloads via HTTP POST to your endpoint',
          'Typical payload includes: event_type, symbol, direction, entry_price, stop_loss, take_profit, confidence, timestamp',
          'The Webhooks page shows a full delivery history for each webhook: timestamp, HTTP status code, response time',
          'Failed deliveries show the error message in plain English with troubleshooting suggestions',
          'VEDD retries failed deliveries up to 3 times with exponential backoff',
          'Each webhook has a delivery success rate displayed as a percentage'
        ],
        tips: [
          'A 200 status in the delivery history means your endpoint received and accepted the payload',
          'If you see 4xx errors, check your endpoint URL and authentication settings',
          'Set up a Telegram bot webhook to receive formatted signal messages directly in your trading group — takes under 5 minutes'
        ]
      }
    ]
  },
  {
    id: 'live-monitor',
    title: 'Live Monitor',
    icon: Layers,
    description: 'Unified real-time cockpit showing your Forex engine, Sol engine, and all active positions',
    content: [
      {
        heading: 'What the Live Monitor Shows',
        steps: [
          'Navigate to Live Monitor from the menu (or /live-monitor)',
          'The page auto-refreshes every 5 seconds — no manual reload needed',
          'SOL ENGINE panel: running/stopped status, activity feed of recent AI decisions, weekly SOL goal progress bar, active strategies list, last agent consensus recommendation',
          'VEDD EA / FOREX panel: current engine phase, weekly profit progress vs target, open trades count, today\'s P&L, active pairs list',
          'PAPER POSITIONS: all open paper trades with entry price, current price, and gain % calculated live',
          'LIVE POSITIONS: all active broker positions with floating P&L',
          'Combined view of both Forex and Solana engines without switching pages'
        ],
        tips: [
          'Use the Live Monitor as your main "cockpit" during active trading sessions — everything you need is on one screen',
          'The activity feed on the Sol Engine panel shows exactly what the AI evaluated and why it passed or skipped each token'
        ]
      }
    ]
  },
  {
    id: 'paper-trades',
    title: 'Paper Trades & What-If Analysis',
    icon: Shield,
    description: 'Track AI-generated paper signals and model trade scenarios before risking real capital',
    content: [
      {
        heading: 'Paper Trades',
        steps: [
          'Navigate to Paper Trades from the menu (or /paper-trades)',
          'Paper trades are AI-generated signals tracked against real market prices — no real capital at risk',
          'Each paper trade shows: symbol, direction, entry price, SL/TP, AI model used, AI provider, confidence score, and confluence grade',
          'The Confluence Score (A/B/C/D grade) reflects how many technical factors aligned for the signal',
          'Statistics panel shows: total trades, win rate, total P&L in pips, average win, average loss',
          'Per-symbol stats and per-model stats let you compare which AI models perform best on which pairs',
          'Mark outcomes manually: Win / Loss / Breakeven — these feed back into the VEDD Brain\'s learning cycle'
        ],
        tips: [
          'Paper trades with A-grade confluence and 80%+ confidence are the highest quality signals — track these closely',
          'Run paper trades for at least 2 weeks before using the same settings for a live SS Engine account'
        ]
      },
      {
        heading: 'What-If Scenario Analysis',
        steps: [
          'Navigate to What-If Analysis from the menu (or /what-if-analysis)',
          'Enter: symbol, current price, proposed entry, stop loss, take profit, and position size',
          'Select a scenario type: Price Target / News Event / Volatility Spike / Session Breakout',
          'Click "Analyze" — the AI models three outcomes with probability weights:',
          '  Best Case: price reaches TP, win % probability',
          '  Most Likely: expected outcome based on current conditions',
          '  Worst Case: price hits SL, loss % probability',
          'Risk Assessment shows: dollar risk, dollar reward, risk-reward ratio, and a risk warning if the setup is unfavorable',
          'Link any saved analysis to a What-If to compare AI recommendations vs your proposed setup'
        ],
        tips: [
          'Use What-If before moving your stop loss — model "what happens if I move SL to breakeven" vs "what happens if I keep the original SL"',
          'A Most Likely outcome that still shows positive expectancy (EV > 0) is a good signal to proceed with the trade'
        ]
      }
    ]
  },
  {
    id: 'vedd-tokens',
    title: 'VEDD Tokens & Wallet',
    icon: Coins,
    description: 'Earn, track, and withdraw VEDD tokens — the platform\'s native reward currency',
    content: [
      {
        heading: 'How to Earn VEDD Tokens',
        steps: [
          'Every action on the platform earns VEDD tokens — here are the primary earn events:',
          'Chart Analysis: earn tokens for each completed AI analysis',
          'Daily Devotional: complete each day\'s devotional to earn the daily token reward',
          'Referrals: earn tokens when someone signs up using your referral link and subscribes',
          'Ambassador Activity: content creation, training completions, and milestone days all award tokens',
          'Trading Milestones: Phase promotions, win streaks, and Growth Plan milestones award bonus tokens',
          'Ambassador Training Days: each day in the 58-day curriculum awards 10–50 tokens, with bonus tokens for quizzes',
          'Streak Bonuses: maintaining a daily analysis or devotional streak multiplies your token earnings'
        ],
        tips: [
          'Daily devotionals are the most consistent token earner — completing one every day for 58 days earns significant accumulated rewards',
          'Referral tokens are the highest single-event earn — one Premium subscriber referral can award hundreds of tokens'
        ]
      },
      {
        heading: 'My Wallet',
        steps: [
          'Navigate to My Wallet from the profile menu (or /my-wallet)',
          'View: VEDD token balance, pending balance (tokens awaiting confirmation), total earned all-time, total withdrawn',
          'To withdraw tokens: enter your Solana wallet address (e.g., your Phantom wallet address)',
          'Enter the amount to withdraw (minimum withdrawal may apply)',
          'Click "Request Withdrawal" — the request is queued for processing',
          'Withdrawal history shows: amount, Solana transaction signature, status (pending/complete/failed)',
          'Click the transaction signature to view it on Solscan (Solana block explorer)'
        ],
        tips: [
          'Make sure your Solana wallet address is correct before submitting — withdrawals cannot be reversed',
          'Pending balance represents tokens you have earned that are still in the confirmation period (typically 24–48 hours)'
        ]
      },
      {
        heading: 'VEDD Tokenomics',
        steps: [
          'Navigate to /vedd-tokenomics to see the full token allocation breakdown',
          'Token allocation: 30% Community Rewards, 20% Development, 20% Liquidity, 15% Team (vested), 15% Treasury',
          'Community Rewards (30%) are distributed as: trading activity, referrals, ambassador earnings, devotional completions, and milestone rewards',
          'VEDD tokens are tradeable on Pump.fun — link to the token page is in the Wallet section',
          'Token supply is fixed — no additional minting after the initial distribution'
        ],
        tips: [
          'The more actively you use the platform, the larger your share of the community rewards pool',
          'Ambassador program participants consistently earn the most tokens due to combined training + referral + content rewards'
        ]
      }
    ]
  },
  {
    id: 'devotional',
    title: 'Devotional & Streak Tracker',
    icon: Heart,
    description: 'Daily scripture devotions, faith-based trading insights, and streak-based reward progression',
    content: [
      {
        heading: 'Daily Devotional',
        steps: [
          'Navigate to Devotional from the menu (or /devotional)',
          'Each day features: a scripture reference, full scripture text, a devotional reflection, prayer points, an affirmation, and a trading tie-in',
          'The devotional is tied to the 58-day ambassador curriculum — each day\'s theme connects faith and trading discipline',
          'Spend the minimum required reading time (shown as a timer) before the completion button activates',
          'Click "Mark Complete" to log the devotional and earn the day\'s VEDD token reward',
          'Group completion stats show how many other VEDD community members completed today\'s devotional'
        ],
        tips: [
          'Read the devotional while your chart analysis is processing — the multi-timeframe analysis page even prompts you to do this',
          'The trading tie-in section applies each day\'s scripture directly to a trading concept — this is where mindset meets strategy'
        ]
      },
      {
        heading: 'Streak Tracker',
        steps: [
          'Navigate to Streak Tracker from the menu (or /streak-tracker)',
          'The streak tracks your consecutive days of activity on the platform (analyses, devotionals, or logins)',
          'Tier progression based on streak days: YG (0–6 days) → Rising (7–13) → Pro (14–29) → Elite (30–59) → OG (60+ days)',
          'Each tier unlocks bonus token multipliers on all earnings',
          'Milestone streak days (7, 14, 30, 60) award special one-time VEDD token bonuses',
          'The leaderboard shows top streaks across the community — compete for the top spot',
          'Missing one day resets your streak — the timer shows how many hours remain before the streak expires'
        ],
        tips: [
          'Set a daily alarm for your trading session time — consistency is more valuable than intensity in the streak system',
          'OG tier (60+ day streak) gives the highest token multiplier — dedicated ambassadors who maintain this earn significantly more'
        ]
      }
    ]
  },
  {
    id: 'referral-hub',
    title: 'Referral Hub',
    icon: Users,
    description: 'Your referral link, earnings dashboard, QR code, and community leaderboard',
    content: [
      {
        heading: 'Your Referral Link & QR Code',
        steps: [
          'Navigate to Referral Hub from the menu (or /referral-hub)',
          'Your unique referral link is displayed at the top — copy it with one click',
          'A QR code is generated automatically — download it for print materials, slides, or story posts',
          'Anyone who signs up through your link is tracked as your referral',
          'Referrals who subscribe to a paid plan earn you both VEDD tokens AND ambassador commission (if enrolled in the Ambassador program)',
          'Your referral link works on all platforms — embed it in YouTube descriptions, TikTok bios, Instagram profiles, and Linktree'
        ],
        tips: [
          'Put your referral link in the bio of every social platform you use — this is passive income that works while you sleep',
          'Use the QR code in live streams — show it on screen while you demo the platform'
        ]
      },
      {
        heading: 'Referral Stats Dashboard',
        steps: [
          'Stats panel shows: Total Referred, Subscribed, Pending (signed up but not yet subscribed), Total Earnings, VEDD Tokens Earned from Referrals',
          '"Send Reminder" feature: select non-subscribed referrals and send them a follow-up email to convert them',
          'Referral Leaderboard shows top ambassadors ranked by referral count — compete for top ambassador status',
          'Each referred user card shows: join date, status (free/subscribed), and their chosen plan',
          'Earnings history shows a breakdown of commission per referral by month'
        ],
        tips: [
          'The "Pending" count is your conversion opportunity — these people already signed up. A personal DM or reminder often converts them to paid',
          'Top leaderboard ambassadors receive spotlight features in VEDD official content — great for growing your own following'
        ]
      }
    ]
  },
  {
    id: 'social-hub',
    title: 'Social Hub',
    icon: Share2,
    description: 'Community trading feed, swipeable signal cards, following traders, and one-tap sharing',
    content: [
      {
        heading: 'The Tinder-Style Signal Feed',
        steps: [
          'Navigate to Social Hub from the menu (or /social-hub)',
          'Signal cards appear as swipeable cards — each shows a trade setup from the community or AI engine',
          'Each card displays: pair, direction, timeframe, entry/TP/SL levels, AI confidence score, and a live SVG price chart generated from the trade data',
          'Swipe RIGHT (or tap the heart) to like and save the setup to your watchlist',
          'Swipe LEFT (or tap X) to skip and see the next card',
          'Long-press or tap "View Details" to open the full analysis breakdown in a modal',
          'The full detail view shows: complete AI reasoning, all technical factors considered, timeframe analysis, and the analyst\'s commentary'
        ],
        tips: [
          'Liked setups are saved to "Your Feed" tab — review them before each session to see if conditions still hold',
          'The SVG price charts are generated from real entry/TP/SL data — they always render correctly even offline'
        ]
      },
      {
        heading: 'Your Feed & Following Traders',
        steps: [
          'The "Your Feed" tab shows analyses from traders you follow, filtered by your preferred assets',
          'Follow any trader by tapping their avatar or username and clicking Follow',
          'The platform surfaces top-performing analysts automatically based on win rate and community engagement',
          'Filter your feed by: asset type (Forex / Crypto / Futures) or timeframe',
          'Like, comment, and save analyses from traders you follow',
          'Your own published analyses appear in your profile for others to follow'
        ],
        tips: [
          'Follow 5–10 active traders whose pairs you trade — your feed becomes a curated signal source for your specific instruments',
          'Traders with a green "Verified" badge have been accuracy-vetted by the platform'
        ]
      },
      {
        heading: 'Sharing Signal Cards',
        steps: [
          'Every signal card has a Share button (arrow icon) that opens the share sheet',
          'Share options: Twitter (pre-formatted tweet with trade details) | Copy to Clipboard | Native device share sheet',
          'Share cards are automatically branded with the VEDD logo and include: pair, direction, entry, TP, SL, confidence score',
          'In the full detail modal, the DialogFooter has a QuickShareButtons panel for multi-platform sharing in one tap',
          'Your Feed cards also have share buttons in the CardFooter — share any saved setup from your watchlist instantly'
        ],
        tips: [
          'Sharing high-confidence setups before they hit TP builds your credibility as an analyst — when the trade wins, your audience remembers',
          'Use the native share sheet on mobile to post directly to Instagram Stories as an image'
        ]
      }
    ]
  },
  {
    id: 'mobile-features',
    title: 'Mobile Features',
    icon: Bell,
    description: 'Trade on the go with mobile alerts and gesture controls',
    content: [
      {
        heading: 'Mobile Alerts',
        steps: [
          'Set up price alerts for your watched symbols',
          'Receive push notifications on your device',
          'Get notified of high-impact news events',
          'Never miss important market movements'
        ]
      },
      {
        heading: 'Push Notification Settings',
        steps: [
          'Go to /notification-settings to customize your alerts',
          'Enable/disable specific notification types:',
          '  • Price Alerts - when targets are hit',
          '  • Analysis Complete - when AI finishes',
          '  • Trade Signals - real-time opportunities',
          '  • News Alerts - high-impact market news',
          'Set Quiet Hours to mute notifications at night',
          'Enable/disable sound and vibration separately',
          'Test notifications to verify they work'
        ],
        tips: ['Long-press the Alerts button in the FAB menu to quickly access settings', 'Enable Daily Digest for a summary of your trading activity']
      },
      {
        heading: 'Gesture Controls',
        steps: [
          'FLOATING ACTION BUTTON (FAB):',
          '  • Tap the + button to open quick actions menu',
          '  • Drag the FAB to reposition it on screen',
          '  • Long-press "Alerts" to go directly to notification settings',
          '',
          'SWIPE GESTURES:',
          '  • Swipe LEFT on alert cards to reveal DELETE action',
          '  • Swipe RIGHT on alert cards to reveal ARCHIVE action',
          '  • Tap the revealed action button or swipe further to confirm',
          '',
          'PULL TO REFRESH:',
          '  • Pull down at the top of lists to refresh data',
          '  • Release when the arrow flips to trigger refresh',
          '',
          'CHART VIEWER GESTURES:',
          '  • Pinch to zoom in/out on chart images',
          '  • Drag to pan when zoomed in',
          '  • Double-tap to reset zoom level'
        ],
        tips: ['Haptic feedback confirms your gestures on supported devices', 'All gestures work on mobile browsers and installed PWA']
      },
      {
        heading: 'Install as App (PWA)',
        steps: [
          'VEDD AI can be installed as a native-like app on your device',
          'On iOS: Tap Share → Add to Home Screen',
          'On Android: Tap the browser menu → Install App or Add to Home Screen',
          'The installed app works offline and loads faster',
          'Push notifications work best when installed as an app'
        ],
        tips: ['The PWA install prompt appears automatically on Android Chrome', 'You can check PWA status on the Notification Settings page']
      },
      {
        heading: 'Mobile-Friendly Design',
        steps: [
          'Access all features from your mobile browser',
          'Touch-optimized chart viewing with pinch-to-zoom',
          'Quick-access floating action button (draggable)',
          'Responsive design for all screen sizes',
          'Offline support for basic features'
        ]
      }
    ]
  },
  {
    id: 'btc-prediction-kalshi',
    title: 'BTC Prediction & Kalshi Auto-Trader',
    icon: TrendingUp,
    description: 'Use the live 5-minute Bitcoin prediction and auto-trade it on Kalshi (CFTC-regulated, US-legal)',
    content: [
      {
        heading: 'Reading the 5-Minute BTC Prediction',
        steps: [
          'Open the prediction panel from the "Kalshi P&L" nav shortcut (top of the page)',
          'The signal shows BUY, SELL, or NEUTRAL with a confidence percentage, refreshing every 30 seconds',
          'It is built from live BTC candles (Binance, with automatic Coinbase fallback) — no account or API key needed',
          'The score blends RSI, MACD, the EMA stack (9/21/50), volume trend, and 1-hour trend alignment',
          'Read confidence as signal QUALITY (how strongly the indicators agree), not a guarantee of profit'
        ],
        tips: [
          'The prediction is display-only and US-legal — it never places a trade by itself',
          'Use it as a fast, objective second opinion to confirm or question your own analysis'
        ]
      },
      {
        heading: 'Connecting Your Kalshi Account (API Key)',
        steps: [
          'Go to kalshi.com/account/api and sign in (Google sign-in works)',
          'Create an API key — Kalshi gives you a Key ID and a private key file (the private key is shown only once)',
          'In the Kalshi Auto-Trader panel, click Connect and paste the Key ID and the full private key',
          'Click "Connect with API Key" — your Kalshi balance appears when it succeeds',
          'Until you connect a key, the engine runs in PAPER mode so you can practice risk-free'
        ],
        tips: [
          'Email/password login is not supported by Kalshi\'s API — always use the API Key method',
          'Paste the entire private key, including the "-----BEGIN ... PRIVATE KEY-----" and "-----END ... PRIVATE KEY-----" lines'
        ]
      },
      {
        heading: 'Auto-Trading & Strategies',
        steps: [
          'The engine maps the BTC signal to Kalshi KXBTC hourly contracts: BUY buys YES on an "above $X" bracket, SELL targets a "below $X" bracket',
          'Open the config (gear icon) to choose your Auto-Trade Strategy: Momentum, Volume Profile, or Markov',
          'Momentum: the RSI/MACD/EMA signal — most active, best in trending markets',
          'Volume Profile: trades breakouts beyond the Point-of-Control value area, confirmed by volume — patient and selective',
          'Markov: bets on the most likely next move using a candle up/down/flat transition matrix',
          'Set your risk limits: contracts per trade, max open trades, cooldown, and minimum confidence — then Save Config',
          'Press Start Engine to auto-trade, or Scan to test the current strategy on demand'
        ],
        tips: [
          'Start in paper mode and test all three strategies before going live with real contracts',
          'The active strategy shows as a badge on the Kalshi panel; track results in the open/closed trades and P&L sections',
          'Kalshi is CFTC-regulated, which is what makes automated BTC trading legal for US users'
        ]
      }
    ]
  },
  {
    id: 'biz-builder',
    title: 'Business Builder & Credit',
    icon: TrendingUp,
    description: 'Launch a business and build credit from scratch — entity formation, banking, 90-day credit plan, and funding matches',
    content: [
      {
        heading: 'Starting the 6-Step Business Wizard',
        steps: [
          'Navigate to Business Builder (/biz-builder) from the main nav',
          'Step 1 — Idea: Describe your business idea in plain language; click Generate Names to let AI create name options and recommend an entity type (LLC, S-Corp, C-Corp, Sole Prop)',
          'Step 2 — Names & Entity: Review AI-generated name options and entity recommendation; select your preferred name and click Confirm Entity Selection',
          'Step 3 — Formation: Choose a formation provider (Stripe Atlas, Incfile, ZenBusiness) and follow the link to complete official state registration',
          'Step 4 — Banking: Select a business banking partner (Mercury, Relay, Found) and open your business account to separate personal and business finances',
          'Step 5 — Credit Plan: Review your AI-generated 90-day credit task plan; check off completed tasks to track progress through net-30 accounts, secured cards, and vendor credit',
          'Step 6 — Funding: Browse AI-matched funding opportunities including SBA loans, CDFI grants, and investor leads matched to your business profile',
        ],
        tips: [
          'Complete Steps 1–4 in order — formation before banking, banking before credit — the sequence mirrors how lenders evaluate business legitimacy',
          'Your business profile is saved after each step; return any time to continue without losing progress',
          'Uses your connected Anthropic API key automatically — no separate key required',
        ]
      },
      {
        heading: 'Business Credit Builder (6-Phase Program)',
        steps: [
          'Navigate to Credit Builder (/credit-builder) — a standalone 6-phase program for personal and business credit',
          'Phase 1 — Foundation: Obtain EIN from IRS.gov, open a dedicated business checking account, register with Dun & Bradstreet (DUNS number)',
          'Phase 2 — Net-30 Accounts: Open vendor credit accounts that report to business bureaus (Uline, Quill, Grainger) — pay invoices within 30 days to build payment history',
          'Phase 3 — Revolving Credit: Apply for a business credit card; keep utilization below 30% and pay in full monthly',
          'Phase 4 — SBA Pre-Qualification: Use Phase 1–3 history to apply for SBA Microloan or 7(a) pre-qualification',
          'Phase 5 — Banking Relationships: Maintain 6+ months of clean account history; request credit limit increases every 6 months',
          'Phase 6 — Investor Readiness: Compile business financials, credit report, and bank statements into an investor-ready package',
        ],
        tips: [
          'Business credit is separate from personal credit — never mix personal cards with business purchases once Phase 1 is complete',
          'The 90-day task plan from Biz Builder aligns with Phases 1–3 of the Credit Builder — complete them together for maximum speed',
          'A Dun & Bradstreet DUNS number is free and required by most vendors before extending net-30 terms',
        ]
      },
      {
        heading: 'Grants Hub — Finding & Applying for Grants',
        steps: [
          'Navigate to Grants Hub (/grants) from the main nav',
          'Browse available grant programs: SBA, NSF, Department of Labor, CDFI Fund, EDA, JPMorgan Chase for Business, Google.org',
          'Click the Grant Scanner to let AI identify which programs match your business type, revenue stage, and geography',
          'Select a grant program and click Generate Proposal — AI drafts a complete proposal with required narrative sections',
          'Review and edit the AI proposal; export or copy the text to submit via the grant program\'s official portal',
          'Track your application status in the Application Tracker by entering submission date, grant name, and expected decision date',
        ],
        tips: [
          'The AI proposal is a starting draft — always personalize with real metrics, team bios, and your specific community impact story',
          'Apply for CDFI and EDA grants first — they have shorter review cycles and higher approval rates for early-stage businesses',
          'Google.org grants favor education and community development projects — align your framing toward financial literacy and inclusion impact',
        ]
      }
    ]
  },
  {
    id: 'copy-trading-orb',
    title: 'Copy Trading & ORB Breakout',
    icon: TrendingUp,
    description: 'Replicate MT5 positions to TradeLocker automatically and trade Opening Range Breakout signals at market opens',
    content: [
      {
        heading: 'Copy Trading — MT5 to TradeLocker',
        steps: [
          'Navigate to Copy Trading (/copy-trading) from the main nav',
          'Connect your source MT5 account (the account whose trades you want to copy)',
          'Connect your destination TradeLocker account (the account that will mirror trades)',
          'Set your lot multiplier — 1.0 mirrors exact lot sizes; 0.5 halves them; 2.0 doubles them',
          'Enable Copy Trading — the relay service watches your MT5 account and replicates every new position to TradeLocker',
          'Monitor active copied trades in the Live Monitor panel; each trade shows source, destination, lot size, and P&L',
        ],
        tips: [
          'Start with lot multiplier 0.1 to verify the relay is working correctly before scaling up',
          'Copy Trading is independent of the Live Trading Engine — you can run both simultaneously on different accounts',
          'Use Copy Trading to mirror your manual MT5 analysis into a funded TradeLocker account automatically',
        ]
      },
      {
        heading: 'ORB Breakout Strategy',
        steps: [
          'Navigate to ORB Breakout (/orb-breakout) from the main nav',
          'The system detects breakouts at the 3 major market opens where institutional order flow is highest: London (3 AM ET), New York (9:30 AM ET), and Tokyo (7 PM ET)',
          'Select which pairs to monitor; each pair has its own breakout toggle so you can mix ORB and pure technical analysis strategies',
          'When a breakout is detected with volume 1.2x above average, the signal is marked as confirmed with HIGH confidence',
          'Review AI-confirmed breakout signals in the signal feed; each shows direction, entry level, SL, TP, and session',
          'Enable Breakout Master Mode to activate a second AI confirmation layer before any signal is issued — higher precision, fewer entries',
        ],
        tips: [
          'London and New York opens produce the most reliable ORB signals — most institutional order flow occurs in the first 30 minutes of each session',
          'ORB signals with volume confirmation score higher in the SS AI Brain Engine consensus — they are weighted above pure pattern signals',
          'Turn off ORB for USD-correlated pairs during high-impact news events — the news spike can fake a breakout that reverses immediately',
        ]
      }
    ]
  },
  {
    id: 'gamification-achievements',
    title: 'Achievements, Streaks & VEDD Rewards',
    icon: TrendingUp,
    description: 'Earn XP, unlock badges, climb leaderboards, and earn VEDD tokens through everyday platform activity',
    content: [
      {
        heading: 'XP Tiers & Progression',
        steps: [
          'Your XP tier is displayed in your profile and on the leaderboard — tiers progress: YG → Rising → Pro → Elite → OG',
          'Earn XP by completing chart analyses, maintaining daily streaks, winning community challenges, posting to the social feed, and selling EAs in the marketplace',
          'Each tier unlocks new features, VEDD token earning multipliers, and social badges displayed on your profile',
          'View your current XP and tier progress at /achievements or through the Activity Hub (/activity)',
        ],
        tips: [
          'Daily streak bonuses stack on all XP and VEDD earnings — a 30-day streak can double your token earning rate',
          'Elite and OG tiers receive bonus entries in the monthly VEDD token prize pool draws',
        ]
      },
      {
        heading: 'Achievements & Badges',
        steps: [
          'Navigate to Achievements (/achievements) to see all unlockable badges and your progress toward each',
          'Achievement categories: Analysis Milestones (complete 10, 50, 100 analyses), Streak Master (7, 30, 90-day streaks), Win Rate (achieve 60%, 70%, 80% accuracy), Community (first share, first follower, first sale), Ambassador (complete training, first referral, 10 referrals)',
          'Earned badges appear on your public trader profile — they signal credibility and attract followers in the Social Hub',
          'Some achievements reward VEDD tokens directly upon unlock — check the reward amount listed under each badge',
        ],
        tips: [
          'Focus on Analysis Milestones first — they\'re the fastest to complete and each milestone pays VEDD tokens',
          'The Ambassador certification badge is the most prestigious — it unlocks special ambassador-only community channels',
        ]
      },
      {
        heading: 'VEDD Token Earning — All Methods',
        steps: [
          'Chart Analysis: Earn tokens for every completed analysis — bonus tokens for analyses above 75% AI confidence',
          'Daily Devotional: Complete the daily devotional lesson to earn daily streak tokens — the streak multiplier grows each consecutive day',
          'Referrals: Every user who signs up with your referral link earns you credits (1 credit = $0.01 subscription discount) and bonus VEDD tokens when they subscribe',
          'EA Marketplace Sales: Earn VEDD tokens (and USD) every time another trader subscribes to your published Expert Advisor',
          'Community Challenges: Compete in weekly and monthly platform challenges — top finishers earn token prizes from the Community Rewards Pool',
          'Wear-to-Earn: Buy official VEDD clothing with an NFC chip → tap the chip with your phone daily → earn tokens automatically',
          'Ambassador Milestones: Complete training modules, earn certification, and hit referral milestones to unlock token bonuses',
          'View your token balance and transaction history at My Wallet (/my-wallet); withdraw to your Solana wallet at any time',
        ],
        tips: [
          '2,000 earned VEDD tokens = 1 free subscription month at the fixed platform redemption rate',
          'Withdraw tokens to Phantom/Solflare wallet to hold them on-chain — market VEDD grows in value as the community scales',
          'The Community Rewards Pool (30% of total supply) is actively distributing — every action you take on the platform pulls from this pool',
        ]
      }
    ]
  },
  {
    id: 'tokenomics-pools',
    title: 'VEDD Tokenomics & Token Pools',
    icon: TrendingUp,
    description: 'Understand the VEDD token economy, how pools work, and how to maximize token benefits for new and existing users',
    content: [
      {
        heading: 'Token Supply Allocation',
        steps: [
          'Total Supply is fixed — allocation breakdown: 30% Community Rewards Pool • 20% Development • 20% Liquidity Pool • 15% Team • 10% Marketing • 5% Reserve',
          'Community Rewards Pool (30%): The largest allocation — actively distributing tokens to ambassadors, referrers, challenge winners, devotional streak earners, and EA sellers',
          'Liquidity Pool (20%): Provides DEX liquidity on Raydium after the bonding curve graduates — enables open-market buying and selling of VEDD at live prices',
          'Development (20%): Funds ongoing platform development, new feature builds, and infrastructure — vested over 24 months',
          'Team (15%): Core team tokens — vested over 36 months to align long-term incentives',
          'Marketing (10%): Content, influencer partnerships, and community growth campaigns',
          'Reserve (5%): Emergency fund for ecosystem stability and bridge financing',
        ],
        tips: [
          'New users: the Community Rewards Pool is live and distributing — start earning immediately through any platform activity',
          'Existing users: your earned token balance is permanently yours — check My Wallet for your accumulated rewards',
        ]
      },
      {
        heading: 'Token Tiers — Benefits for Holders',
        steps: [
          'Holder (1,000+ VEDD): Basic features + community access — entry tier; easy to reach through a few weeks of platform activity',
          'Silver (10,000+ VEDD): 10% fee discount on all subscription payments + priority support — equivalent to ~$5/month savings on Starter',
          'Gold (50,000+ VEDD): 25% fee discount + early access to new features + exclusive signals channel — equivalent to ~$37/month savings on Premium',
          'Diamond (100,000+ VEDD): 50% fee discount + private Diamond community channels + direct team access — equivalent to ~$75/month savings on Premium',
          'Connect your Solana wallet (Phantom or Solflare) at /vedd-tokenomics to have your tier verified and benefits activated automatically',
          'Token-gated subscription: hold enough VEDD on-chain to bypass USD payment entirely — the system reads your wallet balance and unlocks the corresponding tier',
        ],
        tips: [
          'Earn toward Silver tier first (10,000 VEDD) — it\'s achievable through 2–3 months of active use and pays for itself in fee discounts',
          'Existing users who\'ve been earning since day 1 should check their balance — many may already qualify for Silver or Gold tier',
          'Diamond holders also receive governance voting weight — your 100K+ VEDD means you shape the platform\'s future features',
        ]
      },
      {
        heading: 'VEDD Price Roadmap & Milestones',
        steps: [
          'Month 1–3 (Bonding Curve): Token live on pump.fun — early buyers accumulate at micro-cap; ambassador system activated; first 10 ambassadors verified and earning',
          'Month 4 (DEX Launch): Token graduates bonding curve (~$69K raised) → Raydium liquidity pool opens; first 44-day ambassador journey completions paying 500 VEDD bonuses; staking program activates',
          'Month 6 (Aggregator): Listed on Jupiter aggregator — broader Solana ecosystem exposure; Ambassador Training V2 with video certification; token-gated membership tiers go live',
          'Month 9 (Growth Phase): EA creators earning passive VEDD income driving platform trading volume; regional ambassador leads appointed',
          'Month 12 (CEX Talks): Platform trading volume validates real-world utility; CEX listing discussions begin; governance proposals go to community vote',
          'Track live token price on DexScreener — link available at /vedd-tokenomics',
        ],
        tips: [
          'The roadmap milestones are driven by community activity — more ambassadors recruiting = faster token graduation from the bonding curve',
          'Each completed milestone historically increases token visibility and trading volume — early platform users are positioned for the most appreciation',
        ]
      }
    ]
  },
  {
    id: 'brain-marketplace',
    title: 'Brain Data Marketplace',
    icon: Store,
    description: 'Buy and sell AI trading brain data — bootstrap your AI with proven trade history',
    content: [
      {
        heading: 'What the Brain Data Marketplace Is',
        steps: [
          'Every trade the AI confirms for you builds your personal "learning brain" — the history the AI studies to find your winning patterns',
          'Established traders can sell a snapshot copy of their trade history for VEDD tokens — they keep their own data, buyers get a copy',
          'Newcomers can buy a proven trader\'s history to instantly bootstrap their AI\'s pattern recognition instead of starting from zero',
          'Prices are computed automatically from data age, number of pairs, trade count, and win rate (5–500 VEDD range)'
        ],
        tips: ['Purchased data is tagged separately from your own trades, so the AI always knows which patterns came from where', 'You need at least 10 completed trades before you can list your own data']
      },
      {
        heading: 'Buying and Selling',
        steps: [
          'Open Brain Marketplace from the navigation menu',
          'To sell: review your live price preview, add a title and description, then click "List My Data"',
          'To buy: browse listings, check the trades/pairs/age/win-rate stats, and click Buy — VEDD is deducted from your wallet and the data merges into your brain instantly',
          'Sellers earn the full listing price every time someone buys — the same listing can sell to unlimited buyers'
        ],
        tips: ['You can\'t re-sell data you purchased — only your own organic trade history counts toward a listing']
      }
    ]
  },
  {
    id: 'auto-trade-logging',
    title: 'Automatic Trade Logging',
    icon: TrendingUp,
    description: 'Every trade on every connected account logs itself — no manual entry ever',
    content: [
      {
        heading: 'How Automatic Logging Works',
        steps: [
          'Connect a TradeLocker or MT5 account once — that\'s the only setup',
          'VEDD checks your open positions every 20 seconds and records any new trade automatically',
          'When a position closes, VEDD detects it, pulls the real profit or loss from your broker, and marks the trade WIN, LOSS, or BREAKEVEN',
          'Auto-logged trades show an "Auto-Synced" tag in your Trade Performance feed so you can tell them apart from manual entries'
        ],
        tips: ['A complete trade record is what powers the AI Brain\'s learning — automatic logging means no gaps and no cherry-picking']
      },
      {
        heading: 'The Paper Trade AI Journal',
        steps: [
          'Every trade the AI confirms is also recorded as a paper trade — a parallel journal tracking what the AI\'s calls would have produced',
          'Open Paper Trades from the menu to see win rate, P&L in pips, and per-symbol / per-model accuracy breakdowns',
          'Pending entries resolve automatically against live prices at the 1-hour, 4-hour, and 24-hour marks — no manual outcome entry needed',
          'The AI reads its own historical accuracy back into future decisions, so a weak streak automatically makes it more cautious'
        ]
      }
    ]
  },
  {
    id: 'copy-trading-guide',
    title: 'Copy Trading',
    icon: Users,
    description: 'Mirror top traders automatically — on a paper account or your real broker account',
    content: [
      {
        heading: 'Starting a Copy Relationship',
        steps: [
          'Open Copy Trading and browse the leaderboard — traders ranked by real win rate',
          'Click Copy on a trader, set your Max Lot Size (your trades never exceed this, regardless of the leader\'s size)',
          'Choose Paper mode (mirrors into your simulated account — zero risk) or Real mode (places live orders on your connected TradeLocker account)',
          'A one-time VEDD subscription fee goes to the trader, plus a profit share on winning copied trades'
        ],
        tips: ['Start in Paper mode to evaluate a trader\'s real performance on your own account before committing real money']
      },
      {
        heading: 'Real-Mode Safety Gates',
        steps: [
          'Real-mode copying requires selecting a specific connected account and explicitly confirming you understand live orders will be placed automatically',
          'Every copied trade is checked before execution: your account must have fresh data, positive balance, free margin, and a margin level above the 200% safety floor',
          'Your Max Lot Size is a hard cap enforced on every single trade',
          'A daily-loss backstop automatically pauses real-mode copying for the rest of the day if copied trades lose 10% of your account'
        ],
        tips: ['If a copied trade is skipped by a safety gate, the reason is recorded on the trade log so you always know why']
      }
    ]
  },
  {
    id: 'deep-reasoning-prop-firm',
    title: 'Deep Reasoning & Prop Firm Tools',
    icon: Cpu,
    description: 'Veteran-trader AI reasoning and the rules that pass prop firm challenges',
    content: [
      {
        heading: 'Deep Reasoning Mode',
        steps: [
          'Toggle Deep Reasoning Mode on from the Prop Firm Challenge dashboard settings',
          'Instead of one fast AI pass, every trade confirmation runs a full debate: a Bull Case argues for the trade, a Bear Case argues against it',
          'A Veteran Judge — an AI persona modeled on a trader with 30+ years of consistent profitability — weighs both sides using a true chain-of-thought reasoning model and makes the final call',
          'The complete reasoning trail (bull case, bear case, and the judge\'s thinking) is saved with every decision so you can audit exactly why a trade was taken or skipped'
        ],
        tips: ['Deep Reasoning is slower and costs more per confirmation — best used on live accounts and prop firm challenges where every decision matters', 'The Veteran Judge is deliberately biased toward skipping marginal setups — capital preservation first, exactly like a real 30-year veteran']
      },
      {
        heading: 'Prop Firm Consistency Rules',
        steps: [
          'Prop Firm Mode makes the engine respect your firm\'s actual daily drawdown limit — and it stops trading at 80% of the limit, leaving a buffer instead of riding the edge',
          'Consistency Enforcement tracks your profitable-days quota (e.g. 10 of 15 days) and automatically cuts risk when you can\'t afford another losing day',
          'Max Single-Day Profit rule: set a cap on how much of your total challenge profit can come from one day — the engine halts for the day once you reach it, protecting payout eligibility on firms with consistency requirements',
          'Near-target protection: once you\'ve banked 80% of your profit target, risk is automatically trimmed to half — protecting gains the way an experienced challenge-passer does'
        ],
        tips: ['Set the Max Single-Day Profit % to match your firm\'s rule (commonly 30–50%)', 'These rules work together: the goal is passing consistently, not passing fast']
      }
    ]
  }
];

const faqs = [
  {
    question: 'How accurate is the AI chart analysis?',
    answer: 'Our AI uses advanced pattern recognition and is trained on millions of chart patterns. While no analysis is 100% accurate, our system provides confidence scores to help you make informed decisions. Always combine AI insights with your own analysis.'
  },
  {
    question: 'Can I use the generated EA code on my live account?',
    answer: 'Yes, the EA code is production-ready. However, we strongly recommend backtesting on a demo account first and starting with small position sizes when going live.'
  },
  {
    question: 'What trading platforms are supported?',
    answer: 'VEDD supports chart uploads from MT4, MT5, TradingView, and TradeLocker. EA code can be generated for MT5, TradingView (Pine Script), TradeLocker, and NinjaTrader 8 (NinjaScript C# — for futures trading). Live trade execution is supported via MT5, TradeLocker, and Tradovate (futures).'
  },
  {
    question: 'Can VEDD trade futures? Which prop firms are supported?',
    answer: 'Yes — Phase 1 Futures support is live. Connect your Tradovate account (demo or live) via the Futures Connect page. The Futures AI Live Feed page runs a continuous AI market scanner across NQ, ES, YM, GC, CL and micro equivalents — generating real-time BUY/SELL signals with entry, SL, and TP levels every 2 minutes. Supported prop firm presets with auto-enforced drawdown rules: Topstep, Apex Trader Funding, Bulenox, Earn2Trade, and Take Profit Trader. The scanner automatically halts when your daily loss limit is reached.'
  },
  {
    question: 'What is the NinjaScript EA Generator?',
    answer: 'The Futures EA Generator creates production-ready C# NinjaScript strategy files for NinjaTrader 8. Configure your instrument, strategy type, risk parameters, and prop firm rules — then download the .cs file and paste it directly into NinjaTrader 8. The generated strategy includes RSI, EMA 20/50, ATR, ADX indicators, a daily loss circuit breaker embedded in OnBarUpdate, and max trades per day guard.'
  },
  {
    question: 'How do I earn money from the EA Marketplace?',
    answer: 'Create successful trading strategies, publish them to the marketplace with a subscription price, and earn revenue when other traders subscribe. Your earnings are tracked in your profile.'
  },
  {
    question: 'What is the Account Growth Plan and how does it work?',
    answer: 'The Account Growth Plan is a 6-phase capital scaling system. Your account progresses through Seedling → Sprout → Growth → Momentum → Acceleration → Peak phases, each with increasing risk allowances and lot sizes. Connect your MT5 or TradeLocker account to sync your live balance automatically — the plan always knows your current phase and calculates the correct position size for every trade. A built-in Position Sizer handles the math: enter your pair and stop loss distance, and it outputs the exact lot size to risk your phase-appropriate percentage.'
  },
  {
    question: 'How does the SS AI Engine work?',
    answer: 'The SS AI Engine is VEDD\'s autonomous Forex trading system. It runs 18 HFT strategies simultaneously on pairs like XAUUSD, GBPUSD, and EURUSD via TradeLocker. Every 60 seconds it fetches live market data, runs 12+ indicators, checks news sentiment, and queries GPT-4o for a final trade decision. Weekly profit goals keep it goal-oriented — it phases through warming_up → building → accelerating → cruising → pushing → target_reached, adjusting lot sizes at each phase. The Brain Enforcer pre-filters every proposed trade using per-pair learned knowledge. Use the Connected Account Picker to assign any MT5 or TradeLocker account to the engine — each account has its own saved risk settings.'
  },
  {
    question: 'How do Stop Orders work?',
    answer: 'Stop Orders are pending breakout orders that trigger automatically when price reaches your set level. BUY STOP fires when price rises above the trigger (bullish breakout). SELL STOP fires when price falls below the trigger (bearish breakout). Orders stay pending until triggered, cancelled, or the session closes. The MT5 Chart Data EA sends live price ticks to VEDD — when a tick crosses your trigger level, the order fires. Perfect for session breakout trading: set your orders before the London or New York open and let the system execute while you sleep.'
  },
  {
    question: 'What is the Solana Scanner and how do I use it safely?',
    answer: 'The Solana Scanner uses AI to analyze trending tokens across Raydium, Orca, Meteora, Pump.fun, and Jupiter. It scores each token on sentiment, tokenomics, whale activity, and momentum — producing STRONG_BUY through STRONG_SELL signals with confidence percentages. Always start with Paper Trading mode (Settings tab → enable Paper Mode) to test without real capital. When you\'re ready to trade live, connect your Phantom wallet. Use the 4 risk controls in the Settings tab: Direction Filter, Risk Per Trade %, Max Daily Trades, and Stop-Order Price Floor to manage your exposure.'
  },
  {
    question: 'How do I connect VEDD to my Telegram group or Discord server?',
    answer: 'Use the Webhooks feature (navigate to /webhooks). Create a new webhook, paste your Telegram bot webhook URL or Discord webhook URL, select the trigger events you want (e.g., "AI Signal Generated"), and activate it. VEDD will POST a formatted JSON payload to your URL every time the trigger fires. Test it with the built-in Test button before your first real signal. A Telegram bot webhook can be set up in under 5 minutes using the BotFather — your community receives live formatted signals automatically.'
  },
  {
    question: 'What are VEDD Tokens and how do I withdraw them?',
    answer: 'VEDD Tokens are the platform\'s native reward currency earned through trading activity, daily devotionals, referrals, ambassador milestones, and streak bonuses. View your balance in My Wallet (/my-wallet). To withdraw, enter your Solana wallet address (e.g., your Phantom wallet) and the amount you want to withdraw. Withdrawals process to the Solana blockchain — track them via the transaction signature link in your withdrawal history. VEDD Tokens are also tradeable on Pump.fun.'
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes, we use end-to-end encryption and follow industry best practices for data security. Broker passwords (TradeLocker, Tradovate) are encrypted with AES-256 before storage and never stored in plain text. Your chart screenshots are analyzed by the AI and not stored permanently. Your trading data and personal information are protected at all times.'
  }
];

export default function UserGuidePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const filteredSections = guideSections.filter(section =>
    section.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    section.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    section.content.some(c => 
      c.heading.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.steps.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-gray-950 py-8 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-blue-500/20 text-blue-400 border-blue-500/30">
            Documentation
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-guide-title">
            VEDD User Guide
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Everything you need to know about using VEDD for smarter trading decisions
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs px-3 py-1 rounded-full">Forex & Crypto</span>
            <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs px-3 py-1 rounded-full">Futures / NinjaTrader 8</span>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-3 py-1 rounded-full">MT5 / TradeLocker</span>
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-3 py-1 rounded-full">Prop Firm Rules</span>
            <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs px-3 py-1 rounded-full">SS AI Engine</span>
            <span className="bg-violet-500/20 text-violet-300 border border-violet-500/30 text-xs px-3 py-1 rounded-full">Solana Scanner</span>
            <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs px-3 py-1 rounded-full">Webhooks & Automation</span>
            <span className="bg-green-500/20 text-green-300 border border-green-500/30 text-xs px-3 py-1 rounded-full">Account Growth Plan</span>
          </div>
        </div>

        <div className="mb-8 max-w-xl mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              placeholder="Search the guide..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-gray-900/50 border-gray-700"
              data-testid="input-guide-search"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-12">
          <div className="md:col-span-1">
            <Card className="bg-gray-900/50 border-gray-800 sticky top-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  Sections
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {guideSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setSelectedSection(section.id);
                      document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                      selectedSection === section.id 
                        ? 'bg-primary/20 text-primary' 
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                    data-testid={`nav-section-${section.id}`}
                  >
                    <section.icon className="w-4 h-4" />
                    {section.title}
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-3 space-y-8">
            {filteredSections.map((section) => (
              <Card 
                key={section.id} 
                id={section.id}
                className="bg-gray-900/50 border-gray-800"
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                      <section.icon className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-xl" data-testid={`text-section-${section.id}`}>
                        {section.title}
                      </CardTitle>
                      <CardDescription>{section.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="space-y-2">
                    {section.content.map((item, idx) => (
                      <AccordionItem 
                        key={idx} 
                        value={`${section.id}-${idx}`}
                        className="border-gray-800 bg-gray-800/30 rounded-lg px-4"
                      >
                        <AccordionTrigger className="text-left hover:no-underline">
                          <span className="font-medium">{item.heading}</span>
                        </AccordionTrigger>
                        <AccordionContent>
                          <ol className="space-y-2 mb-4">
                            {item.steps.map((step, stepIdx) => (
                              <li key={stepIdx} className="flex gap-3 text-gray-300">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm flex items-center justify-center">
                                  {stepIdx + 1}
                                </span>
                                {step}
                              </li>
                            ))}
                          </ol>
                          {item.tips && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mt-4">
                              <p className="text-amber-400 font-medium text-sm mb-2 flex items-center gap-2">
                                <Star className="w-4 h-4" />
                                Pro Tips
                              </p>
                              <ul className="space-y-1">
                                {item.tips.map((tip, tipIdx) => (
                                  <li key={tipIdx} className="text-sm text-amber-200/80 flex items-start gap-2">
                                    <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                    {tip}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="bg-gray-900/50 border-gray-800 mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              Frequently Asked Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="space-y-2">
              {faqs.map((faq, idx) => (
                <AccordionItem 
                  key={idx} 
                  value={`faq-${idx}`}
                  className="border-gray-800 bg-gray-800/30 rounded-lg px-4"
                >
                  <AccordionTrigger className="text-left hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-400">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <div className="text-center">
          <Card className="bg-gradient-to-r from-primary/20 to-purple-500/20 border-primary/30 inline-block">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-2">Still have questions?</h3>
              <p className="text-gray-400 mb-4">Our support team is here to help</p>
              <div className="flex gap-4 justify-center">
                <Link href="/contact">
                  <Button variant="outline" data-testid="button-contact-support">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    Contact Support
                  </Button>
                </Link>
                <Link href="/ambassador-training">
                  <Button data-testid="button-become-ambassador">
                    <Users className="w-4 h-4 mr-2" />
                    Become an Ambassador
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
