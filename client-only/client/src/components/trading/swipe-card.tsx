import React, { useState } from 'react';
import { useSpring, animated } from 'react-spring';
import { useDrag } from '@use-gesture/react';
import { ChartAnalysis } from '@shared/schema';
import { Card } from '@/components/ui/card';
import { X, Heart, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { ChartImage } from '@/components/ui/chart-image';

interface SwipeCardProps {
  analysis: ChartAnalysis;
  onSwipe: (direction: 'left' | 'right') => void;
  isTop: boolean;
}

export const SwipeCard: React.FC<SwipeCardProps> = ({ analysis, onSwipe, isTop }) => {
  const [gone, setGone] = useState(false);
  const [, setLocation] = useLocation();
  
  // Set up spring animation
  const [{ x, y, rot, scale }, api] = useSpring(() => ({
    x: 0,
    y: 0,
    rot: 0,
    scale: 1,
    config: { friction: 50, tension: 500 }
  }));

  // Set up gesture handler
  const bind = useDrag(({ active, movement: [mx], direction: [xDir], velocity: [vx] }: { 
    active: boolean; 
    movement: number[]; 
    direction: number[]; 
    velocity: number[]; 
  }) => {
    const trigger = vx > 0.2; // Velocity threshold to trigger swipe
    
    // If card is actively being dragged
    if (active && isTop) {
      // Move card and apply rotation based on drag distance
      api.start({
        x: mx,
        rot: mx / 100,
        scale: 1.05,
        immediate: true
      });
    } else {
      // If we've passed velocity threshold and we're the top card
      if (trigger && isTop) {
        // Determine if swipe was left or right
        const dir = xDir < 0 ? -1 : 1;
        
        // Fly card out in swipe direction
        api.start({
          x: (200 + window.innerWidth) * dir,
          rot: mx / 100,
          scale: 0.8,
          config: { friction: 50, tension: 300 }
        });
        
        // Mark card as gone and notify parent
        setGone(true);
        onSwipe(dir === -1 ? 'left' : 'right');
      } else {
        // Reset card position
        api.start({
          x: 0,
          rot: 0,
          scale: 1,
          config: { friction: 30, tension: 600 }
        });
      }
    }
  });

  // If card is gone, it shouldn't be interactive or visible
  if (gone) return null;

  // Visual indicator for like/dislike based on drag direction
  const likeOpacity = x.to({ map: Math.abs, range: [0, 150], output: [0, 1], extrapolate: 'clamp' });
  const likeTransform = x.to({
    map: (value: number) => (value > 0 ? 1 : 0),
    range: [0, 1],
    output: [0, 1],
    extrapolate: 'clamp'
  });
  
  const dislikeOpacity = x.to({ map: Math.abs, range: [0, 150], output: [0, 1], extrapolate: 'clamp' });
  const dislikeTransform = x.to({
    map: (value: number) => (value < 0 ? 1 : 0),
    range: [0, 1],
    output: [0, 1],
    extrapolate: 'clamp'
  });

  // View details handler
  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocation(`/analysis/${analysis.id}`);
  };

  // Swipe direction handlers
  const handleSwipeLeft = () => {
    api.start({
      x: -1000,
      rot: -10,
      scale: 0.8,
      config: { friction: 50, tension: 200 }
    });
    setGone(true);
    setTimeout(() => onSwipe('left'), 200);
  };

  const handleSwipeRight = () => {
    api.start({
      x: 1000,
      rot: 10,
      scale: 0.8,
      config: { friction: 50, tension: 200 }
    });
    setGone(true);
    setTimeout(() => onSwipe('right'), 200);
  };

  return (
    <animated.div
      {...bind()}
      style={{
        x,
        y,
        rotate: rot,
        scale,
        touchAction: 'none',
        position: 'absolute',
        width: '100%',
        height: '100%',
        willChange: 'transform',
        zIndex: isTop ? 10 : 0,
      }}
      className="cursor-grab active:cursor-grabbing"
    >
      <Card className="bg-[#0A0A0A] border-[#333333] h-full relative overflow-hidden shadow-xl">
        {/* Like/Dislike Indicators */}
        <animated.div 
          style={{ opacity: likeOpacity.to((o) => o * likeTransform.get()) }}
          className="absolute top-5 right-5 bg-green-500/80 text-white py-1 px-4 rounded-full rotate-12 z-50"
        >
          LIKE
        </animated.div>
        
        <animated.div 
          style={{ opacity: dislikeOpacity.to((o) => o * dislikeTransform.get()) }}
          className="absolute top-5 left-5 bg-red-500/80 text-white py-1 px-4 rounded-full -rotate-12 z-50"
        >
          NOPE
        </animated.div>
        
        {/* Card Content */}
        <div className="flex flex-col h-full">
          {/* Chart Image */}
          <div className="h-[55%] bg-[#1A1A1A] relative">
            <ChartImage
              imageUrl={analysis.imageUrl}
              altText={`${analysis.symbol || 'Chart'} analysis`}
              className="h-full w-full"
            />
            
            {/* Symbol and Direction Flag */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white">{analysis.symbol || 'Unknown Symbol'}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  analysis.direction.toLowerCase() === 'buy' 
                    ? 'bg-green-500/80 text-white' 
                    : 'bg-red-500/80 text-white'
                }`}>
                  {analysis.direction}
                </span>
              </div>
              <p className="text-sm text-gray-300">{analysis.timeframe || 'Unknown Timeframe'}</p>
            </div>
          </div>
          
          {/* Analysis Details */}
          <div className="p-4 flex-grow flex flex-col justify-between">
            {/* Trend and Pattern */}
            <div>
              <div className="mb-4">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-400">Trend:</span>
                  <span className="font-medium">{analysis.trend}</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-400">Pattern:</span>
                  <span className="font-medium">
                    {analysis.patterns 
                      ? (Array.isArray(analysis.patterns) 
                        ? analysis.patterns.map(p => typeof p === 'string' ? p : '').join(', ')
                        : typeof analysis.patterns === 'object'
                          ? JSON.stringify(analysis.patterns).substring(0, 30) + '...'
                          : String(analysis.patterns))
                      : 'None detected'}
                  </span>
                </div>
              </div>
              
              {/* Entry, TP, SL */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-[#1A1A1A] p-2 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">Entry</p>
                  <p className="text-sm font-medium">{analysis.entryPoint}</p>
                </div>
                <div className="bg-[#1A1A1A] p-2 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">Take Profit</p>
                  <p className="text-sm font-medium">{analysis.takeProfit}</p>
                </div>
                <div className="bg-[#1A1A1A] p-2 rounded-lg">
                  <p className="text-xs text-gray-400 mb-1">Stop Loss</p>
                  <p className="text-sm font-medium">{analysis.stopLoss}</p>
                </div>
              </div>
            </div>
            
            {/* Date and Actions */}
            <div>
              <p className="text-xs text-gray-500 mb-4 text-center">
                {new Date(analysis.createdAt).toLocaleDateString()} at {new Date(analysis.createdAt).toLocaleTimeString()}
              </p>
              
              <div className="flex justify-between items-center">
                <Button 
                  onClick={handleSwipeLeft} 
                  variant="outline" 
                  size="icon" 
                  className="rounded-full h-12 w-12 bg-white/5 border-[#333333] hover:bg-red-600/10 hover:border-red-600 hover:text-red-500 transition-colors"
                >
                  <X className="h-5 w-5" />
                </Button>
                
                <Button 
                  onClick={handleViewDetails} 
                  variant="outline" 
                  className="rounded-full bg-white/5 border-[#333333] hover:bg-blue-600/10 hover:border-blue-600 hover:text-blue-500 transition-colors"
                >
                  View Details <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                
                <Button 
                  onClick={handleSwipeRight} 
                  variant="outline" 
                  size="icon" 
                  className="rounded-full h-12 w-12 bg-white/5 border-[#333333] hover:bg-green-600/10 hover:border-green-600 hover:text-green-500 transition-colors"
                >
                  <Heart className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </animated.div>
  );
};