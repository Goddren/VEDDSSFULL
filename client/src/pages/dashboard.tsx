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
  Zap,
  CalendarCheck,
  Users,
  Coins,
  Video
} from 'lucide-react';
import { MarketCalendar } from '@/components/market/market-calendar';
import { getUserLevel } from '@/lib/achievement-system';
import TradingCoach from '@/components/trading-coach/trading-coach';
import { DailyWisdom } from '@/components/scripture/daily-wisdom';
import { NewsFeed } from '@/components/news/news-feed';
import { ConnectedPairs } from '@/components/mt5/connected-pairs';
import { VeddRewardsPanel } from '@/components/vedd-rewards/vedd-rewards-panel';

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
  
  // Get user profile for accuracy/winRate data
  const { data: userProfile } = useQuery<{ winRate?: number; tradeGrade?: number }>({
    queryKey: ['/api/profile', user?.id],
    enabled: !!user?.id
  });
  
  // Get user's registered events
  const { data: registeredEventsData } = useQuery<{ events: Array<{ event: { id: number; title: string; description: string; scheduledDate: string | null; status: string } }> }>({
    queryKey: ['/api/ambassador/community/my-events'],
    enabled: !!user
  });
  
  // Get host stats if user is a host
  const { data: hostStats } = useQuery<{ totalEventsHosted: number; upcomingEvents: number; hostTier: string; tokensEarned: number }>({
    queryKey: ['/api/ambassador/host/stats'],
    enabled: !!user
  });
  
  // Get events user is hosting
  const { data: hostedEventsData } = useQuery<Array<{ id: number; title: string; description: string; scheduledDate: string | null; status: string; attendeeCount?: number }>>({
    queryKey: ['/api/ambassador/host/my-events'],
    enabled: !!user
  });
  
  // Filter to only upcoming and live registered events
  const upcomingEvents = React.useMemo(() => {
    if (!registeredEventsData?.events) return [];
    const now = new Date();
    return registeredEventsData.events
      .filter(reg => {
        // Always show live events
        if (reg.event.status === 'live') return true;
        if (!reg.event.scheduledDate) return false;
        const eventDate = new Date(reg.event.scheduledDate);
        return eventDate >= now && reg.event.status === 'scheduled';
      })
      .sort((a, b) => {
        // Live events first
        if (a.event.status === 'live' && b.event.status !== 'live') return -1;
        if (b.event.status === 'live' && a.event.status !== 'live') return 1;
        return 0;
      })
      .slice(0, 5);
  }, [registeredEventsData]);
  
  // Filter to only upcoming hosted events
  const upcomingHostedEvents = React.useMemo(() => {
    if (!hostedEventsData) return [];
    const now = new Date();
    return hostedEventsData
      .filter(event => {
        if (!event.scheduledDate) return false;
        const eventDate = new Date(event.scheduledDate);
        return eventDate >= now && event.status === 'scheduled';
      })
      .slice(0, 3);
  }, [hostedEventsData]);
  
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
  
  // Calculate accuracy rate from user profile or analyses
  const accuracyRate = React.useMemo(() => {
    // First try to use winRate from user profile
    if (userProfile?.winRate && userProfile.winRate > 0) {
      return Math.round(userProfile.winRate);
    }
    // If no profile data, calculate from analyses with high confidence
    if (analyses.length === 0) return 0;
    const highConfidenceAnalyses = analyses.filter((a) => {
      const conf = a.confidence?.toLowerCase();
      return conf === 'high' || conf === 'very high' || conf === 'strong';
    });
    if (analyses.length > 0) {
      return Math.round((highConfidenceAnalyses.length / analyses.length) * 100);
    }
    return 0;
  }, [analyses, userProfile]);
  
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
            <div className="flex gap-3">
              <Link href="/webhooks">
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shadow-blue-900/30 rounded-full px-6 border border-blue-500/20" data-testid="button-mt5-copier">
                  <Zap className="h-4 w-4 mr-2" />
                  MT5 Trade Copier
                </Button>
              </Link>
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
              <CardTitle className="text-3xl font-bold text-white" data-testid="text-accuracy-rate">
                {isLoading ? '--' : `${accuracyRate}%`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-gray-700/40 rounded-full h-1.5 mt-1">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-amber-500 h-1.5 rounded-full transition-all duration-500" 
                  style={{ width: `${accuracyRate}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {totalAnalyses > 0 ? 'Based on your analysis confidence' : 'Start analyzing to track accuracy'}
              </p>
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

          {/* Dashboard Right Column */}
          <div className="space-y-6">
            {/* Host Status Card - shows if user has hosted events */}
            {hostStats && (hostStats.totalEventsHosted > 0 || hostStats.upcomingEvents > 0) && (
              <Card className="bg-gradient-to-br from-yellow-900/40 to-orange-900/30 border-yellow-500/40 shadow-xl">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center">
                        <Trophy className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-white flex items-center gap-2">
                          Community Host
                          <span className="text-xs bg-yellow-500/30 text-yellow-300 px-2 py-0.5 rounded-full">
                            {hostStats.hostTier}
                          </span>
                        </CardTitle>
                        <CardDescription className="text-yellow-400/80">
                          {hostStats.upcomingEvents > 0 ? `${hostStats.upcomingEvents} upcoming event${hostStats.upcomingEvents > 1 ? 's' : ''}` : 'View your host dashboard'}
                        </CardDescription>
                      </div>
                    </div>
                    <Link href="/host-dashboard">
                      <Button size="sm" className="bg-yellow-600 hover:bg-yellow-500 text-white">
                        Host Dashboard
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-4 text-sm">
                    <div className="bg-black/20 rounded-lg px-3 py-2 text-center flex-1">
                      <div className="text-xl font-bold text-yellow-400">{hostStats.totalEventsHosted}</div>
                      <div className="text-xs text-gray-400">Events Hosted</div>
                    </div>
                    <div className="bg-black/20 rounded-lg px-3 py-2 text-center flex-1">
                      <div className="text-xl font-bold text-green-400">{hostStats.tokensEarned}</div>
                      <div className="text-xs text-gray-400">VEDD Earned</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Events You're Hosting */}
            {upcomingHostedEvents.length > 0 && (
              <Card className="bg-gradient-to-br from-purple-900/40 to-gray-900 border-purple-500/40 shadow-xl">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-purple-500/30 flex items-center justify-center">
                        <Trophy className="h-4 w-4 text-purple-400" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-white">You're Hosting</CardTitle>
                        <CardDescription className="text-purple-400/80">Events you're presenting</CardDescription>
                      </div>
                    </div>
                    <Link href="/host-dashboard">
                      <Button variant="ghost" size="sm" className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10">
                        Host Dashboard
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {upcomingHostedEvents.map((event) => (
                    <Link key={event.id} href="/host-dashboard">
                      <div className="bg-gray-900/60 border border-purple-500/30 rounded-lg p-3 hover:bg-gray-800/60 transition-colors cursor-pointer">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-white truncate">{event.title}</h4>
                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                              {event.scheduledDate && (
                                <>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(event.scheduledDate).toLocaleDateString()}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {new Date(event.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </>
                              )}
                              {event.attendeeCount !== undefined && (
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {event.attendeeCount} registered
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-xs bg-purple-500/30 text-purple-300 px-2 py-1 rounded-full">
                            <Trophy className="h-3 w-3" />
                            Host
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
            
            {/* Upcoming Registered Events */}
            <Card className="bg-gradient-to-br from-amber-900/30 to-gray-900 border-amber-500/30 shadow-xl">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <CalendarCheck className="h-4 w-4 text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-white">Your Upcoming Events</CardTitle>
                      <CardDescription className="text-amber-400/80">Events you've registered for</CardDescription>
                    </div>
                  </div>
                  <Link href="/ambassador-training">
                    <Button variant="ghost" size="sm" className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
                      Browse Events
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcomingEvents.length > 0 ? (
                  upcomingEvents.map((reg) => (
                    <div 
                      key={reg.event.id}
                      className={`bg-gray-900/60 border rounded-lg p-3 hover:bg-gray-800/60 transition-colors ${reg.event.status === 'live' ? 'border-red-500/50 bg-red-950/30' : 'border-amber-500/20'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {reg.event.status === 'live' && (
                              <span className="flex items-center gap-1 text-xs bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                                <span className="h-2 w-2 rounded-full bg-white"></span>
                                LIVE
                              </span>
                            )}
                            <h4 className="font-medium text-white truncate">{reg.event.title}</h4>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                            {reg.event.scheduledDate && (
                              <>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(reg.event.scheduledDate).toLocaleDateString()}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {new Date(reg.event.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {reg.event.status === 'live' ? (
                          <Button 
                            size="sm" 
                            className="bg-red-600 hover:bg-red-500 text-white shrink-0"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/ambassador/events/${reg.event.id}/stream`, { credentials: 'include' });
                                const data = await res.json();
                                if (data.meetingLink) {
                                  window.open(data.meetingLink, '_blank');
                                } else {
                                  alert('Meeting link not available yet. Please try again.');
                                }
                              } catch (err) {
                                alert('Failed to get stream link. Please try again.');
                              }
                            }}
                          >
                            <Video className="h-3 w-3 mr-1" />
                            Join Live
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full shrink-0">
                            <Users className="h-3 w-3" />
                            Registered
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-gray-400">
                    <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No upcoming events</p>
                    <p className="text-xs text-gray-500 mt-1">Browse events in Ambassador Training to register</p>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Completed Events with Recordings */}
            {registeredEventsData?.events?.some(reg => reg.event.status === 'completed') && (
              <Card className="bg-gradient-to-br from-purple-900/30 to-gray-900 border-purple-500/30 shadow-xl">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Video className="h-4 w-4 text-purple-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-white">Event Recordings</CardTitle>
                      <CardDescription className="text-purple-400/80">Watch past events you attended</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {registeredEventsData?.events
                    ?.filter(reg => reg.event.status === 'completed')
                    .slice(0, 3)
                    .map((reg) => (
                      <div 
                        key={`recording-${reg.event.id}`}
                        className="bg-gray-900/60 border border-purple-500/20 rounded-lg p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-white truncate">{reg.event.title}</h4>
                            <p className="text-xs text-gray-400 mt-1">Completed event</p>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            className="border-purple-500/50 text-purple-300 hover:bg-purple-500/20 shrink-0"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/ambassador/events/${reg.event.id}/recording`, { credentials: 'include' });
                                const data = await res.json();
                                if (data.recordingUrl) {
                                  window.open(data.recordingUrl, '_blank');
                                } else {
                                  alert('Recording not available yet. The host may still be uploading it.');
                                }
                              } catch (err) {
                                alert('Recording not available yet.');
                              }
                            }}
                          >
                            <Video className="h-3 w-3 mr-1" />
                            Watch
                          </Button>
                        </div>
                      </div>
                    ))}
                </CardContent>
              </Card>
            )}
            
            {/* VEDD Token Rewards Panel */}
            <div className="mb-6">
              <VeddRewardsPanel />
            </div>
            
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
            
            {/* MT5 Connected Pairs */}
            <div className="mb-6">
              <ConnectedPairs />
            </div>
            
            {/* Market News Feed */}
            <div className="mb-6">
              <NewsFeed showSentiment={true} maxItems={5} compact={false} />
            </div>
            
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
                <div className="h-[500px]">
                  <TradingCoach personality="friendly" />
                </div>
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
            <Card className="bg-gray-900 border-gray-800 shadow-xl animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
              <CardHeader>
                <CardTitle className="text-xl text-white">Quick Actions</CardTitle>
                <CardDescription>Common tasks for trading analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Link href="/historical">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-rose-600 hover:border-rose-600 transition-all duration-500 ease-out hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-2 duration-500" style={{ animationDelay: "0ms" }}>
                      History
                    </Button>
                  </Link>
                  <Link href="/profile">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-amber-600 hover:border-amber-600 transition-all duration-500 ease-out hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-2 duration-500" style={{ animationDelay: "50ms" }}>
                      Profile
                    </Button>
                  </Link>
                  <Link href="/volatility-meter">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-amber-600 hover:border-amber-600 transition-all duration-500 ease-out hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-2 duration-500" style={{ animationDelay: "100ms" }}>
                      Volatility Meter
                    </Button>
                  </Link>
                  <Link href="/market-trend-game">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-purple-600 hover:border-purple-600 transition-all duration-500 ease-out hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-2 duration-500" style={{ animationDelay: "150ms" }}>
                      <GamepadIcon className="h-4 w-4 mr-2 text-purple-400" />
                      Prediction Game
                    </Button>
                  </Link>
                  <Link href="/market-sentiment">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-purple-600 hover:border-purple-600 transition-all duration-500 ease-out hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-2 duration-500" style={{ animationDelay: "200ms" }}>
                      <BarChart2 className="h-4 w-4 mr-2 text-purple-400" />
                      Sentiment Cloud
                    </Button>
                  </Link>
                  <Link href="/host-dashboard">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-green-600 hover:border-green-600 transition-all duration-500 ease-out hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-2 duration-500" style={{ animationDelay: "250ms" }}>
                      <Users className="h-4 w-4 mr-2 text-green-400" />
                      Host Dashboard
                    </Button>
                  </Link>
                  <Link href="/my-wallet">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-amber-600 hover:border-amber-600 transition-all duration-500 ease-out hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-2 duration-500" style={{ animationDelay: "275ms" }}>
                      <Coins className="h-4 w-4 mr-2 text-amber-400" />
                      My Wallet
                    </Button>
                  </Link>
                  <Link href="/training-calendar">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-orange-600 hover:border-orange-600 transition-all duration-500 ease-out hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-2 duration-500" style={{ animationDelay: "300ms" }}>
                      <Calendar className="h-4 w-4 mr-2 text-orange-400" />
                      Training Calendar
                    </Button>
                  </Link>
                  <Link href="/subscription" className="col-span-2">
                    <Button variant="outline" className="w-full bg-gray-800 border-gray-700 text-white hover:bg-rose-600 hover:border-rose-600 transition-all duration-500 ease-out hover:scale-105 animate-in fade-in-0 slide-in-from-bottom-2 duration-500" style={{ animationDelay: "300ms" }}>
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