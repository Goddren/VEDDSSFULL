import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LoadingIndicator from '@/components/ui/loading-indicator';
import { cn } from '@/lib/utils';
import { Brain, ArrowUp, Cpu, LineChart, BarChart3 } from 'lucide-react';

interface FullscreenLoadingProps {
  visible: boolean;
  isUploading?: boolean;
  isAnalyzing?: boolean;
  progress: number;
  message?: string;
}

const analysisPipeline = [
  { name: 'Preprocessing image', icon: <BarChart3 className="h-5 w-5" /> },
  { name: 'Identifying price patterns', icon: <LineChart className="h-5 w-5" /> },
  { name: 'Running AI analysis', icon: <Brain className="h-5 w-5" /> },
  { name: 'Generating signals', icon: <ArrowUp className="h-5 w-5" /> },
  { name: 'Preparing results', icon: <Cpu className="h-5 w-5" /> },
];

export function FullscreenLoading({
  visible,
  isUploading = false,
  isAnalyzing = false,
  progress,
  message
}: FullscreenLoadingProps) {
  const currentStep = Math.min(
    Math.floor((progress / 100) * analysisPipeline.length),
    analysisPipeline.length - 1
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm"
        >
          <div className="max-w-md w-full mx-auto px-4 py-10 text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="mb-6"
            >
              <div className="mx-auto relative w-32 h-32">
                <motion.div
                  animate={{ 
                    rotate: 360,
                    transition: { 
                      duration: 3, 
                      repeat: Infinity, 
                      ease: "linear" 
                    } 
                  }}
                  className="absolute inset-0 rounded-full border-t-2 border-r-2 border-primary opacity-40"
                ></motion.div>
                <motion.div
                  animate={{ 
                    rotate: -360,
                    transition: { 
                      duration: 5, 
                      repeat: Infinity, 
                      ease: "linear" 
                    } 
                  }}
                  className="absolute inset-2 rounded-full border-t-2 border-r-2 border-primary opacity-60"
                ></motion.div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-20 w-20 rounded-full bg-muted/60 flex items-center justify-center">
                    {isUploading ? (
                      <motion.div
                        animate={{ 
                          y: [0, -5, 0],
                          transition: { 
                            duration: 1.5, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          } 
                        }}
                      >
                        <BarChart3 className="h-8 w-8 text-primary" />
                      </motion.div>
                    ) : (
                      <motion.div
                        animate={{ 
                          scale: [1, 1.1, 1],
                          transition: { 
                            duration: 2, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          } 
                        }}
                      >
                        <Brain className="h-8 w-8 text-primary" />
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.h3
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.3 }}
              className="text-2xl font-bold mb-2"
            >
              {isUploading ? 'Uploading Chart' : 'Analyzing Chart'}
            </motion.h3>

            <motion.p
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className="text-muted-foreground mb-8"
            >
              {message || (isUploading 
                ? 'Please wait while we process your chart image' 
                : 'Our AI is analyzing your chart for patterns and signals'
              )}
            </motion.p>

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="mb-8"
            >
              <LoadingIndicator progress={progress} />
            </motion.div>

            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
              className="max-w-sm mx-auto"
            >
              <ul className="space-y-3">
                {analysisPipeline.map((step, index) => (
                  <li 
                    key={index} 
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 rounded-lg transition-colors",
                      index === currentStep && "bg-primary/10 border border-primary/20",
                      index < currentStep && "opacity-50"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      index === currentStep ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      {step.icon}
                    </div>
                    <span className={cn(
                      "text-sm",
                      index === currentStep && "font-medium text-primary"
                    )}>
                      {step.name}
                    </span>
                    {index === currentStep && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="ml-auto text-xs text-primary-foreground px-2 py-1 rounded-full bg-primary"
                      >
                        Active
                      </motion.span>
                    )}
                    {index < currentStep && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        Completed
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}