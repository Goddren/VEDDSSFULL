import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useLocation, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Flame, TrendingUp, Trophy, Target, Zap, Calendar, 
  BarChart3, Bot, ArrowRight, Star, Crown, Medal,
  Loader2, Rocket, Gift
} from 'lucide-react';
import { TIER_CONFIG, type UserStreak } from '@shared/schema';
import { motion } from 'framer-motion';

const tierIcons: Record<string, JSX.Element> = {
  YG: <Target className="w-8 h-8 text-green-500" />,
  Rising: <Star className="w-8 h-8 text-blue-500" />,
  Pro: <Medal className="w-8 h-8 text-purple-500" />,
  Elite: <Crown className="w-8 h-8 text-yellow-500" />,
  OG: <Trophy className="w-8 h-8 text-red-500" />,
};

const tierColors: Record<string, string> = {
  YG: 'from-green-500 to-emerald-600',
  Rising: 'from-blue-500 to-cyan-600',
  Pro: 'from-purple-500 to-violet-600',
  Elite: 'from-yellow-500 to-amber-600',
  OG: 'from-red-500 to-rose-600',
};

const tierBgColors: Record<string, string> = {
  YG: 'bg-green-500/10 border-green-500/30',
  Rising: 'bg-blue-500/10 border-blue-500/30',
  Pro: 'bg-purple-500/10 border-purple-500/30',
  Elite: 'bg-yellow-500/10 border-yellow-500/30',
  OG: 'bg-red-500/10 border-red-500/30',
};

