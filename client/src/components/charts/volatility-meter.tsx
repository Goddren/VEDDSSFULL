import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, AlertTriangle, Shield } from 'lucide-react';

interface VolatilityMeterProps {
  volatility: number; // 0-100 scale
  symbol: string;
  direction: string;
  className?: string;
}

/**
 * Animated volatility risk meter component that visualizes market risk
 */
export const VolatilityMeter: React.FC<VolatilityMeterProps> = ({
  volatility,
  symbol,
  direction,
  className = '',
}) => {
  // Ensure volatility is within 0-100 range
  const normalizedVolatility = Math.max(0, Math.min(100, volatility));
  
  // Determine risk level based on volatility
  const getRiskLevel = (vol: number) => {
    if (vol < 30) return 'Low';
    if (vol < 70) return 'Medium';
    return 'High';
  };
  
  const riskLevel = getRiskLevel(normalizedVolatility);
  
  // Get colors based on risk level
  const getColors = (level: string) => {
    switch (level) {
      case 'Low':
        return {
          primary: 'bg-green-500',
          secondary: 'text-green-500',
          gradient: 'from-green-500/20 to-green-500/5',
        };
      case 'Medium':
        return {
          primary: 'bg-yellow-500',
          secondary: 'text-yellow-500',
          gradient: 'from-yellow-500/20 to-yellow-500/5',
        };
      case 'High':
        return {
          primary: 'bg-red-500',
          secondary: 'text-red-500',
          gradient: 'from-red-500/20 to-red-500/5',
        };
      default:
        return {
          primary: 'bg-blue-500',
          secondary: 'text-blue-500',
          gradient: 'from-blue-500/20 to-blue-500/5',
        };
    }
  };

  const colors = getColors(riskLevel);
  
  // Get risk message based on volatility and direction
  const getRiskMessage = () => {
    if (riskLevel === 'Low') {
      return `Low volatility detected for ${symbol}. ${direction.toLowerCase() === 'buy' ? 'Buying' : 'Selling'} conditions are relatively stable.`;
    } else if (riskLevel === 'Medium') {
      return `Moderate volatility detected for ${symbol}. Proceed with caution and consider tighter stop losses.`;
    } else {
      return `High volatility alert for ${symbol}! Consider reducing position size and implementing strict risk management.`;
    }
  };

  // Animation for the needle
  const [needlePosition, setNeedlePosition] = useState(0);
  
  useEffect(() => {
    setNeedlePosition(normalizedVolatility);
  }, [normalizedVolatility]);
  
  // Pulsing animation effect
  const pulseAnimation = {
    scale: [1, 1.02, 1],
    opacity: [0.9, 1, 0.9],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut"
    }
  };

  // Risk icon based on level
  const RiskIcon = riskLevel === 'Low' 
    ? Shield 
    : riskLevel === 'Medium' 
      ? TrendingUp 
      : AlertTriangle;

  return (
    <div className={`rounded-lg border border-border bg-card p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-lg">Market Volatility</h3>
        <div className={`px-2 py-1 rounded-full ${colors.primary}/20 ${colors.secondary} text-xs font-medium`}>
          {riskLevel} Risk
        </div>
      </div>
      
      {/* Meter display */}
      <div className="relative h-16 mb-4">
        {/* Background gradient */}
        <div className="absolute inset-0 rounded-full h-4 mt-6 bg-gradient-to-r from-green-500/30 via-yellow-500/30 to-red-500/30"></div>
        
        {/* Meter tick marks */}
        <div className="absolute inset-0 flex justify-between px-1 mt-6">
          <div className="w-px h-8 bg-border -mt-2"></div>
          <div className="w-px h-4 bg-border"></div>
          <div className="w-px h-4 bg-border"></div>
          <div className="w-px h-8 bg-border -mt-2"></div>
          <div className="w-px h-4 bg-border"></div>
          <div className="w-px h-4 bg-border"></div>
          <div className="w-px h-8 bg-border -mt-2"></div>
        </div>
        
        {/* Risk labels */}
        <div className="absolute inset-0 flex justify-between text-xs text-muted-foreground mt-10">
          <span>Low</span>
          <span className="ml-auto">Medium</span>
          <span className="ml-auto">High</span>
        </div>
        
        {/* Animated needle */}
        <motion.div 
          className="absolute top-6 w-1 h-12 bg-primary -ml-0.5"
          style={{ 
            left: `${needlePosition}%`,
            transformOrigin: 'bottom center',
            rotate: 0
          }}
          animate={{ 
            left: `${needlePosition}%`,
            rotate: [0, 2, -2, 0],
          }}
          transition={{ 
            left: { type: "spring", stiffness: 100, damping: 15 },
            rotate: { repeat: Infinity, duration: 1, ease: "easeInOut" }
          }}
        >
          <div className="w-3 h-3 rounded-full bg-primary absolute -top-3 -left-1"></div>
        </motion.div>
      </div>
      
      {/* Risk information box */}
      <motion.div 
        className={`mt-4 p-3 rounded-lg bg-gradient-to-br ${colors.gradient} border border-${colors.primary}/20`}
        animate={pulseAnimation}
      >
        <div className="flex items-start gap-2">
          <RiskIcon className={`h-5 w-5 ${colors.secondary} mt-0.5`} />
          <div>
            <p className="text-sm text-foreground">{getRiskMessage()}</p>
            <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
              <span>Volatility: {normalizedVolatility}%</span>
              <span>•</span>
              <span>ATR: {(normalizedVolatility / 25).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default VolatilityMeter;