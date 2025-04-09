import React from 'react';
import { VolumeAnalysis } from '@shared/types';
import { MarketInsight } from '@/components/ui/market-insight';
import { Clock, TrendingUp, BarChart3 } from 'lucide-react';

interface VolumeAnalysisChartProps {
  volumeData: VolumeAnalysis[];
  symbol: string;
}

export const VolumeAnalysisChart: React.FC<VolumeAnalysisChartProps> = ({ volumeData, symbol }) => {
  if (!volumeData || volumeData.length === 0) {
    return (
      <div className="bg-[#0A0A0A] p-4 rounded-lg text-center text-gray-400">
        No volume analysis available
      </div>
    );
  }

  // Get highest volume sessions
  const veryHighVolumeSession = volumeData.find(session => session.volume.toLowerCase() === 'very high');
  const highVolumeSession = volumeData.find(session => session.volume.toLowerCase() === 'high');
  const bestVolumeSession = veryHighVolumeSession || highVolumeSession;
  const bestTradingSession = volumeData.find(session => session.quality.toLowerCase() === 'excellent');

  // Function to get volume bar width
  const getVolumeWidth = (volume: string): string => {
    switch (volume.toLowerCase()) {
      case 'very high': return '95%';
      case 'high': return '80%';
      case 'medium': return '60%';
      case 'low': return '30%';
      case 'very low': return '15%';
      default: return '50%';
    }
  };

  // Function to get quality color
  const getQualityColor = (quality: string): string => {
    switch (quality.toLowerCase()) {
      case 'excellent': return 'bg-green-500';
      case 'average': return 'bg-yellow-500';
      case 'poor': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {bestVolumeSession && (
        <div className="bg-[#0A0A0A] p-4 rounded-lg">
          <div className="flex items-center mb-3">
            <div className="w-10 h-10 bg-[#333333] rounded-lg flex items-center justify-center mr-3">
              <TrendingUp className="text-[#E64A4A]" />
            </div>
            <div>
              <MarketInsight
                term="Best Trading Time"
                category="strategy"
                animation="volatile"
                description={`The optimal time to trade ${symbol} is during the ${bestVolumeSession.period} when volume is ${bestVolumeSession.volume.toLowerCase()}.`}
              />
              <p className="text-sm text-gray-400">Based on historical volume patterns</p>
            </div>
          </div>
          
          <p className="mb-3 text-sm text-gray-300">
            Trading during high volume periods increases liquidity and potentially reduces slippage.
          </p>
        </div>
      )}

      <div className="bg-[#0A0A0A] p-4 rounded-lg">
        <h4 className="font-medium mb-3">Volume Analysis by Session</h4>
        
        <div className="space-y-4">
          {volumeData.map((session, index) => (
            <div key={index} className="animate-in fade-in-0 slide-in-from-bottom-3 duration-500" style={{ animationDelay: `${index * 100}ms` }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-2 text-gray-400" />
                  <span className="text-sm font-medium">{session.period}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${getQualityColor(session.quality)} text-white`}>
                  {session.quality}
                </span>
              </div>
              
              <div className="w-full bg-[#1E1E1E] h-6 rounded-md overflow-hidden mb-2 flex items-center">
                <div 
                  className="h-full bg-[#E64A4A] opacity-80"
                  style={{ width: getVolumeWidth(session.volume) }}
                ></div>
                <div className="absolute ml-3 text-xs font-medium text-white">
                  {session.volume} Volume
                </div>
              </div>
              
              <p className="text-sm text-gray-300 ml-6">
                {session.activity}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#0A0A0A] p-4 rounded-lg">
        <div className="flex items-center mb-3">
          <div className="w-8 h-8 bg-[#333333] rounded-lg flex items-center justify-center mr-3">
            <BarChart3 className="w-4 h-4 text-[#E64A4A]" />
          </div>
          <h4 className="font-medium">Trading Recommendations</h4>
        </div>
        
        <ul className="space-y-2 ml-5 text-sm">
          <li className="list-disc text-gray-300">
            Best entry times are typically at the beginning of {bestTradingSession?.period || 'high volume sessions'}
          </li>
          <li className="list-disc text-gray-300">
            Consider lower position sizes during low volume periods to manage risk
          </li>
          <li className="list-disc text-gray-300">
            Watch for false breakouts during {volumeData.find(s => s.volume.toLowerCase() === 'low')?.period || 'low volume sessions'}
          </li>
          <li className="list-disc text-gray-300">
            Session overlaps (e.g., London/New York) often show increased volatility and trading opportunities
          </li>
        </ul>
      </div>
    </div>
  );
};

export default VolumeAnalysisChart;