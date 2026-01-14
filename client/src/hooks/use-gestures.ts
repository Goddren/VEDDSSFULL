import { useRef, useCallback, useEffect, useState } from 'react';

interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
  isSwiping: boolean;
}

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  velocityThreshold?: number;
}

export function useSwipe(options: UseSwipeOptions = {}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50,
    velocityThreshold = 0.3
  } = options;

  const stateRef = useRef<SwipeState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    isSwiping: false
  });

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    stateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      isSwiping: true
    };
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!stateRef.current.isSwiping) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - stateRef.current.startX;
    const deltaY = touch.clientY - stateRef.current.startY;
    const deltaTime = Date.now() - stateRef.current.startTime;
    const velocity = Math.sqrt(deltaX * deltaX + deltaY * deltaY) / deltaTime;

    stateRef.current.isSwiping = false;

    if (velocity < velocityThreshold && Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
      return;
    }

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX > absY && absX > threshold) {
      if (deltaX > 0) {
        onSwipeRight?.();
        triggerHaptic('light');
      } else {
        onSwipeLeft?.();
        triggerHaptic('light');
      }
    } else if (absY > absX && absY > threshold) {
      if (deltaY > 0) {
        onSwipeDown?.();
        triggerHaptic('light');
      } else {
        onSwipeUp?.();
        triggerHaptic('light');
      }
    }
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold, velocityThreshold]);

  const bind = useCallback(() => ({
    onTouchStart: (e: React.TouchEvent) => handleTouchStart(e.nativeEvent),
    onTouchEnd: (e: React.TouchEvent) => handleTouchEnd(e.nativeEvent)
  }), [handleTouchStart, handleTouchEnd]);

  return { bind };
}

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
}

export function usePullToRefresh(options: UsePullToRefreshOptions) {
  const { onRefresh, threshold = 80 } = options;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startYRef.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!startYRef.current || isRefreshing) return;
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;
    
    if (diff > 0 && containerRef.current?.scrollTop === 0) {
      e.preventDefault();
      setPullDistance(Math.min(diff * 0.5, threshold * 1.5));
    }
  }, [isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
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
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    containerRef,
    isRefreshing,
    pullDistance,
    pullProgress: Math.min(pullDistance / threshold, 1)
  };
}

interface UseLongPressOptions {
  onLongPress: () => void;
  onPress?: () => void;
  delay?: number;
}

export function useLongPress(options: UseLongPressOptions) {
  const { onLongPress, onPress, delay = 500 } = options;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const start = useCallback(() => {
    isLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      triggerHaptic('heavy');
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isLongPressRef.current && onPress) {
      onPress();
    }
  }, [onPress]);

  const bind = useCallback(() => ({
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchCancel: clear,
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear
  }), [start, clear]);

  return { bind };
}

interface UseDoubleTapOptions {
  onDoubleTap: () => void;
  onSingleTap?: () => void;
  delay?: number;
}

export function useDoubleTap(options: UseDoubleTapOptions) {
  const { onDoubleTap, onSingleTap, delay = 300 } = options;
  const lastTapRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTap = useCallback(() => {
    const now = Date.now();
    const timeDiff = now - lastTapRef.current;

    if (timeDiff < delay && timeDiff > 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      triggerHaptic('medium');
      onDoubleTap();
    } else {
      if (onSingleTap) {
        timerRef.current = setTimeout(() => {
          onSingleTap();
        }, delay);
      }
    }

    lastTapRef.current = now;
  }, [onDoubleTap, onSingleTap, delay]);

  const bind = useCallback(() => ({
    onClick: handleTap
  }), [handleTap]);

  return { bind };
}

type HapticIntensity = 'light' | 'medium' | 'heavy';

export function triggerHaptic(intensity: HapticIntensity = 'medium') {
  try {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      const durations: Record<HapticIntensity, number | number[]> = {
        light: 10,
        medium: 25,
        heavy: [50, 50, 50]
      };
      navigator.vibrate(durations[intensity]);
    }
  } catch (e) {
    // Vibration API not supported or failed - fail silently
  }
}

export function useHaptic() {
  return {
    light: () => triggerHaptic('light'),
    medium: () => triggerHaptic('medium'),
    heavy: () => triggerHaptic('heavy')
  };
}

interface SwipeableItemState {
  offset: number;
  isOpen: boolean;
}

interface UseSwipeableItemOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftThreshold?: number;
  rightThreshold?: number;
}

export function useSwipeableItem(options: UseSwipeableItemOptions = {}) {
  const {
    onSwipeLeft,
    onSwipeRight,
    leftThreshold = -80,
    rightThreshold = 80
  } = options;

  const [state, setState] = useState<SwipeableItemState>({ offset: 0, isOpen: false });
  const startXRef = useRef(0);
  const currentOffsetRef = useRef(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentOffsetRef.current = state.offset;
  }, [state.offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const diff = e.touches[0].clientX - startXRef.current;
    const newOffset = currentOffsetRef.current + diff;
    
    const clampedOffset = Math.max(leftThreshold, Math.min(rightThreshold, newOffset));
    setState(prev => ({ ...prev, offset: clampedOffset }));
  }, [leftThreshold, rightThreshold]);

  const handleTouchEnd = useCallback(() => {
    if (state.offset < leftThreshold / 2) {
      setState({ offset: leftThreshold, isOpen: true });
      triggerHaptic('light');
    } else if (state.offset > rightThreshold / 2) {
      setState({ offset: rightThreshold, isOpen: true });
      triggerHaptic('light');
    } else {
      setState({ offset: 0, isOpen: false });
    }
  }, [state.offset, leftThreshold, rightThreshold]);

  const triggerAction = useCallback((direction: 'left' | 'right') => {
    if (direction === 'left' && onSwipeLeft) {
      triggerHaptic('medium');
      onSwipeLeft();
    } else if (direction === 'right' && onSwipeRight) {
      triggerHaptic('medium');
      onSwipeRight();
    }
    setState({ offset: 0, isOpen: false });
  }, [onSwipeLeft, onSwipeRight]);

  const close = useCallback(() => {
    setState({ offset: 0, isOpen: false });
  }, []);

  return {
    offset: state.offset,
    isOpen: state.isOpen,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd
    },
    triggerAction,
    close
  };
}
