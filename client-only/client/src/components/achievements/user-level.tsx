import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Trophy, Star, Award } from 'lucide-react';
import { getUserLevel } from '@/lib/achievement-system';
import { cn } from '@/lib/utils';

interface UserLevelProps {
  totalPoints: number;
  className?: string;
}

export function UserLevel({ totalPoints, className }: UserLevelProps) {
  const { level, title, nextLevelPoints, progress } = getUserLevel(totalPoints);
  
  return (
    <Card className={cn("bg-gray-900 border-gray-800 shadow-xl overflow-hidden", className)}>
      <div className="absolute top-0 right-0 h-20 w-20 -mt-8 -mr-8 bg-gradient-to-br from-amber-500/20 to-amber-600/0 rounded-full blur-xl"></div>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-xl text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Trader Level
          </CardTitle>
          <div className="flex items-center justify-center bg-amber-500/10 border border-amber-500/20 text-amber-500 h-8 w-8 rounded-full">
            {level}
          </div>
        </div>
        <CardDescription>Your trading journey progress</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {/* Level Title with a badge-like appearance */}
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-r from-amber-500 to-yellow-600 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center">
              <Star className="h-3.5 w-3.5 mr-1" />
              <span>{title}</span>
            </div>
          </div>
          
          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">Level Progress</span>
              <span className="text-gray-400 font-medium">{totalPoints} / {nextLevelPoints}</span>
            </div>
            <Progress 
              value={progress} 
              className="h-2 bg-gray-800" 
            />
            <div className="flex justify-between mt-2">
              <span className="text-xs text-gray-500">Current</span>
              <span className="text-xs text-gray-500">Next Level</span>
            </div>
          </div>
          
          {/* Points needed info */}
          <p className="text-sm text-gray-400 flex items-center">
            <Award className="h-4 w-4 text-amber-500 mr-1.5" />
            {nextLevelPoints - totalPoints} points needed for next level
          </p>
        </div>
      </CardContent>
    </Card>
  );
}