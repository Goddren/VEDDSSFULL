import React from "react";
import { cn } from "@/lib/utils";
import { Trophy, Star, Target, Clock, Zap, Award, Crown, Medal } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { Achievement, UserAchievement } from "@shared/schema";

// Define badge variants and styles
const badgeVariants = cva(
  "relative flex flex-col items-center justify-center rounded-full transition-all duration-300",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-br from-primary/80 to-primary/30 shadow-md border border-primary/40",
        analyst: "bg-gradient-to-br from-blue-600/80 to-blue-800/30 shadow-md border border-blue-500/40",
        explorer: "bg-gradient-to-br from-purple-600/80 to-purple-800/30 shadow-md border border-purple-500/40",
        accuracy: "bg-gradient-to-br from-green-600/80 to-green-800/30 shadow-md border border-green-500/40",
        consistency: "bg-gradient-to-br from-amber-600/80 to-amber-800/30 shadow-md border border-amber-500/40",
        locked: "bg-gradient-to-br from-gray-600/60 to-gray-800/20 shadow-md border border-gray-500/30",
      },
      size: {
        sm: "w-12 h-12 text-xs",
        md: "w-16 h-16 text-sm",
        lg: "w-24 h-24 text-base",
        xl: "w-32 h-32 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

// Map of badge icons by achievement category
const categoryIcons: Record<string, React.ReactNode> = {
  analysis: <Trophy className="h-2/5 w-2/5" />,
  explorer: <Star className="h-2/5 w-2/5" />,
  accuracy: <Target className="h-2/5 w-2/5" />,
  consistency: <Clock className="h-2/5 w-2/5" />,
  speed: <Zap className="h-2/5 w-2/5" />,
  social: <Award className="h-2/5 w-2/5" />,
  master: <Crown className="h-2/5 w-2/5" />,
  default: <Medal className="h-2/5 w-2/5" />,
};

export interface AchievementBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  achievement: Achievement;
  userAchievement?: UserAchievement;
  showProgress?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
}

export function AchievementBadge({
  className,
  variant,
  size,
  achievement,
  userAchievement,
  showProgress = false,
  showTooltip = false,
  animate = false,
  ...props
}: AchievementBadgeProps) {
  // Determine if the badge is locked (no user achievement or not completed)
  const isLocked = !userAchievement || !userAchievement.isCompleted;
  
  // Calculate progress percentage
  const progressPercentage = userAchievement 
    ? Math.min(100, Math.round((userAchievement.progress / achievement.threshold) * 100)) 
    : 0;
  
  // Get the appropriate category-based variant
  const badgeVariant = isLocked ? "locked" : (variant || achievement.category as any);
  
  // Get the appropriate icon based on category
  const badgeIcon = categoryIcons[achievement.category] || categoryIcons.default;

  return (
    <div className="relative group" {...props}>
      <div 
        className={cn(
          badgeVariants({ variant: badgeVariant, size, className }),
          animate && !isLocked && "hover:scale-110",
          "transition-all"
        )}
      >
        {/* Icon */}
        <div className={cn(
          "text-white", 
          isLocked ? "opacity-30" : "opacity-100"
        )}>
          {badgeIcon}
        </div>
        
        {/* Title (for larger badges) */}
        {(size === "lg" || size === "xl") && (
          <div className={cn(
            "mt-1 text-center font-semibold px-1 leading-tight text-white",
            isLocked ? "opacity-30" : "opacity-100"
          )}>
            {achievement.name.length > 15 
              ? `${achievement.name.substring(0, 13)}...` 
              : achievement.name}
          </div>
        )}
        
        {/* Progress indicator circle */}
        {showProgress && userAchievement && !isLocked && (
          <div className="absolute top-0 left-0 w-full h-full rounded-full">
            <svg viewBox="0 0 100 100" className="absolute top-0 left-0 w-full h-full rotate-[-90deg]">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="6"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="rgba(255,255,255,0.8)"
                strokeWidth="6"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - progressPercentage / 100)}`}
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
        
        {/* Progress text for in-progress achievements */}
        {showProgress && userAchievement && !isLocked && (
          <div className="absolute bottom-[-1.5rem] text-xs font-semibold text-white bg-primary/80 rounded-full px-2 py-0.5">
            {userAchievement.progress}/{achievement.threshold}
          </div>
        )}
        
        {/* Lock overlay for locked achievements */}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/30">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-1/3 w-1/3 text-white/70" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        )}
      </div>
      
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute left-1/2 transform -translate-x-1/2 -translate-y-0 top-full mt-2 z-10 w-48 p-2 bg-background rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300">
          <div className="text-center">
            <h4 className="font-bold">{achievement.name}</h4>
            <p className="text-xs text-muted-foreground mt-1">{achievement.description}</p>
            {userAchievement && !isLocked ? (
              <div className="mt-2 text-xs text-green-500 font-medium">Achieved!</div>
            ) : userAchievement ? (
              <div className="mt-2 text-xs">
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full" 
                    style={{ width: `${progressPercentage}%` }}
                  ></div>
                </div>
                <div className="mt-1 text-muted-foreground">
                  {userAchievement.progress}/{achievement.threshold} completed
                </div>
              </div>
            ) : (
              <div className="mt-2 text-xs text-muted-foreground">Not started yet</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}