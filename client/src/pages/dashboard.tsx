import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { BiBook } from 'react-icons/bi';
import { 
  BarChart2, 
  TrendingUp, 
  TrendingDown, 
  PieChart, 
  Calendar, 
  Clock, 
  Activity,
  Plus,
  ChevronRight,
  Info,
  Sparkles,
  Trophy,
  AlertTriangle,
  Lightbulb,
  Gamepad as GamepadIcon,
  Smile,
  Sun,
  Moon
} from 'lucide-react';
import { MarketCalendar } from '@/components/market/market-calendar';
import { getUserLevel } from '@/lib/achievement-system';
import TradingCoach from '@/components/trading-coach/trading-coach';
import { DailyWisdom } from '@/components/scripture/daily-wisdom';
import { DayNightScene } from '@/components/ui/day-night-scene';
import { ThemeToggle } from '@/components/ui/theme-toggle';

interface Analysis {
  id: number;
  userId: number;
  imageUrl: string;
  symbol?: string;
  timeframe?: string;
  direction?: string;
  trend?: string;
  confidence?: string;
  createdAt: string;
  isPublic?: boolean;
  shareId?: string;
  notes?: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [showFaithContent, setShowFaithContent] = useState<boolean>(true);
  
  // Initialize faith content preference from localStorage
  useEffect(() => {
    const savedPreference = localStorage.getItem('faithBasedContent');
    if (savedPreference !== null) {
      setShowFaithContent(savedPreference === 'true');
    }
  }, []);
  
