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
import { InsightTooltip, ConfidenceInsight, PatternInsight, IndicatorInsight, MarketTrendInsight } from '@/components/tooltips';
import { SocialShare } from '@/components/trading/social-share';
import { QuickShareDialog } from '@/components/trading/quick-share-dialog';
import { Share2, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

interface AnalysisResultProps {
  analysis: ChartAnalysisResponse;
  imageUrl: string;
  annotatedImageUrl?: string;
  onReanalyze: () => void;
}

const AnalysisResult: React.FC<AnalysisResultProps> = ({ analysis, imageUrl, annotatedImageUrl, onReanalyze }) => {
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const { isSubscribed, subscribeToSymbol, unsubscribeFromSymbol } = useNewsNotifications();
  const [, setLocation] = useLocation();
  
  const handleWhatIfClick = () => {
    const params = new URLSearchParams({
      symbol: analysis.symbol || '',
      currentPrice: analysis.currentPrice || '',
      entryPrice: analysis.entryPoint || '',
      stopLoss: analysis.stopLoss || '',
      takeProfit: analysis.takeProfit || '',
      trend: analysis.trend?.toLowerCase() || 'bullish',
      patterns: (analysis.patterns || []).map(p => p.name).join(',')
    });
    setLocation(`/what-if?${params.toString()}`);
  };
  
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
            {/* Display annotated image if available, otherwise show original */}
            <div className="bg-[#0A0A0A] rounded-lg overflow-hidden">
              {annotatedImageUrl || imageUrl ? (
                <>
                  <img
                    src={normalizeImageUrl(annotatedImageUrl || imageUrl)}
                    alt={annotatedImageUrl ? "Annotated trading chart with trade setup" : "Uploaded trading chart"}
                    className="w-full h-auto object-cover"
                    onError={(e) => {
                      console.error("Image failed to load:", annotatedImageUrl || imageUrl);
                      e.currentTarget.src = "https://placehold.co/600x400/black/gray?text=Chart+Image+Unavailable";
                    }}
                  />
                  {annotatedImageUrl && (
                    <div className="bg-[#0A0A0A] p-2 border-t border-gray-700">
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          Trade Setup Annotations Enabled
                        </span>
                        <span>Entry • Stop Loss • Take Profit</span>
                      </div>
                    </div>
                  )}
                </>
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
              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  size="sm"
                  className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                  onClick={handleWhatIfClick}
                  data-testid="button-what-if"
                >
                  <Lightbulb className="h-4 w-4 mr-1" /> What If
                </Button>
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
              <div className="grid grid-cols-4 gap-4 mb-3">
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
                <div>
                  <p className="text-sm text-gray-400">Preferred Volume</p>
                  <p className="font-medium text-[#4CAF50]">{analysis.preferredVolumeThreshold || "Standard"}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-400">Preferred Time</p>
                  <p className="font-medium text-[#3498db]">{analysis.preferredTradingTime || "Any Time"}</p>
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
      
      {/* Candlestick Significance - New Indicator */}
      {analysis.candlestickSignificance && (
        <div className="bg-[#1E1E1E] rounded-xl p-6 shadow-lg" data-testid="candlestick-significance-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <span className="text-2xl">🕯️</span>
              Candlestick Significance
            </h2>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                analysis.candlestickSignificance.overallSignal.toLowerCase().includes('buy') 
                  ? 'bg-green-500/20 text-green-400' 
                  : analysis.candlestickSignificance.overallSignal.toLowerCase().includes('sell')
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-500/20 text-gray-400'
              }`} data-testid="candlestick-overall-signal">
                {analysis.candlestickSignificance.overallSignal}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs ${
                analysis.candlestickSignificance.reliability === 'High' 
                  ? 'bg-green-500/20 text-green-400' 
                  : analysis.candlestickSignificance.reliability === 'Medium'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-gray-500/20 text-gray-400'
              }`}>
                {analysis.candlestickSignificance.reliability} Reliability
              </span>
            </div>
          </div>
          
          {/* Key Observation & Trading Implication */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-[#0A0A0A] p-4 rounded-lg border-l-4 border-[#E64A4A]">
              <h4 className="text-sm font-medium text-gray-400 mb-1">Key Observation</h4>
              <p className="text-sm text-gray-200">{analysis.candlestickSignificance.keyObservation}</p>
            </div>
            <div className="bg-[#0A0A0A] p-4 rounded-lg border-l-4 border-[#4CAF50]">
              <h4 className="text-sm font-medium text-gray-400 mb-1">Trading Implication</h4>
              <p className="text-sm text-gray-200">{analysis.candlestickSignificance.tradingImplication}</p>
            </div>
          </div>
          
          {/* Candlestick Patterns */}
          <div className="space-y-3">
            {analysis.candlestickSignificance.patterns && analysis.candlestickSignificance.patterns.length > 0 ? (
              analysis.candlestickSignificance.patterns.map((pattern, index) => (
                <div 
                  key={index} 
                  className="bg-[#0A0A0A] p-4 rounded-lg animate-in fade-in-0 slide-in-from-bottom-3 duration-500" 
                  style={{ animationDelay: `${index * 100}ms` }}
                  data-testid={`candlestick-pattern-${index}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        pattern.type === 'Bullish' ? 'bg-green-500/20' : 
                        pattern.type === 'Bearish' ? 'bg-red-500/20' : 'bg-gray-500/20'
                      }`}>
                        <span className="text-xl">
                          {pattern.type === 'Bullish' ? '📈' : pattern.type === 'Bearish' ? '📉' : '➖'}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-medium">{pattern.name}</h4>
                        <p className="text-xs text-gray-400">{pattern.location}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        pattern.type === 'Bullish' ? 'bg-green-500/20 text-green-400' : 
                        pattern.type === 'Bearish' ? 'bg-red-500/20 text-red-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {pattern.type}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        pattern.significance === 'Very High' ? 'bg-purple-500/20 text-purple-400' :
                        pattern.significance === 'High' ? 'bg-blue-500/20 text-blue-400' :
                        pattern.significance === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {pattern.significance}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 mb-2">{pattern.description}</p>
                  <div className="flex items-start gap-2 bg-[#1a1a1a] p-2 rounded">
                    <span className="text-yellow-500">💡</span>
                    <p className="text-sm text-yellow-200/80">{pattern.actionableInsight}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-[#0A0A0A] p-4 rounded-lg text-center text-gray-400">
                No significant candlestick patterns detected in the current view
              </div>
            )}
          </div>
        </div>
      )}
      
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
          
          {/* Market Trend Heatmap removed as requested */}
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
      
      {/* Social Media Sharing */}
      <div className="bg-[#1E1E1E] rounded-xl p-6 shadow-lg">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">Share Your Analysis</h2>
            <QuickShareDialog 
              analysis={analysis} 
              imageUrl={imageUrl} 
              trigger={
                <Button size="sm" variant="secondary" className="flex items-center gap-2">
                  <Share2 className="h-4 w-4" />
                  One-Click Share
                </Button>
              }
            />
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Share this analysis with your trading community or add personalized trading notes with our quick share feature.
          </p>
          <SocialShare analysis={analysis} imageUrl={imageUrl} />
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
