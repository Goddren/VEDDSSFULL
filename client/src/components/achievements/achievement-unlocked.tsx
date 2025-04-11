import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { 
  Trophy,
  ChartBar, 
  Calendar,
  Target,
  Crown,
  Compass,
  Clock,
  Zap,
  Award,
  Medal,
  Globe,
  TrendingUp,
  Lightbulb
} from 'lucide-react';
import { Achievement } from '@shared/schema';
import { cn } from '@/lib/utils';

// Map of icon names to Lucide React components
export const iconMap: Record<string, React.ReactNode> = {
  'chart-line': <ChartBar className="h-6 w-6" />,
  'chart-bar': <ChartBar className="h-6 w-6" />,
  'chart-pie': <ChartBar className="h-6 w-6" />,
  'analytics': <ChartBar className="h-6 w-6" />,
  'calendar-check': <Calendar className="h-6 w-6" />,
  'calendar-week': <Calendar className="h-6 w-6" />,
  'calendar-star': <Calendar className="h-6 w-6" />,
  'bullseye': <Target className="h-6 w-6" />,
  'crosshairs': <Target className="h-6 w-6" />,
  'gem': <Crown className="h-6 w-6" />,
  'compass': <Compass className="h-6 w-6" />,
  'globe': <Globe className="h-6 w-6" />,
  'moon': <Clock className="h-6 w-6" />,
  'puzzle-piece': <Zap className="h-6 w-6" />,
  'medal': <Medal className="h-6 w-6" />,
  'award': <Award className="h-6 w-6" />,
  'trophy': <Trophy className="h-6 w-6" />,
  'trending-up': <TrendingUp className="h-6 w-6" />,
  'lightbulb': <Lightbulb className="h-6 w-6" />,
};

export interface AchievementUnlockedProps {
  achievement: Achievement;
  onClose: () => void;
}

export function AchievementUnlocked({ 
  achievement,
  onClose
}: AchievementUnlockedProps) {
  const confettiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confettiRef.current) {
      const rect = confettiRef.current.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      
      // Create a canvas confetti instance
      const myConfetti = confetti.create();
      
      // Trigger confetti
      myConfetti({
        particleCount: 100,
        spread: 70,
        origin: { 
          x: x / window.innerWidth, 
          y: y / window.innerHeight 
        },
        colors: ['#FFC107', '#FF5722', '#E91E63', '#9C27B0'],
        disableForReducedMotion: true
      });
      
      // Clean up the confetti canvas after animation
      return () => {
        myConfetti.reset();
      };
    }
  }, []);

  return (
    <motion.div
      ref={confettiRef}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="bg-gray-950 border border-amber-500/30 shadow-lg rounded-lg p-4 max-w-md overflow-hidden"
    >
      <div className="flex gap-4 items-center">
        <div className={cn(
          "flex items-center justify-center h-12 w-12 rounded-full",
          "bg-amber-500/20 text-amber-500 shadow-inner shadow-amber-500/10"
        )}>
          {iconMap[achievement.icon] || <Trophy className="h-6 w-6" />}
        </div>
        
        <div className="flex-1">
          <h3 className="font-bold text-lg text-amber-500">Achievement Unlocked!</h3>
          <p className="text-white font-medium">{achievement.name}</p>
          <p className="text-gray-400 text-sm mt-1">{achievement.description}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full text-xs font-medium">
              +{achievement.points} points
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}