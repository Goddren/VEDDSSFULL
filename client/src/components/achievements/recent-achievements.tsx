import React from "react";
import { Achievement, UserAchievement } from "@shared/schema";
import { AchievementBadge } from "@/components/ui/achievement-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

interface RecentAchievementsProps {
  recentAchievements: (UserAchievement & { achievement: Achievement })[];
  className?: string;
  compact?: boolean;
}

export function RecentAchievements({
  recentAchievements,
  className,
  compact = false,
}: RecentAchievementsProps) {
  // Show a maximum of 5 most recent achievements
  const displayAchievements = recentAchievements
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, compact ? 3 : 5);

  if (displayAchievements.length === 0 && compact) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className={compact ? "p-4 pb-0" : undefined}>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              {compact ? "Recent Achievements" : "Your Achievements"}
            </CardTitle>
            {!compact && (
              <CardDescription>
                Your trading journey milestones
              </CardDescription>
            )}
          </div>
          {!compact && (
            <Link to="/achievements">
              <Button variant="outline" size="sm">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className={compact ? "p-4 pt-3" : undefined}>
        {displayAchievements.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {displayAchievements.map((userAchievement) => (
              <motion.div
                key={userAchievement.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-center"
              >
                <AchievementBadge
                  achievement={userAchievement.achievement}
                  userAchievement={userAchievement}
                  size="sm"
                  showTooltip={true}
                  className="mr-3 flex-shrink-0"
                />
                <div className="flex-grow min-w-0">
                  <h4 className="font-medium text-sm truncate">
                    {userAchievement.achievement.name}
                  </h4>
                  {!compact && (
                    <p className="text-xs text-muted-foreground truncate">
                      {userAchievement.achievement.description}
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 ml-2 text-xs text-muted-foreground">
                  {new Date(userAchievement.updatedAt).toLocaleDateString()}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center p-4">
            <p className="text-muted-foreground text-sm">
              No achievements yet. Start analyzing charts to earn badges!
            </p>
            <Link to="/analysis">
              <Button variant="outline" size="sm" className="mt-3">
                Analyze Charts
              </Button>
            </Link>
          </div>
        )}
        
        {compact && displayAchievements.length > 0 && (
          <div className="mt-3 text-center">
            <Link to="/achievements">
              <Button variant="link" size="sm" className="text-xs">
                View All Achievements
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}