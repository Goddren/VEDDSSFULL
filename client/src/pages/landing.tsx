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
  TrendingDown
} from "lucide-react";
import logoImg from "@assets/IMG_3645.png";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero section */}
      <div className="flex flex-col items-center justify-center px-6 py-16 bg-gradient-to-r from-gray-900 to-gray-800 lg:px-8 lg:py-24">
        <div className="max-w-7xl mx-auto text-center">
          <div className="mb-8 flex justify-center">
            <img 
              src={logoImg} 
              alt="VEDD Logo" 
              className="h-20 md:h-24"
            />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            AI-Powered Chart Analysis
          </h1>
          <p className="mt-6 text-xl text-gray-300 max-w-3xl mx-auto">
            Transform your trading with advanced AI analysis. Upload charts from MT4, MT5, or TradingView 
            and get precise market insights, patterns, and actionable signals instantly.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth">
              <Button size="lg" className="bg-rose-600 hover:bg-rose-700 text-white">
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/subscription">
              <Button size="lg" variant="outline" className="border-rose-600 text-white hover:bg-rose-700/20">
                View Pricing
              </Button>
            </Link>
            <a href="#features">
              <Button size="lg" variant="outline" className="border-gray-600 text-white hover:bg-gray-700/20">
                Learn More
              </Button>
            </a>
          </div>
        </div>
      </div>

      {/* Features section */}
      <div id="features" className="py-16 bg-gray-950">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Powerful Trading Intelligence
            </h2>
            <p className="mt-4 text-lg text-gray-400 max-w-3xl mx-auto">
              Our AI-powered platform analyzes chart patterns and market conditions to provide you with accurate insights and trading recommendations.
            </p>
          </div>
          
          {/* Main Features */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3 mb-16">
            {/* Feature 1 */}
            <div className="flex flex-col items-center p-6 bg-gray-900 rounded-lg">
              <div className="p-3 rounded-full bg-rose-600/20 mb-4">
                <BarChart2 className="h-8 w-8 text-rose-500" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Pattern Recognition</h3>
              <p className="text-center text-gray-400">
                Identify chart patterns and technical indicators with advanced AI analysis.
              </p>
            </div>
            
            {/* Feature 2 */}
            <div className="flex flex-col items-center p-6 bg-gray-900 rounded-lg">
              <div className="p-3 rounded-full bg-rose-600/20 mb-4">
                <ChartLine className="h-8 w-8 text-rose-500" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Price Predictions</h3>
              <p className="text-center text-gray-400">
                Get accurate entry/exit points, stop-loss levels, and potential profit targets.
              </p>
            </div>
            
            {/* Feature 3 */}
            <div className="flex flex-col items-center p-6 bg-gray-900 rounded-lg">
              <div className="p-3 rounded-full bg-rose-600/20 mb-4">
                <Zap className="h-8 w-8 text-rose-500" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Instant Analysis</h3>
              <p className="text-center text-gray-400">
                Upload a chart and receive comprehensive analysis in seconds.
              </p>
            </div>
          </div>
          
          {/* New Features Section */}
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Latest Trading Tools
            </h2>
            <p className="mt-4 text-lg text-gray-400 max-w-3xl mx-auto">
              Cutting-edge features to enhance your trading experience and decision-making.
            </p>
          </div>
          
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* News Notifications */}
            <div className="flex flex-col p-6 bg-gray-900 rounded-lg border border-gray-800 hover:border-rose-500/30 transition-colors">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-rose-600/20 mr-3">
                  <Bell className="h-5 w-5 text-rose-500" />
                </div>
                <h3 className="text-lg font-semibold text-white">News Notifications</h3>
              </div>
              <p className="text-gray-400 flex-grow">
                Get instant alerts about market news events that may impact your analyzed trading pairs.
              </p>
            </div>
            
            {/* Volatility Risk Meter */}
            <div className="flex flex-col p-6 bg-gray-900 rounded-lg border border-gray-800 hover:border-rose-500/30 transition-colors">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-rose-600/20 mr-3">
                  <AlertTriangle className="h-5 w-5 text-rose-500" />
                </div>
                <h3 className="text-lg font-semibold text-white">Volatility Risk Meter</h3>
              </div>
              <p className="text-gray-400 flex-grow">
                Visual gauge showing market volatility levels with animated insights to help manage risk.
              </p>
            </div>
            
            {/* One-Click Chart Sharing */}
            <div className="flex flex-col p-6 bg-gray-900 rounded-lg border border-gray-800 hover:border-rose-500/30 transition-colors">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-rose-600/20 mr-3">
                  <Share2 className="h-5 w-5 text-rose-500" />
                </div>
                <h3 className="text-lg font-semibold text-white">One-Click Sharing</h3>
              </div>
              <p className="text-gray-400 flex-grow">
                Share your chart analyses with trading notes via public links to collaborate with other traders.
              </p>
            </div>
            
            {/* Volume Analysis */}
            <div className="flex flex-col p-6 bg-gray-900 rounded-lg border border-gray-800 hover:border-rose-500/30 transition-colors">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-rose-600/20 mr-3">
                  <BarChart className="h-5 w-5 text-rose-500" />
                </div>
                <h3 className="text-lg font-semibold text-white">Volume Analysis</h3>
              </div>
              <p className="text-gray-400 flex-grow">
                Monitor trading volumes across Asian, European, and US sessions to identify the best times to trade.
              </p>
            </div>
            
            {/* Time Zone Converter */}
            <div className="flex flex-col p-6 bg-gray-900 rounded-lg border border-gray-800 hover:border-rose-500/30 transition-colors">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-rose-600/20 mr-3">
                  <Clock className="h-5 w-5 text-rose-500" />
                </div>
                <h3 className="text-lg font-semibold text-white">Time Zone Converter</h3>
              </div>
              <p className="text-gray-400 flex-grow">
                Convert trading session times between different time zones to never miss important market openings.
              </p>
            </div>
            
            {/* Trading Session Countdown */}
            <div className="flex flex-col p-6 bg-gray-900 rounded-lg border border-gray-800 hover:border-rose-500/30 transition-colors">
              <div className="flex items-center mb-4">
                <div className="p-2 rounded-full bg-rose-600/20 mr-3">
                  <Timer className="h-5 w-5 text-rose-500" />
                </div>
                <h3 className="text-lg font-semibold text-white">Session Countdown</h3>
              </div>
              <p className="text-gray-400 flex-grow">
                Interactive countdown timer to major trading sessions, helping you prepare for market opens and closes.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pattern Distribution section */}
      <div className="py-16 bg-gradient-to-r from-gray-900 to-gray-950">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Pattern Distribution
            </h2>
            <p className="mt-4 text-lg text-gray-400 max-w-3xl mx-auto">
              Our AI recognizes a wide range of technical patterns across different market conditions.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div className="order-2 md:order-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {[
                  { name: "Double Top/Bottom", type: "Reversal", percentage: 22, icon: <PieChart className="h-5 w-5" /> },
                  { name: "Head & Shoulders", type: "Reversal", percentage: 18, icon: <ChartLine className="h-5 w-5" /> },
                  { name: "Triangle Patterns", type: "Continuation", percentage: 25, icon: <BarChart2 className="h-5 w-5" /> },
                  { name: "Flags & Pennants", type: "Continuation", percentage: 15, icon: <Share2 className="h-5 w-5" /> },
                  { name: "Channel Patterns", type: "Trend", percentage: 12, icon: <TrendingUp className="h-5 w-5" /> },
                  { name: "Wedge Patterns", type: "Mixed", percentage: 8, icon: <TrendingDown className="h-5 w-5" /> },
                ].map((pattern, index) => (
                  <div key={index} className="bg-gray-900 p-4 rounded-lg border border-gray-800">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded-full bg-rose-600/20">
                        {pattern.icon}
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
                      <div className="w-full bg-gray-800 rounded-full h-2">
                        <div 
                          className="bg-rose-600 h-2 rounded-full" 
                          style={{ width: `${pattern.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="order-1 md:order-2">
              <div className="bg-gray-900 p-6 rounded-xl border border-gray-800">
                <h3 className="text-xl font-semibold text-white mb-4">Intelligent Pattern Recognition</h3>
                <p className="text-gray-300 mb-4">
                  Our AI can identify over 30 different chart patterns with accuracy rates up to 92%. The system continuously learns from new data to improve pattern recognition.
                </p>
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Reversal Patterns</span>
                    <span className="text-white">40%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '40%' }}></div>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400">Continuation Patterns</span>
                    <span className="text-white">42%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '42%' }}></div>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400">Mixed/Other Patterns</span>
                    <span className="text-white">18%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '18%' }}></div>
                  </div>
                </div>
                <div className="bg-gray-950 p-4 rounded-lg">
                  <div className="flex items-center gap-3 mb-1">
                    <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    <h4 className="font-medium text-white">AI Accuracy Rate</h4>
                  </div>
                  <div className="ml-8">
                    <div className="w-full bg-gray-800 rounded-full h-3 mt-3">
                      <div className="bg-gradient-to-r from-yellow-500 via-orange-500 to-rose-500 h-3 rounded-full" style={{ width: '92%' }}></div>
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