import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Flame, ArrowRight, Zap, Trophy } from 'lucide-react';
import { TIER_CONFIG, type UserStreak } from '@shared/schema';
import { motion, AnimatePresence } from 'framer-motion';

export default function StreakBanner() {
  const { user } = useAuth();

  const { data: streakData } = useQuery<UserStreak>({
    queryKey: ['/api/streak'],
    enabled: !!user,
  });

  if (!user) return null;

  const streak = streakData || {
    currentStreak: 0,
    tier: 'YG',
    xpPoints: 0,
  };

  const currentTierConfig = TIER_CONFIG[streak.tier as keyof typeof TIER_CONFIG];
  const hasStreak = streak.currentStreak > 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full bg-gradient-to-r from-orange-500/10 via-red-500/10 to-pink-500/10 border-b border-orange-500/20"
      >
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${
                  hasStreak 
                    ? 'bg-orange-500/20 text-orange-500' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <Flame className={`w-4 h-4 ${hasStreak ? 'animate-pulse' : ''}`} />
                  <span className="font-bold">{streak.currentStreak}</span>
                  <span className="text-xs">day streak</span>
                </div>
              </div>
              
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-lg">{currentTierConfig.icon}</span>
                <span className="text-sm font-medium">{currentTierConfig.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({streak.xpPoints?.toLocaleString() || 0} XP)
                </span>
              </div>
            </div>

            <Link href="/streak">
              <Button 
                size="sm" 
                className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white"
                data-testid="button-streak-banner"
              >
                <Zap className="w-4 h-4 mr-1" />
                {hasStreak ? 'Keep Streak Going' : 'Make a Trade to Kick Off Your Streak'}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
