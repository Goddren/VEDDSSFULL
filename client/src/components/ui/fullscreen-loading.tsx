import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LoadingIndicator from '@/components/ui/loading-indicator';
import { cn } from '@/lib/utils';
import { Brain, ArrowUp, Cpu, LineChart, BarChart3 } from 'lucide-react';
import { DailyWisdom } from '@/components/scripture/daily-wisdom';

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
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md"
        >
          {/* Background gradient pulses */}
          <div className="absolute inset-0 overflow-hidden">
            <motion.div 
              className="absolute -inset-[100px] bg-primary/5 rounded-full blur-3xl"
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.1, 0.3, 0.1],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              style={{ 
                top: '30%', 
                left: '40%' 
              }}
            />
            <motion.div 
              className="absolute -inset-[100px] bg-primary/5 rounded-full blur-3xl"
              animate={{
                scale: [1.1, 1, 1.1],
                opacity: [0.2, 0.1, 0.2],
              }}
              transition={{
                duration: 10,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              style={{ 
                top: '60%', 
                right: '30%' 
              }}
            />
          </div>
          <div className="max-w-md w-full mx-auto px-4 py-10 text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="mb-6"
            >
              <div className="mx-auto relative w-40 h-40">
                {/* Outer spinning ring */}
                <motion.div
                  animate={{ 
                    rotate: 360,
                    transition: { 
                      duration: 8, 
                      repeat: Infinity, 
                      ease: "linear" 
                    } 
                  }}
                  className="absolute inset-0 rounded-full border-t-4 border-r-4 border-primary opacity-30"
                ></motion.div>
                
                {/* Middle spinning ring */}
                <motion.div
                  animate={{ 
                    rotate: -360,
                    transition: { 
                      duration: 5, 
                      repeat: Infinity, 
                      ease: "linear" 
                    } 
                  }}
                  className="absolute inset-4 rounded-full border-t-4 border-l-4 border-primary opacity-50"
                ></motion.div>
                
                {/* Inner spinning ring */}
                <motion.div
                  animate={{ 
                    rotate: 360,
                    transition: { 
                      duration: 3, 
                      repeat: Infinity, 
                      ease: "linear" 
                    } 
                  }}
                  className="absolute inset-8 rounded-full border-b-4 border-r-4 border-primary opacity-70"
                ></motion.div>
                
                {/* Pulsing dots around the circle */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((degree, index) => (
                  <motion.div 
                    key={degree}
                    className="absolute w-3 h-3 rounded-full bg-primary"
                    style={{
                      top: `calc(50% + ${20 * Math.sin(degree * Math.PI / 180)}px)`,
                      left: `calc(50% + ${20 * Math.cos(degree * Math.PI / 180)}px)`,
                      marginLeft: -6,
                      marginTop: -6
                    }}
                    animate={{
                      opacity: [0.2, 1, 0.2],
                      scale: [0.8, 1.2, 0.8]
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: index * 0.2
                    }}
                  />
                ))}
                
                {/* Central icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-24 w-24 rounded-full bg-background shadow-lg border border-muted/20 flex items-center justify-center z-10">
                    {isUploading ? (
                      <motion.div
                        animate={{ 
                          y: [0, -6, 0],
                          transition: { 
                            duration: 1.5, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          } 
                        }}
                      >
                        <BarChart3 className="h-10 w-10 text-primary" />
                      </motion.div>
                    ) : (
                      <motion.div
                        animate={{ 
                          scale: [1, 1.2, 1],
                          filter: ["drop-shadow(0 0 0px rgba(var(--primary), 0.5))", "drop-shadow(0 0 10px rgba(var(--primary), 0.8))", "drop-shadow(0 0 0px rgba(var(--primary), 0.5))"],
                          transition: { 
                            duration: 3, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          } 
                        }}
                      >
                        <Brain className="h-12 w-12 text-primary" />
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
              <div className="relative">
                {/* Vertical connector line */}
                <div className="absolute left-4 top-4 w-0.5 h-[calc(100%-24px)] bg-gradient-to-b from-primary/10 via-primary/30 to-primary/10 rounded-full" />
                
                <ul className="space-y-6 relative">
                  {analysisPipeline.map((step, index) => (
                    <motion.li 
                      key={index}
                      initial={{ x: -10, opacity: 0 }}
                      animate={{ 
                        x: 0, 
                        opacity: index <= currentStep ? 1 : 0.5
                      }}
                      transition={{ 
                        delay: index * 0.1, 
                        duration: 0.3 
                      }}
                      className={cn(
                        "flex items-center gap-4 transition-all pl-2",
                        index === currentStep && "scale-105"
                      )}
                    >
                      {/* Step indicator */}
                      <div className="relative z-10">
                        {index < currentStep ? (
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20">
                            <motion.svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </motion.svg>
                          </div>
                        ) : index === currentStep ? (
                          <motion.div 
                            className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-lg"
                            animate={{
                              boxShadow: ['0 0 0 0 rgba(var(--primary), 0.3)', '0 0 0 8px rgba(var(--primary), 0)', '0 0 0 0 rgba(var(--primary), 0)'],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: "easeOut"
                            }}
                          >
                            {step.icon}
                          </motion.div>
                        ) : (
                          <div className="w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground/50">
                            {step.icon}
                          </div>
                        )}
                      </div>
                      
                      {/* Step content */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "font-medium",
                            index === currentStep ? "text-primary text-base" : 
                            index < currentStep ? "text-foreground text-sm" : "text-muted-foreground text-sm"
                          )}>
                            {step.name}
                          </span>
                          
                          {index === currentStep && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="flex items-center bg-primary/10 text-primary text-xs px-2 py-1 rounded-full"
                            >
                              <span>Processing</span>
                              <motion.span
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className="ml-1"
                              >
                                ...
                              </motion.span>
                            </motion.div>
                          )}
                          
                          {index < currentStep && (
                            <span className="text-xs bg-muted-foreground/10 text-muted-foreground px-2 py-0.5 rounded-full">
                              Completed
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.div>
            
            {/* Daily Scripture Wisdom - Show during analysis or longer processes */}
            {(isAnalyzing || progress > 40) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.5 }}
                className="mt-12 mb-4"
              >
                <DailyWisdom />
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}