export default function StreakTrackerPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: streakData, isLoading } = useQuery<UserStreak>({
    queryKey: ['/api/streak'],
    enabled: !!user,
  });

  const recordActivityMutation = useMutation({
    mutationFn: async (activityType: 'chart' | 'ea' | 'trade') => {
      const res = await apiRequest('POST', '/api/streak/activity', { activityType });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/streak'] });
      if (data.streakIncreased) {
        toast({
          title: 'Streak Extended!',
          description: `Your streak is now ${data.currentStreak} days! Keep it going!`,
        });
      }
      if (data.tierUp) {
        toast({
          title: 'Tier Up!',
          description: `Congratulations! You've reached ${data.newTier}!`,
        });
      }
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/20">
        <Card className="max-w-md mx-4">
          <CardHeader className="text-center">
            <Flame className="w-16 h-16 mx-auto text-orange-500 mb-4" />
            <CardTitle className="text-2xl">Start Your Trading Journey</CardTitle>
            <CardDescription>
              Log in to track your streak and climb the ranks from YG to OG!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/auth">
              <Button className="w-full" size="lg" data-testid="button-login-streak">
                Log In to Start
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  const streak = streakData || {
    currentStreak: 0,
    longestStreak: 0,
    totalChartsAnalyzed: 0,
    totalEAsCreated: 0,
    totalTrades: 0,
    tier: 'YG',
    tierProgress: 0,
    xpPoints: 0,
    weeklyChartsAnalyzed: 0,
    weeklyEAsCreated: 0,
  };

  const currentTierConfig = TIER_CONFIG[streak.tier as keyof typeof TIER_CONFIG];
  const nextTierConfig = currentTierConfig.nextTier 
    ? TIER_CONFIG[currentTierConfig.nextTier as keyof typeof TIER_CONFIG]
    : null;
  
  const xpToNextTier = nextTierConfig ? nextTierConfig.minXP - streak.xpPoints : 0;
  const progressToNext = nextTierConfig 
    ? Math.min(100, ((streak.xpPoints - currentTierConfig.minXP) / (nextTierConfig.minXP - currentTierConfig.minXP)) * 100)
    : 100;

  const tiers = ['YG', 'Rising', 'Pro', 'Elite', 'OG'];
  const currentTierIndex = tiers.indexOf(streak.tier);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 pb-20">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 bg-clip-text text-transparent">
              Your Trading Streak
            </span>
          </h1>
          <p className="text-muted-foreground text-lg">
            Keep the momentum going. Analyze charts, create EAs, and climb the ranks!
          </p>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="relative overflow-hidden border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-red-500/10">
              <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full -mr-16 -mt-16" />
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-orange-500">
                  <Flame className="w-6 h-6" />
                  Current Streak
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-6xl font-bold text-orange-500 mb-2">
                  {streak.currentStreak}
                </div>
                <p className="text-sm text-muted-foreground">
                  consecutive days
                </p>
                <div className="mt-4 pt-4 border-t border-orange-500/20">
                  <p className="text-xs text-muted-foreground">
                    Longest streak: <span className="font-bold text-foreground">{streak.longestStreak} days</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Card className={`relative overflow-hidden ${tierBgColors[streak.tier]}`}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-current opacity-5 rounded-full -mr-16 -mt-16" />
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  {tierIcons[streak.tier]}
                  <span>Current Tier</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-4xl">{currentTierConfig.icon}</span>
                  <div>
                    <div className="text-2xl font-bold">{currentTierConfig.name}</div>
                    <div className="text-sm text-muted-foreground">{streak.xpPoints.toLocaleString()} XP</div>
                  </div>
                </div>
                {nextTierConfig && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress to {nextTierConfig.name}</span>
                      <span className="font-medium">{xpToNextTier.toLocaleString()} XP to go</span>
                    </div>
                    <Progress value={progressToNext} className="h-3" />
                  </div>
                )}
                {!nextTierConfig && (
                  <Badge className="bg-gradient-to-r from-red-500 to-rose-600 text-white">
                    MAX TIER ACHIEVED
                  </Badge>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Zap className="w-6 h-6" />
                  This Week
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-3xl font-bold">{streak.weeklyChartsAnalyzed}</div>
                    <p className="text-sm text-muted-foreground">Charts</p>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">{streak.weeklyEAsCreated}</div>
                    <p className="text-sm text-muted-foreground">EAs Created</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-primary/20">
                  <p className="text-xs text-muted-foreground">
                    Weekly goal: 7 charts + 3 EAs = <span className="text-primary font-bold">+500 XP bonus</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          <Card className="border-2 border-dashed border-primary/50 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5">
            <CardContent className="py-8">
              <div className="text-center">
                <Rocket className="w-12 h-12 mx-auto mb-4 text-primary" />
                <h2 className="text-2xl font-bold mb-2">Keep Your Streak Alive!</h2>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Make a trade today to maintain your streak and earn XP toward your next tier.
                </p>
                <div className="flex flex-wrap gap-4 justify-center">
                  <Link href="/upload">
                    <Button size="lg" className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600" data-testid="button-analyze-chart-streak">
                      <BarChart3 className="w-5 h-5 mr-2" />
                      Analyze a Chart (+25 XP)
                    </Button>
                  </Link>
                  <Link href="/ea-generator">
                    <Button size="lg" variant="outline" className="border-primary" data-testid="button-create-ea-streak">
                      <Bot className="w-5 h-5 mr-2" />
                      Create an EA (+50 XP)
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-8"
        >
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Tier Progression
          </h2>
          <Card>
            <CardContent className="py-6">
              <div className="relative">
                <div className="absolute top-1/2 left-0 right-0 h-2 bg-muted rounded-full -translate-y-1/2" />
                <div 
                  className="absolute top-1/2 left-0 h-2 bg-gradient-to-r from-green-500 via-purple-500 to-red-500 rounded-full -translate-y-1/2 transition-all duration-500"
                  style={{ width: `${(currentTierIndex / (tiers.length - 1)) * 100}%` }}
                />
                
                <div className="relative flex justify-between">
                  {tiers.map((tier, index) => {
                    const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
                    const isActive = index <= currentTierIndex;
                    const isCurrent = tier === streak.tier;
                    
                    return (
                      <div 
                        key={tier} 
                        className={`flex flex-col items-center ${isCurrent ? 'scale-110' : ''} transition-transform`}
                      >
                        <div 
                          className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl border-4 transition-all ${
                            isActive 
                              ? `bg-gradient-to-br ${tierColors[tier]} border-white shadow-lg` 
                              : 'bg-muted border-muted-foreground/20'
                          }`}
                        >
                          {config.icon}
                        </div>
                        <div className="mt-2 text-center">
                          <div className={`text-sm font-bold ${isActive ? '' : 'text-muted-foreground'}`}>
                            {tier}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {config.minXP.toLocaleString()} XP
                          </div>
                        </div>
                        {isCurrent && (
                          <Badge className="mt-2 bg-primary text-xs">YOU</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Gift className="w-6 h-6 text-primary" />
            XP Earning Guide
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-500" />
                  Chart Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between">
                    <span>Analyze a chart</span>
                    <Badge variant="secondary">+25 XP</Badge>
                  </li>
                  <li className="flex justify-between">
                    <span>Multi-timeframe analysis</span>
                    <Badge variant="secondary">+50 XP</Badge>
                  </li>
                  <li className="flex justify-between">
                    <span>5 charts in one day</span>
                    <Badge variant="secondary">+100 XP bonus</Badge>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-500" />
                  EA Creation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between">
                    <span>Create an EA</span>
                    <Badge variant="secondary">+50 XP</Badge>
                  </li>
                  <li className="flex justify-between">
                    <span>Publish to marketplace</span>
                    <Badge variant="secondary">+100 XP</Badge>
                  </li>
                  <li className="flex justify-between">
                    <span>EA gets subscriber</span>
                    <Badge variant="secondary">+200 XP</Badge>
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  Streak Bonuses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between">
                    <span>7-day streak</span>
                    <Badge variant="secondary">+250 XP</Badge>
                  </li>
                  <li className="flex justify-between">
                    <span>30-day streak</span>
                    <Badge variant="secondary">+1000 XP</Badge>
                  </li>
                  <li className="flex justify-between">
                    <span>Daily login</span>
                    <Badge variant="secondary">+10 XP</Badge>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mt-8"
        >
          <Card className="bg-gradient-to-r from-muted/50 to-muted/30">
            <CardContent className="py-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                <div>
                  <div className="text-3xl font-bold">{streak.totalChartsAnalyzed}</div>
                  <div className="text-sm text-muted-foreground">Total Charts</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">{streak.totalEAsCreated}</div>
                  <div className="text-sm text-muted-foreground">Total EAs</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">{streak.totalTrades}</div>
                  <div className="text-sm text-muted-foreground">Total Trades</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">{streak.longestStreak}</div>
                  <div className="text-sm text-muted-foreground">Best Streak</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
