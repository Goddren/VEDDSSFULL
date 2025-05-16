import React from 'react';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface UsageBarProps {
  current: number;
  limit: number;
  type: 'analysis' | 'social';
  planName?: string;
  compact?: boolean;
  className?: string;
}

export function UsageBar({ 
  current, 
  limit, 
  type,
  planName,
  compact = false,
  className = '' 
}: UsageBarProps) {
  // Calculate percentage
  const percentage = Math.min(Math.round((current / (limit || 1)) * 100), 100);
  
  // Determine bar color based on usage percentage
  const getBarColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <div className={`${className} ${compact ? 'text-xs' : ''}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">
            {type === 'analysis' ? 'Analysis' : 'Social Shares'}
          </span>
          <span className="text-muted-foreground">
            ({current}/{limit === 999999 ? '∞' : limit})
          </span>
          {!compact && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" align="center" className="max-w-xs">
                  <div className="text-sm">
                    <p>
                      {type === 'analysis' 
                        ? `Your ${planName || ''} plan allows ${limit === 999999 ? 'unlimited' : limit} chart analyses per month.` 
                        : `Your ${planName || ''} plan allows ${limit === 999999 ? 'unlimited' : limit} social shares per month.`
                      }
                    </p>
                    {percentage >= 90 && (
                      <p className="mt-1 flex items-center gap-1 text-red-500">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>
                          {type === 'analysis' 
                            ? 'You are approaching your analysis limit.'
                            : 'You are approaching your social sharing limit.'
                          }
                        </span>
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <span 
          className={`
            ${percentage >= 90 ? 'text-red-500' : percentage >= 75 ? 'text-amber-500' : 'text-emerald-500'}
            font-medium
          `}
        >
          {percentage}%
        </span>
      </div>
      <Progress 
        value={percentage} 
        className={`h-2 ${compact ? 'h-1.5' : 'h-2'}`} 
        indicatorClassName={getBarColor()}
      />
    </div>
  );
}