import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Award, Calendar, ChartBar, CheckCircle, ChevronLeft, Clock, Compass, Crown, Lock, Target, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Achievement } from '@shared/schema';
import { AchievementGallery } from '@/components/achievements/achievement-gallery';
import { AchievementBadge } from '@/components/ui/achievement-badge';

// Map of icon names to Lucide React components
const iconMap: Record<string, React.ReactNode> = {
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
  'globe': <Compass className="h-6 w-6" />,
  'moon': <Clock className="h-6 w-6" />,
  'puzzle-piece': <Zap className="h-6 w-6" />,
};

interface UserAchievement {
  id: number;
  userId: number;
  achievementId: number;
  unlockedAt: string | null;
  progress: number;
  isCompleted: boolean;
  achievement: Achievement;
}

const CategoryTitles: Record<string, string> = {
  'analysis': 'Analysis Mastery',
  'consistency': 'Trading Consistency',
  'accuracy': 'Trading Accuracy',
  'exploration': 'Market Explorer',
  'special': 'Special Achievements'
};

const CategoryDescriptions: Record<string, string> = {
  'analysis': 'Complete chart analyses to improve your skills',
  'consistency': 'Maintain regular trading analysis habits',
  'accuracy': 'Focus on high-confidence trade setups',
  'exploration': 'Explore different market instruments',
  'special': 'Discover special hidden achievements'
};

export default function AchievementsPage() {
  const { user } = useAuth();
  
  // Define all state hooks at the top of the component
  const [activeTab, setActiveTab] = useState('all');
  
  // Define all query hooks next
  const { data: achievements, isLoading: achievementsLoading } = useQuery<Achievement[]>({
    queryKey: ['/api/achievements'],
  });
  
  const { data: userAchievements, isLoading: userAchievementsLoading } = useQuery<UserAchievement[]>({
    queryKey: ['/api/user-achievements'],
    enabled: !!user
  });
  
  // Define all memo hooks together
  // Group achievements by category
  const achievementsByCategory = React.useMemo(() => {
    if (!achievements) return {};
    
    return achievements.reduce((acc: Record<string, Achievement[]>, achievement) => {
      if (!acc[achievement.category]) {
        acc[achievement.category] = [];
      }
      acc[achievement.category].push(achievement);
      return acc;
    }, {});
  }, [achievements]);
  
  // Get all categories
  const categories = React.useMemo(() => {
    if (!achievements) return [];
    return Array.from(new Set(achievements.map(a => a.category)));
  }, [achievements]);
  
  // Calculate user's total points
  const totalPoints = React.useMemo(() => {
    if (!userAchievements) return 0;
    
    return userAchievements.reduce((total, ua) => {
      if (ua.isCompleted) {
        return total + (ua.achievement?.points || 0);
      }
      return total;
    }, 0);
  }, [userAchievements]);
  
  // Format user achievements into the expected format for the gallery
  const formattedUserAchievements = React.useMemo(() => {
    if (!userAchievements || !achievements) return [];
    
    return userAchievements.map(ua => {
      const achievement = achievements.find(a => a.id === ua.achievementId);
      if (!achievement) return null;
      
      // Convert string dates to Date objects if needed
      const processedUserAchievement = {
        ...ua,
        // Ensure proper type handling for unlockedAt
        unlockedAt: ua.unlockedAt ? new Date(ua.unlockedAt) : null,
        achievement
      };
      
      return processedUserAchievement;
    }).filter(Boolean) as (UserAchievement & { achievement: Achievement })[];
  }, [userAchievements, achievements]);
  
  // Define helper functions after all hooks
  // Get achievement progress info
  const getAchievementProgress = (achievementId: number) => {
    if (!userAchievements) return { progress: 0, isCompleted: false };
    
    const userAchievement = userAchievements.find(ua => ua.achievementId === achievementId);
    if (!userAchievement) return { progress: 0, isCompleted: false };
    
    return {
      progress: userAchievement.progress,
      isCompleted: userAchievement.isCompleted
    };
  };
  
  if (achievementsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* Back button */}
      <div className="mb-6">
        <Link href="/dashboard">
          <Badge 
            variant="outline" 
            className="cursor-pointer hover:bg-secondary flex items-center gap-1 pl-2 pr-3 py-1.5"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Back to Dashboard</span>
          </Badge>
        </Link>
      </div>
      
      <div className="flex flex-col space-y-4 md:flex-row md:justify-between md:space-y-0 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Achievements</h1>
          <p className="text-muted-foreground">Track your trading growth with achievements</p>
        </div>
        
        <div className="flex items-center bg-muted p-3 rounded-lg">
          <Award className="h-5 w-5 mr-2 text-yellow-500" />
          <div>
            <p className="text-sm font-medium">Your Points</p>
            <p className="text-2xl font-bold">{totalPoints}</p>
          </div>
        </div>
      </div>

      {/* Use the new AchievementGallery component */}
      <AchievementGallery 
        achievements={achievements || []}
        userAchievements={formattedUserAchievements as any}
      />
    </div>
  );
}

interface AchievementCardProps {
  achievement: Achievement;
  progress: number;
  progressPercent: number;
  isCompleted: boolean;
}

function AchievementCard({ achievement, progress, progressPercent, isCompleted }: AchievementCardProps) {
  return (
    <Card className={cn(
      "transition-all duration-300 overflow-hidden",
      isCompleted ? "border-2 border-yellow-500 shadow-md" : ""
    )}>
      <CardHeader className="relative pb-2">
        <div className="flex justify-between items-start">
          <div className={cn(
            "p-2 rounded-lg",
            isCompleted ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300" : "bg-muted"
          )}>
            {iconMap[achievement.icon] || <Award className="h-6 w-6" />}
          </div>
          <Badge variant={isCompleted ? "default" : "outline"} className="ml-auto">
            {achievement.points} pts
          </Badge>
        </div>
        <CardTitle className="mt-2 text-lg">
          {achievement.name}
          {isCompleted && (
            <CheckCircle className="inline-block ml-2 h-4 w-4 text-green-500" />
          )}
        </CardTitle>
        <CardDescription>{achievement.description}</CardDescription>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="flex justify-between text-sm mb-1">
          <span>Progress</span>
          <span className="font-medium">
            {progress} / {achievement.threshold}
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </CardContent>
      <CardFooter className="pt-2">
        {isCompleted ? (
          <p className="text-xs text-muted-foreground">Completed achievement</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {progressPercent}% complete
          </p>
        )}
      </CardFooter>
    </Card>
  );
}