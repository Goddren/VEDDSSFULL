import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar, Lock, CheckCircle, Play, Star, Flame, Trophy, 
  BookOpen, Target, Brain, Zap, Award, ChevronRight, ChevronLeft,
  Video, Share2, Users, Monitor, Camera, Shield, GraduationCap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TrainingProgress {
  id: number;
  userId: number;
  completedModules: string[];
  completedLessons: string[];
  currentModule: string;
  currentLesson: string;
  quizScores: Record<string, number>;
  totalTimeSpent: number;
  lastAccessedAt: string | null;
  certificationEarned: boolean;
}

const trainingDays = [
  { day: 1, module: "intro", title: "What is AI Trading Vault?", icon: BookOpen, category: "foundation" },
  { day: 2, module: "intro", title: "Key Value Propositions", icon: Target, category: "foundation" },
  { day: 3, module: "platforms-intro", title: "What are Trading Platforms?", icon: Monitor, category: "foundation" },
  { day: 4, module: "platforms-intro", title: "MetaTrader 5 (MT5)", icon: Monitor, category: "foundation" },
  { day: 5, module: "platforms-intro", title: "TradingView", icon: Monitor, category: "foundation" },
  { day: 6, module: "platforms-intro", title: "TradeLocker", icon: Monitor, category: "foundation" },
  { day: 7, module: "platforms-intro", title: "Platform Integration", icon: Zap, category: "foundation" },
  { day: 8, module: "chart-patterns", title: "Candlestick Basics", icon: Target, category: "strategy" },
  { day: 9, module: "chart-patterns", title: "Doji Patterns", icon: Target, category: "strategy" },
  { day: 10, module: "chart-patterns", title: "Hammer & Hanging Man", icon: Target, category: "strategy" },
  { day: 11, module: "chart-patterns", title: "Engulfing Patterns", icon: Target, category: "strategy" },
  { day: 12, module: "chart-patterns", title: "Morning/Evening Star", icon: Star, category: "strategy" },
  { day: 13, module: "chart-patterns", title: "Head & Shoulders", icon: Target, category: "strategy" },
  { day: 14, module: "chart-patterns", title: "Double Top/Bottom", icon: Target, category: "strategy" },
  { day: 15, module: "indicators", title: "Moving Averages", icon: Brain, category: "strategy" },
  { day: 16, module: "indicators", title: "RSI Indicator", icon: Brain, category: "strategy" },
  { day: 17, module: "indicators", title: "MACD Explained", icon: Brain, category: "strategy" },
  { day: 18, module: "indicators", title: "Bollinger Bands", icon: Brain, category: "strategy" },
  { day: 19, module: "indicators", title: "Volume Analysis", icon: Brain, category: "strategy" },
  { day: 20, module: "indicators", title: "Combining Indicators", icon: Zap, category: "strategy" },
  { day: 21, module: "indicators", title: "Week 3 Review", icon: Award, category: "review" },
  { day: 22, module: "social", title: "Social Media Basics", icon: Share2, category: "execution" },
  { day: 23, module: "social", title: "Creating Engaging Content", icon: Camera, category: "execution" },
  { day: 24, module: "social", title: "Building Your Audience", icon: Users, category: "execution" },
  { day: 25, module: "social", title: "Hashtag Strategy", icon: Target, category: "execution" },
  { day: 26, module: "social", title: "Engagement Techniques", icon: Zap, category: "execution" },
  { day: 27, module: "social", title: "Going Viral", icon: Flame, category: "execution" },
  { day: 28, module: "social", title: "Week 4 Review", icon: Award, category: "review" },
  { day: 29, module: "video", title: "Video Content Basics", icon: Video, category: "mindset" },
  { day: 30, module: "video", title: "Screen Recording Tips", icon: Monitor, category: "mindset" },
  { day: 31, module: "video", title: "Live Streaming Setup", icon: Video, category: "mindset" },
  { day: 32, module: "video", title: "YouTube Optimization", icon: Video, category: "mindset" },
  { day: 33, module: "video", title: "TikTok & Reels", icon: Video, category: "mindset" },
  { day: 34, module: "video", title: "Video Editing Basics", icon: Video, category: "mindset" },
  { day: 35, module: "video", title: "Week 5 Review", icon: Award, category: "review" },
  { day: 36, module: "compliance", title: "Financial Disclaimers", icon: Shield, category: "foundation" },
  { day: 37, module: "compliance", title: "FTC Guidelines", icon: Shield, category: "foundation" },
  { day: 38, module: "compliance", title: "Social Media Policies", icon: Shield, category: "foundation" },
  { day: 39, module: "advanced", title: "Advanced EA Strategies", icon: Zap, category: "strategy" },
  { day: 40, module: "advanced", title: "Multi-Timeframe Analysis", icon: Brain, category: "strategy" },
  { day: 41, module: "advanced", title: "Risk Management", icon: Shield, category: "strategy" },
  { day: 42, module: "advanced", title: "Building Your Brand", icon: Star, category: "execution" },
  { day: 43, module: "graduation", title: "Final Assessment", icon: Award, category: "review" },
  { day: 44, module: "graduation", title: "Certification Day", icon: GraduationCap, category: "review" }
];

