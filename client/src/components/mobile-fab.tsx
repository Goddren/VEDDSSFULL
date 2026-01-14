import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Briefcase, Plus, X, TrendingUp, BarChart3, Bell, Settings } from "lucide-react";
import { useLocation } from "wouter";
import { isMobileDevice } from "@/lib/pwa";
import { triggerHaptic, useLongPress } from "@/hooks/use-gestures";

export function MobileFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fabRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();

  if (!isMobileDevice()) {
    return null;
  }

  const handleToggle = () => {
    if (!isDragging) {
      triggerHaptic('light');
      setIsOpen(!isOpen);
    }
  };

  const handleActionClick = (path: string) => {
    triggerHaptic('medium');
    setLocation(path);
    setIsOpen(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isOpen) return;
    const touch = e.touches[0];
    const newX = touch.clientX - dragStart.x;
    const newY = touch.clientY - dragStart.y;
    
    const clampedX = Math.max(-window.innerWidth + 80, Math.min(0, newX));
    const clampedY = Math.max(-window.innerHeight + 200, Math.min(0, newY));
    
    if (Math.abs(newX) > 10 || Math.abs(newY) > 10) {
      setIsDragging(true);
    }
    
    setPosition({ x: clampedX, y: clampedY });
  };

  const handleTouchEnd = () => {
    setTimeout(() => setIsDragging(false), 100);
    triggerHaptic('light');
  };

  const { bind: longPressBindSettings } = useLongPress({
    onLongPress: () => {
      triggerHaptic('heavy');
      setLocation('/notification-settings');
      setIsOpen(false);
    },
    onPress: () => handleActionClick('/mobile-alerts')
  });

  const actions = [
    {
      icon: <Camera className="w-6 h-6" />,
      label: "Chart Analysis",
      path: "/analysis",
      color: "bg-blue-500/20 hover:bg-blue-500/30",
      testId: "fab-camera"
    },
    {
      icon: <Briefcase className="w-6 h-6" />,
      label: "My EAs",
      path: "/my-eas",
      color: "bg-purple-500/20 hover:bg-purple-500/30",
      testId: "fab-my-eas"
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      label: "Multi-TF EA",
      path: "/multi-timeframe",
      color: "bg-green-500/20 hover:bg-green-500/30",
      testId: "fab-multi-timeframe"
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      label: "MT5 Chart Data",
      path: "/mt5-chart-data",
      color: "bg-yellow-500/20 hover:bg-yellow-500/30",
      testId: "fab-mt5-chart-data"
    },
    {
      icon: <Bell className="w-6 h-6" />,
      label: "Alerts (hold for settings)",
      path: "/mobile-alerts",
      color: "bg-red-500/20 hover:bg-red-500/30",
      testId: "fab-alerts",
      isSpecial: true
    },
  ];

  return (
    <div 
      ref={fabRef}
      className="fixed bottom-20 right-6 z-40 touch-none select-none"
      style={{ 
        transform: `translate(${position.x}px, ${position.y}px)`,
        transition: isDragging ? 'none' : 'transform 0.2s ease-out'
      }}
      data-testid="mobile-fab-container"
    >
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/30 backdrop-blur-sm -z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute bottom-16 right-0 flex flex-col gap-3 mb-2">
            {actions.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span className="bg-background/95 backdrop-blur border px-3 py-1.5 rounded-full text-sm font-medium shadow-lg whitespace-nowrap">
                  {item.label}
                </span>
                {item.isSpecial ? (
                  <Button
                    {...longPressBindSettings()}
                    size="icon"
                    className={`h-12 w-12 rounded-full shadow-lg ${item.color} border-0`}
                    data-testid={item.testId}
                  >
                    {item.icon}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleActionClick(item.path)}
                    size="icon"
                    className={`h-12 w-12 rounded-full shadow-lg ${item.color} border-0`}
                    data-testid={item.testId}
                  >
                    {item.icon}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Button
        onClick={handleToggle}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        size="icon"
        className={`h-14 w-14 rounded-full shadow-2xl transition-all duration-300 ${
          isOpen 
            ? 'rotate-45 bg-destructive hover:bg-destructive/90' 
            : 'bg-primary hover:bg-primary/90'
        }`}
        data-testid="fab-main-button"
      >
        {isOpen ? (
          <X className="w-7 h-7" />
        ) : (
          <Plus className="w-7 h-7" />
        )}
      </Button>
    </div>
  );
}
