import React from 'react';
import { CheckIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Step {
  id: string;
  name: string;
  message: string;
  status: 'completed' | 'current' | 'upcoming';
}

interface ProgressStepsProps {
  steps: Step[];
}

const ProgressSteps: React.FC<ProgressStepsProps> = ({ steps }) => {
  return (
    <div className="space-y-6">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-start">
          <div className="flex flex-col items-center">
            <div 
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border-2",
                {
                  "border-primary bg-primary text-primary-foreground": step.status === 'completed',
                  "border-primary bg-background text-primary animate-pulse": step.status === 'current',
                  "border-muted-foreground/30 bg-background text-muted-foreground": step.status === 'upcoming',
                }
              )}
            >
              {step.status === 'completed' ? (
                <CheckIcon className="h-4 w-4" />
              ) : step.status === 'current' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="text-xs font-semibold">{index + 1}</span>
              )}
            </div>
            {index < steps.length - 1 && (
              <div 
                className={cn(
                  "h-12 w-px my-1",
                  {
                    "bg-primary": step.status === 'completed',
                    "bg-gradient-to-b from-primary to-muted-foreground/30": step.status === 'current',
                    "bg-muted-foreground/30": step.status === 'upcoming',
                  }
                )}
              />
            )}
          </div>
          
          <div className="ml-4 min-w-0 flex-1 pt-0.5">
            <p 
              className={cn(
                "font-medium",
                {
                  "text-foreground": step.status === 'completed' || step.status === 'current',
                  "text-muted-foreground": step.status === 'upcoming'
                }
              )}
            >
              {step.name}
            </p>
            <p 
              className={cn(
                "text-sm",
                {
                  "text-muted-foreground": step.status === 'completed',
                  "text-foreground": step.status === 'current',
                  "text-muted-foreground/60": step.status === 'upcoming'
                }
              )}
            >
              {step.message}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProgressSteps;