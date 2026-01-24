import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ChartImage } from '@/components/ui/chart-image';
import {
  Share2,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Heart,
  Filter,
  Users,
  Lightbulb,
  Search,
  Calendar,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowUp,
  ArrowLeft,
  Info,
  Play,
  Video,
  ExternalLink,
  Trophy,
  Sparkles,
  Flame,
  BarChart3,
  Globe,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { InteractiveInsightTooltip } from '@/components/ui/interactive-insight-tooltip';

interface Analysis {
  id: number;
  userId: number;
  imageUrl: string;
  sharedImageUrl?: string;
  symbol?: string;
  timeframe?: string;
  direction?: string;
  trend?: string;
  confidence?: string;
  createdAt: string;
  isPublic?: boolean;
  shareId?: string;
  notes?: string;
  user?: {
    username: string;
    fullName?: string;
    profileImageUrl?: string;
  };
  feedbackCount?: {
    likes: number;
    dislikes: number;
    hearts: number;
  };
  patterns?: Array<{
    name: string;
    type: string;
    description: string;
    strength: string;
  }>;
  comments?: Array<{
    id: number;
    userId: number;
    username: string;
    text: string;
    createdAt: string;
  }>;
}

interface User {
  id: number;
  username: string;
  fullName?: string;
  profileImageUrl?: string;
  analysisCount?: number;
  followersCount?: number;
  isFollowing?: boolean;
}

interface RecordedEvent {
  id: number;
  title: string;
  description?: string;
  eventType: string;
  recordingUrl: string;
  recordingUploadedAt?: string;
  shareSlug?: string;
  startAt?: string;
  attendeeCount: number;
  tokenReward: number;
  host?: {
    id: number;
    username: string;
    fullName?: string;
    profileImageUrl?: string;
  };
}

export default function Community() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'discover' | 'following' | 'popular' | 'recordings'>('discover');
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [commentText, setCommentText] = useState('');

  // Get all public analyses
  const { data: analyses, isLoading, error, refetch } = useQuery<Analysis[]>({
    queryKey: ['/api/analyses'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Get popular users
  const { data: popularUsers, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ['/api/social/popular-traders'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Get followed analyses (analyses from users the current user follows)
  const { data: followingAnalyses, isLoading: isLoadingFollowing } = useQuery<Analysis[]>({
    queryKey: ['/api/social/feed'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: activeTab === 'following',
  });

  // Get recorded community events
  const { data: recordedEventsData, isLoading: isLoadingRecordings } = useQuery<{ recordings: RecordedEvent[] }>({
    queryKey: ['/api/community/recorded-events'],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: activeTab === 'recordings',
  });
  const recordedEvents = recordedEventsData?.recordings || [];

  // Filter and search analyses
  const filteredAnalyses = useMemo(() => {
    if (!analyses) return [];
    
    return analyses
      .filter(analysis => {
        // Filter by direction
        if (filter === 'buy' && analysis.direction?.toLowerCase() !== 'buy') return false;
        if (filter === 'sell' && analysis.direction?.toLowerCase() !== 'sell') return false;
        
        // Filter by search query
        if (searchQuery && !(
          analysis.symbol?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          analysis.user?.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          analysis.patterns?.some(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
        )) {
          return false;
        }
        
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [analyses, filter, searchQuery]);

  // Get the analyses to display based on active tab
  const displayedAnalyses = activeTab === 'following' 
    ? followingAnalyses || []
    : activeTab === 'popular'
      ? [...(analyses || [])].sort((a, b) => (b.feedbackCount?.likes || 0) - (a.feedbackCount?.likes || 0)).slice(0, 10)
      : filteredAnalyses;

  // Handle analysis feedback (like, dislike, heart)
  const handleFeedback = async (analysisId: number, feedbackType: 'like' | 'dislike' | 'heart') => {
    try {
      await fetch(`/api/social/analyses/${analysisId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackType }),
      });
      
      toast({
        title: 'Feedback Submitted',
        description: 'Your feedback has been recorded.',
      });
      
      // Refresh analyses data
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to submit feedback. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle follow/unfollow user
  const handleFollowToggle = async (userId: number, isFollowing: boolean) => {
    try {
      await fetch(`/api/social/${isFollowing ? 'unfollow' : 'follow'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      
      toast({
        title: isFollowing ? 'Unfollowed' : 'Following',
        description: `You are ${isFollowing ? 'no longer following' : 'now following'} this trader.`,
      });
      
      // Refresh users data
      refetch();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update follow status. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Handle adding a comment
  const handleAddComment = async () => {
    if (!selectedAnalysis || !commentText.trim()) return;
    
    try {
      await fetch(`/api/social/analyses/${selectedAnalysis.id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: commentText }),
      });
      
      toast({
        title: 'Comment Added',
        description: 'Your comment has been added successfully.',
      });
      
      // Clear comment text and refresh data
      setCommentText('');
      refetch();
      
      // Update the selected analysis with the new comment
      if (selectedAnalysis && analyses) {
        const updatedAnalysis = analyses.find(a => a.id === selectedAnalysis.id);
        if (updatedAnalysis) {
          setSelectedAnalysis(updatedAnalysis);
        }
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add comment. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-500">Error Loading Data</h2>
          <p className="mt-2 text-gray-600">Failed to load community data. Please try again later.</p>
          <Button onClick={() => refetch()} className="mt-4">Retry</Button>
        </div>
      </div>
    );
  }

  const [_, navigate] = useLocation();

  const stats = {
    totalAnalyses: analyses?.length || 0,
    totalTraders: popularUsers?.length || 0,
    totalRecordings: recordedEvents.length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-purple-950/10">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-transparent to-blue-500/5" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        
        <div className="container mx-auto px-4 py-8 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-center mb-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-sm text-purple-300">VEDD Trading Community</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white via-purple-200 to-blue-200 bg-clip-text text-transparent mb-4">
              Connect. Learn. Trade.
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Join thousands of traders sharing insights, strategies, and real-time market analyses
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-3 gap-4 max-w-xl mx-auto mb-8"
          >
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4 text-center hover:border-purple-500/30 transition-colors">
              <div className="flex items-center justify-center gap-2 mb-1">
                <BarChart3 className="h-4 w-4 text-purple-400" />
                <span className="text-2xl font-bold">{stats.totalAnalyses}</span>
              </div>
              <span className="text-xs text-muted-foreground">Analyses</span>
            </div>
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4 text-center hover:border-blue-500/30 transition-colors">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Users className="h-4 w-4 text-blue-400" />
                <span className="text-2xl font-bold">{stats.totalTraders}</span>
              </div>
              <span className="text-xs text-muted-foreground">Traders</span>
            </div>
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-4 text-center hover:border-green-500/30 transition-colors">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Video className="h-4 w-4 text-green-400" />
                <span className="text-2xl font-bold">{stats.totalRecordings}</span>
              </div>
              <span className="text-xs text-muted-foreground">Recordings</span>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8"
          >
            <div className="relative w-full sm:w-80">
              <Input
                placeholder="Search symbols, traders, patterns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-card/50 backdrop-blur-sm border-border/50 focus:border-purple-500/50 h-11"
              />
              <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 transform -translate-y-1/2" />
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant={filter === 'all' ? "default" : "outline"} 
                size="sm"
                onClick={() => setFilter('all')}
                className={filter === 'all' ? "bg-purple-600 hover:bg-purple-700" : "bg-card/50 backdrop-blur-sm border-border/50"}
              >
                <Globe className="h-3 w-3 mr-1" /> All
              </Button>
              <Button 
                variant={filter === 'buy' ? "default" : "outline"} 
                size="sm"
                onClick={() => setFilter('buy')}
                className={filter === 'buy' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-card/50 backdrop-blur-sm border-border/50"}
              >
                <TrendingUp className="h-3 w-3 mr-1" /> Buy
              </Button>
              <Button 
                variant={filter === 'sell' ? "default" : "outline"} 
                size="sm"
                onClick={() => setFilter('sell')}
                className={filter === 'sell' ? "bg-rose-600 hover:bg-rose-700" : "bg-card/50 backdrop-blur-sm border-border/50"}
              >
                <TrendingDown className="h-3 w-3 mr-1" /> Sell
              </Button>
            </div>
          </motion.div>
        </div>
      </motion.div>
      
      <div className="container mx-auto px-4 pb-12">
        <Tabs defaultValue="discover" value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
          <div className="flex justify-center mb-8">
            <TabsList className="bg-card/50 backdrop-blur-sm border border-border/50 p-1 rounded-xl">
              <TabsTrigger value="discover" className="flex items-center gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-lg px-4">
                <Lightbulb className="h-4 w-4" />
                <span>Discover</span>
              </TabsTrigger>
              <TabsTrigger value="following" className="flex items-center gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-lg px-4">
                <Users className="h-4 w-4" />
                <span>Following</span>
              </TabsTrigger>
              <TabsTrigger value="popular" className="flex items-center gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-lg px-4">
                <Flame className="h-4 w-4" />
                <span>Popular</span>
              </TabsTrigger>
              <TabsTrigger value="recordings" className="flex items-center gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-lg px-4">
                <Video className="h-4 w-4" />
                <span>Recordings</span>
              </TabsTrigger>
            </TabsList>
          </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <TabsContent value="discover" className="mt-0">
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map(i => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <Card className="animate-pulse bg-card/50 backdrop-blur-sm border-border/50">
                        <CardContent className="p-6">
                          <div className="h-40 bg-muted/50 rounded-lg mb-4" />
                          <div className="h-6 bg-muted/50 rounded mb-2 w-1/3" />
                          <div className="h-4 bg-muted/50 rounded mb-1 w-1/2" />
                          <div className="h-4 bg-muted/50 rounded w-1/4" />
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              ) : filteredAnalyses.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredAnalyses.map((analysis, index) => (
                    <motion.div
                      key={analysis.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <AnalysisCard 
                        analysis={analysis} 
                        onSelect={(analysis) => {
                          setSelectedAnalysis(analysis);
                          setIsDetailModalOpen(true);
                        }}
                        onFeedback={handleFeedback}
                      />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-16 bg-card/30 backdrop-blur-sm border border-border/30 rounded-2xl"
                >
                  <Lightbulb className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground mb-4">No analyses found matching your filters.</p>
                  <Button onClick={() => {
                    setFilter('all');
                    setSearchQuery('');
                  }} variant="outline" className="bg-card/50">
                    <Zap className="h-4 w-4 mr-2" /> Clear Filters
                  </Button>
                </motion.div>
              )}
            </TabsContent>
            
            <TabsContent value="following" className="mt-0">
              {isLoadingFollowing ? (
                <div className="grid grid-cols-1 gap-4">
                  {[1, 2, 3].map(i => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-40 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
                        <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded mb-2 w-1/3" />
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded mb-1 w-1/2" />
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : followingAnalyses && followingAnalyses.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {followingAnalyses.map(analysis => (
                    <AnalysisCard 
                      key={analysis.id} 
                      analysis={analysis} 
                      onSelect={(analysis) => {
                        setSelectedAnalysis(analysis);
                        setIsDetailModalOpen(true);
                      }}
                      onFeedback={handleFeedback}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-10">
                  <p className="text-muted-foreground">You're not following anyone yet, or they haven't shared any analyses.</p>
                  <Button onClick={() => setActiveTab('discover')} variant="outline" className="mt-4">
                    Discover Traders
                  </Button>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="popular" className="mt-0">
              {isLoading ? (
                <div className="grid grid-cols-1 gap-4">
                  {[1, 2, 3].map(i => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-40 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
                        <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded mb-2 w-1/3" />
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded mb-1 w-1/2" />
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/4" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : displayedAnalyses.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {displayedAnalyses.map(analysis => (
                    <AnalysisCard 
                      key={analysis.id} 
                      analysis={analysis} 
                      onSelect={(analysis) => {
                        setSelectedAnalysis(analysis);
                        setIsDetailModalOpen(true);
                      }}
                      onFeedback={handleFeedback}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-10">
                  <p className="text-muted-foreground">No popular analyses found.</p>
                  <Button onClick={() => setActiveTab('discover')} variant="outline" className="mt-4">
                    Discover Analyses
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="recordings" className="mt-0">
              {isLoadingRecordings ? (
                <div className="grid grid-cols-1 gap-4">
                  {[1, 2, 3].map(i => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
                        <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded mb-2 w-1/3" />
                        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : recordedEvents.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {recordedEvents.map(event => (
                    <Card key={event.id} className="border-purple-500/30 bg-purple-500/5 hover:border-purple-500/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-purple-500 border-purple-500">
                                <Video className="h-3 w-3 mr-1" /> Recording
                              </Badge>
                              <Badge variant="secondary" className="capitalize">
                                {event.eventType}
                              </Badge>
                            </div>
                            <h3 className="text-lg font-semibold">{event.title}</h3>
                            {event.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                              {event.host && (
                                <span className="flex items-center gap-1">
                                  <Avatar className="h-5 w-5">
                                    <AvatarImage src={event.host.profileImageUrl} />
                                    <AvatarFallback className="text-xs">
                                      {event.host.username?.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span>Hosted by {event.host.fullName || event.host.username}</span>
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {event.attendeeCount} attended
                              </span>
                              {event.tokenReward > 0 && (
                                <span className="flex items-center gap-1">
                                  <Trophy className="h-4 w-4 text-yellow-500" />
                                  {event.tokenReward} VEDD reward
                                </span>
                              )}
                              {event.recordingUploadedAt && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  {formatDistanceToNow(new Date(event.recordingUploadedAt), { addSuffix: true })}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2 ml-4">
                            <Button variant="default" size="sm" asChild className="bg-purple-600 hover:bg-purple-700">
                              <a href={event.recordingUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                                <Play className="h-4 w-4" /> Watch
                              </a>
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                const shareLink = event.shareSlug 
                                  ? `${window.location.origin}/event/${event.shareSlug}`
                                  : event.recordingUrl;
                                navigator.clipboard.writeText(shareLink);
                                toast({ 
                                  title: "Link Copied!", 
                                  description: "Share this recording with others" 
                                });
                              }}
                              className="flex items-center gap-1"
                            >
                              <Share2 className="h-4 w-4" /> Share
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10">
                  <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No recorded events yet.</p>
                  <p className="text-sm text-muted-foreground mt-2">Community hosts will share their recorded sessions here.</p>
                </div>
              )}
            </TabsContent>
          </div>
          
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 sticky top-24">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-4 w-4 text-purple-400" /> Popular Traders
                </CardTitle>
                <CardDescription>Top traders in the community</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingUsers ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="h-10 w-10 rounded-full bg-muted/50" />
                        <div className="flex-1">
                          <div className="h-4 bg-muted/50 rounded w-24 mb-1" />
                          <div className="h-3 bg-muted/50 rounded w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : popularUsers && popularUsers.length > 0 ? (
                  <div className="space-y-3">
                    {popularUsers.map(trader => (
                      <div key={trader.id} className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-purple-500/5 transition-colors">
                        <div className="flex items-center gap-3">
                          <Avatar className="ring-2 ring-purple-500/20">
                            <AvatarImage src={trader.profileImageUrl} />
                            <AvatarFallback className="bg-purple-500/20 text-purple-300">
                              {trader.username.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Link to={`/profile/${trader.id}`} className="font-medium hover:text-purple-400 transition-colors">
                              {trader.username}
                            </Link>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <BarChart3 className="h-3 w-3" />
                              {trader.analysisCount} {trader.analysisCount === 1 ? 'analysis' : 'analyses'}
                            </div>
                          </div>
                        </div>
                        
                        {trader.id !== user?.id && (
                          <Button
                            variant={trader.isFollowing ? "outline" : "default"}
                            size="sm"
                            onClick={() => handleFollowToggle(trader.id, !!trader.isFollowing)}
                            className={trader.isFollowing ? "border-purple-500/30" : "bg-purple-600 hover:bg-purple-700"}
                          >
                            {trader.isFollowing ? 'Unfollow' : 'Follow'}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-muted-foreground text-sm">No popular traders found</p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-center pt-2">
                <Button variant="ghost" size="sm" asChild className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10">
                  <Link href="/profile">View Your Profile</Link>
                </Button>
              </CardFooter>
            </Card>
            
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-400" /> Recent Activity
                </CardTitle>
                <CardDescription>Latest community activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Array.isArray(analyses) && analyses.slice(0, 5).map(analysis => (
                    <div key={analysis.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-purple-500/5 transition-colors">
                      <div className={cn(
                        "h-2 w-2 rounded-full mt-2",
                        analysis.direction?.toLowerCase() === 'buy' ? "bg-emerald-500" : "bg-rose-500"
                      )} />
                      <div>
                        <div className="text-sm">
                          <span className="font-medium">{analysis.user?.username || "Anonymous"}</span>{' '}
                          shared a{' '}
                          <span className={cn(
                            "font-medium",
                            analysis.direction?.toLowerCase() === 'buy' ? "text-emerald-400" : "text-rose-400"
                          )}>
                            {analysis.direction?.toLowerCase() === 'buy' ? 'buy' : 'sell'}
                          </span>{' '}
                          signal for <span className="font-medium">{analysis.symbol || "Unknown"}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(analysis.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-purple-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-400" /> Community Guidelines
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    Be respectful to fellow traders
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    Don't share misleading analysis
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    Give constructive feedback
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    Respect others' trading opinions
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    Keep personal info private
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
        </Tabs>
      </div>
      
      {/* Analysis Detail Modal */}
      {selectedAnalysis && (
        <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader className="relative">
              <div className="absolute left-0 top-0">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsDetailModalOpen(false)}
                  className="rounded-full hover:bg-card transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </div>
              <DialogTitle className="flex items-center justify-center gap-2 pt-2">
                {selectedAnalysis.symbol} Analysis
                <Badge variant={selectedAnalysis.direction?.toLowerCase() === 'buy' ? 'success' : 'destructive'}>
                  {selectedAnalysis.direction}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-center">
                Shared by {selectedAnalysis.user?.username || "Anonymous"} • {formatDistanceToNow(new Date(selectedAnalysis.createdAt), { addSuffix: true })}
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="aspect-video relative overflow-hidden rounded-lg border border-border mb-4">
                  <ChartImage 
                    imageUrl={selectedAnalysis.imageUrl}
                    sharedImageUrl={selectedAnalysis.sharedImageUrl}
                    altText={`${selectedAnalysis.symbol} Chart Analysis`}
                    className="w-full h-full object-cover"
                    showWatermark={true}
                  />
                </div>
                
                <div className="flex items-center gap-4 mb-4">
                  <Badge variant="outline">{selectedAnalysis.timeframe}</Badge>
                  <Badge variant={selectedAnalysis.trend?.toLowerCase() === 'bullish' ? 'success' : 'destructive'}>
                    {selectedAnalysis.trend}
                  </Badge>
                  <Badge variant="outline">{selectedAnalysis.confidence}</Badge>
                </div>
                
                {selectedAnalysis.notes && (
                  <div className="mb-4">
                    <h3 className="font-medium mb-1">Trader Notes:</h3>
                    <p className="text-sm text-muted-foreground">{selectedAnalysis.notes}</p>
                  </div>
                )}
              </div>
              
              <div>
                {selectedAnalysis.patterns && selectedAnalysis.patterns.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-medium mb-2">Detected Patterns:</h3>
                    <div className="space-y-3">
                      {selectedAnalysis.patterns.map((pattern, index) => (
                        <div key={index} className="p-3 border border-border rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <InteractiveInsightTooltip
                              type="info"
                              marketTrend={pattern.type?.toLowerCase().includes('bullish') ? 'bullish' : 
                                  pattern.type?.toLowerCase().includes('bearish') ? 'bearish' : 'neutral'}
                              title={pattern.name}
                              description={pattern.description}
                              context="pattern"
                            >
                              <span className="font-medium cursor-help">{pattern.name}</span>
                            </InteractiveInsightTooltip>
                            <Badge variant="outline">{pattern.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{pattern.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="mb-4">
                  <h3 className="font-medium mb-2">Community Feedback:</h3>
                  <div className="flex items-center gap-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={() => handleFeedback(selectedAnalysis.id, 'like')}
                    >
                      <ThumbsUp className="h-4 w-4" />
                      <span>{selectedAnalysis.feedbackCount?.likes || 0}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={() => handleFeedback(selectedAnalysis.id, 'dislike')}
                    >
                      <ThumbsDown className="h-4 w-4" />
                      <span>{selectedAnalysis.feedbackCount?.dislikes || 0}</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex items-center gap-2"
                      onClick={() => handleFeedback(selectedAnalysis.id, 'heart')}
                    >
                      <Heart className="h-4 w-4 text-rose-500" />
                      <span>{selectedAnalysis.feedbackCount?.hearts || 0}</span>
                    </Button>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Comments:</h3>
                  <div className="max-h-[200px] overflow-y-auto mb-3 space-y-3">
                    {selectedAnalysis.comments && selectedAnalysis.comments.length > 0 ? (
                      selectedAnalysis.comments.map(comment => (
                        <div key={comment.id} className="p-3 border border-border rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{comment.username}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm">{comment.text}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment!</p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={handleAddComment} disabled={!commentText.trim()}>
                      Post
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <div className="flex items-center justify-between w-full">
                <Button variant="outline" asChild>
                  <Link href={`/profile/${selectedAnalysis.userId}`}>
                    View Trader Profile
                  </Link>
                </Button>
                <Button onClick={() => setIsDetailModalOpen(false)}>
                  Close
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Analysis Card Component with modern glassmorphism design
function AnalysisCard({ 
  analysis, 
  onSelect, 
  onFeedback 
}: { 
  analysis: Analysis; 
  onSelect: (analysis: Analysis) => void; 
  onFeedback: (id: number, type: 'like' | 'dislike' | 'heart') => void;
}) {
  const isBuy = analysis.direction?.toLowerCase() === 'buy';
  
  return (
    <Card className="overflow-hidden bg-card/50 backdrop-blur-sm border-border/50 hover:border-purple-500/30 transition-all duration-300 group hover:shadow-lg hover:shadow-purple-500/5">
      <CardContent className="p-0">
        <div className="relative h-40 cursor-pointer overflow-hidden" onClick={() => onSelect(analysis)}>
          <ChartImage 
            imageUrl={analysis.imageUrl} 
            sharedImageUrl={analysis.sharedImageUrl}
            altText={`${analysis.symbol} Chart Analysis`}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            showWatermark={true}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute top-3 left-3">
            <Badge 
              className={cn(
                "font-semibold shadow-lg",
                isBuy 
                  ? "bg-emerald-500/90 hover:bg-emerald-600 text-white" 
                  : "bg-rose-500/90 hover:bg-rose-600 text-white"
              )}
            >
              {isBuy ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
              {analysis.direction}
            </Badge>
          </div>
          <div className="absolute bottom-3 left-3 right-3">
            <h3 className="font-bold text-white text-lg flex items-center gap-2">
              {analysis.symbol || "Unknown Symbol"}
              <Badge variant="outline" className="bg-white/20 border-white/30 text-white text-xs">
                {analysis.timeframe}
              </Badge>
            </h3>
          </div>
        </div>
        
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7 ring-2 ring-purple-500/20">
                <AvatarImage src={analysis.user?.profileImageUrl} />
                <AvatarFallback className="bg-purple-500/20 text-purple-300 text-xs">
                  {analysis.user?.username?.substring(0, 2).toUpperCase() || 'UN'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <Link 
                  to={`/profile/${analysis.userId}`} 
                  className="text-sm font-medium hover:text-purple-400 transition-colors"
                >
                  {analysis.user?.username || "Anonymous"}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(analysis.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs",
                analysis.trend?.toLowerCase() === 'bullish' 
                  ? "border-emerald-500/50 text-emerald-400" 
                  : "border-rose-500/50 text-rose-400"
              )}
            >
              {analysis.trend}
            </Badge>
          </div>
          
          {analysis.notes && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{analysis.notes}</p>
          )}
          
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <div className="flex items-center gap-1">
              <button 
                className="flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-all"
                onClick={() => onFeedback(analysis.id, 'like')}
              >
                <ThumbsUp className="h-4 w-4" />
                <span>{analysis.feedbackCount?.likes || 0}</span>
              </button>
              <button 
                className="flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-all"
                onClick={() => onFeedback(analysis.id, 'dislike')}
              >
                <ThumbsDown className="h-4 w-4" />
                <span>{analysis.feedbackCount?.dislikes || 0}</span>
              </button>
              <button 
                className="flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground hover:text-pink-400 hover:bg-pink-500/10 rounded-md transition-all"
                onClick={() => onFeedback(analysis.id, 'heart')}
              >
                <Heart className="h-4 w-4" />
                <span>{analysis.feedbackCount?.hearts || 0}</span>
              </button>
            </div>
            
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => onSelect(analysis)}
              className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              {analysis.comments?.length || 0}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}