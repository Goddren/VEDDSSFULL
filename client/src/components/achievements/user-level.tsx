import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getUserLevel } from "@/lib/achievement-system";
import { Trophy, Star, ChevronRight, Award, Zap } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface UserLevelProps {
  totalPoints: number;
  className?: string;
  compact?: boolean;
}

export function UserLevel({ totalPoints, className, compact = false }: UserLevelProps) {
  const levelInfo = getUserLevel(totalPoints);
  
  return (
    <Card className={cn("overflow-hidden border-gradient-to-r from-primary/40 to-primary/10", className)}>
      <CardHeader className={compact ? "p-4 pb-2" : undefined}>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              {compact ? "Your Level" : "Trading Level"}
            </CardTitle>
            {!compact && (
              <CardDescription>
                Level up by earning achievements
              </CardDescription>
            )}
          </div>
          {!compact && (
            <Link href="/achievements">
              <div className="flex items-center text-sm text-muted-foreground hover:text-foreground cursor-pointer">
                View All Achievements
                <ChevronRight className="ml-1 h-4 w-4" />
              </div>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className={compact ? "p-4 pt-0" : undefined}>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <div className={cn(
              "rounded-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/60",
              compact ? "w-12 h-12" : "w-16 h-16"
            )}>
              <Trophy className={cn("text-primary-foreground", compact ? "h-6 w-6" : "h-8 w-8")} />
              
              {/* Animated ring effect */}
              <motion.div 
                className="absolute inset-0 rounded-full border-2 border-primary/50"
                animate={{ scale: [1, 1.1, 1], opacity: [1, 0.7, 1] }}
                transition={{ 
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut" 
                }}
              />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-primary rounded-full flex items-center justify-center border-2 border-background z-10">
              <span className={cn("font-bold text-primary-foreground", compact ? "text-xs w-5 h-5" : "text-sm w-6 h-6")}>
                {levelInfo.level}
              </span>
            </div>
          </div>
          
          <div className="flex-grow">
            <div className="flex justify-between items-center">
              <div>
                <h3 className={cn("font-semibold", compact ? "text-sm" : "text-base")}>
                  {levelInfo.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {totalPoints} points
                </p>
              </div>
              {!compact && (
                <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-xs">
                  <Star className="h-3.5 w-3.5 text-yellow-400" />
                  <span>Rank: {getRankFromLevel(levelInfo.level)}</span>
                </div>
              )}
            </div>
            
            <div className="mt-2">
              <div className="flex justify-between text-xs mb-1">
                <span>Progress to Level {levelInfo.level + 1}</span>
                <span>{levelInfo.progress}%</span>
              </div>
              <Progress value={levelInfo.progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {totalPoints} / {levelInfo.nextLevelPoints} points
              </p>
            </div>
          </div>
        </div>
        
        {!compact && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="bg-muted p-3 rounded-md">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Trophy className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Achievements</p>
                  <p className="text-lg font-bold">{Math.floor(totalPoints / 10)}</p>
                </div>
              </div>
            </div>
            <div className="bg-muted p-3 rounded-md">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">Next Reward</p>
                  <p className="text-xs">{getNextReward(levelInfo.level)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {compact && (
          <Link href="/achievements">
            <div className="mt-2 text-center text-xs text-primary hover:underline cursor-pointer">
              View Your Achievements
            </div>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// Get rank title based on level
function getRankFromLevel(level: number): string {
  if (level < 3) return "Bronze";
  if (level < 5) return "Silver";
  if (level < 7) return "Gold";
  if (level < 9) return "Platinum";
  if (level < 11) return "Diamond";
  return "Master";
}

// Get next reward message based on level
function getNextReward(level: number): string {
  const rewards = [
    "Beginner's Guide",
    "Chart Pattern Pack",
    "Advanced Analysis Tools",
    "Market Indicator Pack",
    "Premium Indicator Access",
    "Direct Trading Signals",
    "Priority Support",
    "Pro Strategy Library",
    "Market Mentorship",
    "VIP Trading Room",
    "Lifetime Premium",
  ];
  
  return level <= rewards.length ? rewards[level - 1] : "Special Reward";
}