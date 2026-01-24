import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Calendar, Lock, CheckCircle, Play, Star, Flame, Trophy, 
  BookOpen, Target, Brain, Zap, Award, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DailyLesson {
  dayNumber: number;
  title: string;
  tradingTopic: string;
  tradingLesson: string;
  scriptureReference: string;
  scriptureText: string;
  devotionalMessage: string;
  contentPrompt: string;
  suggestedHashtags: string[];
  mediaType: 'image' | 'video' | 'carousel';
  tokenReward: number;
  bonusTokens: number;
  weekNumber: number;
  category: 'foundation' | 'strategy' | 'mindset' | 'execution' | 'review';
}

interface ContentStats {
  id: number;
  userId: number;
  currentDay: number;
  completedDays: number;
  totalTokensEarned: number;
  currentStreak: number;
  longestStreak: number;
  lastCompletedAt: string | null;
  journeyStartedAt: string | null;
  journeyCompletedAt: string | null;
}

interface DayProgress {
  dayNumber: number;
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  tokensEarned: number;
  completedAt: string | null;
}

const categoryColors = {
  foundation: { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400', icon: BookOpen },
  strategy: { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400', icon: Target },
  mindset: { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400', icon: Brain },
  execution: { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400', icon: Zap },
  review: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-400', icon: Award }
};

const weekLabels = [
  "Foundation",
  "Strategy Development",
  "Trading Mindset",
  "Execution Excellence",
  "Advanced Techniques",
  "Community Building & Growth",
  "Integration & Graduation"
];

export default function ContentFlowCalendar() {
  const [, setLocation] = useLocation();
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  const { data: lessons = [] } = useQuery<DailyLesson[]>({
    queryKey: ['/api/ambassador/content-flow/lessons']
  });

  const { data: stats } = useQuery<ContentStats>({
    queryKey: ['/api/ambassador/content-flow/stats']
  });

  const { data: progressList = [] } = useQuery<DayProgress[]>({
    queryKey: ['/api/ambassador/content-flow/progress']
  });

  const progressMap = new Map(progressList.map(p => [p.dayNumber, p]));
  const currentDay = stats?.currentDay || 1;
  const completedDays = stats?.completedDays || 0;
  const totalTokens = stats?.totalTokensEarned || 0;
  const currentStreak = stats?.currentStreak || 0;

  const getDayStatus = (dayNumber: number): 'locked' | 'available' | 'in_progress' | 'completed' => {
    const progress = progressMap.get(dayNumber);
    if (progress?.status === 'completed') return 'completed';
    if (progress?.status === 'in_progress') return 'in_progress';
    if (dayNumber <= currentDay) return 'available';
    return 'locked';
  };

  const getWeekLessons = (weekNum: number) => {
    return lessons.filter(l => l.weekNumber === weekNum);
  };

  const handleDayClick = (dayNumber: number) => {
    const status = getDayStatus(dayNumber);
    if (status !== 'locked') {
      setLocation(`/ambassador/content-flow/day/${dayNumber}`);
    }
  };

  const progressPercent = (completedDays / 44) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2"
        >
          <div className="flex items-center justify-center gap-3">
            <Calendar className="w-8 h-8 text-green-400" />
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
              44-Day Content Journey
            </h1>
          </div>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Master trading wisdom through daily lessons combining chart analysis with biblical principles. 
            Complete each day to earn tokens and build your ambassador credentials.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Trophy className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{completedDays}</p>
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
                <p className="text-2xl font-bold text-white">{totalTokens}</p>
                <p className="text-sm text-gray-400">Tokens Earned</p>
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
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-400">Overall Progress</span>
                <span className="text-sm font-medium text-green-400">{progressPercent.toFixed(0)}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="1" className="w-full" onValueChange={(v) => setSelectedWeek(parseInt(v))}>
          <TabsList className="w-full bg-gray-800/50 border border-gray-700 p-1 grid grid-cols-7 gap-1">
            {[1, 2, 3, 4, 5, 6, 7].map(week => {
              const weekLessons = getWeekLessons(week);
              const weekCompleted = weekLessons.filter(l => getDayStatus(l.dayNumber) === 'completed').length;
              const isCurrentWeek = weekLessons.some(l => l.dayNumber === currentDay);
              
              return (
                <TabsTrigger 
                  key={week} 
                  value={week.toString()}
                  className="relative data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400"
                >
                  <span className="hidden md:inline">Week {week}</span>
                  <span className="md:hidden">W{week}</span>
                  {weekCompleted === weekLessons.length && weekLessons.length > 0 && (
                    <CheckCircle className="absolute -top-1 -right-1 w-4 h-4 text-green-400" />
                  )}
                  {isCurrentWeek && weekCompleted < weekLessons.length && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {[1, 2, 3, 4, 5, 6, 7].map(week => (
            <TabsContent key={week} value={week.toString()} className="mt-4">
              <Card className="bg-gray-800/30 border-gray-700">
                <CardHeader>
                  <CardTitle className="text-xl text-white flex items-center gap-2">
                    Week {week}: {weekLabels[week - 1]}
                  </CardTitle>
                  <CardDescription>
                    {getWeekLessons(week).filter(l => getDayStatus(l.dayNumber) === 'completed').length} of {getWeekLessons(week).length} days completed
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <AnimatePresence mode="popLayout">
                      {getWeekLessons(week).map((lesson, idx) => {
                        const status = getDayStatus(lesson.dayNumber);
                        const categoryStyle = categoryColors[lesson.category];
                        const CategoryIcon = categoryStyle.icon;
                        const progress = progressMap.get(lesson.dayNumber);

                        return (
                          <motion.div
                            key={lesson.dayNumber}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.05 }}
                          >
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Card 
                                    className={`cursor-pointer transition-all duration-300 ${
                                      status === 'locked' 
                                        ? 'bg-gray-800/30 border-gray-700/50 opacity-60' 
                                        : status === 'completed'
                                          ? 'bg-green-500/10 border-green-500/30 hover:border-green-400/50'
                                          : status === 'in_progress'
                                            ? 'bg-amber-500/10 border-amber-500/30 hover:border-amber-400/50'
                                            : 'bg-gray-800/50 border-gray-600 hover:border-green-500/50 hover:bg-gray-700/50'
                                    }`}
                                    onClick={() => handleDayClick(lesson.dayNumber)}
                                  >
                                    <CardContent className="p-4 space-y-3">
                                      <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
                                            status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                            status === 'in_progress' ? 'bg-amber-500/20 text-amber-400' :
                                            status === 'available' ? 'bg-gray-700 text-white' :
                                            'bg-gray-800 text-gray-500'
                                          }`}>
                                            {status === 'locked' ? <Lock className="w-5 h-5" /> :
                                             status === 'completed' ? <CheckCircle className="w-5 h-5" /> :
                                             status === 'in_progress' ? <Play className="w-5 h-5" /> :
                                             lesson.dayNumber}
                                          </div>
                                          <div>
                                            <p className="font-semibold text-white text-sm">Day {lesson.dayNumber}</p>
                                            <Badge 
                                              variant="outline" 
                                              className={`text-xs ${categoryStyle.bg} ${categoryStyle.border} ${categoryStyle.text}`}
                                            >
                                              <CategoryIcon className="w-3 h-3 mr-1" />
                                              {lesson.category}
                                            </Badge>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 text-amber-400">
                                          <Star className="w-4 h-4" />
                                          <span className="text-sm font-medium">
                                            {progress?.tokensEarned || lesson.tokenReward}
                                          </span>
                                        </div>
                                      </div>

                                      <div>
                                        <h3 className="font-medium text-white text-sm line-clamp-1">{lesson.title}</h3>
                                        <p className="text-xs text-gray-400 line-clamp-1">{lesson.tradingTopic}</p>
                                      </div>

                                      <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500">{lesson.scriptureReference}</span>
                                        {status !== 'locked' && (
                                          <ChevronRight className="w-4 h-4 text-gray-400" />
                                        )}
                                      </div>
                                    </CardContent>
                                  </Card>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs bg-gray-800 border-gray-700">
                                  <div className="space-y-2">
                                    <p className="font-medium">{lesson.title}</p>
                                    <p className="text-sm text-gray-300">{lesson.tradingTopic}</p>
                                    <p className="text-xs text-gray-400 italic">"{lesson.scriptureText.slice(0, 100)}..."</p>
                                    <div className="flex gap-2">
                                      <Badge variant="outline" className="text-xs">
                                        {lesson.tokenReward} tokens
                                      </Badge>
                                      {lesson.bonusTokens > 0 && (
                                        <Badge variant="outline" className="text-xs text-green-400">
                                          +{lesson.bonusTokens} bonus
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        {stats?.journeyCompletedAt && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center p-8 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-2xl border border-green-500/30"
          >
            <Trophy className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Journey Complete!</h2>
            <p className="text-gray-300 mb-4">
              Congratulations! You've completed the 44-day Ambassador Content Journey.
            </p>
            <Button 
              className="bg-green-500 hover:bg-green-600"
              onClick={() => setLocation('/ambassador-training')}
            >
              View Your Certification
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
