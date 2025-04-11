import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Achievement, UserAchievement } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Award, ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

type RecentAchievementsProps = {
  limit?: number;
  className?: string;
  showProgress?: boolean;
}

export function RecentAchievements({ 
  limit = 3, 
  className, 
  showProgress = true 
}: RecentAchievementsProps) {
  // Fetch user achievements
  const { data: userAchievements, isLoading } = useQuery({
    queryKey: ['/api/user-achievements'],
    staleTime: 60 * 1000, // 1 minute
  });
  
  // Get sorted achievements: completed first, then in-progress by highest progress percentage
  const sortedAchievements = React.useMemo(() => {
    if (!userAchievements || !Array.isArray(userAchievements)) return [];
    
    return [...userAchievements].sort((a, b) => {
      // First sort by completion status
      if (a.isCompleted && !b.isCompleted) return -1;
      if (!a.isCompleted && b.isCompleted) return 1;
      
      // Then by progress percentage (descending)
      const aProgress = a.progress / a.achievement.threshold;
      const bProgress = b.progress / b.achievement.threshold;
      return bProgress - aProgress;
    }).slice(0, limit);
  }, [userAchievements, limit]);
  
  return (
    <Card className={cn("border-gradient-to-r from-primary/40 to-primary/10", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-xl">Recent Achievements</CardTitle>
          <CardDescription>Your latest trading accomplishments</CardDescription>
        </div>
        <Link href="/achievements">
          <div className="flex items-center text-sm text-muted-foreground hover:text-foreground cursor-pointer">
            View All
            <ChevronRight className="ml-1 h-4 w-4" />
          </div>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <AchievementsSkeleton count={limit} />
        ) : sortedAchievements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Award className="h-12 w-12 mb-2 opacity-20" />
            <p>No achievements yet</p>
            <p className="text-sm">Complete analyses to earn achievements</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedAchievements.map((userAchievement) => (
              <AchievementItem 
                key={userAchievement.id} 
                userAchievement={userAchievement}
                showProgress={showProgress}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AchievementItem({ 
  userAchievement, 
  showProgress = true 
}: { 
  userAchievement: UserAchievement & { achievement: Achievement }, 
  showProgress?: boolean 
}) {
  const { achievement, progress, isCompleted } = userAchievement;
  const progressPercentage = Math.min(Math.round((progress / achievement.threshold) * 100), 100);
  
  return (
    <div className="flex items-start space-x-4">
      <div className="relative">
        <div className={cn(
          "w-12 h-12 rounded-lg flex items-center justify-center",
          isCompleted 
            ? "bg-gradient-to-br from-primary to-primary/70" 
            : "bg-muted"
        )}>
          {achievement.isSecret && !isCompleted ? (
            <Lock className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Award className={cn("h-6 w-6", isCompleted ? "text-primary-foreground" : "text-muted-foreground")} />
          )}
        </div>
        
        {isCompleted && (
          <motion.div 
            className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center border-2 border-background"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <span className="text-xs">✓</span>
          </motion.div>
        )}
      </div>
      
      <div className="flex-1 space-y-1">
        <div className="flex justify-between">
          <div>
            <h4 className="font-medium leading-none">
              {achievement.isSecret && !isCompleted ? "Secret Achievement" : achievement.name}
            </h4>
            <p className="text-sm text-muted-foreground">
              {achievement.isSecret && !isCompleted 
                ? "Complete a special action to unlock" 
                : achievement.description}
            </p>
          </div>
          
          <Badge variant={isCompleted ? "default" : "outline"} className="h-fit">
            {achievement.points} pts
          </Badge>
        </div>
        
        {showProgress && !isCompleted && (
          <div className="w-full bg-muted rounded-full h-1.5 mt-2">
            <div 
              className="bg-primary h-1.5 rounded-full" 
              style={{ width: `${progressPercentage}%` }}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {progress} / {achievement.threshold} {progressPercentage}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AchievementsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array(count).fill(0).map((_, i) => (
        <div key={i} className="flex items-start space-x-4">
          <Skeleton className="w-12 h-12 rounded-lg" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-1.5 w-full mt-1" />
          </div>
        </div>
      ))}
    </div>
  );
}