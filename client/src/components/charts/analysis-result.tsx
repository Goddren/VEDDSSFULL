import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ChartAnalysisResponse } from '@shared/types';
import { formatCurrency, getConfidenceColor, getDirectionColor, getStrengthColor, normalizeImageUrl } from '@/lib/utils';
import { AnimatedTooltip } from '@/components/ui/animated-tooltip';
import { MarketInsight, DirectionInsight } from '@/components/ui/market-insight';
import { NewsAlert, NewsEvent } from '@/components/ui/news-alert';
import { getNewsForSymbol } from '@/lib/news-service';
import { useNewsNotifications } from '@/components/news-notification-scheduler';
import VolumeAnalysisChart from './volume-analysis';
import { MarketTrendHeatmap } from './market-trend-heatmap';
import { InsightTooltip, ConfidenceInsight, PatternInsight, IndicatorInsight, MarketTrendInsight } from '@/components/tooltips';

interface AnalysisResultProps {
  analysis: ChartAnalysisResponse;
  imageUrl: string;
  onReanalyze: () => void;
}

const AnalysisResult: React.FC<AnalysisResultProps> = ({ analysis, imageUrl, onReanalyze }) => {
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const { isSubscribed, subscribeToSymbol, unsubscribeFromSymbol } = useNewsNotifications();
  
  // Load relevant news events when the component mounts or when the symbol changes
  useEffect(() => {
    if (analysis.symbol) {
      const events = getNewsForSymbol(analysis.symbol);
      setNewsEvents(events);
      
      console.log(`Loaded ${events.length} news events for ${analysis.symbol}`);
    }
  }, [analysis.symbol]);
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="md:col-span-2 bg-[#1E1E1E] rounded-xl p-6 shadow-lg">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <div className="bg-[#0A0A0A] rounded-lg overflow-hidden">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Uploaded trading chart"
                  className="w-full h-auto object-cover"
                  onError={(e) => {
                    console.error("Image failed to load:", imageUrl);
                    e.currentTarget.src = "https://placehold.co/600x400/black/gray?text=Chart+Image+Unavailable";
                  }}
                />
              ) : (
                <div className="h-64 flex items-center justify-center bg-[#222222]">
                  <p className="text-gray-400">Chart image not available</p>
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-between items-center">
              <div>
                <h3 className="font-medium">{analysis.symbol || "Uploaded Chart"}</h3>
                <p className="text-sm text-gray-400">{analysis.timeframe || "Unknown"} Timeframe</p>
              </div>
              <div>
                <button 
                  className="text-[#E64A4A] hover:text-white px-3 py-1 rounded-md hover:bg-[#E64A4A]/20 transition-colors"
                  onClick={onReanalyze}
                >
                  <i className="fas fa-sync-alt mr-1"></i> Re-analyze
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1">
                <h2 className="text-xl font-semibold">Analysis Results</h2>
                <p className="text-sm text-gray-400">Analysis completed at {new Date().toLocaleTimeString()}</p>
              </div>
              <div className="flex items-center bg-[#0A0A0A] px-4 py-2 rounded-lg">
                <div className="w-3 h-3 bg-[#4CAF50] rounded-full mr-2 animate-pulse"></div>
                <span className="text-sm font-medium">Live Price: {analysis.currentPrice}</span>
              </div>
            </div>
            
            {/* Signal Card */}
            <div className="relative bg-[#0A0A0A] p-5 rounded-xl mb-4 overflow-hidden before:content-[''] before:absolute before:inset-[-1.5px] before:z-[-1] before:rounded-xl before:bg-gradient-to-br before:from-[#E64A4A] before:to-[#E64A4A]/30">
              <div className="absolute top-0 left-0 w-1 h-full bg-[#E64A4A]"></div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold">Market Signal</h3>
                <DirectionInsight 
                  direction={analysis.direction} 
                  description={`${analysis.confidence} confidence ${analysis.direction.toLowerCase()} signal with a potential gain of ${analysis.potentialPips} pips.`}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-400">Market Trend</p>
                  <div className="flex items-center">
                    <span className="font-medium mr-2">{analysis.trend}</span>
                    <MarketTrendInsight trend={analysis.trend} iconSize="sm" />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Confidence</p>
                  <div className="flex items-center">
                    <div className="flex items-center">
                      <span className="font-medium mr-2">{analysis.confidence}</span>
                      <ConfidenceInsight level={analysis.confidence} iconSize="sm" />
                    </div>
                    <div className="flex ml-2">
                      {['Low', 'Medium', 'High'].map((level, index) => (
                        <React.Fragment key={index}>
                          {Array.from({ length: index === 0 ? 1 : index === 1 ? 2 : 4 }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-5 h-1.5 rounded-sm mr-0.5 ${
                                level.toLowerCase() === analysis.confidence.toLowerCase()
                                  ? "bg-[#E64A4A]"
                                  : "bg-[#333333]"
                              }`}
                            ></div>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <i className="fas fa-arrow-right text-[#E64A4A] mr-2"></i>
                    <span>Entry Point</span>
                  </div>
                  <span className="font-medium">{analysis.entryPoint}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <i className="fas fa-arrow-left text-[#4CAF50] mr-2"></i>
                    <span>Exit Point</span>
                  </div>
                  <span className="font-medium">{analysis.exitPoint}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <i className="fas fa-flag-checkered text-[#3498db] mr-2"></i>
                    <span>Take Profit</span>
                  </div>
                  <span className="font-medium">{analysis.takeProfit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <i className="fas fa-shield-alt text-[#F39C12] mr-2"></i>
                    <span>Stop Loss</span>
                  </div>
                  <span className="font-medium">{analysis.stopLoss}</span>
                </div>
              </div>
            </div>
            
            {/* Risk Analysis Card */}
            <div className="bg-[#0A0A0A] p-5 rounded-xl">
              <h3 className="font-semibold mb-3">Risk Analysis</h3>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <p className="text-sm text-gray-400">Risk/Reward Ratio</p>
                  <MarketInsight
                    term={analysis.riskRewardRatio}
                    category="risk"
                    animation="volatile"
                    description={`The risk-to-reward ratio of ${analysis.riskRewardRatio} shows the potential profit compared to possible loss. Lower values like 1:3 or 1:4 indicate better trading opportunities.`}
                  />
                </div>
                <div>
                  <p className="text-sm text-gray-400">Potential Pips</p>
                  <p className="font-medium">{analysis.potentialPips}</p>
                </div>
              </div>
              <div className="w-full bg-[#333333] rounded-full h-2.5 mb-1">
                <div className="bg-green-600 h-2.5 rounded-full" style={{ width: '45%' }}></div>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>High Risk</span>
                <span>Low Risk</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pattern Recognition */}
      <div className="bg-[#1E1E1E] rounded-xl p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4">Pattern Recognition</h2>
        <div className="space-y-4">
          {analysis.patterns && analysis.patterns.length > 0 ? (
            analysis.patterns.map((pattern, index) => (
              <div key={index} className="bg-[#0A0A0A] p-4 rounded-lg fade-in animate-in fade-in-0 slide-in-from-bottom-3 duration-500" style={{ animationDelay: `${index * 100}ms` }}>
                <div className="flex justify-between items-start">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-[#333333] rounded-lg flex items-center justify-center mr-3">
                      <i className="fas fa-chart-line text-[#E64A4A]"></i>
                    </div>
                    <div>
                      <PatternInsight 
                        pattern={pattern.name} 
                        iconSize="sm" 
                      />
                      <p className="text-sm text-gray-400">{pattern.type}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium px-2 py-0.5 rounded ${getStrengthColor(pattern.strength)}`}>
                    {pattern.strength}
                  </span>
                </div>
                <p className="text-sm mt-3 text-gray-300">{pattern.details}</p>
              </div>
            ))
          ) : (
            <div className="bg-[#0A0A0A] p-4 rounded-lg text-center text-gray-400">
              No patterns detected
            </div>
          )}
        </div>
      </div>
      
      {/* Technical Indicators */}
      <div className="bg-[#1E1E1E] rounded-xl p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4">Technical Indicators</h2>
        <div className="space-y-4">
          {analysis.indicators && analysis.indicators.length > 0 ? (
            analysis.indicators.map((indicator, index) => (
              <div key={index} className="bg-[#0A0A0A] p-4 rounded-lg animate-in fade-in-0 slide-in-from-bottom-3 duration-500" style={{ animationDelay: `${index * 100}ms` }}>
                <div className="flex justify-between items-start">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-[#333333] rounded-lg flex items-center justify-center mr-3">
                      <i className={`fas fa-${indicator.name === 'RSI' ? 'signal' : 'wave-square'} text-[#E64A4A]`}></i>
                    </div>
                    <div>
                      <IndicatorInsight 
                        indicator={indicator.name} 
                        signal={indicator.signal.toLowerCase().includes('buy') ? 'bullish' : indicator.signal.toLowerCase().includes('sell') ? 'bearish' : 'neutral'}
                        iconSize="sm" 
                      />
                      <p className="text-sm text-gray-400">{indicator.type}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium px-2 py-0.5 rounded ${getDirectionColor(indicator.signal)}`}>
                    {indicator.signal}
                  </span>
                </div>
                <p className="text-sm mt-3 text-gray-300">{indicator.details}</p>
              </div>
            ))
          ) : (
            <div className="bg-[#0A0A0A] p-4 rounded-lg text-center text-gray-400">
              No indicators analyzed
            </div>
          )}
        </div>
      </div>
      
      {/* Market Context */}
      <div className="bg-[#1E1E1E] rounded-xl p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4">Market Context</h2>
        <div className="space-y-4">
          <div className="bg-[#0A0A0A] p-4 rounded-lg animate-in fade-in-0 slide-in-from-bottom-3 duration-300">
            <h4 className="font-medium mb-2">Support & Resistance Levels</h4>
            <div className="space-y-2 mb-4">
              {analysis.supportResistance && analysis.supportResistance.length > 0 ? (
                analysis.supportResistance.map((level, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <InsightTooltip
                      type={level.type.toLowerCase().includes('resistance') ? 'bearish' : 'bullish'}
                      title={`${level.strength} ${level.type}`}
                      description={`A ${level.strength.toLowerCase()} ${level.type.toLowerCase()} level at ${level.level} that may impact price movement.`}
                      iconSize="sm"
                    >
                      <span className="font-medium text-sm">{`${level.strength} ${level.type}`}</span>
                    </InsightTooltip>
                    <span className="font-medium">{level.level}</span>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-400">No support/resistance levels identified</div>
              )}
            </div>
          </div>
          
          <div className="bg-[#0A0A0A] p-4 rounded-lg animate-in fade-in-0 slide-in-from-bottom-3 duration-500">
            <h4 className="font-medium mb-2">Timeframe Analysis</h4>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {analysis.timeframeAnalysis && analysis.timeframeAnalysis.length > 0 ? (
                analysis.timeframeAnalysis.map((tf, index) => (
                  <div key={index} className="text-center p-2 rounded bg-[#333333]">
                    <p className="text-xs text-gray-400">{tf.timeframe}</p>
                    <p className={`text-sm font-medium ${tf.trend.toLowerCase() === 'bearish' ? 'text-[#E64A4A]' : 'text-[#4CAF50]'}`}>
                      {tf.trend}
                    </p>
                  </div>
                ))
              ) : (
                <div className="col-span-3 text-center text-gray-400">No timeframe analysis available</div>
              )}
            </div>
            <p className="text-sm text-gray-300">
              {analysis.timeframeAnalysis && analysis.timeframeAnalysis.length > 0 
                ? `All timeframes aligned in ${analysis.trend.toLowerCase()} direction, confirming strong ${analysis.trend.toLowerCase()} trend.`
                : 'No timeframe alignment analysis available.'}
            </p>
          </div>
          
          {/* Market Trend Heatmap */}
          <div className="bg-[#0A0A0A] p-4 rounded-lg animate-in fade-in-0 slide-in-from-bottom-3 duration-700 mt-4">
            <h4 className="font-medium mb-2">Market Trend Heatmap</h4>
            <p className="text-sm text-gray-300 mb-3">
              Correlation analysis of related currency pairs based on the analysis of {analysis.symbol}:
            </p>
            {analysis.marketTrends && analysis.marketTrends.length > 0 ? (
              <MarketTrendHeatmap
                data={analysis.marketTrends}
                title="Related Market Predictions"
                description={`Showing correlation data for ${analysis.marketTrends.length} related currency pairs to ${analysis.symbol}`}
              />
            ) : (
              <div className="text-center text-gray-400 my-3 py-6">No market trend data available</div>
            )}
          </div>
        </div>
      </div>
      
      {/* Volume Analysis */}
      <div className="bg-[#1E1E1E] rounded-xl p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4">Volume Analysis & Best Trading Times</h2>
        <VolumeAnalysisChart volumeData={analysis.volumeAnalysis} symbol={analysis.symbol} />
      </div>
      
      {/* Trading Recommendation */}
      <div className="bg-[#1E1E1E] rounded-xl p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4">Trading Recommendation</h2>
        <div className="bg-[#0A0A0A] p-4 rounded-lg animate-in fade-in-0 slide-in-from-bottom-3 duration-700">
          <div className="flex items-center mb-3">
            <div className="w-10 h-10 bg-[#E64A4A] rounded-lg flex items-center justify-center mr-3">
              <i className="fas fa-robot text-white"></i>
            </div>
            <div>
              <MarketInsight
                term="AI-Powered Strategy"
                category="strategy"
                animation="volatile"
                description={`Trading recommendation based on the analysis of ${(analysis.patterns?.length || 0) + (analysis.indicators?.length || 0)} pattern and indicator signals.`}
              />
              <p className="text-sm text-gray-400">
                Based on {(analysis.patterns?.length || 0) + (analysis.indicators?.length || 0)} pattern and indicator signals
              </p>
            </div>
          </div>
          
          <div className="mb-4">
            <h5 className="text-sm font-medium mb-2">Recommendation</h5>
            <p className="text-gray-300">{analysis.recommendation}</p>
          </div>
          
          <div className="space-y-2">
            <h5 className="text-sm font-medium">Actionable Steps</h5>
            {analysis.steps && analysis.steps.length > 0 ? (
              analysis.steps.map((step, index) => (
                <div key={index} className="flex items-start">
                  <div className="w-5 h-5 rounded-full bg-[#333333] flex-shrink-0 mr-2 flex items-center justify-center">
                    <span className="text-xs font-medium">{index + 1}</span>
                  </div>
                  <p className="text-sm text-gray-300">{step}</p>
                </div>
              ))
            ) : (
              <div className="text-gray-400">No actionable steps available</div>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-[#333333]">
            <p className="text-sm text-gray-400">Risk Disclaimer: This analysis is for informational purposes only and should not be considered as financial advice.</p>
          </div>
        </div>
      </div>
      
      {/* Economic News Alerts Section - Only show if we have news events */}
      {newsEvents.length > 0 && (
        <div className="md:col-span-2 animate-in fade-in-0 slide-in-from-bottom-3 duration-700">
          <NewsAlert 
            symbol={analysis.symbol} 
            news={newsEvents}
            className="bg-[#1E1E1E] rounded-xl shadow-lg"
          />
        </div>
      )}
    </div>
  );
};

export default AnalysisResult;
