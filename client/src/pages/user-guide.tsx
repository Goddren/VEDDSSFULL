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
  Star
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
    description: 'Learn the basics of using AI Trading Vault for your trading analysis',
    content: [
      {
        heading: 'Creating Your Account',
        steps: [
          'Visit the AI Trading Vault homepage and click "Get Started"',
          'Fill in your username, email, and create a secure password',
          'Verify your email address to activate your account',
          'Complete your profile with trading preferences'
        ],
        tips: ['Use a strong password with at least 8 characters', 'Your username will be visible to other traders in the community']
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
          'Cards include AI Trading Vault branding and key metrics',
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
    answer: 'AI Trading Vault supports chart uploads from MT4, MT5, TradingView, and TradeLocker. EA code can be generated for MT5, TradingView (Pine Script), and TradeLocker.'
  },
  {
    question: 'How do I earn money from the EA Marketplace?',
    answer: 'Create successful trading strategies, publish them to the marketplace with a subscription price, and earn revenue when other traders subscribe. Your earnings are tracked in your profile.'
  },
  {
    question: 'Is my data secure?',
    answer: 'Yes, we use end-to-end encryption and follow industry best practices for data security. Your trading data and personal information are protected. Read more on our Security page.'
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
            AI Trading Vault User Guide
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Everything you need to know about using AI Trading Vault for smarter trading decisions
          </p>
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