const categoryColors = {
  foundation: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400', icon: BookOpen },
  strategy: { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400', icon: Target },
  mindset: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400', icon: Brain },
  execution: { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400', icon: Zap },
  review: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-400', icon: Award }
};

const weekLabels = [
  "Foundation Week",
  "Pattern Mastery",
  "Indicator Deep Dive",
  "Social Media Strategy",
  "Video Content Creation",
  "Compliance & Advanced",
  "Graduation Week"
];

export default function TrainingCalendar() {
  const [, setLocation] = useLocation();
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  const { data: progress } = useQuery<TrainingProgress>({
    queryKey: ['/api/ambassador/training/progress']
  });

  const completedLessons = progress?.completedLessons || [];
  const completedCount = completedLessons.length;
  const progressPercent = (completedCount / 44) * 100;
  const currentStreak = Math.min(completedCount, 7);

  const getDayStatus = (dayNumber: number): 'locked' | 'available' | 'completed' => {
    const dayData = trainingDays.find(d => d.day === dayNumber);
    if (!dayData) return 'locked';
    
    const lessonId = `${dayData.module}-${dayNumber}`;
    if (completedLessons.includes(lessonId) || completedLessons.includes(dayData.module)) {
      return 'completed';
    }
    
    if (dayNumber === 1) return 'available';
    if (dayNumber <= completedCount + 1) return 'available';
    return 'locked';
  };

  const getWeekDays = (weekNum: number) => {
    const startDay = (weekNum - 1) * 7 + 1;
    const endDay = Math.min(weekNum * 7, 44);
    return trainingDays.filter(d => d.day >= startDay && d.day <= endDay);
  };

  const handleDayClick = (dayNumber: number) => {
    const status = getDayStatus(dayNumber);
    if (status !== 'locked') {
      setLocation(`/ambassador-training?day=${dayNumber}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2"
        >
          <div className="flex items-center justify-center gap-3">
            <GraduationCap className="w-8 h-8 text-amber-400" />
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              44-Day Ambassador Training
            </h1>
          </div>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Master trading knowledge, social media skills, and become a certified AI Trading Vault Ambassador. 
            Complete daily lessons to unlock your certification.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Trophy className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{completedCount}</p>
                <p className="text-sm text-gray-400">Days Complete</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Star className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{44 - completedCount}</p>
                <p className="text-sm text-gray-400">Days Remaining</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <Flame className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{currentStreak}</p>
                <p className="text-sm text-gray-400">Day Streak</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <Award className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{Math.round(progressPercent)}%</p>
                <p className="text-sm text-gray-400">Progress</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardContent className="p-4">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Overall Progress</span>
              <span>{completedCount}/44 days</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-2 flex-wrap">
          {[1, 2, 3, 4, 5, 6, 7].map((week) => (
            <Button
              key={week}
              variant={selectedWeek === week ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedWeek(week)}
              className={selectedWeek === week 
                ? "bg-amber-500 hover:bg-amber-600 text-black" 
                : "border-gray-600 hover:bg-gray-700"
              }
            >
              Week {week}
            </Button>
          ))}
        </div>

        <motion.div
          key={selectedWeek}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-400">
                <Calendar className="w-5 h-5" />
                {weekLabels[selectedWeek - 1]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <TooltipProvider>
                  {getWeekDays(selectedWeek).map((day) => {
                    const status = getDayStatus(day.day);
                    const categoryStyle = categoryColors[day.category as keyof typeof categoryColors];
                    const IconComponent = day.icon;

                    return (
                      <Tooltip key={day.day}>
                        <TooltipTrigger asChild>
                          <motion.div
                            whileHover={status !== 'locked' ? { scale: 1.02 } : {}}
                            whileTap={status !== 'locked' ? { scale: 0.98 } : {}}
                            onClick={() => handleDayClick(day.day)}
                            className={`
                              relative p-4 rounded-xl border cursor-pointer transition-all
                              ${status === 'locked' 
                                ? 'bg-gray-900/50 border-gray-700 opacity-60 cursor-not-allowed' 
                                : status === 'completed'
                                  ? 'bg-green-900/30 border-green-500/40 hover:border-green-400'
                                  : `${categoryStyle.bg} ${categoryStyle.border} hover:border-amber-400`
                              }
                            `}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  status === 'completed' 
                                    ? 'border-green-500/50 text-green-400' 
                                    : status === 'locked'
                                      ? 'border-gray-600 text-gray-500'
                                      : 'border-amber-500/50 text-amber-400'
                                }`}
                              >
                                Day {day.day}
                              </Badge>
                              {status === 'completed' ? (
                                <CheckCircle className="w-5 h-5 text-green-400" />
                              ) : status === 'locked' ? (
                                <Lock className="w-5 h-5 text-gray-600" />
                              ) : (
                                <Play className="w-5 h-5 text-amber-400" />
                              )}
                            </div>

                            <div className={`p-2 rounded-lg w-fit mb-2 ${
                              status === 'completed' 
                                ? 'bg-green-500/20' 
                                : status === 'locked'
                                  ? 'bg-gray-700/50'
                                  : categoryStyle.bg
                            }`}>
                              <IconComponent className={`w-5 h-5 ${
                                status === 'completed' 
                                  ? 'text-green-400' 
                                  : status === 'locked'
                                    ? 'text-gray-500'
                                    : categoryStyle.text
                              }`} />
                            </div>

                            <h3 className={`font-medium text-sm line-clamp-2 ${
                              status === 'locked' ? 'text-gray-500' : 'text-white'
                            }`}>
                              {day.title}
                            </h3>

                            {status !== 'locked' && (
                              <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
                                <ChevronRight className="w-3 h-3" />
                                <span>{status === 'completed' ? 'Review' : 'Start'}</span>
                              </div>
                            )}
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-gray-800 border-gray-700">
                          <p className="font-medium">{day.title}</p>
                          <p className="text-xs text-gray-400 capitalize">{day.category} • {day.module}</p>
                          {status === 'locked' && (
                            <p className="text-xs text-amber-400 mt-1">Complete Day {day.day - 1} to unlock</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-4 text-sm">
          {Object.entries(categoryColors).map(([key, value]) => {
            const Icon = value.icon;
            return (
              <div key={key} className="flex items-center gap-2">
                <div className={`p-1.5 rounded ${value.bg}`}>
                  <Icon className={`w-4 h-4 ${value.text}`} />
                </div>
                <span className="text-gray-400 capitalize">{key}</span>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center gap-4">
          <Link href="/ambassador-training">
            <Button variant="outline" className="border-gray-600 hover:bg-gray-700">
              <BookOpen className="w-4 h-4 mr-2" />
              Go to Training
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline" className="border-gray-600 hover:bg-gray-700">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
