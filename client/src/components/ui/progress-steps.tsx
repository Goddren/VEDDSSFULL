import React from 'react';
import { cn } from '@/lib/utils';

export interface Step {
  id: number;
  name: string;
  status: 'completed' | 'current' | 'upcoming';
}

interface ProgressStepsProps {
  steps: Step[];
  className?: string;
}

const ProgressSteps: React.FC<ProgressStepsProps> = ({ steps, className }) => {
  return (
    <div className={cn("w-full space-y-3", className)}>
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div className={cn(
            "w-5 h-5 rounded-full flex-shrink-0 mr-3 flex items-center justify-center",
            step.status === 'completed' ? "bg-[#4CAF50]" : 
            step.status === 'current' ? "bg-[#3498db] animate-pulse" : "bg-[#333333]"
          )}>
            {step.status === 'completed' ? (
              <i className="fas fa-check text-xs text-black"></i>
            ) : step.status === 'current' ? (
              <div className="w-2 h-2 bg-black rounded-full"></div>
            ) : null}
          </div>
          <div className="flex-grow">
            <p className={cn(
              "text-sm",
              step.status === 'upcoming' ? "text-gray-400" : "text-white"
            )}>
              {step.name}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProgressSteps;
