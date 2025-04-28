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
  Lightbulb
} from "lucide-react";
import { motion } from "framer-motion";
import { EarlyAccessForm } from "@/components/early-access/early-access-form";
import { FeatureSlider } from "@/components/ui/feature-slider";
import { PatternSlider } from "@/components/ui/pattern-slider";
import { patternDescriptions } from "@/assets/pattern-descriptions";
import logoImg from "@/assets/IMG_3645.png";

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
    <div className="flex flex-col min-h-screen bg-[#fcf8ef]">
      {/* Header with Logo */}
      <header className="w-full border-b border-black/10 py-4 px-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <img src={logoImg} alt="VEDD Logo" className="h-12" />
            <span className="ml-2 text-xs text-red-500 italic font-light">seize the day divine</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 bg-black rounded-full"></div>
            <div className="w-2 h-2 bg-black rounded-full"></div>
            <div className="w-2 h-2 bg-black rounded-full"></div>
          </div>
        </div>
      </header>
      
      {/* Hero section */}
      <motion.section 
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="flex flex-col items-center justify-center px-6 py-16 bg-[#fcf8ef] lg:px-8 lg:py-24"
      >
        <div className="max-w-7xl mx-auto text-center">
          <motion.div variants={fadeIn} className="mb-8 flex justify-center">
            <img 
              src={logoImg} 
              alt="VEDD Logo" 
              className="h-20 md:h-28 drop-shadow-sm transition-all duration-300"
            />
          </motion.div>
          
          <motion.h1 variants={slideUp} className="text-4xl font-bold tracking-tight text-black sm:text-5xl md:text-6xl">
            <span className="text-red-500">AI-Powered</span> Chart Analysis
          </motion.h1>
          
          <motion.p variants={slideUp} className="mt-6 text-xl text-gray-700 max-w-3xl mx-auto">
            Transform your trading with advanced AI analysis. Upload charts from MT4, MT5, or TradingView 
            and get precise market insights, patterns, and actionable signals instantly.
          </motion.p>
          
          <motion.div variants={slideUp} className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth">
              <Button size="lg" className="bg-red-500 hover:bg-red-600 text-white shadow-sm transition-all duration-300 transform hover:translate-y-[-2px]">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
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
        className="py-16 bg-white border-t border-black/10"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div variants={fadeIn} className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-black sm:text-4xl">
              <span className="text-red-500">Powerful Trading Intelligence</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-3xl mx-auto">
              Our AI-powered platform analyzes chart patterns and market conditions to provide you with accurate insights and trading recommendations.
            </p>
          </motion.div>
          
          {/* Main Features */}
          <motion.div variants={staggerContainer} className="grid grid-cols-1 gap-8 md:grid-cols-3 mb-16">
            {/* Feature 1 */}
            <motion.div variants={fadeIn} className="group flex flex-col items-center p-6 bg-[#fcf8ef] rounded-lg border border-black/10 shadow-sm transform hover:translate-y-[-4px] transition-all duration-300">
              <div className="p-3 rounded-full bg-red-50 mb-4 group-hover:bg-red-100 transition-all duration-300">
                <BarChart2 className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-xl font-semibold text-black mb-2">Pattern Recognition</h3>
              <p className="text-center text-gray-600">
                Identify chart patterns and technical indicators with advanced AI analysis.
              </p>
              <div className="mt-4 w-24 h-[1px] bg-red-500 rounded-full transform origin-left scale-0 group-hover:scale-100 transition-transform duration-500"></div>
            </motion.div>
            
            {/* Feature 2 */}
            <motion.div variants={fadeIn} className="group flex flex-col items-center p-6 bg-[#fcf8ef] rounded-lg border border-black/10 shadow-sm transform hover:translate-y-[-4px] transition-all duration-300">
              <div className="p-3 rounded-full bg-blue-50 mb-4 group-hover:bg-blue-100 transition-all duration-300">
                <ChartLine className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-xl font-semibold text-black mb-2">Price Predictions</h3>
              <p className="text-center text-gray-600">
                Get accurate entry/exit points, stop-loss levels, and potential profit targets.
              </p>
              <div className="mt-4 w-24 h-[1px] bg-blue-500 rounded-full transform origin-left scale-0 group-hover:scale-100 transition-transform duration-500"></div>
            </motion.div>
            
            {/* Feature 3 */}
            <motion.div variants={fadeIn} className="group flex flex-col items-center p-6 bg-[#fcf8ef] rounded-lg border border-black/10 shadow-sm transform hover:translate-y-[-4px] transition-all duration-300">
              <div className="p-3 rounded-full bg-green-50 mb-4 group-hover:bg-green-100 transition-all duration-300">
                <Zap className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="text-xl font-semibold text-black mb-2">Instant Analysis</h3>
              <p className="text-center text-gray-600">
                Upload a chart and receive comprehensive analysis in seconds.
              </p>
              <div className="mt-4 w-24 h-[1px] bg-green-500 rounded-full transform origin-left scale-0 group-hover:scale-100 transition-transform duration-500"></div>
            </motion.div>
          </motion.div>
          
          {/* New Features Section */}
          <motion.div variants={fadeIn} className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-black sm:text-4xl">
              <span className="text-red-500">Latest Trading Tools</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-3xl mx-auto">
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
                  color: "bg-red-50",
                  bgGradient: "bg-white border border-red-100"
                },
                {
                  icon: <Clock className="h-7 w-7 text-blue-500" />,
                  title: "Trading Session Countdown Timer",
                  description: "Never miss important trading sessions. Our interactive timer tracks major market openings across global time zones.",
                  color: "bg-blue-50",
                  bgGradient: "bg-white border border-blue-100"
                },
                {
                  icon: <Target className="h-7 w-7 text-green-500" />,
                  title: "Support & Resistance Detector",
                  description: "Automatically identify key support and resistance levels with strength indicators to help you make better entry and exit decisions.",
                  color: "bg-green-50",
                  bgGradient: "bg-white border border-green-100"
                },
                {
                  icon: <LineChart className="h-7 w-7 text-purple-500" />,
                  title: "Volume Analysis By Session",
                  description: "Analyze trading volume across different market sessions to identify the best times to trade specific pairs for maximum liquidity.",
                  color: "bg-purple-50",
                  bgGradient: "bg-white border border-purple-100"
                },
                {
                  icon: <Timer className="h-7 w-7 text-orange-500" />,
                  title: "Time Zone Converter Tool",
                  description: "Easily convert trading times between different time zones to coordinate your strategy with global market movements.",
                  color: "bg-orange-50",
                  bgGradient: "bg-white border border-orange-100"
                }
              ]}
              className="min-h-[250px] md:min-h-[280px]"
            />
          </motion.div>
          
          <motion.div variants={staggerContainer} className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* News Notifications */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-[#fcf8ef] rounded-lg border border-black/10 shadow-sm transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-red-50 mr-3 group-hover:bg-red-100 transition-all duration-300">
                  <Bell className="h-5 w-5 text-red-500" />
                </div>
                <h3 className="text-lg font-semibold text-black">News Notifications</h3>
              </div>
              <p className="text-gray-600 flex-grow">
                Get instant alerts about market news events that may impact your analyzed trading pairs.
              </p>
            </motion.div>
            
            {/* Volatility Risk Meter */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-[#fcf8ef] rounded-lg border border-black/10 shadow-sm transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-orange-50 mr-3 group-hover:bg-orange-100 transition-all duration-300">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                </div>
                <h3 className="text-lg font-semibold text-black">Volatility Risk Meter</h3>
              </div>
              <p className="text-gray-600 flex-grow">
                Visual gauge showing market volatility levels with animated insights to help manage risk.
              </p>
            </motion.div>
            
            {/* One-Click Chart Sharing */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-[#fcf8ef] rounded-lg border border-black/10 shadow-sm transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-blue-50 mr-3 group-hover:bg-blue-100 transition-all duration-300">
                  <Share2 className="h-5 w-5 text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold text-black">One-Click Sharing</h3>
              </div>
              <p className="text-gray-600 flex-grow">
                Share your chart analyses with trading notes via public links to collaborate with other traders.
              </p>
            </motion.div>
            
            {/* Volume Analysis */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-[#fcf8ef] rounded-lg border border-black/10 shadow-sm transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-green-50 mr-3 group-hover:bg-green-100 transition-all duration-300">
                  <BarChart className="h-5 w-5 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-black">Volume Analysis</h3>
              </div>
              <p className="text-gray-600 flex-grow">
                Monitor trading volumes across Asian, European, and US sessions to identify the best times to trade.
              </p>
            </motion.div>
            
            {/* Time Zone Converter */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-[#fcf8ef] rounded-lg border border-black/10 shadow-sm transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-purple-50 mr-3 group-hover:bg-purple-100 transition-all duration-300">
                  <Clock className="h-5 w-5 text-purple-500" />
                </div>
                <h3 className="text-lg font-semibold text-black">Time Zone Converter</h3>
              </div>
              <p className="text-gray-600 flex-grow">
                Convert trading session times between different time zones to never miss important market openings.
              </p>
            </motion.div>
            
            {/* Trading Session Countdown */}
            <motion.div variants={fadeIn} className="flex flex-col p-6 bg-[#fcf8ef] rounded-lg border border-black/10 shadow-sm transform hover:translate-y-[-4px] transition-all duration-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-cyan-50 mr-3 group-hover:bg-cyan-100 transition-all duration-300">
                  <Timer className="h-5 w-5 text-cyan-500" />
                </div>
                <h3 className="text-lg font-semibold text-black">Session Countdown</h3>
              </div>
              <p className="text-gray-600 flex-grow">
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
        className="py-16 bg-[#fcf8ef] border-t border-black/10"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <motion.div variants={fadeIn} className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-black sm:text-4xl">
              <span className="text-red-500">Pattern Distribution</span>
            </h2>
            <p className="mt-4 text-lg text-gray-600 max-w-3xl mx-auto">
              Our AI recognizes a wide range of technical patterns across different market conditions.
            </p>
          </motion.div>
          
          <motion.div variants={fadeIn}>
            <PatternSlider />
          </motion.div>
          
          <motion.div variants={fadeIn} className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-black/10 shadow-sm">
              <PieChart className="h-10 w-10 text-pink-500 mb-2" />
              <span className="font-medium text-black">Double Top</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-black/10 shadow-sm">
              <ChartLine className="h-10 w-10 text-blue-500 mb-2" />
              <span className="font-medium text-black">Bull Flag</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-black/10 shadow-sm">
              <BarChart2 className="h-10 w-10 text-purple-500 mb-2" />
              <span className="font-medium text-black">Head & Shoulders</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-black/10 shadow-sm">
              <Share2 className="h-10 w-10 text-green-500 mb-2" />
              <span className="font-medium text-black">Triangle</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-black/10 shadow-sm">
              <TrendingUp className="h-10 w-10 text-red-500 mb-2" />
              <span className="font-medium text-black">Ascending Channel</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-black/10 shadow-sm">
              <TrendingDown className="h-10 w-10 text-orange-500 mb-2" />
              <span className="font-medium text-black">Descending Channel</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-black/10 shadow-sm">
              <Lightbulb className="h-10 w-10 text-yellow-500 mb-2" />
              <span className="font-medium text-black">Divergence</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-black/10 shadow-sm">
              <BarChart className="h-10 w-10 text-cyan-500 mb-2" />
              <span className="font-medium text-black">Support/Resistance</span>
            </div>
          </motion.div>
        </div>
      </motion.section>
      
      {/* Call to Action */}
      <motion.section 
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={staggerContainer}
        className="py-16 bg-black text-white border-t border-white/10"
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <motion.h2 variants={fadeIn} className="text-3xl font-bold sm:text-4xl mb-4">
            Ready to Elevate Your Trading?
          </motion.h2>
          <motion.p variants={fadeIn} className="text-lg text-gray-300 max-w-2xl mx-auto mb-8">
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
      <footer className="w-full border-t border-black/10 py-6 px-6 bg-[#fcf8ef]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center mb-4 md:mb-0">
            <img src={logoImg} alt="VEDD Logo" className="h-8" />
            <span className="ml-2 text-xs text-red-500 italic font-light">seize the day divine</span>
          </div>
          
          <div className="flex items-center space-x-8">
            <Link href="/blog" className="text-sm text-black hover:text-red-500 transition-colors duration-300">
              Blog
            </Link>
            <Link href="/subscription" className="text-sm text-black hover:text-red-500 transition-colors duration-300">
              Pricing
            </Link>
            <Link href="/auth" className="text-sm text-black hover:text-red-500 transition-colors duration-300">
              Login
            </Link>
            <Link href="/contact" className="text-sm text-black hover:text-red-500 transition-colors duration-300">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}