import React from 'react';
import { Progress } from '@/components/ui/progress';
import { ArrowUpFromLine, ChevronsUpDown, LineChart, BarChart3, TrendingUp, Loader2 } from 'lucide-react';

interface LoadingIndicatorProps {
  progress: number;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ progress }) => {
  // Animation for the cycle of icons
  const icons = [LineChart, BarChart3, TrendingUp, ChevronsUpDown];
  const iconIndex = Math.floor((progress / 100) * icons.length) % icons.length;
  const CurrentIcon = progress === 100 ? 
    ArrowUpFromLine : 
    (progress === 0 ? Loader2 : icons[iconIndex]);

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="flex flex-col items-center justify-center">
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <CurrentIcon className={`h-12 w-12 text-primary ${progress !== 100 && progress !== 0 ? 'animate-pulse' : ''} ${progress === 0 ? 'animate-spin' : ''}`} />
          </div>
          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-background px-3 py-1 rounded-full border border-primary/20">
            <span className="text-sm font-medium">{Math.round(progress)}%</span>
          </div>
        </div>
        
        <div className="w-full mt-4">
          <Progress value={progress} className="h-2" />
        </div>
      </div>
    </div>
  );
};

export default LoadingIndicator;