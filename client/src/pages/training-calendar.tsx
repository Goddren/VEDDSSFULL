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

import dojiImg from '@assets/training_images/doji_patterns_explained.png';
import hammerImg from '@assets/training_images/hammer_patterns_explained.png';
import engulfingImg from '@assets/training_images/engulfing_patterns_explained.png';
import morningStarImg from '@assets/training_images/morning_evening_star_explained.png';
import headShouldersImg from '@assets/training_images/head_shoulders_explained.png';
import doubleTopImg from '@assets/training_images/double_top_bottom_explained.png';
import movingAvgImg from '@assets/training_images/moving_averages_explained.png';
import rsiImg from '@assets/training_images/rsi_indicator_explained.png';
import macdImg from '@assets/training_images/macd_indicator_explained.png';
import bollingerImg from '@assets/training_images/bollinger_bands_explained.png';
import volumeImg from '@assets/training_images/volume_analysis_explained.png';
import platformsImg from '@assets/training_images/trading_platforms_overview.png';
import chartAnalysisImg from '@assets/training_images/ai_trading_vault_workflow.png';
import socialMediaImg from '@assets/training_images/social_media_trading.png';
import videoCreationImg from '@assets/training_images/video_content_creation.png';
import complianceImg from '@assets/training_images/trading_compliance.png';
import triangleImg from '@assets/training_images/triangle_patterns_explained.png';

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
  { day: 1, module: "intro", title: "What is AI Trading Vault?", icon: BookOpen, category: "foundation", image: chartAnalysisImg },
  { day: 2, module: "intro", title: "Key Value Propositions", icon: Target, category: "foundation", image: chartAnalysisImg },
  { day: 3, module: "platforms-intro", title: "What are Trading Platforms?", icon: Monitor, category: "foundation", image: platformsImg },
  { day: 4, module: "platforms-intro", title: "MetaTrader 5 (MT5)", icon: Monitor, category: "foundation", image: platformsImg },
  { day: 5, module: "platforms-intro", title: "TradingView", icon: Monitor, category: "foundation", image: platformsImg },
  { day: 6, module: "platforms-intro", title: "TradeLocker", icon: Monitor, category: "foundation", image: platformsImg },
  { day: 7, module: "platforms-intro", title: "Platform Integration", icon: Zap, category: "foundation", image: platformsImg },
  { day: 8, module: "chart-patterns", title: "Candlestick Basics", icon: Target, category: "strategy", image: dojiImg },
  { day: 9, module: "chart-patterns", title: "Doji Patterns", icon: Target, category: "strategy", image: dojiImg },
  { day: 10, module: "chart-patterns", title: "Hammer & Hanging Man", icon: Target, category: "strategy", image: hammerImg },
  { day: 11, module: "chart-patterns", title: "Engulfing Patterns", icon: Target, category: "strategy", image: engulfingImg },
  { day: 12, module: "chart-patterns", title: "Morning/Evening Star", icon: Star, category: "strategy", image: morningStarImg },
  { day: 13, module: "chart-patterns", title: "Head & Shoulders", icon: Target, category: "strategy", image: headShouldersImg },
  { day: 14, module: "chart-patterns", title: "Double Top/Bottom", icon: Target, category: "strategy", image: doubleTopImg },
  { day: 15, module: "indicators", title: "Moving Averages", icon: Brain, category: "strategy", image: movingAvgImg },
  { day: 16, module: "indicators", title: "RSI Indicator", icon: Brain, category: "strategy", image: rsiImg },
  { day: 17, module: "indicators", title: "MACD Explained", icon: Brain, category: "strategy", image: macdImg },
  { day: 18, module: "indicators", title: "Bollinger Bands", icon: Brain, category: "strategy", image: bollingerImg },
  { day: 19, module: "indicators", title: "Volume Analysis", icon: Brain, category: "strategy", image: volumeImg },
  { day: 20, module: "indicators", title: "Combining Indicators", icon: Zap, category: "strategy", image: chartAnalysisImg },
  { day: 21, module: "indicators", title: "Week 3 Review", icon: Award, category: "review", image: chartAnalysisImg },
  { day: 22, module: "social", title: "Social Media Basics", icon: Share2, category: "execution", image: socialMediaImg },
  { day: 23, module: "social", title: "Creating Engaging Content", icon: Camera, category: "execution", image: socialMediaImg },
  { day: 24, module: "social", title: "Building Your Audience", icon: Users, category: "execution", image: socialMediaImg },
  { day: 25, module: "social", title: "Hashtag Strategy", icon: Target, category: "execution", image: socialMediaImg },
  { day: 26, module: "social", title: "Engagement Techniques", icon: Zap, category: "execution", image: socialMediaImg },
  { day: 27, module: "social", title: "Going Viral", icon: Flame, category: "execution", image: socialMediaImg },
  { day: 28, module: "social", title: "Week 4 Review", icon: Award, category: "review", image: socialMediaImg },
  { day: 29, module: "video", title: "Video Content Basics", icon: Video, category: "mindset", image: videoCreationImg },
  { day: 30, module: "video", title: "Screen Recording Tips", icon: Monitor, category: "mindset", image: videoCreationImg },
  { day: 31, module: "video", title: "Live Streaming Setup", icon: Video, category: "mindset", image: videoCreationImg },
  { day: 32, module: "video", title: "YouTube Optimization", icon: Video, category: "mindset", image: videoCreationImg },
  { day: 33, module: "video", title: "TikTok & Reels", icon: Video, category: "mindset", image: videoCreationImg },
  { day: 34, module: "video", title: "Video Editing Basics", icon: Video, category: "mindset", image: videoCreationImg },
  { day: 35, module: "video", title: "Week 5 Review", icon: Award, category: "review", image: videoCreationImg },
  { day: 36, module: "compliance", title: "Financial Disclaimers", icon: Shield, category: "foundation", image: complianceImg },
  { day: 37, module: "compliance", title: "FTC Guidelines", icon: Shield, category: "foundation", image: complianceImg },
  { day: 38, module: "compliance", title: "Social Media Policies", icon: Shield, category: "foundation", image: complianceImg },
  { day: 39, module: "advanced", title: "Advanced EA Strategies", icon: Zap, category: "strategy", image: chartAnalysisImg },
  { day: 40, module: "advanced", title: "Multi-Timeframe Analysis", icon: Brain, category: "strategy", image: chartAnalysisImg },
  { day: 41, module: "advanced", title: "Risk Management", icon: Shield, category: "strategy", image: doubleTopImg },
  { day: 42, module: "advanced", title: "Building Your Brand", icon: Star, category: "execution", image: socialMediaImg },
  { day: 43, module: "graduation", title: "Final Assessment", icon: Award, category: "review", image: chartAnalysisImg },
  { day: 44, module: "graduation", title: "Certification Day", icon: GraduationCap, category: "review", image: chartAnalysisImg }
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
      setLocation(`/training-calendar/day/${dayNumber}`);
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
                              relative rounded-xl border cursor-pointer transition-all overflow-hidden
                              ${status === 'locked' 
                                ? 'bg-gray-900/50 border-gray-700 opacity-60 cursor-not-allowed' 
                                : status === 'completed'
                                  ? 'bg-green-900/30 border-green-500/40 hover:border-green-400'
                                  : `${categoryStyle.bg} ${categoryStyle.border} hover:border-amber-400`
                              }
                            `}
                          >
                            {day.image && (
                              <div className="relative h-24 w-full">
                                <img 
                                  src={day.image} 
                                  alt={day.title}
                                  className={`w-full h-full object-cover ${status === 'locked' ? 'opacity-40 grayscale' : ''}`}
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent" />
                              </div>
                            )}
                            <div className="p-3">
                              <div className="flex items-start justify-between mb-2">
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
                            </div>
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
