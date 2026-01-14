import { useState, useRef, useCallback, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Archive, CheckCircle } from 'lucide-react';
import { triggerHaptic } from '@/hooks/use-gestures';
import { cn } from '@/lib/utils';

interface SwipeAction {
  icon: ReactNode;
  label: string;
  color: string;
  onAction: () => void;
}

interface SwipeableCardProps {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  className?: string;
  threshold?: number;
  testId?: string;
}

export function SwipeableCard({
  children,
  leftAction,
  rightAction,
  className,
  threshold = 80,
  testId
}: SwipeableCardProps) {
  const [offset, setOffset] = useState(0);
  const [isRevealed, setIsRevealed] = useState<'left' | 'right' | null>(null);
  const startXRef = useRef(0);
  const currentOffsetRef = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    currentOffsetRef.current = offset;
  }, [offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const diff = e.touches[0].clientX - startXRef.current;
    let newOffset = currentOffsetRef.current + diff;

    const maxLeft = leftAction ? threshold * 1.2 : 0;
    const maxRight = rightAction ? -threshold * 1.2 : 0;

    newOffset = Math.max(maxRight, Math.min(maxLeft, newOffset));
    setOffset(newOffset);
  }, [leftAction, rightAction, threshold]);

  const handleTouchEnd = useCallback(() => {
    if (offset > threshold / 2 && leftAction) {
      setOffset(threshold);
      setIsRevealed('left');
      triggerHaptic('light');
    } else if (offset < -threshold / 2 && rightAction) {
      setOffset(-threshold);
      setIsRevealed('right');
      triggerHaptic('light');
    } else {
      setOffset(0);
      setIsRevealed(null);
    }
  }, [offset, threshold, leftAction, rightAction]);

  const handleActionClick = useCallback((action: SwipeAction) => {
    triggerHaptic('medium');
    action.onAction();
    setOffset(0);
    setIsRevealed(null);
  }, []);

  const resetPosition = useCallback(() => {
    setOffset(0);
    setIsRevealed(null);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-lg" data-testid={testId}>
      {leftAction && (
        <div 
          className={cn(
            "absolute inset-y-0 left-0 flex items-center justify-start pl-4",
            leftAction.color,
            "transition-opacity",
            offset > 0 ? "opacity-100" : "opacity-0"
          )}
          style={{ width: threshold }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleActionClick(leftAction)}
            className="h-10 w-10 text-white"
          >
            {leftAction.icon}
          </Button>
        </div>
      )}
      
      {rightAction && (
        <div 
          className={cn(
            "absolute inset-y-0 right-0 flex items-center justify-end pr-4",
            rightAction.color,
            "transition-opacity",
            offset < 0 ? "opacity-100" : "opacity-0"
          )}
          style={{ width: threshold }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleActionClick(rightAction)}
            className="h-10 w-10 text-white"
          >
            {rightAction.icon}
          </Button>
        </div>
      )}

      <Card
        ref={cardRef}
        className={cn("relative touch-pan-y", className)}
        style={{
          transform: `translateX(${offset}px)`,
          transition: offset === 0 || Math.abs(offset) === threshold ? 'transform 0.2s ease-out' : 'none'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={isRevealed ? resetPosition : undefined}
      >
        {children}
      </Card>
    </div>
  );
}

interface SwipeableAlertCardProps {
  children: ReactNode;
  onDelete: () => void;
  onArchive?: () => void;
  className?: string;
  testId?: string;
}

export function SwipeableAlertCard({
  children,
  onDelete,
  onArchive,
  className,
  testId
}: SwipeableAlertCardProps) {
  return (
    <SwipeableCard
      leftAction={onArchive ? {
        icon: <Archive className="w-5 h-5" />,
        label: "Archive",
        color: "bg-blue-600",
        onAction: onArchive
      } : undefined}
      rightAction={{
        icon: <Trash2 className="w-5 h-5" />,
        label: "Delete",
        color: "bg-red-600",
        onAction: onDelete
      }}
      className={className}
      testId={testId}
    >
      {children}
    </SwipeableCard>
  );
}

export function SwipeableNotificationCard({
  children,
  onDismiss,
  onMarkRead,
  className,
  testId
}: {
  children: ReactNode;
  onDismiss: () => void;
  onMarkRead?: () => void;
  className?: string;
  testId?: string;
}) {
  return (
    <SwipeableCard
      leftAction={onMarkRead ? {
        icon: <CheckCircle className="w-5 h-5" />,
        label: "Mark Read",
        color: "bg-green-600",
        onAction: onMarkRead
      } : undefined}
      rightAction={{
        icon: <Trash2 className="w-5 h-5" />,
        label: "Dismiss",
        color: "bg-gray-600",
        onAction: onDismiss
      }}
      className={className}
      testId={testId}
    >
      {children}
    </SwipeableCard>
  );
}
