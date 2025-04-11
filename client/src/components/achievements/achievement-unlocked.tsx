import React from "react";
import { Achievement } from "@shared/schema";
import { motion } from "framer-motion";
import { Award, Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import confetti from "canvas-confetti";

export interface AchievementUnlockedProps {
  achievement: Achievement;
  onClose: () => void;
}

export function AchievementUnlocked({ 
  achievement, 
  onClose 
}: AchievementUnlockedProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  
  // Trigger confetti effect when component mounts
  React.useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      
      // Create a confetti burst
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { 
          x: x / window.innerWidth, 
          y: y / window.innerHeight 
        },
        colors: ['#FFD700', '#FFC107', '#FF9800', primary],
        zIndex: 9999,
      });
    }
    
    // Auto-close after 5 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [onClose]);
  
  // Get primary color from CSS custom property
  const primaryStyle = getComputedStyle(document.documentElement);
  const primary = primaryStyle.getPropertyValue('--primary').trim() || '#0ea5e9';
  
  return (
    <motion.div
      ref={containerRef}
      className="fixed inset-x-0 top-6 z-50 flex justify-center pointer-events-none"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="bg-background border rounded-lg shadow-lg p-4 pointer-events-auto max-w-md w-full mx-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                <Trophy className="h-7 w-7 text-primary-foreground" />
                
                {/* Animated pulse effect */}
                <motion.div 
                  className="absolute inset-0 rounded-full border-2 border-primary/40"
                  animate={{ 
                    scale: [1, 1.15, 1],
                    opacity: [1, 0.8, 1]
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity,
                    ease: "easeInOut" 
                  }}
                />
              </div>
              
              <motion.div 
                className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center border-2 border-background"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ 
                  type: "spring", 
                  stiffness: 500, 
                  damping: 30,
                  delay: 0.3 
                }}
              >
                <Award className="h-3 w-3" />
              </motion.div>
            </div>
          </div>
          
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <div>
                <motion.h3 
                  className="font-bold text-lg text-foreground"
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  Achievement Unlocked!
                </motion.h3>
                
                <motion.p 
                  className="font-medium text-primary"
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  {achievement.name}
                </motion.p>
                
                <motion.p 
                  className="text-sm text-muted-foreground mt-1"
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  {achievement.description}
                </motion.p>
                
                <motion.div 
                  className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  +{achievement.points} points
                </motion.div>
              </div>
              
              <button 
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground rounded-full p-1 transition-colors"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}