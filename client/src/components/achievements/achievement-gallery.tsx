import React, { useState } from "react";
import { Achievement, UserAchievement } from "@shared/schema";
import { AchievementBadge } from "@/components/ui/achievement-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface AchievementGalleryProps {
  achievements: Achievement[];
  userAchievements: {
    id: number;
    userId: number;
    achievementId: number;
    unlockedAt: Date | string | null;
    progress: number;
    isCompleted: boolean;
    achievement: Achievement;
  }[];
  className?: string;
}

export function AchievementGallery({
  achievements,
  userAchievements,
  className,
}: AchievementGalleryProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");

  // Get all unique categories
  const categories = Array.from(new Set(achievements.map(a => a.category)));

  // Calculate overall completion stats
  const totalAchievements = achievements.length;
  const completedAchievements = userAchievements.filter(ua => ua.isCompleted).length;
  const completionPercentage = Math.round((completedAchievements / totalAchievements) * 100);

  // Filter achievements by search query and category
  const filteredAchievements = achievements.filter(achievement => {
    const matchesSearch = 
      searchQuery === "" || 
      achievement.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      achievement.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = activeTab === "all" || achievement.category === activeTab;
    
    return matchesSearch && matchesCategory;
  });

  // Find user achievement for a given achievement
  const findUserAchievement = (achievementId: number) => {
    return userAchievements.find(ua => ua.achievementId === achievementId);
  };

  return (
    <div className={className}>
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle>Achievement Progress</CardTitle>
          <CardDescription>
            Track your trading journey milestones
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="flex justify-between mb-1 text-sm">
              <span>Overall Progress</span>
              <span className="font-medium">{completedAchievements}/{totalAchievements} Achievements</span>
            </div>
            <Progress value={completionPercentage} className="h-3" />
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {categories.map(category => {
              const categoryAchievements = achievements.filter(a => a.category === category);
              const categoryUserAchievements = userAchievements.filter(
                ua => ua.isCompleted && ua.achievement.category === category
              );
              const categoryCompletionPercentage = Math.round(
                (categoryUserAchievements.length / categoryAchievements.length) * 100
              );
              
              return (
                <div key={category} className="text-center">
                  <div className="mb-1 inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                    <AchievementBadge 
                      achievement={{
                        id: 0,
                        name: category,
                        description: "",
                        category,
                        icon: "trophy",
                        points: 0,
                        threshold: 0,
                        isSecret: false
                      }}
                      size="sm"
                      variant={category as any}
                    />
                  </div>
                  <div className="mt-1 text-xs font-medium">{category}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{categoryCompletionPercentage}%</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      
      <div className="mb-6 flex flex-col sm:flex-row items-start gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            type="search"
            placeholder="Search achievements..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <Tabs 
          defaultValue="all" 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="w-full overflow-auto flex flex-nowrap">
            <TabsTrigger value="all">All</TabsTrigger>
            {categories.map(category => (
              <TabsTrigger key={category} value={category}>
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      
      {filteredAchievements.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-8">
          {filteredAchievements.map(achievement => {
            const userAchievement = findUserAchievement(achievement.id);
            return (
              <div key={achievement.id} className="flex flex-col items-center text-center">
                <AchievementBadge
                  achievement={achievement}
                  userAchievement={userAchievement as any}
                  size="lg"
                  showProgress={true}
                  showTooltip={true}
                  animate={true}
                  className="mb-2"
                />
                <h3 className="font-medium text-sm mt-3">{achievement.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 px-2">
                  {achievement.description}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center p-8 bg-secondary/20 rounded-lg">
          <h3 className="text-lg font-medium">No achievements found</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Try changing your search query or category filter.
          </p>
        </div>
      )}
    </div>
  );
}