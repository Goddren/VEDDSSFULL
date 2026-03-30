import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { SlidingButton } from "@/components/ui/sliding-button";
import { Link } from "wouter";
import { 
  ArrowRight, 
  BarChart2, 
  ChartLine, 
  Zap, 
  Bell, 
  Share2, 
  Clock, 
  BarChart, 
  Timer,
  AlertTriangle,
  PieChart,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Target,
  LineChart,
  Lightbulb,
  MoreVertical,
  Menu,
  User,
  Settings,
  Info,
  Layers,
  Pause,
  Lock,
  ChevronUp,
  Bot,
  Coins,
  GraduationCap,
  Users,
  Flame,
  Brain,
  Wallet,
  Calendar,
  MessageSquare,
  Trophy,
  Gift
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { EarlyAccessForm } from "@/components/early-access/early-access-form";
import { FeatureSlider } from "@/components/ui/feature-slider";
import { PatternSlider } from "@/components/ui/pattern-slider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { GamifiedLogin } from "@/components/ui/gamified-login";
import { DemoSection } from "@/components/ui/demo-section";
import { InteractiveFeatureCard, FeatureCardGrid } from "@/components/ui/interactive-feature-card";
import { patternDescriptions } from "@/assets/pattern-descriptions";
import logoImg from "@/assets/IMG_3645.png";

// Animated counter hook
function useCountUp(target: number, duration = 2000, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

export default function LandingPage() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  // Scroll progress bar
  useEffect(() => {
    const handleScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(total > 0 ? (window.scrollY / total) * 100 : 0);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Animation variants
  const fadeIn = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1, 
      transition: { duration: 0.6 }
    }
  };
  
  const slideUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { 
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 }
    }
  };
  
  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };
  
  return (
    <div className="flex flex-col min-h-screen bg-theme-off" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
      {/* Scroll Progress Bar */}
      <div className="fixed top-0 left-0 z-[100] h-[3px] bg-red-500 transition-all duration-100 ease-out" style={{ width: `${scrollProgress}%` }} />

      {/* Header with Logo */}
      <header className="w-full border-b border-theme-light py-4 px-6 bg-theme-light sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <img src={logoImg} alt="Trading Vault Logo" className="h-12" />
            <div className="ml-3 flex flex-col">
              <span className="text-lg font-bold text-white dark:text-white">AI Trading Vault</span>
              <span className="text-[10px] text-red-500 italic font-light -mt-1">Powered by Intelligence</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none">
                <div className="flex items-center space-x-1.5">
                  <div className="w-1.5 h-1.5 bg-black dark:bg-white rounded-full"></div>
                  <div className="w-1.5 h-1.5 bg-black dark:bg-white rounded-full"></div>
                  <div className="w-1.5 h-1.5 bg-black dark:bg-white rounded-full"></div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <Link href="/auth">
                  <DropdownMenuItem className="cursor-pointer">
                    <User className="h-4 w-4 mr-2" />
                    <span>Sign In</span>
                  </DropdownMenuItem>
                </Link>
                <Link href="/subscription">
                  <DropdownMenuItem className="cursor-pointer">
                    <Settings className="h-4 w-4 mr-2" />
                    <span>Plans & Pricing</span>
                  </DropdownMenuItem>
                </Link>
                <Link href="/blog">
                  <DropdownMenuItem className="cursor-pointer">
                    <Info className="h-4 w-4 mr-2" />
                    <span>Blog</span>
                  </DropdownMenuItem>
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      
      {/* Hero section */}
      <motion.section 
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="flex flex-col items-center justify-center px-6 py-16 bg-theme-light lg:px-8 lg:py-24"
      >
        <div className="max-w-7xl mx-auto text-center">
          <motion.div variants={fadeIn} className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 rounded-full blur-2xl animate-pulse" />
              <img 
                src={logoImg} 
                alt="AI Trading Vault Logo" 
                className="relative h-20 md:h-28 drop-shadow-sm transition-all duration-300"
              />
            </div>
          </motion.div>
          
          <motion.h1 variants={slideUp} className="text-4xl font-bold tracking-tight text-theme-main sm:text-5xl md:text-6xl lg:text-7xl" style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
            <span className="text-red-500">AI Powered</span> Trading Vault
          </motion.h1>

          <motion.p variants={slideUp} className="mt-4 text-xs font-semibold tracking-[0.2em] uppercase text-red-400/80">
            Chart Analysis · EA Generator · Live Trading Engine · Solana Scanner
          </motion.p>

          <motion.p variants={slideUp} className="mt-6 text-xl text-theme-muted max-w-3xl mx-auto leading-relaxed">
            Upload any trading chart from <strong className="text-theme-main">MT5, TradingView, or TradeLocker</strong> and get instant AI pattern recognition, automated Expert Advisors, multi-timeframe signals, and live trade execution — all in one vault.
          </motion.p>
          
          <motion.div variants={slideUp} className="mt-10 flex flex-col items-center gap-4">
            <div className="w-full max-w-md flex justify-center mb-4">
              <motion.button
                onClick={() => setIsLoginOpen(true)}
                className="relative w-full max-w-[280px] h-16 rounded-full bg-gray-800 p-1 overflow-hidden cursor-pointer shadow-lg shadow-gray-900/20 group"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-red-500 to-red-600 opacity-90 bg-size-200 animate-gradient-x"></div>
                
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute -bottom-10 -left-10 h-20 w-20 bg-white/20 rounded-full transition-all duration-500 group-hover:scale-150"></div>
                  <div className="absolute -top-10 -right-10 h-20 w-20 bg-white/20 rounded-full transition-all duration-500 group-hover:scale-150"></div>
                </div>
                
                <div className="absolute inset-0 flex items-center justify-center text-white font-semibold text-lg">
                  <Lock className="h-5 w-5 mr-2" />
                  <span className="mr-2">Enter the Vault</span>
                  <ChevronUp className="h-5 w-5 transform transition-transform duration-500 group-hover:-translate-y-1" />
                </div>
              </motion.button>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <EarlyAccessForm />
              <Link href="/subscription">
                <Button size="lg" variant="outline" className="border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all duration-300">
                  View Pricing
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Unique Platform Features Section - Automated Trading Revolution */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
        className="py-20 bg-gradient-to-b from-gray-900 to-black border-t border-gray-800"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div variants={fadeIn} className="text-center mb-16">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-red-500/20 text-red-400 text-sm font-medium mb-6">
              <Bot className="h-4 w-4 mr-2" />
              Exclusive Features
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
              <span className="text-red-500">Automated Trading</span> Revolution
            </h2>
            <p className="mt-4 text-lg text-gray-400 max-w-3xl mx-auto">
              Experience the future of trading with AI-powered Expert Advisors, automated rewards, and a thriving community ecosystem.
            </p>
          </motion.div>

          {/* EA Automated Trading Hero */}
          <motion.div variants={fadeIn} className="mb-16">
            <div className="relative bg-gradient-to-r from-red-600/20 via-red-500/10 to-orange-600/20 rounded-3xl p-8 md:p-12 border border-red-500/30 overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl"></div>
              
              <div className="relative z-10 grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-red-500/20 rounded-xl">
                      <Bot className="h-8 w-8 text-red-400" />
                    </div>
                    <span className="text-red-400 font-semibold">EA AI ANALYSIS</span>
                  </div>
                  <h3 className="text-3xl md:text-4xl font-bold text-white mb-4">
                    Expert Advisor with <span className="text-red-400">AI Brain</span>
                  </h3>
                  <p className="text-gray-300 text-lg mb-6">
                    Create automated trading strategies powered by AI analysis. Our EAs combine multi-timeframe analysis with real-time technical indicators for precise entry and exit signals.
                  </p>
                  <ul className="space-y-3">
                    <li className="flex items-center text-gray-300">
                      <Zap className="h-5 w-5 text-red-400 mr-3 flex-shrink-0" />
                      Multi-timeframe synthesis (4H + 1H + 15M + 5M)
                    </li>
                    <li className="flex items-center text-gray-300">
                      <Brain className="h-5 w-5 text-red-400 mr-3 flex-shrink-0" />
                      AI pattern recognition baked into EA logic
                    </li>
                    <li className="flex items-center text-gray-300">
                      <Target className="h-5 w-5 text-red-400 mr-3 flex-shrink-0" />
                      ATR-based stop loss & dynamic take profit
                    </li>
                    <li className="flex items-center text-gray-300">
                      <Bell className="h-5 w-5 text-red-400 mr-3 flex-shrink-0" />
                      News-aware trading with confidence filtering
                    </li>
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-700">
                    <Layers className="h-8 w-8 text-blue-400 mb-3" />
                    <h4 className="font-semibold text-white mb-2">4-Stage Entry</h4>
                    <p className="text-sm text-gray-400">HTF trend → Pattern scoring → LTF timing → Order type</p>
                  </div>
                  <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-700">
                    <Pause className="h-8 w-8 text-yellow-400 mb-3" />
                    <h4 className="font-semibold text-white mb-2">Choppy Filter</h4>
                    <p className="text-sm text-gray-400">Auto-pause in ranging markets with ADX/ATR</p>
                  </div>
                  <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-700">
                    <Share2 className="h-8 w-8 text-green-400 mb-3" />
                    <h4 className="font-semibold text-white mb-2">Signal Relay</h4>
                    <p className="text-sm text-gray-400">Copy to TradeLocker, TradingView via webhooks</p>
                  </div>
                  <div className="bg-gray-800/60 rounded-xl p-6 border border-gray-700">
                    <LineChart className="h-8 w-8 text-purple-400 mb-3" />
                    <h4 className="font-semibold text-white mb-2">Live Refresh</h4>
                    <p className="text-sm text-gray-400">Real-time market data for EA re-analysis</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Feature Grid */}
          <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* VEDD Token Rewards */}
            <motion.div variants={fadeIn} className="bg-gradient-to-br from-amber-900/30 to-yellow-900/20 rounded-2xl p-6 border border-amber-500/30 group hover:border-amber-400/50 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-500/20 rounded-lg group-hover:bg-amber-500/30 transition-all">
                  <Coins className="h-6 w-6 text-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-white">VEDD Token Rewards</h3>
              </div>
              <p className="text-gray-300 mb-4">
                Earn VEDD tokens for chart analyses, EA creations, and community contributions. Automatic Solana wallet transfers with admin-verified security.
              </p>
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <Wallet className="h-4 w-4" />
                <span>Connect wallet to claim rewards</span>
              </div>
            </motion.div>

            {/* Ambassador Training */}
            <motion.div variants={fadeIn} className="bg-gradient-to-br from-purple-900/30 to-violet-900/20 rounded-2xl p-6 border border-purple-500/30 group hover:border-purple-400/50 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-500/20 rounded-lg group-hover:bg-purple-500/30 transition-all">
                  <GraduationCap className="h-6 w-6 text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white">44-Day Ambassador Training</h3>
              </div>
              <p className="text-gray-300 mb-4">
                Complete interactive training combining trading education with biblical wisdom. Earn certifications and unlock exclusive ambassador rewards.
              </p>
              <div className="flex items-center gap-2 text-purple-400 text-sm">
                <Calendar className="h-4 w-4" />
                <span>Daily content journey with quizzes</span>
              </div>
            </motion.div>

            {/* Gamification */}
            <motion.div variants={fadeIn} className="bg-gradient-to-br from-orange-900/30 to-red-900/20 rounded-2xl p-6 border border-orange-500/30 group hover:border-orange-400/50 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-orange-500/20 rounded-lg group-hover:bg-orange-500/30 transition-all">
                  <Flame className="h-6 w-6 text-orange-400" />
                </div>
                <h3 className="text-xl font-bold text-white">XP & Streak System</h3>
              </div>
              <p className="text-gray-300 mb-4">
                Level up from YG to OG through five tiers. Earn XP for analyses and EA creations. Track your streak and compete on leaderboards.
              </p>
              <div className="flex items-center gap-2 text-orange-400 text-sm">
                <Trophy className="h-4 w-4" />
                <span>YG → Apprentice → Journeyman → Expert → OG</span>
              </div>
            </motion.div>

            {/* Community Features */}
            <motion.div variants={fadeIn} className="bg-gradient-to-br from-blue-900/30 to-cyan-900/20 rounded-2xl p-6 border border-blue-500/30 group hover:border-blue-400/50 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-500/20 rounded-lg group-hover:bg-blue-500/30 transition-all">
                  <Users className="h-6 w-6 text-blue-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Community Hub</h3>
              </div>
              <p className="text-gray-300 mb-4">
                AI-generated challenges, shareable events with auto-agendas, discussion threads, and social media content directions for promotion.
              </p>
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <MessageSquare className="h-4 w-4" />
                <span>Online University-style community experience</span>
              </div>
            </motion.div>

            {/* What-If Scenarios */}
            <motion.div variants={fadeIn} className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 rounded-2xl p-6 border border-green-500/30 group hover:border-green-400/50 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-green-500/20 rounded-lg group-hover:bg-green-500/30 transition-all">
                  <Brain className="h-6 w-6 text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-white">What-If Scenarios</h3>
              </div>
              <p className="text-gray-300 mb-4">
                Explore different trading outcomes with AI-powered scenario analysis. Test price targets, stop losses, and market conditions before trading.
              </p>
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <Target className="h-4 w-4" />
                <span>Probability & risk assessments</span>
              </div>
            </motion.div>

            {/* EA Marketplace */}
            <motion.div variants={fadeIn} className="bg-gradient-to-br from-teal-900/30 to-cyan-900/20 rounded-2xl p-6 border border-teal-500/30 group hover:border-teal-400/50 transition-all duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-teal-500/20 rounded-lg group-hover:bg-teal-500/30 transition-all">
                  <Gift className="h-6 w-6 text-teal-400" />
                </div>
                <h3 className="text-xl font-bold text-white">EA Marketplace</h3>
              </div>
              <p className="text-gray-300 mb-4">
                Publish your Expert Advisors for others to subscribe. Earn passive income from your trading strategies while helping the community.
              </p>
              <div className="flex items-center gap-2 text-teal-400 text-sm">
                <Coins className="h-4 w-4" />
                <span>Monetize your trading expertise</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </motion.section>
      
      {/* Features section */}
      <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
        className="py-16 bg-theme-light border-t border-theme-light"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div variants={fadeIn} className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-theme-main sm:text-4xl">
              <span className="text-red-500">Powerful Trading Intelligence</span>
            </h2>
            <p className="mt-4 text-lg text-theme-muted max-w-3xl mx-auto">
              Our AI-powered platform analyzes chart patterns and market conditions to provide you with accurate insights and trading recommendations.
            </p>
          </motion.div>
          
          {/* Main Features */}
          <motion.div variants={staggerContainer} className="grid grid-cols-1 gap-8 md:grid-cols-3 mb-16">
            {/* Feature 1 */}
            <motion.div variants={fadeIn} className="group flex flex-col items-center p-6 bg-theme-light rounded-lg border border-theme-light shadow-theme transform hover:translate-y-[-4px] transition-all duration-300">
              <div className="p-3 rounded-full bg-red-50 dark:bg-red-900/20 mb-4 group-hover:bg-red-100 dark:group-hover:bg-red-900/30 transition-all duration-300">
                <BarChart2 className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-xl font-semibold text-theme-main mb-2">Pattern Recognition</h3>
              <p className="text-center text-theme-muted">
                Identify chart patterns and technical indicators with advanced AI analysis.
              </p>
              <div className="mt-4 w-24 h-[1px] bg-red-500 rounded-full transform origin-left scale-0 group-hover:scale-100 transition-transform duration-500"></div>
            </motion.div>
            
            {/* Feature 2 */}
            <motion.div variants={fadeIn} className="group flex flex-col items-center p-6 bg-theme-light rounded-lg border border-theme-light shadow-theme transform hover:translate-y-[-4px] transition-all duration-300">
              <div className="p-3 rounded-full bg-blue-50 dark:bg-blue-900/20 mb-4 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-all duration-300">
                <ChartLine className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-xl font-semibold text-theme-main mb-2">Price Predictions</h3>
              <p className="text-center text-theme-muted">
                Get accurate entry/exit points, stop-loss levels, and potential profit targets.
              </p>
              <div className="mt-4 w-24 h-[1px] bg-blue-500 rounded-full transform origin-left scale-0 group-hover:scale-100 transition-transform duration-500"></div>
            </motion.div>
            
            {/* Feature 3 */}
            <motion.div variants={fadeIn} className="group flex flex-col items-center p-6 bg-theme-light rounded-lg border border-theme-light shadow-theme transform hover:translate-y-[-4px] transition-all duration-300">
              <div className="p-3 rounded-full bg-green-50 dark:bg-green-900/20 mb-4 group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-all duration-300">
                <Zap className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="text-xl font-semibold text-theme-main mb-2">Instant Analysis</h3>
              <p className="text-center text-theme-muted">
                Upload a chart and receive comprehensive analysis in seconds.
              </p>
              <div className="mt-4 w-24 h-[1px] bg-green-500 rounded-full transform origin-left scale-0 group-hover:scale-100 transition-transform duration-500"></div>
            </motion.div>
          </motion.div>
          
          {/* New Features Section */}
          <motion.div variants={fadeIn} className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-theme-main sm:text-4xl">
              <span className="text-red-500">Latest Trading Tools</span>
            </h2>
            <p className="mt-4 text-lg text-theme-muted max-w-3xl mx-auto">
              Cutting-edge features to enhance your trading experience and decision-making.
            </p>
          </motion.div>
          
          {/* Feature Slider */}
          <motion.div variants={fadeIn} className="mb-16">
            <FeatureSlider
              items={[
                {
                  icon: <Sparkles className="h-7 w-7 text-red-500" />,
                  title: "AI-Powered Trading Tip Generator",
                  description: "Get instant trading tips and insights for any symbol with one click. Our AI analyzes market conditions and provides actionable recommendations.",
                  color: "bg-red-50 dark:bg-red-900/20",
                  bgGradient: "bg-theme-light border border-theme-light"
                },
                {
                  icon: <Clock className="h-7 w-7 text-blue-500" />,
                  title: "Trading Session Countdown Timer",
                  description: "Never miss important trading sessions. Our interactive timer tracks major market openings across global time zones.",
                  color: "bg-blue-50 dark:bg-blue-900/20",
                  bgGradient: "bg-theme-light border border-theme-light"
                },
                {
                  icon: <Target className="h-7 w-7 text-green-500" />,
                  title: "Support & Resistance Detector",
                  description: "Automatically identify key support and resistance levels with strength indicators to help you make better entry and exit decisions.",
                  color: "bg-green-50 dark:bg-green-900/20",
                  bgGradient: "bg-theme-light border border-theme-light"
                },
                {
                  icon: <LineChart className="h-7 w-7 text-purple-500" />,
                  title: "Volume Analysis By Session",
                  description: "Analyze trading volume across different market sessions to identify the best times to trade specific pairs for maximum liquidity.",
                  color: "bg-purple-50 dark:bg-purple-900/20",
                  bgGradient: "bg-theme-light border border-theme-light"
                },
                {
                  icon: <Timer className="h-7 w-7 text-orange-500" />,
                  title: "Time Zone Converter Tool",
                  description: "Easily convert trading times between different time zones to coordinate your strategy with global market movements.",
                  color: "bg-orange-50 dark:bg-orange-900/20",
                  bgGradient: "bg-theme-light border border-theme-light"
                },
                {
                  icon: <Share2 className="h-7 w-7 text-teal-500" />,
                  title: "Webhook Signal System",
                  description: "Automatically send trading signals to TradeLocker, TradingView, or custom endpoints when analyses complete or trades open.",
                  color: "bg-teal-50 dark:bg-teal-900/20",
                  bgGradient: "bg-theme-light border border-theme-light"
                },
                {
                  icon: <Zap className="h-7 w-7 text-amber-500" />,
                  title: "MT5 Trade Copier EA",
                  description: "Copy trades from MetaTrader 5 directly to TradeLocker and other platforms with our downloadable EA and API tokens.",
                  color: "bg-amber-50 dark:bg-amber-900/20",
                  bgGradient: "bg-theme-light border border-theme-light"
                },
                {
                  icon: <Layers className="h-7 w-7 text-indigo-500" />,
                  title: "4-Stage Entry System",
                  description: "Advanced multi-stage entry pipeline: HTF trend analysis → candlestick pattern scoring → LTF timing confirmation → smart order type selection for precision entries.",
                  color: "bg-indigo-50 dark:bg-indigo-900/20",
                  bgGradient: "bg-theme-light border border-theme-light"
                },
                {
                  icon: <Pause className="h-7 w-7 text-rose-500" />,
                  title: "Choppy Market Filter",
                  description: "Automatically pauses trading during sideways/ranging markets using ADX and ATR analysis. Resumes when trends develop to avoid whipsaws.",
                  color: "bg-rose-50 dark:bg-rose-900/20",
                  bgGradient: "bg-theme-light border border-theme-light"
                },
                {
                  icon: <Wallet className="h-7 w-7 text-purple-500" />,
                  title: "Solana Token Scanner",
                  description: "AI-powered scanner that analyzes trending Solana tokens for buy/sell signals. Connect your Phantom wallet for auto-trading with Jupiter DEX integration.",
                  color: "bg-purple-50 dark:bg-purple-900/20",
                  bgGradient: "bg-theme-light border border-theme-light"
                }
              ]}
              className="min-h-[250px] md:min-h-[280px]"
            />
          </motion.div>
          
          <motion.div variants={staggerContainer} className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* News Notifications */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-theme-light rounded-lg border-theme-light shadow-theme transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-red-50 dark:bg-red-900/20 mr-3 group-hover:bg-red-100 dark:group-hover:bg-red-900/30 transition-all duration-300">
                  <Bell className="h-5 w-5 text-red-500" />
                </div>
                <h3 className="text-lg font-semibold text-theme-main">News Notifications</h3>
              </div>
              <p className="text-theme-muted flex-grow">
                Get instant alerts about market news events that may impact your analyzed trading pairs.
              </p>
            </motion.div>
            
            {/* Volatility Risk Meter */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-theme-light rounded-lg border-theme-light shadow-theme transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-orange-50 dark:bg-orange-900/20 mr-3 group-hover:bg-orange-100 dark:group-hover:bg-orange-900/30 transition-all duration-300">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                </div>
                <h3 className="text-lg font-semibold text-theme-main">Volatility Risk Meter</h3>
              </div>
              <p className="text-theme-muted flex-grow">
                Visual gauge showing market volatility levels with animated insights to help manage risk.
              </p>
            </motion.div>
            
            {/* One-Click Chart Sharing */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-theme-light rounded-lg border-theme-light shadow-theme transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-blue-50 dark:bg-blue-900/20 mr-3 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-all duration-300">
                  <Share2 className="h-5 w-5 text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold text-theme-main">One-Click Sharing</h3>
              </div>
              <p className="text-theme-muted flex-grow">
                Share your chart analyses with trading notes via public links to collaborate with other traders.
              </p>
            </motion.div>
            
            {/* Volume Analysis */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-theme-light rounded-lg border-theme-light shadow-theme transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-green-50 dark:bg-green-900/20 mr-3 group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-all duration-300">
                  <BarChart className="h-5 w-5 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-theme-main">Volume Analysis</h3>
              </div>
              <p className="text-theme-muted flex-grow">
                Monitor trading volumes across Asian, European, and US sessions to identify the best times to trade.
              </p>
            </motion.div>
            
            {/* Time Zone Converter */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-theme-light rounded-lg border-theme-light shadow-theme transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-purple-50 dark:bg-purple-900/20 mr-3 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 transition-all duration-300">
                  <Clock className="h-5 w-5 text-purple-500" />
                </div>
                <h3 className="text-lg font-semibold text-theme-main">Time Zone Converter</h3>
              </div>
              <p className="text-theme-muted flex-grow">
                Convert trading session times between different time zones to never miss important market openings.
              </p>
            </motion.div>
            
            {/* Trading Session Countdown */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-theme-light rounded-lg border-theme-light shadow-theme transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-cyan-50 dark:bg-cyan-900/20 mr-3 group-hover:bg-cyan-100 dark:group-hover:bg-cyan-900/30 transition-all duration-300">
                  <Timer className="h-5 w-5 text-cyan-500" />
                </div>
                <h3 className="text-lg font-semibold text-theme-main">Session Countdown</h3>
              </div>
              <p className="text-theme-muted flex-grow">
                Interactive countdown timer to major trading sessions, helping you prepare for market opens and closes.
              </p>
            </motion.div>
            
            {/* Solana Token Scanner */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-gradient-to-br from-purple-900/30 to-cyan-900/30 rounded-lg border border-purple-500/30 shadow-theme transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-purple-50 dark:bg-purple-900/40 mr-3 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/50 transition-all duration-300">
                  <Wallet className="h-5 w-5 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-theme-main">Solana Token Scanner</h3>
              </div>
              <p className="text-theme-muted flex-grow">
                AI-powered scanner analyzes trending Solana tokens for buy/sell signals. Connect Phantom wallet for auto-trading via Jupiter DEX.
              </p>
            </motion.div>
            
            {/* Wallet Monitoring */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-gradient-to-br from-cyan-900/30 to-blue-900/30 rounded-lg border border-cyan-500/30 shadow-theme transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-cyan-50 dark:bg-cyan-900/40 mr-3 group-hover:bg-cyan-100 dark:group-hover:bg-cyan-900/50 transition-all duration-300">
                  <Brain className="h-5 w-5 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-theme-main">Wallet Monitoring</h3>
              </div>
              <p className="text-theme-muted flex-grow">
                AI continuously monitors your wallet tokens for sell signals. Get notifications when it's time to exit positions before losses.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </motion.section>

      {/* Pattern Distribution section */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
        className="py-16 bg-theme-off border-t border-theme-light"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div variants={fadeIn} className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-theme-main sm:text-4xl">
              <span className="text-red-500">Pattern Distribution</span>
            </h2>
            <p className="mt-4 text-lg text-theme-muted max-w-3xl mx-auto">
              Our AI recognizes a wide range of technical patterns across different market conditions.
            </p>
          </motion.div>
          
          <motion.div variants={fadeIn}>
            <PatternSlider />
          </motion.div>
          
          <motion.div variants={fadeIn} className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="flex flex-col items-center p-4 bg-theme-light rounded-lg border border-theme-light shadow-theme">
              <PieChart className="h-10 w-10 text-pink-500 mb-2" />
              <span className="font-medium text-theme-main">Double Top</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-theme-light rounded-lg border border-theme-light shadow-theme">
              <ChartLine className="h-10 w-10 text-blue-500 mb-2" />
              <span className="font-medium text-theme-main">Bull Flag</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-theme-light rounded-lg border border-theme-light shadow-theme">
              <BarChart2 className="h-10 w-10 text-purple-500 mb-2" />
              <span className="font-medium text-theme-main">Head & Shoulders</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-theme-light rounded-lg border border-theme-light shadow-theme">
              <Share2 className="h-10 w-10 text-green-500 mb-2" />
              <span className="font-medium text-theme-main">Triangle</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-theme-light rounded-lg border border-theme-light shadow-theme">
              <TrendingUp className="h-10 w-10 text-red-500 mb-2" />
              <span className="font-medium text-theme-main">Ascending Channel</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-theme-light rounded-lg border border-theme-light shadow-theme">
              <TrendingDown className="h-10 w-10 text-orange-500 mb-2" />
              <span className="font-medium text-theme-main">Descending Channel</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-theme-light rounded-lg border border-theme-light shadow-theme">
              <Lightbulb className="h-10 w-10 text-yellow-500 mb-2" />
              <span className="font-medium text-theme-main">Divergence</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-theme-light rounded-lg border border-theme-light shadow-theme">
              <BarChart className="h-10 w-10 text-cyan-500 mb-2" />
              <span className="font-medium text-theme-main">Support/Resistance</span>
            </div>
          </motion.div>
        </div>
      </motion.section>
      
      {/* Replace Multiple Apps Section */}
      <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
        className="py-20 bg-gradient-to-b from-theme-light to-theme-off border-t border-theme-light"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div variants={fadeIn} className="text-center mb-12">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm font-medium mb-6">
              <Zap className="h-4 w-4 mr-2" />
              All-In-One Platform
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-theme-main sm:text-4xl">
              <span className="text-red-500">Replace Multiple Apps</span> With One
            </h2>
            <p className="mt-4 text-lg text-theme-muted max-w-3xl mx-auto">
              Stop paying for separate tools. AI Trading Vault bundles everything you need into one powerful platform.
            </p>
          </motion.div>

          <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {/* Competitor 1 */}
            <motion.div variants={fadeIn} className="p-6 bg-theme-light rounded-xl border border-red-200 dark:border-red-800 relative overflow-hidden">
              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">REPLACED</div>
              <h3 className="font-bold text-lg text-theme-main mb-2">TrendSpider</h3>
              <p className="text-2xl font-bold text-red-500 line-through mb-2">$82-197/mo</p>
              <p className="text-sm text-theme-muted">AI pattern analysis & automated chart scanning</p>
              <div className="mt-3 pt-3 border-t border-theme-light">
                <p className="text-xs text-green-500 font-medium">✓ Included in AI Trading Vault</p>
              </div>
            </motion.div>

            {/* Competitor 2 */}
            <motion.div variants={fadeIn} className="p-6 bg-theme-light rounded-xl border border-red-200 dark:border-red-800 relative overflow-hidden">
              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">REPLACED</div>
              <h3 className="font-bold text-lg text-theme-main mb-2">Trade Ideas</h3>
              <p className="text-2xl font-bold text-red-500 line-through mb-2">$118-228/mo</p>
              <p className="text-sm text-theme-muted">AI stock scanning & signal generation</p>
              <div className="mt-3 pt-3 border-t border-theme-light">
                <p className="text-xs text-green-500 font-medium">✓ Included in AI Trading Vault</p>
              </div>
            </motion.div>

            {/* Competitor 3 */}
            <motion.div variants={fadeIn} className="p-6 bg-theme-light rounded-xl border border-red-200 dark:border-red-800 relative overflow-hidden">
              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">REPLACED</div>
              <h3 className="font-bold text-lg text-theme-main mb-2">EA Builder Pro</h3>
              <p className="text-2xl font-bold text-red-500 line-through mb-2">$19.99/mo</p>
              <p className="text-sm text-theme-muted">Expert Advisor code generator</p>
              <div className="mt-3 pt-3 border-t border-theme-light">
                <p className="text-xs text-green-500 font-medium">✓ Included in AI Trading Vault</p>
              </div>
            </motion.div>

            {/* Competitor 4 */}
            <motion.div variants={fadeIn} className="p-6 bg-theme-light rounded-xl border border-red-200 dark:border-red-800 relative overflow-hidden">
              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">REPLACED</div>
              <h3 className="font-bold text-lg text-theme-main mb-2">Trade Copier Services</h3>
              <p className="text-2xl font-bold text-red-500 line-through mb-2">$50-150/mo</p>
              <p className="text-sm text-theme-muted">MT5 to TradeLocker signal relay</p>
              <div className="mt-3 pt-3 border-t border-theme-light">
                <p className="text-xs text-green-500 font-medium">✓ Included in AI Trading Vault</p>
              </div>
            </motion.div>

            {/* Competitor 5 */}
            <motion.div variants={fadeIn} className="p-6 bg-theme-light rounded-xl border border-red-200 dark:border-red-800 relative overflow-hidden">
              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">REPLACED</div>
              <h3 className="font-bold text-lg text-theme-main mb-2">News Sentiment Tools</h3>
              <p className="text-2xl font-bold text-red-500 line-through mb-2">$30-80/mo</p>
              <p className="text-sm text-theme-muted">Financial news analysis & sentiment scoring</p>
              <div className="mt-3 pt-3 border-t border-theme-light">
                <p className="text-xs text-green-500 font-medium">✓ Included in AI Trading Vault</p>
              </div>
            </motion.div>

            {/* Competitor 6 */}
            <motion.div variants={fadeIn} className="p-6 bg-theme-light rounded-xl border border-red-200 dark:border-red-800 relative overflow-hidden">
              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">REPLACED</div>
              <h3 className="font-bold text-lg text-theme-main mb-2">Webhook Alert Services</h3>
              <p className="text-2xl font-bold text-red-500 line-through mb-2">$15-40/mo</p>
              <p className="text-sm text-theme-muted">Trading signal webhooks & automation</p>
              <div className="mt-3 pt-3 border-t border-theme-light">
                <p className="text-xs text-green-500 font-medium">✓ Included in AI Trading Vault</p>
              </div>
            </motion.div>
          </motion.div>

          {/* Pricing Summary */}
          <motion.div variants={fadeIn} className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-8 text-white text-center">
            <h3 className="text-2xl font-bold mb-2">All-In-One Platform Pricing</h3>
            <p className="text-base opacity-80 mb-6">Get everything listed above in a single subscription</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-2xl mx-auto">
              <div className="bg-white/15 rounded-xl p-4">
                <p className="text-sm opacity-80 mb-1">Starter</p>
                <p className="text-3xl font-bold">$49.95</p>
                <p className="text-sm opacity-70">/month</p>
              </div>
              <div className="bg-white/25 rounded-xl p-4 ring-2 ring-white/50">
                <p className="text-sm opacity-80 mb-1">Premium</p>
                <p className="text-3xl font-bold">$149.99</p>
                <p className="text-sm opacity-70">/month</p>
              </div>
              <div className="bg-white/15 rounded-xl p-4">
                <p className="text-sm opacity-80 mb-1">Yearly</p>
                <p className="text-3xl font-bold">$999.99</p>
                <p className="text-sm opacity-70">/year</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/subscription">
                <Button size="lg" variant="secondary" className="bg-white text-green-600 hover:bg-gray-100">
                  View Pricing Plans
                </Button>
              </Link>
              <Link href="/auth">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                  Start Free Trial
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* The VEDDAI Experience Section */}
      <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
        className="py-20 bg-gradient-to-b from-theme-off to-theme-light border-t border-theme-light"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div variants={fadeIn} className="text-center mb-16">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4 mr-2" />
              Experience the Journey
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-theme-main sm:text-5xl lg:text-6xl">
              <span className="text-red-500">The VEDDAI</span> Experience
            </h2>
            <p className="mt-6 text-xl text-theme-muted max-w-4xl mx-auto leading-relaxed">
              Discover how VEDD transforms complex trading challenges into clear, actionable insights through our revolutionary approach
            </p>
          </motion.div>
          
          <motion.div variants={staggerContainer} className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            {/* Step 1 - Introduction */}
            <motion.div 
              variants={fadeIn}
              className="group relative"
            >
              <div className="absolute -top-4 -left-4 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white font-bold text-sm z-10">
                1
              </div>
              <div className="relative bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-700 group-hover:shadow-3xl transition-all duration-500 transform group-hover:-translate-y-2">
                <div className="aspect-video bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 flex items-center justify-center relative overflow-hidden">
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-4 left-4">
                      <BarChart2 className="h-8 w-8 text-red-500" />
                    </div>
                    <div className="absolute top-4 right-4">
                      <TrendingUp className="h-6 w-6 text-red-400" />
                    </div>
                    <div className="absolute bottom-4 left-4">
                      <LineChart className="h-6 w-6 text-red-400" />
                    </div>
                    <div className="absolute bottom-4 right-4">
                      <PieChart className="h-8 w-8 text-red-500" />
                    </div>
                  </div>
                  {/* Main Icon */}
                  <div className="relative z-10 p-6 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-red-100 dark:border-red-800 group-hover:scale-110 transition-transform duration-300">
                    <Zap className="h-16 w-16 text-red-500" />
                  </div>
                </div>
                <div className="p-8">
                  <div className="flex items-center mb-4">
                    <div className="w-3 h-3 rounded-full bg-red-500 mr-3"></div>
                    <span className="text-sm font-medium text-red-500 uppercase tracking-wider">Introduction</span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Initiation to Automation</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    Begin your journey with VEDD's intuitive interface. Our platform welcomes you into a world where AI-powered trading analysis becomes accessible and actionable.
                  </p>
                  <div className="mt-6 flex items-center text-red-500 text-sm font-medium">
                    <span>Learn More</span>
                    <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </motion.div>
            
            {/* Step 2 - Problem */}
            <motion.div 
              variants={fadeIn}
              className="group relative"
            >
              <div className="absolute -top-4 -left-4 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm z-10">
                2
              </div>
              <div className="relative bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-700 group-hover:shadow-3xl transition-all duration-500 transform group-hover:-translate-y-2">
                <div className="aspect-video bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 flex items-center justify-center relative overflow-hidden">
                  {/* Chaos Pattern for Problem */}
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-2 left-2 animate-pulse">
                      <BarChart className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="absolute top-8 left-8 animate-pulse delay-100">
                      <TrendingDown className="h-5 w-5 text-blue-400" />
                    </div>
                    <div className="absolute top-4 right-8 animate-pulse delay-200">
                      <AlertTriangle className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="absolute bottom-8 left-12 animate-pulse delay-300">
                      <MoreVertical className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="absolute bottom-4 right-4 animate-pulse delay-150">
                      <BarChart2 className="h-7 w-7 text-blue-500" />
                    </div>
                    <div className="absolute top-12 left-16 animate-pulse delay-250">
                      <Share2 className="h-3 w-3 text-blue-400" />
                    </div>
                  </div>
                  {/* Main Icon */}
                  <div className="relative z-10 p-6 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-blue-100 dark:border-blue-800 group-hover:scale-110 transition-transform duration-300">
                    <AlertTriangle className="h-16 w-16 text-blue-500" />
                  </div>
                </div>
                <div className="p-8">
                  <div className="flex items-center mb-4">
                    <div className="w-3 h-3 rounded-full bg-blue-500 mr-3"></div>
                    <span className="text-sm font-medium text-blue-500 uppercase tracking-wider">Problem</span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">The Trading Challenge</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    The real problem with trading isn't the lack of information, but the ability to process it effectively. VEDD addresses this fundamental challenge head-on.
                  </p>
                  <div className="mt-6 flex items-center text-blue-500 text-sm font-medium">
                    <span>Understand the Problem</span>
                    <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </motion.div>
            
            {/* Step 3 - Solution */}
            <motion.div 
              variants={fadeIn}
              className="group relative"
            >
              <div className="absolute -top-4 -left-4 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-sm z-10">
                3
              </div>
              <div className="relative bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-700 group-hover:shadow-3xl transition-all duration-500 transform group-hover:-translate-y-2">
                <div className="aspect-video bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 flex items-center justify-center relative overflow-hidden">
                  {/* Solution Pattern */}
                  <div className="absolute inset-0 opacity-15">
                    <div className="absolute top-4 left-4">
                      <Target className="h-6 w-6 text-green-500" />
                    </div>
                    <div className="absolute top-4 right-4">
                      <TrendingUp className="h-7 w-7 text-green-600" />
                    </div>
                    <div className="absolute bottom-4 left-4">
                      <BarChart2 className="h-8 w-8 text-green-500" />
                    </div>
                    <div className="absolute bottom-4 right-4">
                      <Lightbulb className="h-6 w-6 text-green-400" />
                    </div>
                    <div className="absolute top-8 left-12">
                      <ChartLine className="h-5 w-5 text-green-500" />
                    </div>
                  </div>
                  {/* Main Icon */}
                  <div className="relative z-10 p-6 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-green-100 dark:border-green-800 group-hover:scale-110 transition-transform duration-300">
                    <Lightbulb className="h-16 w-16 text-green-500" />
                  </div>
                </div>
                <div className="p-8">
                  <div className="flex items-center mb-4">
                    <div className="w-3 h-3 rounded-full bg-green-500 mr-3"></div>
                    <span className="text-sm font-medium text-green-500 uppercase tracking-wider">Solution</span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">The VEDD Answer</h3>
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    Our algorithm leverages advanced data analysis and EMA crosses to create powerful, data-driven trading strategies that maximize your returns with precision.
                  </p>
                  <div className="mt-6 flex items-center text-green-500 text-sm font-medium">
                    <span>See the Solution</span>
                    <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
          
          {/* Progress Indicator */}
          <motion.div variants={fadeIn} className="flex justify-center mt-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-16 h-0.5 bg-gray-300 dark:bg-gray-600 mx-2"></div>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <div className="w-16 h-0.5 bg-gray-300 dark:bg-gray-600 mx-2"></div>
              </div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
          </motion.div>
          
          <motion.div 
            variants={fadeIn}
            className="mt-10 flex justify-center"
          >
            <Link href="/auth" className="w-full max-w-[280px]">
              <div className="relative w-full h-16 rounded-full bg-gray-800 p-1 overflow-hidden cursor-pointer shadow-lg shadow-gray-900/20 group">
                {/* Track */}
                <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-red-500 to-red-600 opacity-90 bg-size-200 animate-gradient-x"></div>
                
                {/* Animated background effects */}
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute -bottom-10 -left-10 h-20 w-20 bg-white/20 rounded-full transition-all duration-500 group-hover:scale-150"></div>
                  <div className="absolute -top-10 -right-10 h-20 w-20 bg-white/20 rounded-full transition-all duration-500 group-hover:scale-150"></div>
                </div>
                
                {/* Text label */}
                <div className="absolute inset-0 flex items-center justify-center text-white font-semibold text-lg">
                  <span className="mr-2">Experience it Yourself</span>
                  <span className="transform transition-transform duration-500 group-hover:translate-x-3">→</span>
                </div>
                
                {/* Left sliding indicator */}
                <div className="absolute left-1 top-1 bottom-1 flex items-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform -translate-x-full group-hover:translate-x-0">
                  <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center">
                    <ArrowRight className="h-5 w-5 text-white" />
                  </div>
                </div>
                
                {/* Right sliding indicator */}
                <div className="absolute right-1 top-1 bottom-1 flex items-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-x-full group-hover:translate-x-0">
                  <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center">
                    <ArrowRight className="h-5 w-5 text-white" />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        </div>
      </motion.section>
      
      {/* Testimonials */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        className="py-20 bg-gradient-to-b from-black to-gray-950 border-t border-gray-800"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div variants={fadeIn} className="text-center mb-14">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-amber-500/10 text-amber-400 text-sm font-medium mb-4">
              <Trophy className="h-4 w-4 mr-2" />
              Trader Stories
            </div>
            <h2 className="text-3xl font-bold text-white sm:text-4xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Real traders. <span className="text-red-400">Real results.</span>
            </h2>
          </motion.div>
          <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote: "I uploaded my XAUUSD chart and the AI immediately spotted a Head & Shoulders I completely missed. Saved me from a bad BUY entry. Now I never trade without it.",
                name: "Marcus T.", role: "Forex Trader · MT5 User", stars: 5,
              },
              {
                quote: "The EA generator is insane. I described my strategy, uploaded my charts, and had a compiled MT5 Expert Advisor running in 10 minutes. Would have taken me weeks to code.",
                name: "Priya S.", role: "Algorithmic Trader · TradingView", stars: 5,
              },
              {
                quote: "I was paying $197/mo for TrendSpider alone. VEDD replaced that, my webhook service, and my news tool. Better analysis for a fraction of the cost.",
                name: "Devon K.", role: "Swing Trader · TradeLocker", stars: 5,
              },
            ].map((t, i) => (
              <motion.div
                key={i}
                variants={fadeIn}
                whileHover={{ y: -6, transition: { duration: 0.25 } }}
                className="bg-gray-900/80 rounded-2xl p-6 border border-gray-700/60 flex flex-col gap-4"
              >
                <div className="flex gap-1">
                  {Array.from({ length: t.stars }).map((_, s) => (
                    <span key={s} className="text-amber-400 text-sm">★</span>
                  ))}
                </div>
                <p className="text-gray-300 leading-relaxed text-sm italic">"{t.quote}"</p>
                <div className="mt-auto pt-4 border-t border-gray-700/40">
                  <p className="font-semibold text-white text-sm">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.role}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* Ambassador Program Teaser */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        className="py-20 bg-gradient-to-r from-amber-950/40 via-gray-900 to-amber-950/40 border-t border-amber-800/30"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div variants={slideUp}>
              <div className="inline-flex items-center px-4 py-2 rounded-full bg-amber-500/15 text-amber-400 text-sm font-medium mb-6">
                <Gift className="h-4 w-4 mr-2" />
                Ambassador Program
              </div>
              <h2 className="text-3xl font-bold text-white sm:text-4xl mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Get paid to share <span className="text-amber-400">VEDD</span>
              </h2>
              <p className="text-gray-300 text-lg leading-relaxed mb-6">
                Refer traders, earn recurring commissions, and unlock ambassador credits you can use to <strong className="text-white">pay your own Pro subscription</strong> — completely free.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "500 credits per successful referral",
                  "Recurring monthly commissions on paid plans",
                  "Use credits to pay your Starter or Premium plan",
                  "44-day training program with certifications",
                  "Bronze → Silver → Gold → Platinum tiers",
                  "Private ambassador community & strategy calls",
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-300 text-sm">
                    <div className="h-5 w-5 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-amber-400 text-xs">✓</span>
                    </div>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/ambassador-training">
                <Button className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-8 py-3 text-base rounded-full transition-all duration-300 hover:scale-105">
                  Start Ambassador Training
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
            </motion.div>

            <motion.div variants={fadeIn} className="grid grid-cols-2 gap-4">
              {[
                { tier: "Bronze", req: "5 referrals", perk: "500 credits/mo", color: "from-amber-700/30 to-amber-900/20", border: "border-amber-700/40", text: "text-amber-600" },
                { tier: "Silver", req: "15 referrals", perk: "1,500 credits/mo + 5% commission", color: "from-gray-400/20 to-gray-600/10", border: "border-gray-400/40", text: "text-gray-300" },
                { tier: "Gold", req: "40 referrals", perk: "Free Pro + 10% commission", color: "from-yellow-500/20 to-yellow-700/10", border: "border-yellow-500/40", text: "text-yellow-400" },
                { tier: "Platinum", req: "100+ referrals", perk: "Revenue share + co-marketing", color: "from-cyan-500/20 to-blue-700/10", border: "border-cyan-500/40", text: "text-cyan-400" },
              ].map((tier, i) => (
                <motion.div
                  key={i}
                  whileHover={{ scale: 1.04, transition: { duration: 0.2 } }}
                  className={`bg-gradient-to-br ${tier.color} rounded-2xl p-5 border ${tier.border}`}
                >
                  <p className={`text-lg font-bold mb-1 ${tier.text}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{tier.tier}</p>
                  <p className="text-xs text-gray-400 mb-2">{tier.req}</p>
                  <p className="text-sm text-gray-200 font-medium">{tier.perk}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* Call to Action */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
        className="py-16 bg-red-600 dark:bg-red-800 text-white border-t border-white/10"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <motion.h2 variants={fadeIn} className="text-3xl font-bold sm:text-4xl mb-4 text-white">
            Ready to Elevate Your Trading?
          </motion.h2>
          <motion.p variants={fadeIn} className="text-lg text-white/90 max-w-2xl mx-auto mb-8">
            Join traders who are using VEDD's AI-powered analysis to transform their results.
          </motion.p>
          <motion.div variants={fadeIn} className="flex flex-col items-center gap-4">
            <div className="w-full max-w-md flex justify-center mb-4">
              <Link href="/auth" className="w-full max-w-[280px]">
                <div className="relative w-full h-16 rounded-full bg-gray-800 p-1 overflow-hidden cursor-pointer shadow-lg shadow-gray-900/20 group">
                  {/* Track */}
                  <div className="absolute inset-0 bg-gradient-to-r from-red-600 via-red-500 to-red-600 opacity-90 bg-size-200 animate-gradient-x"></div>
                  
                  {/* Animated background effects */}
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute -bottom-10 -left-10 h-20 w-20 bg-white/20 rounded-full transition-all duration-500 group-hover:scale-150"></div>
                    <div className="absolute -top-10 -right-10 h-20 w-20 bg-white/20 rounded-full transition-all duration-500 group-hover:scale-150"></div>
                  </div>
                  
                  {/* Text label */}
                  <div className="absolute inset-0 flex items-center justify-center text-white font-semibold text-lg">
                    <span className="mr-2">Get Started</span>
                    <span className="transform transition-transform duration-500 group-hover:translate-x-3">→</span>
                  </div>
                  
                  {/* Left sliding indicator */}
                  <div className="absolute left-1 top-1 bottom-1 flex items-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform -translate-x-full group-hover:translate-x-0">
                    <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center">
                      <ArrowRight className="h-5 w-5 text-white" />
                    </div>
                  </div>
                  
                  {/* Right sliding indicator */}
                  <div className="absolute right-1 top-1 bottom-1 flex items-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-x-full group-hover:translate-x-0">
                    <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center">
                      <ArrowRight className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </div>
              </Link>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <EarlyAccessForm />
              
              <Link href="/subscription">
                <Button size="lg" variant="outline" className="border-white/40 text-white/60 hover:bg-white/10 hover:text-white transition-all duration-300">
                  View Pricing
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </motion.section>
      
      {/* Interactive Demo Section */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
        className="py-20 bg-theme-off border-t border-theme-light"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <DemoSection />
        </div>
      </motion.section>
      
      {/* Footer */}
      <footer className="w-full border-t border-theme-light py-6 px-6 bg-theme-light">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-4 md:mb-0">
            <img src={logoImg} alt="VEDD Logo" className="h-8" />
            <span className="ml-2 text-xs text-red-500 italic font-light">seize the day divine</span>
          </div>
          
          <div className="flex items-center space-x-8">
            <Link href="/blog" className="text-sm text-theme-main hover:text-red-500 transition-colors duration-300">
              Blog
            </Link>
            <Link href="/subscription" className="text-sm text-theme-main hover:text-red-500 transition-colors duration-300">
              Pricing
            </Link>
            <button 
              onClick={() => setIsLoginOpen(true)}
              className="text-sm text-theme-main hover:text-red-500 transition-colors duration-300"
            >
              Login
            </button>
            <Link href="/contact" className="text-sm text-theme-main hover:text-red-500 transition-colors duration-300">
              Contact
            </Link>
          </div>
        </div>
      </footer>
      
      {/* Floating Login Button */}
      <motion.button
        onClick={() => setIsLoginOpen(true)}
        className="fixed bottom-6 right-6 z-40 p-4 rounded-full bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-500/30 hover:shadow-xl hover:shadow-red-500/40 transition-shadow"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
      >
        <Lock className="h-6 w-6" />
      </motion.button>
      
      {/* Gamified Login Modal */}
      <GamifiedLogin isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </div>
  );
}