import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Brain, 
  TrendingUp, 
  Clock, 
  Shield, 
  Zap, 
  BarChart3, 
  Globe, 
  Newspaper, 
  Calendar, 
  Share2, 
  Store, 
  Smartphone,
  Target,
  LineChart,
  ArrowRight,
  Check,
  Sparkles,
  RefreshCw,
  DollarSign
} from 'lucide-react';

const Home = () => {
  const features = [
    {
      icon: Brain,
      title: "AI-Powered Chart Analysis",
      description: "Upload charts from MT5, TradingView, or TradeLocker and get instant AI analysis with pattern recognition, trend identification, and actionable trading signals.",
      gradient: "from-purple-500 to-pink-500"
    },
    {
      icon: BarChart3,
      title: "Multi-Timeframe Analysis",
      description: "Analyze multiple timeframes simultaneously (M15, H1, H4, D1) with immersive full-page processing, unified signal synthesis, and daily devotional wisdom for inspired trading.",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      icon: Zap,
      title: "Instant EA Code Generation",
      description: "Generate ready-to-use Expert Advisor code for MT5, TradingView Pine Script, and TradeLocker with ATR-based stops and breakout strategies.",
      gradient: "from-yellow-500 to-orange-500"
    },
    {
      icon: RefreshCw,
      title: "Live AI Refresh & Direction Alerts",
      description: "Real-time market data detects pattern changes and automatically triggers AI re-analysis. Get instant alerts when market direction changes with new entry points and targets.",
      gradient: "from-green-500 to-emerald-500"
    },
    {
      icon: Newspaper,
      title: "News Sentiment Analysis",
      description: "Finnhub-powered financial news with AI sentiment scoring generates BUY/SELL/NEUTRAL signals based on real-time news flow.",
      gradient: "from-red-500 to-rose-500"
    },
    {
      icon: Calendar,
      title: "Economic Events Calendar",
      description: "View high-impact economic events 3-5 days ahead that may affect your trading pairs with intelligent timing recommendations.",
      gradient: "from-indigo-500 to-violet-500"
    },
    {
      icon: Globe,
      title: "Webhook Signal System",
      description: "Send trading signals to TradeLocker, TradingView, or custom endpoints automatically when analysis completes or trades open.",
      gradient: "from-teal-500 to-cyan-500"
    },
    {
      icon: Smartphone,
      title: "MT5 Trade Copier",
      description: "Copy trades from MetaTrader 5 directly to TradeLocker and other platforms. Download the EA, configure with your API token, and automate your trade relay.",
      gradient: "from-amber-500 to-orange-500"
    }
  ];

  const marketplaceFeatures = [
    { icon: Store, text: "Publish your EAs to the marketplace" },
    { icon: DollarSign, text: "Earn passive income from subscriptions" },
    { icon: Globe, text: "Discover strategies from top traders" },
    { icon: Share2, text: "Share branded analysis cards on social" }
  ];

  const platforms = ["MT5", "TradingView", "TradeLocker"];
  const assets = ["Forex", "Stocks", "Crypto", "Indices"];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 px-4 md:px-8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#E64A4A]/10 via-transparent to-purple-500/10" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-[#E64A4A]/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        
        <div className="container mx-auto relative z-10">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
            <div className="max-w-2xl text-center lg:text-left">
              <Badge className="mb-6 bg-[#E64A4A]/20 text-[#E64A4A] border-[#E64A4A]/30 px-4 py-2" data-testid="badge-new">
                <Sparkles className="w-4 h-4 mr-2" />
                AI-Powered Trading Intelligence
              </Badge>
              
              <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent" data-testid="text-hero-title">
                Transform Your Trading with Advanced AI Analysis
              </h1>
              
              <p className="text-xl text-gray-300 mb-8 leading-relaxed" data-testid="text-hero-description">
                Upload your trading charts from MT5, TradingView, or TradeLocker and get instant AI-powered analysis across multiple timeframes, generate custom EA code, and access real-time news sentiment — all in one powerful platform.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link href="/multi-timeframe-analysis">
                  <Button size="lg" className="bg-[#E64A4A] hover:bg-[#E64A4A]/90 text-white px-8 py-6 text-lg group" data-testid="button-analyze-chart">
                    Start Analyzing
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link href="/ea-marketplace">
                  <Button variant="outline" size="lg" className="border-gray-600 hover:bg-gray-800 px-8 py-6 text-lg" data-testid="button-marketplace">
                    Explore Marketplace
                  </Button>
                </Link>
              </div>

              <div className="flex flex-wrap gap-3 mt-8 justify-center lg:justify-start">
                {platforms.map((platform) => (
                  <Badge key={platform} variant="secondary" className="bg-gray-800 text-gray-300" data-testid={`badge-platform-${platform.toLowerCase()}`}>
                    {platform}
                  </Badge>
                ))}
                {assets.map((asset) => (
                  <Badge key={asset} variant="outline" className="border-gray-600 text-gray-400" data-testid={`badge-asset-${asset.toLowerCase()}`}>
                    {asset}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Hero Visual */}
            <div className="relative w-full max-w-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-[#E64A4A]/30 to-purple-500/30 rounded-2xl blur-2xl" />
              <Card className="relative bg-gray-900/90 border-gray-700 backdrop-blur-xl overflow-hidden">
                <CardContent className="p-0">
                  <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-4 border-b border-gray-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                      </div>
                      <span className="text-sm text-gray-400">Multi-Timeframe Analysis</span>
                    </div>
                  </div>
                  
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">EUR/USD</span>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        BUY Signal
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2">
                      {['M15', 'H1', 'H4', 'D1'].map((tf, i) => (
                        <div key={tf} className="bg-gray-800 rounded-lg p-3 text-center">
                          <div className="text-xs text-gray-400 mb-1">{tf}</div>
                          <div className={`text-sm font-semibold ${i < 3 ? 'text-green-400' : 'text-yellow-400'}`}>
                            {i < 3 ? 'BUY' : 'NEUTRAL'}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Unified Confidence</span>
                        <span className="text-green-400 font-semibold">87%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Entry Point</span>
                        <span className="font-medium">1.0892</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Stop Loss</span>
                        <span className="text-red-400 font-medium">1.0845</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Take Profit</span>
                        <span className="text-green-400 font-medium">1.0985</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs border-blue-500/50 text-blue-400">Double Bottom</Badge>
                      <Badge variant="outline" className="text-xs border-purple-500/50 text-purple-400">Bullish Divergence</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4 md:px-8 bg-gradient-to-b from-transparent to-gray-900/50">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-blue-500/20 text-blue-400 border-blue-500/30">
              Powerful Features
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-features-title">
              Everything You Need to Trade Smarter
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-lg">
              From AI analysis to EA generation, news sentiment to economic calendars — we've built the complete trading intelligence platform.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="bg-gray-900/50 border-gray-800 hover:border-gray-700 transition-all duration-300 hover:transform hover:scale-[1.02] group"
                data-testid={`card-feature-${index}`}
              >
                <CardContent className="p-6">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} p-0.5 mb-4`}>
                    <div className="w-full h-full bg-gray-900 rounded-xl flex items-center justify-center">
                      <feature.icon className="w-7 h-7 text-white" />
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold mb-3 group-hover:text-[#E64A4A] transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-gray-400 leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* EA Marketplace Section */}
      <section className="py-20 px-4 md:px-8">
        <div className="container mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1">
              <Badge className="mb-4 bg-green-500/20 text-green-400 border-green-500/30">
                EA Marketplace
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-6" data-testid="text-marketplace-title">
                Monetize Your Trading Strategies
              </h2>
              <p className="text-gray-400 text-lg mb-8 leading-relaxed">
                Create Expert Advisors from your analysis, publish them to our marketplace, and earn passive income through subscriptions. Join a community of traders sharing and discovering winning strategies.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {marketplaceFeatures.map((item, index) => (
                  <div key={index} className="flex items-center gap-3" data-testid={`text-marketplace-feature-${index}`}>
                    <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-green-400" />
                    </div>
                    <span className="text-gray-300">{item.text}</span>
                  </div>
                ))}
              </div>
              
              <Link href="/ea-marketplace">
                <Button className="bg-green-600 hover:bg-green-700 text-white" data-testid="button-explore-marketplace">
                  Explore Marketplace
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
            
            <div className="flex-1 w-full max-w-md">
              <Card className="bg-gray-900/80 border-gray-700">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-semibold text-lg">Gold Scalper Pro</h4>
                      <p className="text-sm text-gray-400">by TraderMike</p>
                    </div>
                    <Badge className="bg-yellow-500/20 text-yellow-400">Popular</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                    <span>127 subscribers</span>
                    <span>•</span>
                    <span>4.8 ⭐</span>
                  </div>
                  <div className="flex gap-2 mb-4">
                    <Badge variant="outline" className="text-xs">XAUUSD</Badge>
                    <Badge variant="outline" className="text-xs">Scalping</Badge>
                    <Badge variant="outline" className="text-xs">MT5</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold">$29<span className="text-sm text-gray-400">/mo</span></span>
                    <Button size="sm" variant="outline">Subscribe</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4 md:px-8 bg-gray-900/50">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "4+", label: "Timeframes", icon: Clock },
              { value: "3", label: "Platforms", icon: Globe },
              { value: "100+", label: "Patterns", icon: LineChart },
              { value: "24/7", label: "AI Analysis", icon: Brain }
            ].map((stat, index) => (
              <div key={index} className="text-center" data-testid={`stat-${index}`}>
                <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-[#E64A4A]/20 flex items-center justify-center">
                  <stat.icon className="w-6 h-6 text-[#E64A4A]" />
                </div>
                <div className="text-3xl md:text-4xl font-bold mb-2">{stat.value}</div>
                <div className="text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 md:px-8">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-purple-500/20 text-purple-400 border-purple-500/30">
              Simple Process
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-how-it-works-title">
              From Chart to EA in Minutes
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: "1", title: "Upload Charts", desc: "Upload your trading charts from any platform", icon: LineChart },
              { step: "2", title: "AI Analysis", desc: "Get instant multi-timeframe AI analysis", icon: Brain },
              { step: "3", title: "Generate EA", desc: "Create custom EA code for your platform", icon: Zap },
              { step: "4", title: "Trade or Share", desc: "Use it yourself or publish to marketplace", icon: Share2 }
            ].map((item, index) => (
              <div key={index} className="relative text-center" data-testid={`step-${index}`}>
                {index < 3 && (
                  <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-[#E64A4A] to-transparent" />
                )}
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#E64A4A]/20 border-2 border-[#E64A4A] flex items-center justify-center">
                  <item.icon className="w-7 h-7 text-[#E64A4A]" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 md:px-8">
        <div className="container mx-auto">
          <Card className="bg-gradient-to-br from-[#E64A4A]/20 via-gray-900 to-purple-500/20 border-gray-700 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-[#E64A4A]/10 to-purple-500/10" />
            <CardContent className="relative z-10 p-10 md:p-16 text-center">
              <h2 className="text-3xl md:text-5xl font-bold mb-6" data-testid="text-cta-title">
                Ready to Elevate Your Trading?
              </h2>
              <p className="text-xl text-gray-300 max-w-2xl mx-auto mb-8">
                Join thousands of traders using AI-powered analysis to make smarter decisions. Start your free analysis today.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/multi-timeframe-analysis">
                  <Button size="lg" className="bg-[#E64A4A] hover:bg-[#E64A4A]/90 text-white px-10 py-6 text-lg" data-testid="button-cta-start">
                    Start Free Analysis
                    <Sparkles className="ml-2 w-5 h-5" />
                  </Button>
                </Link>
                <Link href="/news-sentiment">
                  <Button variant="outline" size="lg" className="border-gray-600 hover:bg-gray-800 px-10 py-6 text-lg" data-testid="button-cta-news">
                    View Market News
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Home;
