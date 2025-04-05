import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingIndicatorProps {
  progress: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ 
  progress, 
  className,
  size = 'md' 
}) => {
  const radius = 40;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  
  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32'
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-xl'
  };
  
  return (
    <div className={cn("relative", className)}>
      <svg className={cn(sizeClasses[size])} viewBox="0 0 100 100">
        <circle 
          className="text-[#1E1E1E]" 
          strokeWidth="8" 
          stroke="currentColor" 
          fill="transparent" 
          r={radius} 
          cx="50" 
          cy="50"
        />
        <circle 
          className="text-[#E64A4A] progress-ring__circle" 
          strokeWidth="8" 
          strokeDasharray={circumference} 
          strokeDashoffset={offset} 
          stroke="currentColor" 
          fill="transparent" 
          r={radius} 
          cx="50" 
          cy="50"
          style={{
            transition: 'stroke-dashoffset 0.35s',
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%'
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("font-bold", textSizes[size])}>{Math.round(progress)}%</span>
      </div>
    </div>
  );
};

export default LoadingIndicator;
