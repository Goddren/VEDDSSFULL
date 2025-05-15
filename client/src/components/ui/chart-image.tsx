import React, { useState } from 'react';
import { normalizeImageUrl } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ChartImageProps {
  imageUrl: string;
  altText?: string;
  className?: string;
}

export function ChartImage({ imageUrl, altText = 'Chart analysis', className = '' }: ChartImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  // Default chart background - a simple candlestick pattern
  const DefaultChartBackground = () => (
    <div className={`relative w-full h-full bg-[#121212] flex items-center justify-center ${className}`}>
      <div className="absolute inset-0 overflow-hidden">
        {/* Grid lines */}
        <div className="absolute inset-0" style={{ 
          backgroundImage: 'linear-gradient(to right, #1a1a1a 1px, transparent 1px), linear-gradient(to bottom, #1a1a1a 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }} />
        
        {/* Price chart lines */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Trend line */}
          <path d="M0,70 Q30,60 50,40 T100,20" stroke="#333" strokeWidth="0.5" fill="none" />
          
          {/* Candlesticks - simplified representation */}
          <g>
            {[5, 15, 25, 35, 45, 55, 65, 75, 85, 95].map((x, i) => {
              const isGreen = i % 2 === 0;
              const height = 10 + Math.random() * 20;
              const y = 40 + (Math.random() * 30 - 15);
              const wickHeight = 5 + Math.random() * 10;
              
              return (
                <g key={x}>
                  {/* Candle wick */}
                  <line 
                    x1={x} y1={y - wickHeight/2} 
                    x2={x} y2={y + wickHeight/2} 
                    stroke={isGreen ? "#4CAF50" : "#E64A4A"} 
                    strokeWidth="0.5" 
                  />
                  {/* Candle body */}
                  <rect 
                    x={x-1.5} y={y - height/2} 
                    width={3} height={height}
                    fill={isGreen ? "#4CAF50" : "#E64A4A"} 
                    fillOpacity="0.3"
                    stroke={isGreen ? "#4CAF50" : "#E64A4A"} 
                    strokeWidth="0.5" 
                  />
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      
      {/* Placeholder text */}
      <div className="text-center z-10 px-4 py-2 bg-black/70 rounded">
        <p className="text-gray-400">Chart Image Unavailable</p>
        <p className="text-xs text-gray-500 mt-1">{altText}</p>
      </div>
    </div>
  );

  const handleImageLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleImageError = () => {
    console.error("Image failed to load:", imageUrl);
    setIsLoading(false);
    setHasError(true);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#121212]">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      )}
      
      {/* Display the default chart if there's an error */}
      {hasError && <DefaultChartBackground />}
      
      {/* Actual image */}
      <img
        src={normalizeImageUrl(imageUrl)}
        alt={altText}
        className={`h-full w-full object-cover ${hasError ? 'hidden' : ''}`}
        onLoad={handleImageLoad}
        onError={handleImageError}
        style={{ visibility: isLoading ? 'hidden' : 'visible' }}
      />
    </div>
  );
}