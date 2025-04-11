import React from "react";
import { cn } from "@/lib/utils";
import { Trophy, Star, Target, Clock, Zap, Award, Crown, Medal, Compass } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { Achievement, UserAchievement } from "@shared/schema";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";

// Define size variants
const badgeVariants = cva(
  "relative flex items-center justify-center rounded-full transition-all duration-200",
  {
    variants: {
      size: {
        xs: "w-6 h-6",
        sm: "w-10 h-10",
        md: "w-16 h-16",
        lg: "w-24 h-24",
        xl: "w-32 h-32",
      },
      variant: {
        analysis: "bg-blue-500 text-white",
        consistency: "bg-green-500 text-white",
        accuracy: "bg-purple-500 text-white",
        exploration: "bg-amber-500 text-white",
        special: "bg-gradient-to-r from-pink-500 to-orange-500 text-white",
        default: "bg-primary text-primary-foreground",
        locked: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      size: "md",
      variant: "default",
    },
  }
);

// Define the animations for different states
const animations = {
  locked: {
    filter: "grayscale(100%)",
    opacity: 0.5,
  },
  unlocked: {
    filter: "grayscale(0%)",
    opacity: 1,
    transform: "scale(1)",
  },
  animate: {
    transition: "all 0.3s ease",
    transform: "scale(1.05)",
    boxShadow: "0 0 15px rgba(255, 200, 50, 0.6)",
  },
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
  achievement,
  userAchievement,
  showProgress = false,
  showTooltip = false,
  animate = false,
  size,
  variant,
  className,
  ...props
}: AchievementBadgeProps) {
  // Determine if the achievement is locked or completed
  const isLocked = !userAchievement || (!userAchievement.isCompleted && !userAchievement.progress);
  const isCompleted = userAchievement?.isCompleted || false;
  const progress = userAchievement?.progress || 0;
  const progressPercent = Math.min(100, Math.round((progress / achievement.threshold) * 100));
  
  // Map achievement category to variant if not explicitly provided
  const badgeVariant = variant || (isLocked ? "locked" : (achievement.category as any)) || "default";
  
  // Get the appropriate icon based on the achievement category or icon field
  const getIcon = () => {
    if (achievement.icon) {
      const iconMap: Record<string, React.ReactNode> = {
        'trophy': <Trophy />,
        'star': <Star />,
        'target': <Target />,
        'clock': <Clock />,
        'zap': <Zap />,
        'award': <Award />,
        'crown': <Crown />,
        'medal': <Medal />,
      };
      return iconMap[achievement.icon] || <Trophy />;
    }
    
    // Fallback to category
    const categoryIconMap: Record<string, React.ReactNode> = {
      'analysis': <Target />,
      'consistency': <Clock />,
      'accuracy': <Star />,
      'exploration': <Compass strokeWidth={1.5} />,
      'special': <Crown />,
    };
    
    return categoryIconMap[achievement.category] || <Trophy />;
  };
  
  // Construct the badge with appropriate styling
  const badge = (
    <div
      className={cn(
        badgeVariants({ size, variant: badgeVariant }),
        isLocked && "grayscale opacity-50",
        isCompleted && !isLocked && "ring-2 ring-yellow-400",
        animate && isCompleted && !isLocked && "animate-pulse",
        className
      )}
      style={{
        ...(animate && isCompleted && !isLocked
          ? {
              boxShadow: "0 0 10px rgba(255, 215, 0, 0.7)",
              transition: "all 0.3s ease",
            }
          : {}),
      }}
      {...props}
    >
      {/* Lock icon overlay for locked achievements */}
      {isLocked && (
        <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black bg-opacity-40">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-1/2 h-1/2 text-white opacity-70"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
      )}
      
      {/* Main icon */}
      <div className={cn("text-current", {
        "w-3 h-3": size === "xs",
        "w-5 h-5": size === "sm",
        "w-8 h-8": size === "md",
        "w-12 h-12": size === "lg",
        "w-16 h-16": size === "xl",
      })}>
        {getIcon()}
      </div>
      
      {/* Show glow effect for completed achievements */}
      {isCompleted && !isLocked && (
        <div className="absolute inset-0 rounded-full bg-white opacity-20 animate-pulse" />
      )}
      
      {/* Progress indicator for partially completed achievements */}
      {showProgress && !isLocked && !isCompleted && progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 px-1">
          <div className="h-1 bg-white/30 rounded-full overflow-hidden">
            <div 
              className="h-full bg-white rounded-full" 
              style={{ width: `${progressPercent}%` }} 
            />
          </div>
        </div>
      )}
    </div>
  );
  
  // Wrap in tooltip if requested
  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {badge}
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-center">
              <p className="font-bold">{achievement.name}</p>
              <p className="text-xs text-muted-foreground">{achievement.description}</p>
              {!isLocked && !isCompleted && (
                <div className="mt-1">
                  <div className="flex justify-between text-xs">
                    <span>Progress:</span>
                    <span>{progress}/{achievement.threshold}</span>
                  </div>
                  <Progress
                    value={progressPercent}
                    className="h-1 mt-1"
                  />
                </div>
              )}
              {isLocked && (
                <p className="text-xs italic mt-1">Keep trading to unlock this achievement</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return badge;
}