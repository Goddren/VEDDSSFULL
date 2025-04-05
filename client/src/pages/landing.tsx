import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, BarChart2, ChartLine, Zap } from "lucide-react";
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
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
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
          <div className="mt-8 flex justify-center gap-4">
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
      <div className="bg-gray-950 py-6">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <p className="text-center text-gray-500 text-sm">
            © {new Date().getFullYear()} VEDD. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}