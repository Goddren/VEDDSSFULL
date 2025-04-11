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
  "relative flex items-center justify-center rounded-full transition-all duration-200 overflow-hidden bg-gradient-to-b",
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
        analysis: "from-blue-400 to-blue-600 text-white shadow-md shadow-blue-600/30",
        consistency: "from-green-400 to-green-600 text-white shadow-md shadow-green-600/30",
        accuracy: "from-purple-400 to-purple-600 text-white shadow-md shadow-purple-600/30",
        exploration: "from-amber-400 to-amber-600 text-white shadow-md shadow-amber-600/30",
        special: "from-pink-400 via-rose-500 to-orange-400 text-white shadow-lg shadow-orange-600/40",
        default: "from-primary/80 to-primary text-primary-foreground shadow-md shadow-primary/20",
        locked: "from-gray-300 to-gray-400 text-gray-600 shadow-inner shadow-gray-500/50",
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
    opacity: 0.7,
  },
  unlocked: {
    filter: "grayscale(0%)",
    opacity: 1,
    transform: "scale(1)",
  },
  animate: {
    transition: "all 0.3s ease",
    transform: "scale(1.05)",
    boxShadow: "0 0 20px rgba(255, 215, 0, 0.7)",
  },
};

export interface AchievementBadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  achievement: Achievement;
  userAchievement?: UserAchievement | any;
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
        isCompleted && !isLocked && "ring-4 ring-yellow-300/70 ring-offset-2 ring-offset-background",
        animate && isCompleted && !isLocked && "animate-pulse",
        "transition-all transform hover:scale-105 relative",
        className
      )}
      style={{
        ...(animate && isCompleted && !isLocked
          ? {
              boxShadow: "0 0 20px rgba(255, 215, 0, 0.8)",
              transition: "all 0.3s ease-in-out",
            }
          : {}),
      }}
      {...props}
    >
      {/* Background pattern for badges */}
      <div className="absolute inset-0 rounded-full overflow-hidden opacity-30">
        <div className="w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent" />
      </div>

      {/* Shine effect */}
      <div className="absolute inset-0 rounded-full overflow-hidden">
        <div className="w-full h-full bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-20" />
      </div>
      
      {/* Rim/border effect for all badges */}
      <div className={cn(
        "absolute inset-0 rounded-full",
        isLocked ? "border border-white/10" : "border-2 border-white/30"
      )}></div>
      
      {/* Lock icon overlay for locked achievements */}
      {isLocked && (
        <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-[1px]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-1/2 h-1/2 text-white opacity-70 drop-shadow-md"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
      )}
      
      {/* Main icon */}
      <div className={cn(
        "text-current relative z-10 drop-shadow-md", 
        {
          "w-3 h-3": size === "xs",
          "w-5 h-5": size === "sm",
          "w-8 h-8": size === "md",
          "w-12 h-12": size === "lg",
          "w-16 h-16": size === "xl",
        },
        isCompleted && !isLocked && "text-shadow-sm text-white"
      )}>
        {getIcon()}
      </div>
      
      {/* Glow effect for completed achievements */}
      {isCompleted && !isLocked && (
        <>
          <div className="absolute inset-0 rounded-full bg-gradient-radial from-white/40 to-transparent animate-pulse-slow opacity-60" />
          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-300/20 via-amber-400/20 to-yellow-300/20 animate-shine-slow" />
        </>
      )}
      
      {/* Progress indicator for partially completed achievements */}
      {showProgress && !isLocked && !isCompleted && progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 px-1">
          <div className="h-1.5 bg-black/30 rounded-full overflow-hidden backdrop-blur-sm">
            <div 
              className="h-full bg-gradient-to-r from-white/70 to-white/90 rounded-full" 
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
          <TooltipContent className="p-0 overflow-hidden">
            <div className="relative">
              {/* Header with colored background based on category */}
              <div className={cn(
                "p-3 text-center relative overflow-hidden",
                isLocked ? "bg-gray-600 text-gray-100" : 
                  achievement.category === 'analysis' ? "bg-blue-600 text-white" : 
                  achievement.category === 'consistency' ? "bg-green-600 text-white" : 
                  achievement.category === 'accuracy' ? "bg-purple-600 text-white" : 
                  achievement.category === 'exploration' ? "bg-amber-600 text-white" : 
                  achievement.category === 'special' ? "bg-rose-600 text-white" : 
                  "bg-primary text-white"
              )}>
                {/* Shine overlay effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-70" />
                
                {/* Badge icon */}
                <div className="mx-auto mb-1">
                  <div className="inline-flex items-center justify-center bg-white/20 rounded-full p-1.5 mb-1">
                    <div className="text-white w-5 h-5">
                      {getIcon()}
                    </div>
                  </div>
                </div>
                
                <h4 className="font-bold text-sm">{achievement.name}</h4>
                
                {/* Point value chip */}
                <div className="absolute top-2 right-2 bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {achievement.points} pts
                </div>
              </div>
              
              {/* Content */}
              <div className="p-3">
                <p className="text-xs text-foreground">{achievement.description}</p>
                
                {/* Progress for in-progress achievements */}
                {!isLocked && !isCompleted && (
                  <div className="mt-2 bg-secondary/40 p-2 rounded-md">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">Progress</span>
                      <span>{progress}/{achievement.threshold}</span>
                    </div>
                    <Progress
                      value={progressPercent}
                      className="h-1.5"
                    />
                  </div>
                )}
                
                {/* Completion status */}
                {isCompleted && (
                  <div className="flex items-center mt-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs p-2 rounded-md">
                    <Award className="h-3.5 w-3.5 mr-1" />
                    <span>Completed on {userAchievement?.unlockedAt ? new Date(userAchievement.unlockedAt).toLocaleDateString() : 'unknown date'}</span>
                  </div>
                )}
                
                {/* Locked message */}
                {isLocked && (
                  <div className="flex items-center mt-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-xs italic p-2 rounded-md">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5 mr-1.5"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Keep trading to unlock this achievement</span>
                  </div>
                )}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return badge;
}