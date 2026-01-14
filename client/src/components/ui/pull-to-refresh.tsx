import { useState, useRef, useCallback, ReactNode } from 'react';
import { Loader2, ArrowDown } from 'lucide-react';
import { triggerHaptic } from '@/hooks/use-gestures';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  threshold?: number;
  className?: string;
  disabled?: boolean;
}

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 80,
  className,
  disabled = false
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const isAtTopRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const container = containerRef.current;
    if (container && container.scrollTop <= 0) {
      startYRef.current = e.touches[0].clientY;
      isAtTopRef.current = true;
    } else {
      isAtTopRef.current = false;
    }
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isAtTopRef.current || disabled || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;

    if (diff > 0) {
      const resistance = 0.4;
      const newDistance = Math.min(diff * resistance, threshold * 1.5);
      setPullDistance(newDistance);
    }
  }, [disabled, isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isAtTopRef.current || disabled) return;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      triggerHaptic('medium');
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    setPullDistance(0);
    startYRef.current = 0;
    isAtTopRef.current = false;
  }, [pullDistance, threshold, isRefreshing, onRefresh, disabled]);

  const progress = Math.min(pullDistance / threshold, 1);
  const showIndicator = pullDistance > 10 || isRefreshing;

  return (
    <div 
      ref={containerRef}
      className={cn("relative overflow-auto", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className={cn(
          "absolute left-1/2 -translate-x-1/2 z-10 transition-all duration-200",
          showIndicator ? "opacity-100" : "opacity-0"
        )}
        style={{
          top: pullDistance > 0 ? pullDistance - 40 : -40,
          transform: `translateX(-50%) rotate(${progress * 360}deg)`
        }}
      >
        <div className={cn(
          "w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center",
          isRefreshing && "animate-pulse"
        )}>
          {isRefreshing ? (
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          ) : (
            <ArrowDown 
              className={cn(
                "w-5 h-5 text-primary transition-transform duration-200",
                progress >= 1 && "rotate-180"
              )} 
            />
          )}
        </div>
      </div>

      <div 
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance === 0 && !isRefreshing ? 'transform 0.2s ease-out' : 'none'
        }}
      >
        {children}
      </div>

      {isRefreshing && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20 overflow-hidden">
          <div className="h-full bg-primary animate-pulse" style={{ width: '100%' }} />
        </div>
      )}
    </div>
  );
}
