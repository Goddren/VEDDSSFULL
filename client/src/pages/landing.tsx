import { Button } from "@/components/ui/button";
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
  Info
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import { EarlyAccessForm } from "@/components/early-access/early-access-form";
import { FeatureSlider } from "@/components/ui/feature-slider";
import { PatternSlider } from "@/components/ui/pattern-slider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { patternDescriptions } from "@/assets/pattern-descriptions";
import logoImg from "@/assets/IMG_3645.png";
import appScreenOne from "@/assets/1.png";
import appScreenTwo from "@/assets/3.png";
import appScreenThree from "@/assets/4.png";

export default function LandingPage() {
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
    <div className="flex flex-col min-h-screen bg-theme-off">
      {/* Header with Logo */}
      <header className="w-full border-b border-theme-light py-4 px-6 bg-theme-light">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <img src={logoImg} alt="VEDD Logo" className="h-12" />
            <span className="ml-2 text-xs text-red-500 italic font-light">seize the day divine</span>
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
            <img 
              src={logoImg} 
              alt="VEDD Logo" 
              className="h-20 md:h-28 drop-shadow-sm transition-all duration-300"
            />
          </motion.div>
          
          <motion.h1 variants={slideUp} className="text-4xl font-bold tracking-tight text-theme-main sm:text-5xl md:text-6xl">
            <span className="text-red-500">AI-Powered</span> Chart Analysis
          </motion.h1>
          
          <motion.p variants={slideUp} className="mt-6 text-xl text-theme-muted max-w-3xl mx-auto">
            Transform your trading with advanced AI analysis. Upload charts from MT4, MT5, or TradingView 
            and get precise market insights, patterns, and actionable signals instantly.
          </motion.p>
          
          <motion.div variants={slideUp} className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth">
              <div className="relative overflow-hidden bg-gradient-to-r from-red-600 to-red-700 rounded-full h-14 pr-4 pl-6 flex items-center shadow-lg shadow-red-500/20 text-white cursor-pointer group">
                <div className="flex-1 text-left font-semibold">
                  Get Started
                </div>
                <div className="relative">
                  <div className="absolute inset-0 bg-white rounded-full opacity-20 scale-75 group-hover:scale-100 transition-all duration-300 animate-pulse-custom"></div>
                  <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center transform translate-x-0 group-hover:translate-x-1 transition-transform duration-300">
                    <ArrowRight className="h-5 w-5 text-red-600" />
                  </div>
                </div>
                <div className="absolute -bottom-10 -left-10 h-20 w-20 bg-white/10 rounded-full transition-all duration-500 group-hover:scale-150 group-hover:opacity-20"></div>
                <div className="absolute -top-10 -right-10 h-20 w-20 bg-white/10 rounded-full transition-all duration-500 group-hover:scale-150 group-hover:opacity-20"></div>
              </div>
            </Link>
            <EarlyAccessForm />
            <Link href="/subscription">
              <Button size="lg" variant="outline" className="border-black text-black hover:bg-black/5 transition-all duration-300">
                View Pricing
              </Button>
            </Link>
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
      
      {/* App Screenshots Showcase Section */}
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
              <span className="text-red-500">The VEDDAI Experience</span>
            </h2>
            <p className="mt-4 text-lg text-theme-muted max-w-3xl mx-auto">
              Take a tour of our intuitive interface and powerful trading tools
            </p>
          </motion.div>
          
          <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Screenshot 1 */}
            <motion.div 
              variants={fadeIn}
              whileHover={{ y: -8, transition: { duration: 0.3 } }}
              className="bg-theme-light rounded-xl overflow-hidden shadow-xl border border-theme-light"
            >
              <div className="p-1 bg-gradient-to-r from-gray-200 to-gray-100 dark:from-gray-800 dark:to-gray-900">
                <div className="flex items-center space-x-1.5 px-3 py-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                  <div className="text-xs text-gray-500 ml-2">VEDDAI Trading Suite</div>
                </div>
              </div>
              <img 
                src={appScreenOne} 
                alt="VEDDAI Interface" 
                className="w-full object-cover"
              />
              <div className="p-5">
                <h3 className="text-lg font-semibold text-theme-main mb-2">Initiation to Automation</h3>
                <p className="text-sm text-theme-muted">Our elegant landing page introduces you to the power of AI-driven trading analysis and decision support.</p>
              </div>
            </motion.div>
            
            {/* Screenshot 2 */}
            <motion.div 
              variants={fadeIn}
              whileHover={{ y: -8, transition: { duration: 0.3 } }}
              className="bg-theme-light rounded-xl overflow-hidden shadow-xl border border-theme-light"
            >
              <div className="p-1 bg-gradient-to-r from-gray-200 to-gray-100 dark:from-gray-800 dark:to-gray-900">
                <div className="flex items-center space-x-1.5 px-3 py-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                  <div className="text-xs text-gray-500 ml-2">VEDDAI Trading Problem</div>
                </div>
              </div>
              <img 
                src={appScreenTwo} 
                alt="VEDDAI Analysis Dashboard" 
                className="w-full object-cover"
              />
              <div className="p-5">
                <h3 className="text-lg font-semibold text-theme-main mb-2">The Trading Problem</h3>
                <p className="text-sm text-theme-muted">We address the real problem with trading - not the lack of information, but the ability to process it effectively.</p>
              </div>
            </motion.div>
            
            {/* Screenshot 3 */}
            <motion.div 
              variants={fadeIn}
              whileHover={{ y: -8, transition: { duration: 0.3 } }}
              className="bg-theme-light rounded-xl overflow-hidden shadow-xl border border-theme-light"
            >
              <div className="p-1 bg-gradient-to-r from-gray-200 to-gray-100 dark:from-gray-800 dark:to-gray-900">
                <div className="flex items-center space-x-1.5 px-3 py-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                  <div className="text-xs text-gray-500 ml-2">VEDDAI Trading Answer</div>
                </div>
              </div>
              <img 
                src={appScreenThree} 
                alt="VEDDAI Chart Analysis" 
                className="w-full object-cover"
              />
              <div className="p-5">
                <h3 className="text-lg font-semibold text-theme-main mb-2">The VEDDAI Answer</h3>
                <p className="text-sm text-theme-muted">Our algorithm leverages data analysis and EMA crosses to create powerful, data-driven trading strategies that maximize your returns.</p>
              </div>
            </motion.div>
          </motion.div>
          
          <motion.div 
            variants={fadeIn}
            className="mt-10 text-center"
          >
            <Link href="/auth">
              <Button className="bg-red-500 hover:bg-red-600 text-white">
                Experience it Yourself <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
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
          <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth">
              <Button size="lg" className="bg-red-500 hover:bg-red-600 text-white font-medium">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            
            <EarlyAccessForm />
            
            <Link href="/subscription">
              <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                View Pricing
              </Button>
            </Link>
          </motion.div>
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
            <Link href="/auth" className="text-sm text-theme-main hover:text-red-500 transition-colors duration-300">
              Login
            </Link>
            <Link href="/contact" className="text-sm text-theme-main hover:text-red-500 transition-colors duration-300">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}