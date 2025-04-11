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
  BarChart3,
  LineChart,
  Lightbulb,
  FlaskConical
} from "lucide-react";
import logoImg from "@assets/IMG_3645.png";
import { FeatureSlider } from "@/components/ui/feature-slider";
import { PatternSlider } from "@/components/ui/pattern-slider";
import { patternDescriptions } from "@/assets/pattern-descriptions";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero section */}
      <div className="flex flex-col items-center justify-center relative px-6 py-16 bg-gradient-to-r from-black via-gray-900 to-black lg:px-8 lg:py-24 overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -left-10 top-1/4 w-40 h-40 bg-rose-600/20 rounded-full filter blur-3xl animate-pulse"></div>
          <div className="absolute right-10 top-3/4 w-60 h-60 bg-blue-600/20 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute left-1/3 bottom-0 w-80 h-80 bg-purple-600/20 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
          
          {/* Animated chart elements */}
          <div className="absolute left-0 top-1/3 flex space-x-1 opacity-30">
            {[40, 65, 30, 85, 55, 75, 40, 90, 60, 45, 70].map((height, i) => (
              <div 
                key={i}
                className="w-2 bg-emerald-500 rounded-t-sm animate-bounce-custom" 
                style={{ 
                  height: `${height}px`,
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: '2s'
                }}
              ></div>
            ))}
          </div>
          
          <div className="absolute right-0 bottom-1/4 flex space-x-1 opacity-30">
            {[70, 45, 60, 90, 40, 75, 55, 85, 30, 65, 40].map((height, i) => (
              <div 
                key={i}
                className="w-2 bg-red-600 rounded-t-sm animate-bounce-custom" 
                style={{ 
                  height: `${height}px`,
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: '2s'
                }}
              ></div>
            ))}
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto text-center relative z-10">
          <div className="mb-8 flex justify-center">
            <img 
              src={logoImg} 
              alt="VEDD Logo" 
              className="h-20 md:h-28 animate-pulse hover:animate-none transition-all duration-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
            />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl animate-in slide-in-from-bottom-3 duration-500">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-600 via-rose-500 to-red-400">
              AI-Powered
            </span> Chart Analysis
          </h1>
          <p className="mt-6 text-xl text-gray-200 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-3 duration-700 delay-200">
            Transform your trading with advanced AI analysis. Upload charts from MT4, MT5, or TradingView 
            and get precise market insights, patterns, and actionable signals instantly.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center animate-in fade-in slide-in-from-bottom-3 duration-1000 delay-300">
            <Link href="/auth">
              <Button size="lg" className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 transition-all duration-300 transform hover:scale-105">
                Get Started <ArrowRight className="ml-2 h-4 w-4 animate-bounce-custom" />
              </Button>
            </Link>
            <Link href="/subscription">
              <Button size="lg" variant="outline" className="border-red-600 text-white hover:bg-red-700/20 hover:border-red-500 transition-all duration-300 transform hover:scale-105">
                View Pricing
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline" className="border-gray-500 text-white hover:bg-white/10 transition-all duration-300 transform hover:scale-105">
                Learn More
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* Features section */}
      <div id="features" className="py-16 bg-gradient-to-b from-black to-gray-950 relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden opacity-30">
          {/* Stock market grid background */}
          <div className="absolute inset-0">
            {Array.from({ length: 20 }).map((_, rowIndex) => (
              <div key={`grid-row-${rowIndex}`} className="flex">
                {Array.from({ length: 30 }).map((_, colIndex) => {
                  const randomOpacity = (Math.random() * 0.1).toFixed(2);
                  return (
                    <div 
                      key={`grid-cell-${rowIndex}-${colIndex}`} 
                      className={`border border-fuchsia-900/10 w-10 h-10`}
                      style={{ 
                        opacity: randomOpacity,
                        animationDelay: `${(rowIndex + colIndex) * 0.1}s`,
                      }}
                    ></div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      
        <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl animate-in fade-in slide-in-from-bottom-3 duration-700">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-600 via-rose-500 to-red-400">
                Powerful Trading Intelligence
              </span>
            </h2>
            <p className="mt-4 text-lg text-gray-300 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-3 duration-700 delay-200">
              Our AI-powered platform analyzes chart patterns and market conditions to provide you with accurate insights and trading recommendations.
            </p>
          </div>
          
          {/* Main Features */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3 mb-16">
            {/* Feature 1 */}
            <div className="group flex flex-col items-center p-6 bg-gradient-to-b from-black/80 to-gray-900/60 backdrop-blur-md rounded-lg border border-red-900/40 shadow-lg shadow-red-500/5 transform hover:scale-105 hover:shadow-red-500/20 hover:border-red-700/50 transition-all duration-300 animate-in fade-in-0 slide-in-from-bottom-3 duration-500">
              <div className="p-3 rounded-full bg-gradient-to-br from-red-600/40 to-red-900/20 mb-4 group-hover:from-red-500/50 group-hover:to-red-800/30 transition-all duration-300">
                <BarChart2 className="h-8 w-8 text-red-400 group-hover:text-red-300 animate-pulse transition-colors duration-300" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-red-300 transition-colors duration-300">Pattern Recognition</h3>
              <p className="text-center text-gray-300 group-hover:text-gray-200 transition-colors duration-300">
                Identify chart patterns and technical indicators with advanced AI analysis.
              </p>
              <div className="mt-4 w-24 h-1 bg-gradient-to-r from-red-500 to-rose-500 rounded-full transform origin-left scale-0 group-hover:scale-100 transition-transform duration-500"></div>
            </div>
            
            {/* Feature 2 */}
            <div className="group flex flex-col items-center p-6 bg-gradient-to-b from-black/80 to-gray-900/60 backdrop-blur-md rounded-lg border border-indigo-900/40 shadow-lg shadow-indigo-500/5 transform hover:scale-105 hover:shadow-indigo-500/20 hover:border-indigo-700/50 transition-all duration-300 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 delay-150">
              <div className="p-3 rounded-full bg-gradient-to-br from-indigo-600/40 to-indigo-900/20 mb-4 group-hover:from-indigo-500/50 group-hover:to-indigo-800/30 transition-all duration-300">
                <ChartLine className="h-8 w-8 text-indigo-400 group-hover:text-indigo-300 animate-pulse transition-colors duration-300" style={{ animationDelay: '0.5s' }} />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-indigo-300 transition-colors duration-300">Price Predictions</h3>
              <p className="text-center text-gray-300 group-hover:text-gray-200 transition-colors duration-300">
                Get accurate entry/exit points, stop-loss levels, and potential profit targets.
              </p>
              <div className="mt-4 w-24 h-1 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transform origin-left scale-0 group-hover:scale-100 transition-transform duration-500"></div>
            </div>
            
            {/* Feature 3 */}
            <div className="group flex flex-col items-center p-6 bg-gradient-to-b from-black/80 to-gray-900/60 backdrop-blur-md rounded-lg border border-rose-900/40 shadow-lg shadow-rose-500/5 transform hover:scale-105 hover:shadow-rose-500/20 hover:border-rose-700/50 transition-all duration-300 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 delay-300">
              <div className="p-3 rounded-full bg-gradient-to-br from-rose-600/40 to-rose-900/20 mb-4 group-hover:from-rose-500/50 group-hover:to-rose-800/30 transition-all duration-300">
                <Zap className="h-8 w-8 text-rose-400 group-hover:text-rose-300 animate-pulse transition-colors duration-300" style={{ animationDelay: '1s' }} />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-rose-300 transition-colors duration-300">Instant Analysis</h3>
              <p className="text-center text-gray-300 group-hover:text-gray-200 transition-colors duration-300">
                Upload a chart and receive comprehensive analysis in seconds.
              </p>
              <div className="mt-4 w-24 h-1 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full transform origin-left scale-0 group-hover:scale-100 transition-transform duration-500"></div>
            </div>
          </div>
          
          {/* New Features Section */}
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl animate-in fade-in slide-in-from-bottom-3 duration-700">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-red-600 to-rose-500">
                Latest Trading Tools
              </span>
            </h2>
            <p className="mt-4 text-lg text-gray-300 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-3 duration-700 delay-200">
              Cutting-edge features to enhance your trading experience and decision-making.
            </p>
          </div>
          
          {/* Feature Slider */}
          <div className="mb-16 animate-in fade-in-0 slide-in-from-bottom-3 duration-700">
            <FeatureSlider
              items={[
                {
                  icon: <Sparkles className="h-7 w-7 text-white" />,
                  title: "AI-Powered Trading Tip Generator",
                  description: "Get instant trading tips and insights for any symbol with one click. Our AI analyzes market conditions and provides actionable recommendations.",
                  color: "bg-gradient-to-br from-red-600/50 to-pink-600/50",
                  bgGradient: "bg-gradient-to-b from-black/90 to-rose-900/20 border border-rose-600/30"
                },
                {
                  icon: <Clock className="h-7 w-7 text-white" />,
                  title: "Trading Session Countdown Timer",
                  description: "Never miss important trading sessions. Our interactive timer tracks major market openings across global time zones.",
                  color: "bg-gradient-to-br from-blue-600/50 to-indigo-600/50",
                  bgGradient: "bg-gradient-to-b from-black/90 to-blue-900/20 border border-blue-600/30"
                },
                {
                  icon: <Target className="h-7 w-7 text-white" />,
                  title: "Support & Resistance Detector",
                  description: "Automatically identify key support and resistance levels with strength indicators to help you make better entry and exit decisions.",
                  color: "bg-gradient-to-br from-emerald-600/50 to-green-600/50",
                  bgGradient: "bg-gradient-to-b from-black/90 to-emerald-900/20 border border-emerald-600/30"
                },
                {
                  icon: <LineChart className="h-7 w-7 text-white" />,
                  title: "Volume Analysis By Session",
                  description: "Analyze trading volume across different market sessions to identify the best times to trade specific pairs for maximum liquidity.",
                  color: "bg-gradient-to-br from-red-600/50 to-rose-600/50",
                  bgGradient: "bg-gradient-to-b from-black/90 to-red-900/20 border border-red-600/30"
                },
                {
                  icon: <Timer className="h-7 w-7 text-white" />,
                  title: "Time Zone Converter Tool",
                  description: "Easily convert trading times between different time zones to coordinate your strategy with global market movements.",
                  color: "bg-gradient-to-br from-purple-600/50 to-violet-600/50",
                  bgGradient: "bg-gradient-to-b from-black/90 to-purple-900/20 border border-purple-600/30"
                }
              ]}
              className="min-h-[250px] md:min-h-[280px]"
            />
          </div>
          
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* News Notifications */}
            <div className="flex flex-col p-6 bg-gradient-to-b from-black/90 to-gray-900/80 backdrop-blur-sm rounded-lg border border-red-900/30 shadow-xl shadow-red-500/5 hover:shadow-red-500/20 hover:border-red-700/40 transition-all duration-300 transform hover:-translate-y-1 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-gradient-to-br from-red-600/40 to-red-900/20 mr-3 group-hover:from-red-500/50 group-hover:to-red-800/30 transition-all duration-300">
                  <Bell className="h-5 w-5 text-red-400 group-hover:text-red-300 group-hover:animate-ping transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-semibold text-white group-hover:text-red-300 transition-colors duration-300">News Notifications</h3>
              </div>
              <p className="text-gray-300 flex-grow group-hover:text-gray-200 transition-colors duration-300">
                Get instant alerts about market news events that may impact your analyzed trading pairs.
              </p>
            </div>
            
            {/* Volatility Risk Meter */}
            <div className="flex flex-col p-6 bg-gradient-to-b from-black/90 to-gray-900/80 backdrop-blur-sm rounded-lg border border-red-900/30 shadow-xl shadow-red-500/5 hover:shadow-red-500/20 hover:border-red-700/40 transition-all duration-300 transform hover:-translate-y-1 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 delay-100 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-gradient-to-br from-red-600/40 to-red-900/20 mr-3 group-hover:from-red-500/50 group-hover:to-red-800/30 transition-all duration-300">
                  <AlertTriangle className="h-5 w-5 text-red-400 group-hover:text-red-300 group-hover:animate-pulse transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-semibold text-white group-hover:text-red-300 transition-colors duration-300">Volatility Risk Meter</h3>
              </div>
              <p className="text-gray-300 flex-grow group-hover:text-gray-200 transition-colors duration-300">
                Visual gauge showing market volatility levels with animated insights to help manage risk.
              </p>
            </div>
            
            {/* One-Click Chart Sharing */}
            <div className="flex flex-col p-6 bg-gradient-to-b from-black/90 to-gray-900/80 backdrop-blur-sm rounded-lg border border-indigo-900/30 shadow-xl shadow-indigo-500/5 hover:shadow-indigo-500/20 hover:border-indigo-700/40 transition-all duration-300 transform hover:-translate-y-1 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 delay-200 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-gradient-to-br from-indigo-600/40 to-indigo-900/20 mr-3 group-hover:from-indigo-500/50 group-hover:to-indigo-800/30 transition-all duration-300">
                  <Share2 className="h-5 w-5 text-indigo-400 group-hover:text-indigo-300 group-hover:animate-bounce transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors duration-300">One-Click Sharing</h3>
              </div>
              <p className="text-gray-300 flex-grow group-hover:text-gray-200 transition-colors duration-300">
                Share your chart analyses with trading notes via public links to collaborate with other traders.
              </p>
            </div>
            
            {/* Volume Analysis */}
            <div className="flex flex-col p-6 bg-gradient-to-b from-black/90 to-gray-900/80 backdrop-blur-sm rounded-lg border border-emerald-900/30 shadow-xl shadow-emerald-500/5 hover:shadow-emerald-500/20 hover:border-emerald-700/40 transition-all duration-300 transform hover:-translate-y-1 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 delay-300 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-gradient-to-br from-emerald-600/40 to-emerald-900/20 mr-3 group-hover:from-emerald-500/50 group-hover:to-emerald-800/30 transition-all duration-300">
                  <BarChart className="h-5 w-5 text-emerald-400 group-hover:text-emerald-300 group-hover:animate-pulse transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-semibold text-white group-hover:text-emerald-300 transition-colors duration-300">Volume Analysis</h3>
              </div>
              <p className="text-gray-300 flex-grow group-hover:text-gray-200 transition-colors duration-300">
                Monitor trading volumes across Asian, European, and US sessions to identify the best times to trade.
              </p>
            </div>
            
            {/* Time Zone Converter */}
            <div className="flex flex-col p-6 bg-gradient-to-b from-black/90 to-gray-900/80 backdrop-blur-sm rounded-lg border border-violet-900/30 shadow-xl shadow-violet-500/5 hover:shadow-violet-500/20 hover:border-violet-700/40 transition-all duration-300 transform hover:-translate-y-1 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 delay-400 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-gradient-to-br from-violet-600/40 to-violet-900/20 mr-3 group-hover:from-violet-500/50 group-hover:to-violet-800/30 transition-all duration-300">
                  <Clock className="h-5 w-5 text-violet-400 group-hover:text-violet-300 group-hover:animate-spin-slow transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-semibold text-white group-hover:text-violet-300 transition-colors duration-300">Time Zone Converter</h3>
              </div>
              <p className="text-gray-300 flex-grow group-hover:text-gray-200 transition-colors duration-300">
                Convert trading session times between different time zones to never miss important market openings.
              </p>
            </div>
            
            {/* Trading Session Countdown */}
            <div className="flex flex-col p-6 bg-gradient-to-b from-black/90 to-gray-900/80 backdrop-blur-sm rounded-lg border border-sky-900/30 shadow-xl shadow-sky-500/5 hover:shadow-sky-500/20 hover:border-sky-700/40 transition-all duration-300 transform hover:-translate-y-1 animate-in fade-in-0 slide-in-from-bottom-3 duration-500 delay-500 group">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-gradient-to-br from-sky-600/40 to-sky-900/20 mr-3 group-hover:from-sky-500/50 group-hover:to-sky-800/30 transition-all duration-300">
                  <Timer className="h-5 w-5 text-sky-400 group-hover:text-sky-300 group-hover:animate-bounce transition-colors duration-300" />
                </div>
                <h3 className="text-lg font-semibold text-white group-hover:text-sky-300 transition-colors duration-300">Session Countdown</h3>
              </div>
              <p className="text-gray-300 flex-grow group-hover:text-gray-200 transition-colors duration-300">
                Interactive countdown timer to major trading sessions, helping you prepare for market opens and closes.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pattern Distribution section */}
      <div className="py-16 bg-gradient-to-r from-gray-900 to-gray-950 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute left-0 top-1/3 w-32 h-32 bg-blue-500/5 rounded-full filter blur-3xl animate-pulse"></div>
          <div className="absolute right-10 bottom-1/4 w-48 h-48 bg-rose-500/5 rounded-full filter blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }}></div>
          
          {/* Animated chart patterns */}
          <div className="absolute top-20 left-10 opacity-20">
            <svg width="120" height="60" viewBox="0 0 120 60" className="animate-float">
              <polyline 
                points="0,30 20,10 40,50 60,20 80,60 100,30 120,10" 
                fill="none" 
                stroke="rgba(255,255,255,0.3)" 
                strokeWidth="2"
              />
            </svg>
          </div>
          
          <div className="absolute bottom-20 right-10 opacity-20">
            <svg width="120" height="60" viewBox="0 0 120 60" className="animate-float" style={{ animationDelay: '2s' }}>
              <polyline 
                points="0,50 20,60 40,20 60,30 80,10 100,40 120,30" 
                fill="none" 
                stroke="rgba(255,255,255,0.3)" 
                strokeWidth="2"
              />
            </svg>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl animate-in fade-in slide-in-from-bottom-3 duration-700">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-400 via-red-600 to-red-800">
                Pattern Distribution
              </span>
            </h2>
            <p className="mt-4 text-lg text-gray-400 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-3 duration-700 delay-200">
              Our AI recognizes a wide range of technical patterns across different market conditions.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div className="order-2 md:order-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[
                  { name: "Double Top/Bottom", type: "Reversal", percentage: 22, icon: <PieChart className="h-5 w-5 text-rose-500" />, bgClass: "bg-rose-600/20", barClass: "bg-rose-500" },
                  { name: "Head & Shoulders", type: "Reversal", percentage: 18, icon: <ChartLine className="h-5 w-5 text-red-500" />, bgClass: "bg-red-600/20", barClass: "bg-red-500" },
                  { name: "Triangle Patterns", type: "Continuation", percentage: 25, icon: <BarChart2 className="h-5 w-5 text-blue-500" />, bgClass: "bg-blue-600/20", barClass: "bg-blue-500" },
                  { name: "Flags & Pennants", type: "Continuation", percentage: 15, icon: <Share2 className="h-5 w-5 text-green-500" />, bgClass: "bg-green-600/20", barClass: "bg-green-500" },
                  { name: "Channel Patterns", type: "Trend", percentage: 12, icon: <TrendingUp className="h-5 w-5 text-violet-500" />, bgClass: "bg-violet-600/20", barClass: "bg-violet-500" },
                  { name: "Wedge Patterns", type: "Mixed", percentage: 8, icon: <TrendingDown className="h-5 w-5 text-cyan-500" />, bgClass: "bg-cyan-600/20", barClass: "bg-cyan-500" },
                ].map((pattern, index) => (
                  <div 
                    key={index} 
                    className="bg-gray-900/80 backdrop-blur-sm p-4 rounded-lg border border-gray-800 shadow-lg hover:shadow-lg hover:border-gray-700 transition-all duration-300 transform hover:-translate-y-1 animate-in fade-in-0 slide-in-from-bottom-3 duration-500"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-full ${pattern.bgClass} transition-colors duration-300`}>
                        <div className="animate-pulse" style={{ animationDelay: `${index * 0.2}s` }}>
                          {pattern.icon}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium text-white">{pattern.name}</h4>
                        <span className="text-xs text-gray-400">{pattern.type} Pattern</span>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400">Distribution</span>
                        <span className="text-white font-medium">{pattern.percentage}%</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`${pattern.barClass} h-2 rounded-full transform-gpu transition-all duration-1000 ease-out`}
                          style={{ 
                            width: `${pattern.percentage}%`,
                            animation: 'width 1.5s ease-out',
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="order-1 md:order-2">
              <div className="bg-gray-900/90 backdrop-blur-sm p-6 rounded-xl border border-gray-800 shadow-xl animate-in fade-in slide-in-from-right-3 duration-700">
                <h3 className="text-xl font-semibold text-white mb-4">Intelligent Pattern Recognition</h3>
                <p className="text-gray-300 mb-4">
                  Our AI can identify over 30 different chart patterns with accuracy rates up to 92%. The system continuously learns from new data to improve pattern recognition.
                </p>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Reversal Patterns</span>
                    <span className="text-white">40%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-gradient-to-r from-green-400 to-green-500 h-2 rounded-full animate-pulse-glow" style={{ width: '40%' }}></div>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400">Continuation Patterns</span>
                    <span className="text-white">42%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-400 to-blue-500 h-2 rounded-full animate-pulse-glow" style={{ width: '42%', animationDelay: '0.5s' }}></div>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400">Mixed/Other Patterns</span>
                    <span className="text-white">18%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                    <div className="bg-gradient-to-r from-yellow-400 to-yellow-500 h-2 rounded-full animate-pulse-glow" style={{ width: '18%', animationDelay: '1s' }}></div>
                  </div>
                </div>
                <div className="bg-gray-950/80 backdrop-blur-md p-4 rounded-lg border border-gray-800 transform transition-all duration-300 hover:scale-105 hover:border-yellow-500/30">
                  <div className="flex items-center gap-3 mb-1">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 animate-pulse" />
                    <h4 className="font-medium text-white">AI Accuracy Rate</h4>
                  </div>
                  <div className="ml-8">
                    <div className="w-full bg-gray-800 rounded-full h-3 mt-3 overflow-hidden">
                      <div className="bg-gradient-to-r from-yellow-500 via-orange-500 to-rose-500 h-3 rounded-full relative animate-pulse-glow" style={{ width: '92%' }}>
                        <div className="absolute top-0 left-0 right-0 bottom-0 bg-white/10 animate-float"></div>
                      </div>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-400">0%</span>
                      <span className="text-xs text-gray-400">92%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Achievements section */}
      <div className="py-16 bg-gradient-to-b from-gray-900 to-gray-950">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-white">
                Track Your Progress with Achievements
              </h2>
              <p className="mt-4 text-lg text-gray-300">
                Our gamified achievements system lets you track your trading milestones and earn badges as you improve your skills.
              </p>
              <ul className="mt-6 space-y-3">
                <li className="flex items-center">
                  <div className="mr-3 h-5 w-5 text-rose-500">✓</div>
                  <span className="text-gray-300">Unlock badges for analysis milestones</span>
                </li>
                <li className="flex items-center">
                  <div className="mr-3 h-5 w-5 text-rose-500">✓</div>
                  <span className="text-gray-300">Track progress across different markets</span>
                </li>
                <li className="flex items-center">
                  <div className="mr-3 h-5 w-5 text-rose-500">✓</div>
                  <span className="text-gray-300">Compete with other traders on leaderboards</span>
                </li>
                <li className="flex items-center">
                  <div className="mr-3 h-5 w-5 text-rose-500">✓</div>
                  <span className="text-gray-300">Build a comprehensive trading portfolio</span>
                </li>
              </ul>
            </div>
            <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
              <div className="grid grid-cols-1 gap-4">
                {[
                  { name: "First Analysis", description: "Complete your first chart analysis", progress: 100 },
                  { name: "Technical Master", description: "Analyze 10 different technical patterns", progress: 70 },
                  { name: "Sharing Pro", description: "Share 3 analyses with other traders", progress: 40 }
                ].map((achievement, index) => (
                  <div key={index} className="bg-gray-950 p-4 rounded-lg">
                    <h4 className="font-medium text-white mb-1">{achievement.name}</h4>
                    <p className="text-xs text-gray-400 mb-3">{achievement.description}</p>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div 
                        className="bg-rose-600 h-2 rounded-full" 
                        style={{ width: `${achievement.progress}%` }}
                      ></div>
                    </div>
                    <div className="mt-1 text-right">
                      <span className="text-xs text-gray-400">{achievement.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA section */}
      <div className="py-16 bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to Elevate Your Trading?
          </h2>
          <p className="mt-4 text-xl text-gray-300 max-w-2xl mx-auto">
            Join thousands of traders using AI to gain a competitive edge in the markets.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/auth">
              <Button size="lg" className="bg-rose-600 hover:bg-rose-700 text-white">
                Sign Up Now <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/subscription">
              <Button size="lg" variant="outline" className="border-rose-600 text-white hover:bg-rose-700/20">
                Compare Plans
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-950 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-white mb-3">Platform</h3>
              <ul className="space-y-2">
                <li><Link href="/analysis" className="text-gray-400 hover:text-rose-500 transition-colors">Chart Analysis</Link></li>
                <li><Link href="/historical" className="text-gray-400 hover:text-rose-500 transition-colors">Analysis History</Link></li>
                <li><Link href="/subscription" className="text-gray-400 hover:text-rose-500 transition-colors">Pricing</Link></li>
                <li><Link href="/dashboard" className="text-gray-400 hover:text-rose-500 transition-colors">Dashboard</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-3">Features</h3>
              <ul className="space-y-2">
                <li><Link href="/achievements" className="text-gray-400 hover:text-rose-500 transition-colors">Achievements</Link></li>
                <li><Link href="/#features" className="text-gray-400 hover:text-rose-500 transition-colors">Trading Tools</Link></li>
                <li><Link href="/#features" className="text-gray-400 hover:text-rose-500 transition-colors">Volume Analysis</Link></li>
                <li><Link href="/#features" className="text-gray-400 hover:text-rose-500 transition-colors">News Alerts</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-3">Support</h3>
              <ul className="space-y-2">
                <li><Link href="/contact" className="text-gray-400 hover:text-rose-500 transition-colors">Contact Us</Link></li>
                <li><Link href="/support" className="text-gray-400 hover:text-rose-500 transition-colors">Help Center</Link></li>
                <li><Link href="/about" className="text-gray-400 hover:text-rose-500 transition-colors">About Us</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-3">Legal</h3>
              <ul className="space-y-2">
                <li><Link href="/terms" className="text-gray-400 hover:text-rose-500 transition-colors">Terms of Service</Link></li>
                <li><Link href="/privacy" className="text-gray-400 hover:text-rose-500 transition-colors">Privacy Policy</Link></li>
                <li><Link href="/security" className="text-gray-400 hover:text-rose-500 transition-colors">Security</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 pt-8 mt-8 flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center mb-4 md:mb-0">
              <img src={logoImg} alt="VEDD Logo" className="h-8 mr-3" />
              <p className="text-gray-400 text-sm">
                © {new Date().getFullYear()} VEDD. All rights reserved.
              </p>
            </div>
            <div className="flex gap-4">
              <a href="#" className="text-gray-400 hover:text-rose-500 transition-colors">
                <i className="fab fa-twitter text-lg"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-rose-500 transition-colors">
                <i className="fab fa-discord text-lg"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-rose-500 transition-colors">
                <i className="fab fa-github text-lg"></i>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}