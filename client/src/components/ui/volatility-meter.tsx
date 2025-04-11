import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, AlertCircle, ArrowRight } from "lucide-react";

export interface VolatilityMeterProps {
  value?: number;
  volatility?: number; // For backward compatibility with existing component
  symbol?: string;
  direction?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  animated?: boolean;
  className?: string;
  onChange?: (value: number) => void;
}

export function VolatilityMeter({
  value,
  volatility = 50,
  symbol = "Unknown",
  direction = "Neutral",
  size = "md",
  showLabel = true,
  animated = true,
  className = "",
  onChange
}: VolatilityMeterProps) {
  // Use value if provided, otherwise use volatility for backward compatibility
  const actualValue: number = value !== undefined ? value : volatility;
  const [displayValue, setDisplayValue] = useState(actualValue);
  
  // Ensure value is between 0 and 100
  const normalizedValue = Math.max(0, Math.min(100, actualValue));
  
  // Size mappings
  const sizeClasses = {
    sm: "h-2",
    md: "h-4",
    lg: "h-6"
  };
  
  const meterHeight = sizeClasses[size];
  
  // Get risk level and color based on value
  const getRiskLevel = (val: number) => {
    if (val < 25) return { level: "Low", color: "bg-green-500" };
    if (val < 50) return { level: "Moderate", color: "bg-yellow-500" };
    if (val < 75) return { level: "High", color: "bg-orange-500" };
    return { level: "Extreme", color: "bg-red-500" };
  };
  
  const risk = getRiskLevel(normalizedValue);
  
  // Animated fill gradient based on value
  const fillGradient = normalizedValue < 50
    ? `bg-gradient-to-r from-green-500 to-yellow-500`
    : normalizedValue < 75
      ? `bg-gradient-to-r from-yellow-500 to-orange-500`
      : `bg-gradient-to-r from-orange-500 to-red-500`;
  
  useEffect(() => {
    if (animated) {
      // Animate the value changing
      const animateValue = (start: number, end: number, duration: number) => {
        let startTimestamp: number | null = null;
        const step = (timestamp: number) => {
          if (!startTimestamp) startTimestamp = timestamp;
          const progress = Math.min((timestamp - startTimestamp) / duration, 1);
          const currentValue = Math.floor(progress * (end - start) + start);
          setDisplayValue(currentValue);
          
          if (progress < 1) {
            window.requestAnimationFrame(step);
          }
        };
        window.requestAnimationFrame(step);
      };
      
      animateValue(0, normalizedValue, 1500);
    } else {
      setDisplayValue(normalizedValue);
    }
  }, [normalizedValue, animated]);
  
  // Get risk indicator icon
  const RiskIcon = normalizedValue < 50 ? AlertCircle : AlertTriangle;
  
  // Handle click on meter to update value (if onChange provided)
  const handleMeterClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onChange) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newValue = Math.round((x / rect.width) * 100);
    onChange(newValue);
  };
  
  return (
    <div className={`${className} w-full`}>
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center">
            <RiskIcon 
              className={`mr-1.5 h-4 w-4 ${
                normalizedValue < 50 
                  ? "text-green-500" 
                  : normalizedValue < 75 
                    ? "text-orange-500" 
                    : "text-red-500"
              } ${animated ? "animate-pulse" : ""}`} 
            />
            <span className="text-sm font-medium">Market Volatility</span>
          </div>
          <span 
            className={`text-sm font-medium ${
              normalizedValue < 50 
                ? "text-green-500" 
                : normalizedValue < 75 
                  ? "text-orange-500" 
                  : "text-red-500"
            }`}
          >
            {risk.level} Risk
          </span>
        </div>
      )}
      
      <div 
        className={`relative w-full ${meterHeight} bg-gray-800 rounded-full overflow-hidden cursor-pointer`}
        onClick={onChange ? handleMeterClick : undefined}
      >
        {/* Base gradient background with animation */}
        <motion.div 
          className={`absolute inset-0 ${fillGradient} rounded-full`}
          initial={{ width: "0%" }}
          animate={{ width: `${displayValue}%` }}
          transition={{ 
            duration: animated ? 1.5 : 0, 
            ease: "easeOut" 
          }}
        >
          {/* Animated pulse effect */}
          {animated && (
            <motion.div 
              className="absolute inset-0 bg-white/20"
              animate={{ 
                opacity: [0.2, 0.3, 0.2],
                scale: [1, 1.02, 1]
              }}
              transition={{ 
                repeat: Infinity, 
                duration: 2 
              }}
            />
          )}
          
          {/* Animated indicator */}
          {size !== "sm" && animated && (
            <motion.div 
              className="absolute right-1 top-1/2 -translate-y-1/2 bg-white h-3 w-3 rounded-full shadow-glow"
              animate={{ 
                scale: [0.8, 1.2, 0.8],
                boxShadow: [
                  "0 0 5px 2px rgba(255, 255, 255, 0.3)",
                  "0 0 8px 3px rgba(255, 255, 255, 0.5)",
                  "0 0 5px 2px rgba(255, 255, 255, 0.3)"
                ]
              }}
              transition={{ 
                repeat: Infinity, 
                duration: 2 
              }}
            />
          )}
        </motion.div>
      </div>
      
      {showLabel && (
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">Low</span>
          <span className="text-xs text-gray-400">Medium</span>
          <span className="text-xs text-gray-400">High</span>
        </div>
      )}
      
      {size === "lg" && showLabel && (
        <div className="mt-2 p-3 bg-gray-900/80 rounded-lg border border-gray-800">
          <div className="flex items-center text-sm mb-1">
            <span className={`font-medium ${
              normalizedValue < 50 
                ? "text-green-400" 
                : normalizedValue < 75 
                  ? "text-orange-400" 
                  : "text-red-400"
            }`}>
              {symbol} Risk Rating: {displayValue}/100
            </span>
            <div className="flex-grow"></div>
            {normalizedValue > 70 && (
              <span className="text-xs bg-red-900/50 text-red-200 px-2 py-0.5 rounded-full flex items-center">
                <AlertTriangle className="h-3 w-3 mr-1" /> Warning
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {normalizedValue < 25 && `Low volatility detected for ${symbol}. ${direction.toLowerCase() === 'buy' ? 'Buying' : 'Selling'} conditions are relatively stable. Good for conservative trading strategies.`}
            {normalizedValue >= 25 && normalizedValue < 50 && `Moderate volatility for ${symbol} with reasonable risk levels. Suitable for balanced ${direction.toLowerCase()} approaches.`}
            {normalizedValue >= 50 && normalizedValue < 75 && `High volatility indicates significant market uncertainty for ${symbol}. Apply stronger risk management with your ${direction.toLowerCase()} position.`}
            {normalizedValue >= 75 && `Extreme volatility detected for ${symbol}! Consider reducing position sizes and implementing strict stop losses for this ${direction.toLowerCase()} signal.`}
          </p>
          {normalizedValue > 50 && (
            <div className="mt-2 flex items-center">
              <ArrowRight className="h-3 w-3 text-amber-400 mr-1" />
              <span className="text-xs text-amber-400">
                {normalizedValue > 70 ? (
                  `Recommended action: Reduce position size by ${Math.round((normalizedValue - 50) / 50 * 100)}%`
                ) : (
                  `Consider tighter stop losses for this ${direction.toLowerCase()} position`
                )}
              </span>
            </div>
          )}
          
          {/* Symbol-specific additional info */}
          {symbol !== "Unknown" && (
            <div className="mt-3 pt-2 border-t border-gray-800 text-xs text-gray-400 grid grid-cols-3 gap-2">
              <div>
                <span className="block text-gray-500">ATR Est.</span>
                <span className="font-medium">{(normalizedValue / 1000).toFixed(4)}</span>
              </div>
              <div>
                <span className="block text-gray-500">Trend Strength</span>
                <span className={`font-medium ${
                  normalizedValue < 40 ? "text-blue-400" : 
                  normalizedValue < 70 ? "text-amber-400" : "text-red-400"
                }`}>
                  {normalizedValue < 40 ? "Weak" : normalizedValue < 70 ? "Moderate" : "Strong"}
                </span>
              </div>
              <div>
                <span className="block text-gray-500">Suggested Lot</span>
                <span className="font-medium">
                  {normalizedValue > 70 ? "0.01" : normalizedValue > 50 ? "0.05" : "0.1"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}