import React, { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card } from '@/components/ui/card';
import { 
  TrendingUp, TrendingDown, ChevronsUpDown, AlertTriangle, 
  BarChart2, LineChart, CandlestickChart, ArrowUpRight, 
  ArrowDownRight, Layers, Activity, Inspect
} from 'lucide-react';

type InsightType = 'bullish' | 'bearish' | 'neutral' | 'volatile';
type MarketContext = 
  'candlestick' | 
  'support' | 
  'resistance' | 
  'breakout' | 
  'trend' | 
  'volume' | 
  'divergence' | 
  'indicator' | 
  'reversal' | 
  'pattern';

interface InteractiveInsightTooltipProps {
  title: string;
  description: string;
  type?: InsightType;
  context?: MarketContext;
  children?: React.ReactNode;
  showAnimation?: boolean;
  className?: string;
}

export const InteractiveInsightTooltip: React.FC<InteractiveInsightTooltipProps> = ({
  title,
  description,
  type = 'neutral',
  context = 'trend',
  children,
  showAnimation = true,
  className = ''
}) => {
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);

  // Get icon based on insight type
  const getIcon = () => {
    switch (type) {
      case 'bullish':
        return <TrendingUp size={18} className="text-emerald-500" />;
      case 'bearish':
        return <TrendingDown size={18} className="text-rose-500" />;
      case 'neutral':
        return <ChevronsUpDown size={18} className="text-amber-500" />;
      case 'volatile':
        return <AlertTriangle size={18} className="text-orange-500" />;
      default:
        return <TrendingUp size={18} className="text-gray-500" />;
    }
  };

  // Get contextual animation elements
  const getContextualAnimation = () => {
    switch (context) {
      case 'candlestick':
        return (
          <div className="py-3">
            <div className="flex items-end justify-center gap-1 h-24">
              {/* Candlestick chart animation */}
              <div className="w-4 flex flex-col items-center">
                <div className="h-1 w-px bg-gray-400"></div>
                <div className={`w-4 h-12 ${type === 'bullish' ? 'bg-emerald-500' : 'bg-rose-500'} rounded-sm animate-candlestick`}></div>
                <div className="h-1 w-px bg-gray-400"></div>
              </div>
              <div className="w-4 flex flex-col items-center">
                <div className="h-2 w-px bg-gray-400"></div>
                <div className={`w-4 h-8 ${type === 'bullish' ? 'bg-emerald-500/50' : 'bg-rose-500/50'} rounded-sm animate-candlestick`} style={{animationDelay: '0.5s'}}></div>
                <div className="h-2 w-px bg-gray-400"></div>
              </div>
              <div className="w-4 flex flex-col items-center">
                <div className="h-3 w-px bg-gray-400"></div>
                <div className={`w-4 h-10 ${type === 'bullish' ? 'bg-emerald-500' : 'bg-rose-500'} rounded-sm animate-candlestick`} style={{animationDelay: '1s'}}></div>
                <div className="h-3 w-px bg-gray-400"></div>
              </div>
              <div className="w-4 flex flex-col items-center">
                <div className="h-1 w-px bg-gray-400"></div>
                <div className={`w-4 h-16 ${type === 'bullish' ? 'bg-emerald-500/70' : 'bg-rose-500/70'} rounded-sm animate-candlestick`} style={{animationDelay: '1.5s'}}></div>
                <div className="h-1 w-px bg-gray-400"></div>
              </div>
              <div className="w-4 flex flex-col items-center">
                <div className="h-2 w-px bg-gray-400"></div>
                <div className={`w-4 h-14 ${type === 'bullish' ? 'bg-emerald-500/80' : 'bg-rose-500/80'} rounded-sm animate-candlestick`} style={{animationDelay: '2s'}}></div>
                <div className="h-2 w-px bg-gray-400"></div>
              </div>
            </div>
          </div>
        );
      
      case 'support':
      case 'resistance':
        return (
          <div className="py-3">
            <div className="relative h-24 w-full">
              {/* Price chart */}
              <svg viewBox="0 0 100 50" className="w-full h-full">
                <path 
                  d="M0,25 Q10,15 20,30 T40,20 T60,35 T80,15 T100,25" 
                  fill="none" 
                  stroke={type === 'bullish' ? '#10b981' : '#f43f5e'} 
                  strokeWidth="2"
                  className="animate-price-wave"
                />
              </svg>
              
              {/* Support/Resistance line */}
              <div 
                className={`absolute w-full h-0.5 ${
                  context === 'support' ? 'bg-emerald-500/50' : 'bg-rose-500/50'
                } animate-support-resistance`}
                style={{
                  bottom: context === 'support' ? '30%' : '70%',
                  boxShadow: `0 0 8px ${context === 'support' ? '#10b981' : '#f43f5e'}`
                }}
              ></div>
            </div>
          </div>
        );
      
      case 'breakout':
        return (
          <div className="py-3">
            <div className="relative h-24 w-full overflow-hidden">
              {/* Base pattern */}
              <div className="absolute w-full h-full flex items-center justify-center">
                <div className="w-24 h-12 border-2 border-gray-600 rounded-md relative">
                  {/* Breakout arrow */}
                  <div 
                    className={`absolute -right-3 ${type === 'bullish' ? '-top-6' : '-bottom-6'} animate-breakout`}
                    style={{borderRadius: '50%'}}
                  >
                    {type === 'bullish' ? (
                      <ArrowUpRight size={24} className="text-emerald-500" />
                    ) : (
                      <ArrowDownRight size={24} className="text-rose-500" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      case 'trend':
        return (
          <div className="py-3">
            <div className="flex items-center justify-center h-24 relative">
              {/* Trend arrows */}
              <div className="flex flex-col items-center">
                {type === 'bullish' && (
                  <>
                    <ArrowUpRight size={18} className="text-emerald-500 animate-trend-arrows" style={{animationDelay: '0s'}} />
                    <ArrowUpRight size={24} className="text-emerald-500 animate-trend-arrows" style={{animationDelay: '0.2s'}} />
                    <ArrowUpRight size={30} className="text-emerald-500 animate-trend-arrows" style={{animationDelay: '0.4s'}} />
                  </>
                )}
                {type === 'bearish' && (
                  <>
                    <ArrowDownRight size={18} className="text-rose-500 animate-trend-arrows" style={{animationDelay: '0s'}} />
                    <ArrowDownRight size={24} className="text-rose-500 animate-trend-arrows" style={{animationDelay: '0.2s'}} />
                    <ArrowDownRight size={30} className="text-rose-500 animate-trend-arrows" style={{animationDelay: '0.4s'}} />
                  </>
                )}
                {type === 'neutral' && (
                  <ChevronsUpDown size={30} className="text-amber-500 animate-shake" />
                )}
                {type === 'volatile' && (
                  <Activity size={30} className="text-orange-500 animate-bounce-custom" />
                )}
              </div>
            </div>
          </div>
        );
      
      case 'volume':
        return (
          <div className="py-3">
            <div className="flex items-end justify-center gap-1.5 h-24">
              {/* Volume bars */}
              <div className="w-4 h-8 bg-gray-500/30 animate-volume" style={{animationDelay: '0.1s'}}></div>
              <div className="w-4 h-12 bg-gray-500/40 animate-volume" style={{animationDelay: '0.2s'}}></div>
              <div className="w-4 h-16 bg-gray-500/50 animate-volume" style={{animationDelay: '0.3s'}}></div>
              <div className="w-4 h-20 bg-gray-500/60 animate-volume" style={{animationDelay: '0.4s'}}></div>
              <div 
                className={`w-4 h-24 ${type === 'bullish' ? 'bg-emerald-500' : type === 'bearish' ? 'bg-rose-500' : 'bg-amber-500'} animate-volume`} 
                style={{animationDelay: '0.5s'}}
              ></div>
              <div className="w-4 h-18 bg-gray-500/60 animate-volume" style={{animationDelay: '0.6s'}}></div>
              <div className="w-4 h-14 bg-gray-500/50 animate-volume" style={{animationDelay: '0.7s'}}></div>
              <div className="w-4 h-10 bg-gray-500/40 animate-volume" style={{animationDelay: '0.8s'}}></div>
              <div className="w-4 h-6 bg-gray-500/30 animate-volume" style={{animationDelay: '0.9s'}}></div>
            </div>
          </div>
        );
      
      case 'divergence':
        return (
          <div className="py-3">
            <div className="relative h-24 w-full overflow-hidden">
              {/* Price line */}
              <svg viewBox="0 0 100 30" className="absolute top-0 w-full h-1/2">
                <path 
                  d={type === 'bullish' ? 'M0,30 L30,20 L60,25 L100,10' : 'M0,10 L30,15 L60,5 L100,20'} 
                  fill="none" 
                  stroke={type === 'bullish' ? '#10b981' : '#f43f5e'} 
                  strokeWidth="2"
                />
              </svg>
              
              {/* Indicator line - showing divergence */}
              <svg viewBox="0 0 100 30" className="absolute bottom-0 w-full h-1/2 animate-divergence">
                <path 
                  d={type === 'bullish' ? 'M0,10 L30,15 L60,5 L100,20' : 'M0,30 L30,20 L60,25 L100,10'} 
                  fill="none" 
                  stroke="#a3a3a3" 
                  strokeWidth="2"
                  strokeDasharray="3,2"
                />
              </svg>
            </div>
          </div>
        );
      
      case 'indicator':
        return (
          <div className="py-3 flex justify-center">
            <div 
              className={`h-16 w-16 rounded-full border-4 ${
                type === 'bullish' ? 'border-emerald-500 bg-emerald-500/20' : 
                type === 'bearish' ? 'border-rose-500 bg-rose-500/20' :
                'border-amber-500 bg-amber-500/20'
              } animate-indicator flex items-center justify-center`}
            >
              <Activity 
                size={30} 
                className={
                  type === 'bullish' ? 'text-emerald-500' : 
                  type === 'bearish' ? 'text-rose-500' : 
                  'text-amber-500'
                } 
              />
            </div>
          </div>
        );
      
      case 'pattern':
        return (
          <div className="py-3">
            <div className="flex flex-col items-center justify-center h-24">
              {/* Chart pattern */}
              {type === 'bullish' && (
                <div className="relative w-40 h-20">
                  <svg viewBox="0 0 100 50" className="w-full h-full">
                    <path 
                      d="M0,40 L20,30 L40,40 L60,25 L80,15 L100,5" 
                      fill="none" 
                      stroke="#10b981" 
                      strokeWidth="2"
                    />
                    <circle cx="40" cy="40" r="3" fill="#10b981" className="animate-pulse-slow" />
                    <circle cx="80" cy="15" r="3" fill="#10b981" className="animate-pulse-slow" />
                  </svg>
                </div>
              )}
              {type === 'bearish' && (
                <div className="relative w-40 h-20">
                  <svg viewBox="0 0 100 50" className="w-full h-full">
                    <path 
                      d="M0,10 L20,20 L40,10 L60,25 L80,35 L100,45" 
                      fill="none" 
                      stroke="#f43f5e" 
                      strokeWidth="2"
                    />
                    <circle cx="40" cy="10" r="3" fill="#f43f5e" className="animate-pulse-slow" />
                    <circle cx="80" cy="35" r="3" fill="#f43f5e" className="animate-pulse-slow" />
                  </svg>
                </div>
              )}
              {(type === 'neutral' || type === 'volatile') && (
                <div className="relative w-40 h-20">
                  <svg viewBox="0 0 100 50" className="w-full h-full">
                    <path 
                      d="M0,25 Q10,15 20,30 T40,20 T60,35 T80,15 T100,25" 
                      fill="none" 
                      stroke={type === 'neutral' ? '#eab308' : '#f97316'} 
                      strokeWidth="2"
                      className={type === 'volatile' ? 'animate-shake' : ''}
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>
        );
      
      case 'reversal':
        return (
          <div className="py-3">
            <div className="relative h-24 w-full overflow-hidden">
              {/* Reversal pattern */}
              <svg viewBox="0 0 100 50" className="w-full h-full">
                {type === 'bullish' ? (
                  // Bullish reversal (V shape)
                  <>
                    <path 
                      d="M10,10 L30,30 L50,5 L70,20 L90,10" 
                      fill="none" 
                      stroke="#a3a3a3" 
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                    <path 
                      d="M10,30 L30,20 L50,40 L70,30 L90,10" 
                      fill="none" 
                      stroke="#10b981" 
                      strokeWidth="2"
                      className="animate-price-wave"
                    />
                    <circle cx="50" cy="40" r="3" fill="#10b981" className="animate-pulse-slow" />
                  </>
                ) : (
                  // Bearish reversal (Λ shape)
                  <>
                    <path 
                      d="M10,30 L30,10 L50,35 L70,20 L90,30" 
                      fill="none" 
                      stroke="#a3a3a3" 
                      strokeWidth="1"
                      strokeDasharray="2,2"
                    />
                    <path 
                      d="M10,10 L30,20 L50,5 L70,10 L90,30" 
                      fill="none" 
                      stroke="#f43f5e" 
                      strokeWidth="2"
                      className="animate-price-wave"
                    />
                    <circle cx="50" cy="5" r="3" fill="#f43f5e" className="animate-pulse-slow" />
                  </>
                )}
              </svg>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  // Get context icon
  const getContextIcon = () => {
    switch (context) {
      case 'candlestick':
        return <CandlestickChart size={16} className="text-gray-400" />;
      case 'support':
      case 'resistance':
        return <Layers size={16} className="text-gray-400" />;
      case 'breakout':
        return <ArrowUpRight size={16} className="text-gray-400" />;
      case 'trend':
        return <TrendingUp size={16} className="text-gray-400" />;
      case 'volume':
        return <BarChart2 size={16} className="text-gray-400" />;
      case 'divergence':
        return <Inspect size={16} className="text-gray-400" />;
      case 'indicator':
        return <Activity size={16} className="text-gray-400" />;
      case 'reversal':
        return <ArrowUpRight size={16} className="text-gray-400 rotate-180" />;
      case 'pattern':
        return <LineChart size={16} className="text-gray-400" />;
      default:
        return <LineChart size={16} className="text-gray-400" />;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip 
        delayDuration={100} 
        open={isTooltipOpen} 
        onOpenChange={setIsTooltipOpen}
      >
        <TooltipTrigger asChild>
          <div 
            className={`inline-flex items-center gap-1 cursor-help ${className}`}
            onClick={(e) => {
              e.preventDefault();
              setIsTooltipOpen(!isTooltipOpen);
            }}
          >
            {children || (
              <span className="font-medium text-base border-b border-dashed border-gray-500 flex items-center gap-1">
                {title} {getIcon()}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          align="center" 
          className="p-0 bg-transparent border-none shadow-none max-w-xs"
        >
          <Card className="bg-gray-900/95 border-gray-800 shadow-xl backdrop-blur-sm w-full">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={`
                  p-1.5 rounded-full
                  ${type === 'bullish' ? 'bg-emerald-500/20' : 
                    type === 'bearish' ? 'bg-rose-500/20' : 
                    type === 'volatile' ? 'bg-orange-500/20' : 
                    'bg-amber-500/20'}
                `}>
                  {getIcon()}
                </span>
                <h4 className="font-medium text-white">{title}</h4>
                <span className="ml-auto text-xs px-2 py-1 rounded-full bg-gray-800 flex items-center gap-1">
                  {getContextIcon()}
                  <span className="opacity-70">{context}</span>
                </span>
              </div>
              <p className="text-sm text-gray-300">{description}</p>
              
              {/* Contextual animation */}
              {showAnimation && getContextualAnimation()}
            </div>
          </Card>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};