  // Save faith content preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('faithBasedContent', String(showFaithContent));
  }, [showFaithContent]);
  
  const { data: analyses = [], isLoading, isError } = useQuery<Analysis[]>({
    queryKey: ['/api/analyses'],
  });
  
  // Get user achievements
  const { data: userAchievements = [] } = useQuery({
    queryKey: ['/api/user-achievements'],
    enabled: !!user
  });
  
  // Get all achievements
  const { data: achievements = [] } = useQuery({
    queryKey: ['/api/achievements'],
    enabled: !!user
  });
  
  // Calculate total achievement points (for UserLevel component)
  const totalAchievementPoints = React.useMemo(() => {
    if (!userAchievements || !Array.isArray(userAchievements) || !achievements || !Array.isArray(achievements)) {
      return 0;
    }
    
    return userAchievements
      .filter((ua: any) => ua.isCompleted)
      .reduce((total: number, ua: any) => {
        const achievement = achievements.find((a: any) => a.id === ua.achievementId);
        if (achievement) {
          return total + achievement.points;
        }
        return total;
      }, 0);
  }, [userAchievements, achievements]);
  
  // Calculate stats
  const totalAnalyses = analyses.length;
  const buySignals = analyses.filter((a) => a.direction?.toLowerCase() === 'buy').length;
  const sellSignals = analyses.filter((a) => a.direction?.toLowerCase() === 'sell').length;
  
  // Get the most recent analyses
  const recentAnalyses = analyses.slice(0, 5);
  
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header with glassmorphism effect */}
      <div className="bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 md:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">Trader Dashboard</h1>
                <p className="text-gray-400 mt-1">Track your analyses, patterns, and trading signals</p>
              </div>
              
              {/* Add Trader Level Badge in the header */}
              {totalAchievementPoints > 0 && (
                <div className="flex items-center gap-2 bg-gradient-to-r from-amber-600/20 to-amber-600/10 border border-amber-500/20 p-2 rounded-lg">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-500">
                    <Trophy className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-amber-400 font-medium text-sm flex items-center">
                      Level {getUserLevel(totalAchievementPoints).level}
                      <span className="text-xs text-amber-500/60 ml-1">
                        • {getUserLevel(totalAchievementPoints).title}
                      </span>
                    </div>
                    <div className="w-32 h-1.5 bg-gray-800 rounded-full mt-1">
                      <div 
                        className="h-1.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-600" 
                        style={{ width: `${getUserLevel(totalAchievementPoints).progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <Link href="/analysis">
              <Button className="bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white shadow-lg shadow-rose-900/30 rounded-full px-6 border border-rose-500/20">
                <div className="mr-2 h-5 w-5 rounded-full bg-white/20 flex items-center justify-center">
                  <Plus className="h-3 w-3" />
                </div>
                New Analysis
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-8 py-8">      
        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5 mb-10">
          {/* Card 1 - Total Analyses */}
          <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-800 shadow-xl hover:shadow-2xl hover:shadow-rose-900/10 transition-all duration-300 overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-gray-400">Total Analyses</CardDescription>
                <div className="h-8 w-8 rounded-full bg-rose-600/20 flex items-center justify-center">
                  <BarChart2 className="h-4 w-4 text-rose-500" />
                </div>
              </div>
              <CardTitle className="text-3xl font-bold text-white">{isLoading ? '--' : totalAnalyses}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center text-sm text-gray-400">
                <div className="flex items-center text-emerald-500 mr-2">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  <span>+3</span>
                </div>
                from last week
              </div>
            </CardContent>
          </Card>
          
          {/* Card 2 - Buy Signals */}
          <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-800 shadow-xl hover:shadow-2xl hover:shadow-emerald-900/10 transition-all duration-300 overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-gray-400">Buy Signals</CardDescription>
                <div className="h-8 w-8 rounded-full bg-emerald-600/20 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </div>
              </div>
              <CardTitle className="text-3xl font-bold text-white">{isLoading ? '--' : buySignals}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center text-sm text-gray-400">
                <div className="flex items-center text-rose-500 mr-2">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  <span>-2</span>
                </div>
                from last week
              </div>
            </CardContent>
          </Card>
          
          {/* Card 3 - Sell Signals */}
          <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-800 shadow-xl hover:shadow-2xl hover:shadow-rose-900/10 transition-all duration-300 overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-gray-400">Sell Signals</CardDescription>
                <div className="h-8 w-8 rounded-full bg-rose-600/20 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                </div>
              </div>
              <CardTitle className="text-3xl font-bold text-white">{isLoading ? '--' : sellSignals}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center text-sm text-gray-400">
                <div className="flex items-center text-emerald-500 mr-2">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  <span>+5</span>
                </div>
                from last week
              </div>
            </CardContent>
          </Card>
          
          {/* Card 4 - Accuracy Rate */}
          <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-800 shadow-xl hover:shadow-2xl hover:shadow-amber-900/10 transition-all duration-300 overflow-hidden relative group">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-gray-400">Accuracy Rate</CardDescription>
                <div className="h-8 w-8 rounded-full bg-amber-600/20 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-amber-500" />
                </div>
              </div>
              <CardTitle className="text-3xl font-bold text-white">92%</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-gray-700/40 rounded-full h-1.5 mt-1">
                <div className="bg-gradient-to-r from-emerald-500 to-amber-500 h-1.5 rounded-full" style={{ width: '92%' }}></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Analyses - Spans 2 columns */}
          <div className="lg:col-span-2">
            <Card className="bg-gray-900 border-gray-800 shadow-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl text-white">Recent Analyses</CardTitle>
                    <CardDescription>Your most recent chart analyses</CardDescription>
                  </div>
                  <Link href="/historical">
                    <Button variant="ghost" className="text-gray-400 hover:text-white rounded-full px-4 border border-gray-800 hover:border-rose-500/30 hover:bg-rose-500/10">
                      <span>View All</span>
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-gray-700 border-t-rose-500 rounded-full animate-spin"></div>
                  </div>
                ) : isError ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="rounded-full bg-gray-800 w-16 h-16 mx-auto flex items-center justify-center mb-4">
                      <Activity className="h-8 w-8 text-rose-500/50" />
                    </div>
                    <p>Error loading analyses</p>
                  </div>
                ) : analyses?.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="rounded-full bg-gray-800 w-16 h-16 mx-auto flex items-center justify-center mb-4">
                      <BarChart2 className="h-8 w-8 text-rose-500/50" />
                    </div>
                    <p>No analyses yet. Upload your first chart to get started.</p>
                    <Link href="/analysis">
                      <Button className="mt-6 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white shadow-lg shadow-rose-900/30 rounded-full px-6 border border-rose-500/20">
                        <div className="mr-2 h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                          <Plus className="h-4 w-4" />
                        </div>
                        Analyze Chart
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentAnalyses && recentAnalyses.map((analysis) => (
                      <Link key={analysis.id} href={`/analysis/${analysis.id}`}>
                        <div className="bg-gray-950 border border-gray-800 p-4 rounded-xl flex items-center justify-between hover:bg-gray-900 hover:border-rose-500/30 transition-all duration-300 cursor-pointer group">
                          <div className="flex items-center">
                            <div className="h-16 w-16 md:h-20 md:w-20 rounded-lg bg-gray-900 mr-4 overflow-hidden border border-gray-800 shadow-md">
                              <img 
                                src={analysis.imageUrl} 
                                alt="Chart thumbnail" 
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div>
                              <h4 className="font-medium text-white flex items-center gap-1.5">
                                {analysis.symbol || 'Unknown Symbol'}
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  analysis.direction?.toLowerCase() === 'buy' 
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' 
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/20'
                                }`}>
                                  {analysis.direction}
                                </span>
                              </h4>
                              <div className="flex items-center mt-1">
                                <span className="text-xs text-gray-500 flex items-center mr-3">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {new Date(analysis.createdAt).toLocaleDateString()}
                                </span>
                                <span className="text-xs text-gray-500 flex items-center">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  {analysis.timeframe || 'Unknown Timeframe'}
                                </span>
                              </div>
                              <p className="text-gray-400 text-sm mt-1.5 line-clamp-1">
                                {analysis.trend ? 
                                  `Trend: ${analysis.trend} • Confidence: ${analysis.confidence}` : 
                                  'Analysis details not available'}
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-500 group-hover:text-rose-500 transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Pattern Distribution and Trading Tip Generator */}
          <div className="space-y-6">
            {/* Pattern Distribution */}
            <Card className="bg-gray-900 border-gray-800 shadow-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl text-white">Pattern Distribution</CardTitle>
                    <CardDescription>Most common patterns in your analyses</CardDescription>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-rose-600/20 flex items-center justify-center">
                    <PieChart className="h-4 w-4 text-rose-500" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {totalAnalyses > 0 ? (
                  <div className="space-y-4">
                    {[
                      { name: 'Double Top/Bottom', percentage: 28 },
                      { name: 'Head & Shoulders', percentage: 22 },
                      { name: 'Triangle Patterns', percentage: 18 },
                      { name: 'Flag & Pennant', percentage: 12 },
                    ].map((pattern, index) => (
                      <div key={index}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-gray-300">{pattern.name}</span>
                          <span className="text-sm text-gray-400">{pattern.percentage}%</span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full ${
                              index === 0 ? 'bg-rose-500' : 
                              index === 1 ? 'bg-amber-500' : 
                              index === 2 ? 'bg-emerald-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${pattern.percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <PieChart className="h-10 w-10 mx-auto mb-4 text-rose-500/40" />
                      <p>Analyze more charts to see pattern distribution</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Economic Calendar */}
            <MarketCalendar />
            
            {/* Scripture Wisdom */}
            {showFaithContent && (
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-medium text-gray-300">Daily Scripture Wisdom</h3>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowFaithContent(false)}
                    className="h-8 text-xs text-gray-400 rounded-full px-3 border border-gray-800 hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-white"
                  >
                    <span>Hide</span>
                  </Button>
                </div>
                <DailyWisdom />
              </div>
            )}
            
            {/* Trading Coach */}
            <Card className="bg-gray-900 border-gray-800 shadow-xl overflow-hidden mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl text-white flex items-center">
                      <Lightbulb className="h-5 w-5 mr-2 text-amber-500" />
                      Trading Coach
                    </CardTitle>
                    <CardDescription>Get personalized trading advice</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="h-[400px]">
                  <TradingCoach personality="friendly" />
                </div>
              </CardContent>
            </Card>

            {/* Day/Night Scene Card */}
            <Card className="bg-gray-900 border-gray-800 shadow-xl overflow-hidden mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl text-white flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Sun className="h-5 w-5 text-yellow-500" />
                        <span className="text-gray-500">/</span>
                        <Moon className="h-5 w-5 text-blue-400" />
                      </div>
                      Day & Night Theme
                    </CardTitle>
                    <CardDescription>Customize your trading environment</CardDescription>
                  </div>
                  <ThemeToggle />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center pb-6">
                <DayNightScene size="md" className="mb-4" />
                <p className="text-gray-400 text-sm text-center max-w-md">
                  Toggle between light and dark mode to suit your trading environment.
                  Reduce eye strain during night trading sessions with our dark theme.
                </p>
              </CardContent>
            </Card>

            
            {/* Show Scripture Wisdom button when hidden */}
            {!showFaithContent && (
              <Card className="bg-gray-900 border-gray-800 shadow-xl mb-6">
                <CardContent className="py-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowFaithContent(true)}
                    className="w-full flex items-center justify-center bg-gray-800 border-gray-700 text-white hover:bg-blue-600 hover:border-blue-600 transition-colors"
                  >
                    <BiBook className="h-4 w-4 mr-2" /> 
                    Show Scripture Wisdom
                  </Button>
                </CardContent>
              </Card>
            )}
            
            {/* Quick Links */}
            <Card className="bg-gray-900 border-gray-800 shadow-xl">
              <CardHeader>
                <CardTitle className="text-xl text-white">Quick Actions</CardTitle>
                <CardDescription>Common tasks for trading analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/historical">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-rose-600 hover:border-rose-600 transition-colors">
                      History
                    </Button>
                  </Link>
                  <Link href="/market-insights">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-indigo-600 hover:border-indigo-600 transition-colors">
                      <Sparkles className="h-4 w-4 mr-2 text-indigo-400" />
                      Market Insights
                    </Button>
                  </Link>
                  <Link href="/achievements">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-rose-600 hover:border-rose-600 transition-colors">
                      Achievements
                    </Button>
                  </Link>
                  <Link href="/profile">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-amber-600 hover:border-amber-600 transition-colors">
                      Profile
                    </Button>
                  </Link>
                  <Link href="/support">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-amber-600 hover:border-amber-600 transition-colors">
                      Support
                    </Button>
                  </Link>
                  <Link href="/volatility-meter">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-amber-600 hover:border-amber-600 transition-colors">
                      Volatility Meter
                    </Button>
                  </Link>
                  <Link href="/market-trend-game">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-purple-600 hover:border-purple-600 transition-colors">
                      <GamepadIcon className="h-4 w-4 mr-2 text-purple-400" />
                      Prediction Game
                    </Button>
                  </Link>
                  <Link href="/market-mood">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-green-600 hover:border-green-600 transition-colors">
                      <Smile className="h-4 w-4 mr-2 text-green-400" />
                      Market Mood
                    </Button>
                  </Link>
                  <Link href="/market-sentiment">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-purple-600 hover:border-purple-600 transition-colors">
                      <BarChart2 className="h-4 w-4 mr-2 text-purple-400" />
                      Sentiment Cloud
                    </Button>
                  </Link>
                  <Link href="/interactive-tooltips">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-blue-600 hover:border-blue-600 transition-colors">
                      <Lightbulb className="h-4 w-4 mr-2 text-blue-400" />
                      Market Insights
                    </Button>
                  </Link>
                  <Link href="/subscription" className="col-span-2">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-rose-600 hover:border-rose-600 transition-colors">
                      Upgrade Account
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;