import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import VeddLogo from '@/components/ui/vedd-logo';

const Home: React.FC = () => {
  return (
    <div className="container mx-auto px-4 md:px-8 py-16">
      {/* Hero Section */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-10 mb-20">
        <div className="max-w-xl">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Advanced Trading Chart Analysis with AI
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            Upload your trading charts from MT4, MT5, or TradingView and get instant AI-powered analysis, predictions, and actionable insights.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/analysis">
              <Button className="bg-[#E64A4A] hover:bg-opacity-80 text-white px-8 py-6 text-lg">
                Analyze Your Chart
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" className="border-[#333333] hover:bg-[#1E1E1E] px-8 py-6 text-lg">
                View Dashboard
              </Button>
            </Link>
          </div>
        </div>
        <div className="relative w-full max-w-md">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#E64A4A] to-[#E64A4A]/20 blur-xl opacity-20"></div>
          <div className="relative bg-[#0A0A0A] p-6 rounded-xl border border-[#333333]">
            <img
              src="https://images.unsplash.com/photo-1535320903710-d993d3d77d29"
              alt="Trading chart example"
              className="rounded-lg w-full h-auto object-cover"
            />
            <div className="mt-4 p-4 bg-[#1E1E1E] rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-400">EUR/USD 4H</span>
                <span className="text-sm font-medium bg-[#E64A4A]/20 text-[#E64A4A] px-2 py-0.5 rounded">SELL</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">Entry Point</span>
                <span className="font-medium">1.0889</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Take Profit</span>
                <span className="font-medium">1.0720</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="mb-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Powerful Analysis Features</h2>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Our AI-powered platform helps traders make better decisions with advanced chart analysis tools.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-[#1E1E1E] p-6 rounded-xl">
            <div className="w-12 h-12 bg-[#333333] rounded-lg flex items-center justify-center mb-4">
              <i className="fas fa-chart-line text-[#E64A4A] text-xl"></i>
            </div>
            <h3 className="text-xl font-semibold mb-2">Pattern Recognition</h3>
            <p className="text-gray-300">
              Automatically identify chart patterns like head and shoulders, double tops, triangles and more from your screenshots.
            </p>
          </div>
          
          <div className="bg-[#1E1E1E] p-6 rounded-xl">
            <div className="w-12 h-12 bg-[#333333] rounded-lg flex items-center justify-center mb-4">
              <i className="fas fa-robot text-[#E64A4A] text-xl"></i>
            </div>
            <h3 className="text-xl font-semibold mb-2">AI Predictions</h3>
            <p className="text-gray-300">
              Get intelligent buy/sell signals based on comprehensive analysis of multiple indicators and market conditions.
            </p>
          </div>
          
          <div className="bg-[#1E1E1E] p-6 rounded-xl">
            <div className="w-12 h-12 bg-[#333333] rounded-lg flex items-center justify-center mb-4">
              <i className="fas fa-crosshairs text-[#E64A4A] text-xl"></i>
            </div>
            <h3 className="text-xl font-semibold mb-2">Entry/Exit Points</h3>
            <p className="text-gray-300">
              Receive precise recommendations for optimal entry points, exit strategies, stop losses and take profit levels.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-[#1E1E1E] rounded-xl p-10 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to improve your trading?</h2>
        <p className="text-gray-300 max-w-2xl mx-auto mb-8">
          Upload your first trading chart today and experience the power of AI-driven market analysis.
        </p>
        <Link href="/analysis">
          <Button className="bg-[#E64A4A] hover:bg-opacity-80 text-white px-8 py-6 text-lg">
            Start Analyzing
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default Home;
