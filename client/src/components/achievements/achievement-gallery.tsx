import React, { useState } from "react";
import { Achievement, UserAchievement } from "@shared/schema";
import { AchievementBadge } from "@/components/ui/achievement-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Search, Award } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AchievementDetailModal } from "./achievement-detail-modal";

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
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {categories.map(category => {
              const categoryAchievements = achievements.filter(a => a.category === category);
              const categoryUserAchievements = userAchievements.filter(
                ua => ua.isCompleted && ua.achievement.category === category
              );
              const categoryCompletionPercentage = Math.round(
                (categoryUserAchievements.length / categoryAchievements.length) * 100
              );
              
              // Get background color class based on category
              const getBgColorClass = () => {
                switch(category) {
                  case 'analysis': return "from-blue-500/10 to-blue-600/5";
                  case 'consistency': return "from-green-500/10 to-green-600/5";
                  case 'accuracy': return "from-purple-500/10 to-purple-600/5";
                  case 'exploration': return "from-amber-500/10 to-amber-600/5";
                  case 'special': return "from-rose-500/10 to-rose-600/5";
                  default: return "from-primary/10 to-primary/5";
                }
              };
              
              // Get border color class based on category
              const getBorderColorClass = () => {
                switch(category) {
                  case 'analysis': return "border-blue-500/20";
                  case 'consistency': return "border-green-500/20";
                  case 'accuracy': return "border-purple-500/20";
                  case 'exploration': return "border-amber-500/20";
                  case 'special': return "border-rose-500/20";
                  default: return "border-primary/20";
                }
              };
              
              // Get text color for category name
              const getTextColorClass = () => {
                switch(category) {
                  case 'analysis': return "text-blue-600 dark:text-blue-400";
                  case 'consistency': return "text-green-600 dark:text-green-400";
                  case 'accuracy': return "text-purple-600 dark:text-purple-400";
                  case 'exploration': return "text-amber-600 dark:text-amber-400";
                  case 'special': return "text-rose-600 dark:text-rose-400";
                  default: return "text-primary";
                }
              };
              
              return (
                <div 
                  key={category} 
                  className={cn(
                    "text-center p-3 rounded-lg bg-gradient-to-b border transition-all duration-200",
                    "hover:shadow-md hover:scale-105",
                    getBgColorClass(),
                    getBorderColorClass()
                  )}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <div className="mb-1 flex items-center justify-center">
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
                    
                    <div className={cn("text-sm font-semibold capitalize", getTextColorClass())}>
                      {category}
                    </div>
                    
                    <div className="w-full mt-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{categoryUserAchievements.length}/{categoryAchievements.length}</span>
                      </div>
                      <Progress 
                        value={categoryCompletionPercentage} 
                        className={cn(
                          "h-1.5",
                          categoryCompletionPercentage === 100 ? "bg-green-100 dark:bg-green-900/30" : ""
                        )}
                      />
                    </div>
                  </div>
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
              <div 
                key={achievement.id} 
                className="flex flex-col items-center text-center group cursor-pointer"
                onClick={() => {
                  setSelectedAchievement(achievement);
                  setIsModalOpen(true);
                }}
              >
                <div className="relative flex items-center justify-center mb-4 transition-transform duration-300 transform group-hover:scale-110">
                  {/* Badge drop shadow */}
                  <div className={cn(
                    "absolute -inset-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl",
                    userAchievement?.isCompleted ? 
                      achievement.category === 'analysis' ? "bg-blue-400/30" : 
                      achievement.category === 'consistency' ? "bg-green-400/30" : 
                      achievement.category === 'accuracy' ? "bg-purple-400/30" : 
                      achievement.category === 'exploration' ? "bg-amber-400/30" : 
                      achievement.category === 'special' ? "bg-rose-400/30" : 
                      "bg-primary/20" : 
                    "bg-transparent"
                  )} />
                  
                  {/* Achievement badge */}
                  <AchievementBadge
                    achievement={achievement}
                    userAchievement={userAchievement as any}
                    size="lg"
                    showProgress={true}
                    showTooltip={true}
                    animate={userAchievement?.isCompleted}
                    className="z-10"
                  />
                </div>
                
                {/* Achievement name with completion indicator */}
                <div className="flex items-center justify-center gap-1">
                  <h3 className="font-medium text-sm transition-colors group-hover:text-primary">{achievement.name}</h3>
                  {userAchievement?.isCompleted && (
                    <div className="text-amber-500">
                      <Award className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
                
                {/* Short description with truncation */}
                <p className="text-xs text-muted-foreground mt-1 px-2 line-clamp-2 group-hover:text-foreground/70 transition-colors">
                  {achievement.description}
                </p>
                
                {/* Points indicator */}
                <div className="mt-2 text-xs font-medium bg-secondary/40 text-muted-foreground px-2 py-0.5 rounded-full">
                  {achievement.points} points
                </div>
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

      {/* Achievement Detail Modal */}
      {selectedAchievement && (
        <AchievementDetailModal
          achievement={selectedAchievement}
          userAchievement={findUserAchievement(selectedAchievement.id)}
          isOpen={isModalOpen}
          onOpenChange={setIsModalOpen}
        />
      )}
    </div>
  );
}