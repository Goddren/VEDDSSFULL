import { useState } from "react";
import { ArrowLeft, Info, Sliders } from "lucide-react";
import { Link } from "wouter";
import { VolatilityMeter } from "@/components/ui/volatility-meter";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export default function VolatilityMeterShowcase() {
  const [volatility, setVolatility] = useState(72);
  const [animated, setAnimated] = useState(true);
  
  return (
    <div className="container max-w-6xl px-4 py-10">
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center text-sm text-gray-400 hover:text-white transition-colors mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-white mb-2">Market Volatility Risk Meter</h1>
        <p className="text-gray-400 max-w-3xl">
          This animated component helps traders visualize market volatility levels and associated risk. 
          Higher volatility indicates greater price fluctuations and potential risk.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="space-y-10">
          <div className="bg-gray-900 rounded-xl border border-gray-800 shadow-xl p-6">
            <h2 className="text-lg font-medium text-white mb-4">Interactive Demo</h2>
            <div className="space-y-6">
              <div className="p-4 bg-gray-950 rounded-lg">
                <VolatilityMeter 
                  value={volatility} 
                  size="lg" 
                  animated={animated} 
                  onChange={setVolatility}
                />
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-2 block">
                  Adjust Volatility Level:
                </label>
                <Slider
                  value={[volatility]}
                  onValueChange={(values) => setVolatility(values[0])}
                  min={0}
                  max={100}
                  step={1}
                  className="py-4"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={animated}
                    onChange={() => setAnimated(!animated)}
                    className="sr-only peer"
                  />
                  <div className="relative w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  <span className="ms-3 text-sm font-medium text-gray-300">Enable animations</span>
                </label>
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setVolatility(Math.floor(Math.random() * 100))}
                >
                  <Sliders className="h-4 w-4 mr-2" />
                  Random Value
                </Button>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-900 rounded-xl border border-gray-800 shadow-xl p-6">
            <h2 className="text-lg font-medium text-white mb-4">Different Sizes</h2>
            <div className="space-y-6">
              <div>
                <p className="text-sm text-gray-400 mb-2">Small (sm)</p>
                <VolatilityMeter value={volatility} size="sm" animated={animated} />
              </div>
              
              <div>
                <p className="text-sm text-gray-400 mb-2">Medium (md) - Default</p>
                <VolatilityMeter value={volatility} size="md" animated={animated} />
              </div>
              
              <div>
                <p className="text-sm text-gray-400 mb-2">Large (lg)</p>
                <VolatilityMeter value={volatility} size="lg" animated={animated} />
              </div>
            </div>
          </div>
        </div>
        
        <div>
          <div className="bg-gray-900 rounded-xl border border-gray-800 shadow-xl p-6 space-y-6">
            <h2 className="text-lg font-medium text-white mb-4">Risk Level Thresholds</h2>
            
            <div className="space-y-4">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-3"></div>
                <div>
                  <h3 className="text-white font-medium">Low Risk (0-24)</h3>
                  <p className="text-sm text-gray-400">Stable market conditions with minimal volatility</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-yellow-500 mr-3"></div>
                <div>
                  <h3 className="text-white font-medium">Moderate Risk (25-49)</h3>
                  <p className="text-sm text-gray-400">Normal market volatility with manageable risk</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-orange-500 mr-3"></div>
                <div>
                  <h3 className="text-white font-medium">High Risk (50-74)</h3>
                  <p className="text-sm text-gray-400">Elevated volatility requiring careful risk management</p>
                </div>
              </div>
              
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-3"></div>
                <div>
                  <h3 className="text-white font-medium">Extreme Risk (75-100)</h3>
                  <p className="text-sm text-gray-400">Severe market volatility with high risk of rapid price swings</p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-gray-950 rounded-lg flex items-start">
              <Info className="text-indigo-400 h-5 w-5 mr-3 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p className="mb-2">
                  The volatility meter can be used in various contexts throughout the application:
                </p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>On analysis result pages to indicate current market volatility</li>
                  <li>In the dashboard for tracked currency pairs</li>
                  <li>As part of trading signal notifications</li>
                  <li>In historical analysis comparisons</li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="mt-6 bg-gray-900 rounded-xl border border-gray-800 shadow-xl p-6">
            <h2 className="text-lg font-medium text-white mb-4">Usage Examples</h2>
            
            <div className="space-y-6">
              <div className="p-4 bg-gray-950 rounded-lg">
                <h3 className="text-sm font-medium text-gray-300 mb-3">In Analysis Report</h3>
                <div className="flex items-center justify-between bg-gray-900/50 p-3 rounded-md border border-gray-800">
                  <span className="text-sm text-gray-300">EUR/USD Volatility</span>
                  <div className="w-1/2">
                    <VolatilityMeter value={35} size="sm" showLabel={false} />
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-gray-950 rounded-lg">
                <h3 className="text-sm font-medium text-gray-300 mb-3">In Market Overview</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-900/50 p-3 rounded-md border border-gray-800">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-white">BTC/USD</span>
                      <span className="text-xs text-red-400">-2.4%</span>
                    </div>
                    <VolatilityMeter value={82} size="sm" />
                  </div>
                  
                  <div className="bg-gray-900/50 p-3 rounded-md border border-gray-800">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-white">ETH/USD</span>
                      <span className="text-xs text-green-400">+1.2%</span>
                    </div>
                    <VolatilityMeter value={68} size="sm" />
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-gray-950 rounded-lg">
                <h3 className="text-sm font-medium text-gray-300 mb-3">With Risk Warning</h3>
                <div className="bg-gray-900/50 p-4 rounded-md border border-gray-800">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center">
                      <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                      <span className="text-sm font-medium text-white">High Volatility Alert</span>
                    </div>
                    <span className="text-xs bg-red-900/40 text-red-300 px-2 py-0.5 rounded-full">Warning</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">
                    Market volatility for GBP/JPY has increased significantly in the last hour.
                  </p>
                  <VolatilityMeter value={88} size="md" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}