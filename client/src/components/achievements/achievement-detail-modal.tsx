import React from "react";
import { Achievement, UserAchievement } from "@shared/schema";
import { Progress } from "@/components/ui/progress";
import { Award, Clock, ArrowLeft, Trophy, Star, Target, Zap, Crown, Medal, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AchievementBadge } from "@/components/ui/achievement-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface AchievementDetailModalProps {
  achievement: Achievement;
  userAchievement?: UserAchievement | any;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AchievementDetailModal({
  achievement,
  userAchievement,
  isOpen,
  onOpenChange,
}: AchievementDetailModalProps) {
  const isLocked = !userAchievement || (!userAchievement.isCompleted && !userAchievement.progress);
  const isCompleted = userAchievement?.isCompleted || false;
  const progress = userAchievement?.progress || 0;
  const progressPercent = Math.min(100, Math.round((progress / achievement.threshold) * 100));

  // Get category-specific content
  const getCategoryInfo = () => {
    switch (achievement.category) {
      case "analysis":
        return {
          title: "Analysis Mastery",
          description: "Achievements focused on performing chart analyses and spotting patterns.",
          icon: <Target className="w-5 h-5" />,
          color: "bg-blue-600",
          textColor: "text-blue-600 dark:text-blue-400",
          tips: [
            "Practice identifying different patterns in trading charts",
            "Try analyzing multiple timeframes for the same chart",
            "Record your observations to improve your accuracy over time",
          ],
        };
      case "consistency":
        return {
          title: "Trading Consistency",
          description: "Achievements for maintaining regular trading habits and discipline.",
          icon: <Clock className="w-5 h-5" />,
          color: "bg-green-600",
          textColor: "text-green-600 dark:text-green-400",
          tips: [
            "Set a consistent schedule for your trading analysis",
            "Try to log in and analyze the markets regularly",
            "Track your progress and identify times when the market performs best",
          ],
        };
      case "accuracy":
        return {
          title: "Trading Accuracy",
          description: "Achievements earned by making precise predictions and setups.",
          icon: <Star className="w-5 h-5" />,
          color: "bg-purple-600",
          textColor: "text-purple-600 dark:text-purple-400",
          tips: [
            "Focus on quality over quantity with your trading setups",
            "Use multiple indicators to confirm your analysis",
            "Review past analyses to learn from your successes and mistakes",
          ],
        };
      case "exploration":
        return {
          title: "Market Explorer",
          description: "Achievements for exploring different markets and trading instruments.",
          icon: <Compass className="w-5 h-5" />,
          color: "bg-amber-600",
          textColor: "text-amber-600 dark:text-amber-400",
          tips: [
            "Try analyzing different currency pairs and markets",
            "Explore correlations between different markets",
            "Learn how global events affect different instruments differently",
          ],
        };
      case "special":
        return {
          title: "Special Achievements",
          description: "Rare and unique achievements that showcase exceptional trading skills.",
          icon: <Crown className="w-5 h-5" />,
          color: "bg-rose-600",
          textColor: "text-rose-600 dark:text-rose-400",
          tips: [
            "These are often hidden achievements - keep using the platform to discover them",
            "Try different features of the application",
            "Some special achievements have specific requirements that may not be obvious",
          ],
        };
      default:
        return {
          title: "Trading Achievement",
          description: "A milestone in your trading journey.",
          icon: <Trophy className="w-5 h-5" />,
          color: "bg-primary",
          textColor: "text-primary",
          tips: ["Keep trading and analyzing charts to unlock more achievements"],
        };
    }
  };

  const categoryInfo = getCategoryInfo();

  // Format unlock date
  const formatUnlockDate = () => {
    if (!userAchievement?.unlockedAt) return "Not yet unlocked";
    try {
      const date = new Date(userAchievement.unlockedAt);
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch (e) {
      return "Unknown date";
    }
  };

  // Get recommended achievements based on current achievement
  const getRecommendedSteps = () => {
    const baseSteps = [
      `Reach ${achievement.threshold} ${achievement.description.toLowerCase().includes("analys") ? "analyses" : "trades"}`,
      "Check your progress regularly in the achievements tab",
    ];

    if (achievement.category === "analysis") {
      return [
        ...baseSteps,
        "Try analyzing charts from different timeframes",
        "Look for specific patterns like double tops or head and shoulders",
      ];
    }

    if (achievement.category === "consistency") {
      return [
        ...baseSteps,
        "Set a daily reminder to analyze charts",
        "Try to maintain a streak of consecutive days",
      ];
    }

    if (achievement.category === "accuracy") {
      return [
        ...baseSteps,
        "Take your time with each analysis to ensure accuracy",
        "Review previous trades to improve your technique",
      ];
    }

    return baseSteps;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className={cn("p-6 text-white", categoryInfo.color)}>
          <div className="absolute top-3 right-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="rounded-full text-white/80 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Button>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div className="relative">
              <AchievementBadge
                achievement={achievement}
                userAchievement={userAchievement}
                size="xl"
                showProgress={true}
                animate={isCompleted}
                className="drop-shadow-md"
              />
            </div>

            <div className="text-center sm:text-left">
              <div className="mb-1 text-white/80 flex items-center justify-center sm:justify-start text-sm font-medium">
                {categoryInfo.icon}
                <span className="ml-2">{categoryInfo.title}</span>
              </div>
              <DialogTitle className="text-2xl sm:text-3xl font-bold mb-2">{achievement.name}</DialogTitle>
              <DialogDescription className="text-white/80">
                <p>{achievement.description}</p>
                {isCompleted ? (
                  <div className="flex items-center mt-2 text-white/90 text-sm">
                    <Award className="h-4 w-4 mr-1" />
                    Completed on {formatUnlockDate()}
                  </div>
                ) : isLocked ? (
                  <div className="flex items-center mt-2 text-white/70 text-sm">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 mr-1"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Keep trading to unlock this achievement</span>
                  </div>
                ) : (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1 text-white/90">
                      <span>Progress</span>
                      <span>{progress}/{achievement.threshold}</span>
                    </div>
                    <Progress 
                      value={progressPercent} 
                      className="h-2 bg-white/20" 
                    />
                  </div>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className={cn("text-lg font-semibold mb-2", categoryInfo.textColor)}>About this Achievement</h3>
              <p className="text-muted-foreground mb-4">
                {achievement.description} This achievement belongs to the {categoryInfo.title} category, which focuses on {categoryInfo.description.toLowerCase()}
              </p>

              <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-4">
                <div className="flex items-center">
                  <Trophy className="h-5 w-5 mr-2 text-amber-500" />
                  <span className="font-medium">Reward Points</span>
                </div>
                <span className="text-lg font-bold">{achievement.points}</span>
              </div>

              <h4 className="font-medium mb-2">Requirements</h4>
              <ul className="space-y-2 mb-4">
                {getRecommendedSteps().map((step, index) => (
                  <li key={index} className="flex items-start">
                    <div className={cn(
                      "mt-1 mr-2 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0",
                      isCompleted ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"
                    )}>
                      <span className="text-xs">{index + 1}</span>
                    </div>
                    <span className="text-sm">{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className={cn("text-lg font-semibold mb-2", categoryInfo.textColor)}>Tips & Strategy</h3>
              
              <div className="space-y-3 mb-4">
                {categoryInfo.tips.map((tip, index) => (
                  <div key={index} className="flex items-start">
                    <div className={cn(
                      "mt-0.5 mr-2 text-amber-500",
                    )}>
                      <Star className="h-4 w-4" />
                    </div>
                    <span className="text-sm text-muted-foreground">{tip}</span>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <h4 className="font-medium mb-2">Achievement Status</h4>
              <div className="p-3 rounded-lg border">
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <span className={cn(
                    "text-sm font-medium",
                    isCompleted ? "text-green-600 dark:text-green-400" : 
                    isLocked ? "text-muted-foreground" : 
                    "text-amber-600 dark:text-amber-400"
                  )}>
                    {isCompleted ? "Completed" : isLocked ? "Locked" : "In Progress"}
                  </span>
                </div>
                
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-muted-foreground">Completion</span>
                  <span className="text-sm font-medium">{progressPercent}%</span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Unlocked On</span>
                  <span className="text-sm font-medium">
                    {isCompleted ? formatUnlockDate() : "Not yet unlocked"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}