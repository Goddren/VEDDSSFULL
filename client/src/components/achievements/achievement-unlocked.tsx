import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AchievementBadge } from "@/components/ui/achievement-badge";
import { Trophy, X } from "lucide-react";
import { Achievement } from "@shared/schema";

interface AchievementUnlockedProps {
  achievement: Achievement;
  onClose: () => void;
  autoCloseDelay?: number;
}

export function AchievementUnlocked({
  achievement,
  onClose,
  autoCloseDelay = 5000,
}: AchievementUnlockedProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, autoCloseDelay);
    
    return () => clearTimeout(timer);
  }, [onClose, autoCloseDelay]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.9 }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 20,
          duration: 0.5 
        }}
        className="fixed bottom-6 right-6 z-50 w-72 bg-background border-2 border-primary/30 rounded-lg shadow-lg overflow-hidden"
      >
        <div className="relative">
          {/* Animated confetti-like effects */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  opacity: 0, 
                  x: Math.random() * 100 - 50, 
                  y: Math.random() * 100 - 50,
                  scale: 0 
                }}
                animate={{ 
                  opacity: [0, 1, 0], 
                  x: Math.random() * 200 - 100,
                  y: Math.random() * 200 - 100, 
                  scale: [0, Math.random() * 0.8 + 0.2, 0],
                  rotate: Math.random() * 360
                }}
                transition={{ 
                  duration: Math.random() * 2 + 1,
                  delay: Math.random() * 0.5,
                  repeat: Math.floor(Math.random() * 2),
                  repeatType: "reverse"
                }}
                className={`absolute w-2 h-2 rounded-full bg-${
                  ["primary", "blue", "green", "yellow", "pink", "purple"][
                    Math.floor(Math.random() * 6)
                  ]
                }-500`}
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  backgroundColor: [
                    "#ff9800", "#03a9f4", "#4caf50", 
                    "#e91e63", "#9c27b0", "#ff5722"
                  ][Math.floor(Math.random() * 6)]
                }}
              />
            ))}
          </div>
          
          <button 
            onClick={onClose}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground z-10"
          >
            <X className="h-4 w-4" />
          </button>
          
          <div className="px-4 py-3 bg-primary/10">
            <div className="flex items-center">
              <Trophy className="h-5 w-5 text-primary mr-2" />
              <h4 className="font-bold text-sm">Achievement Unlocked!</h4>
            </div>
          </div>
          
          <div className="p-4 flex items-center">
            <AchievementBadge
              achievement={achievement}
              userAchievement={{
                id: 0,
                userId: 0,
                achievementId: achievement.id,
                progress: achievement.threshold,
                isCompleted: true,
                unlockedAt: new Date(),
              }}
              size="md"
              variant={achievement.category as any}
              className="mr-3"
            />
            <div>
              <h3 className="font-bold text-sm">{achievement.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{achievement.description}</p>
            </div>
          </div>
          
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: autoCloseDelay / 1000 }}
            className="h-1 bg-primary"
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}