import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { 
  Heart, 
  X, 
  Share2, 
  MessageSquare, 
  Star, 
  ChevronLeft, 
  ChevronRight,
  UserPlus,
  Users,
  ThumbsUp,
  ThumbsDown,
  BookmarkPlus,
  Bookmark,
  Award,
  TrendingUp,
  Info,
  Filter,
  RefreshCcw,
  Search
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { ChartAnalysis, User } from '@shared/schema';

// UI Components
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';

// Type definitions for our social features
interface TraderProfile {
  userId: number;
  username: string;
  fullName?: string;
  profileImage?: string;
  bio?: string;
  tradingExperience?: string;
  tradingStyle?: string;
  tradeGrade: number;
  winRate: number;
  followers: number;
  following: number;
  isFollowing: boolean;
}

interface AnalysisWithDetails extends ChartAnalysis {
  user: {
    id: number;
    username: string;
    fullName?: string;
    profileImage?: string;
  };
  feedbackCounts: {
    likes: number;
    dislikes: number;
    saves: number;
    comments: number;
  };
  userFeedback: {
    hasLiked: boolean;
    hasDisliked: boolean;
    hasSaved: boolean;
  };
}

const TinderCard: React.FC<{
  analysis: AnalysisWithDetails;
  onLike: () => void;
  onDislike: () => void;
  onInfo: () => void;
  onSave: () => void;
}> = ({ analysis, onLike, onDislike, onInfo, onSave }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);
  
  const likeOpacity = useTransform(x, [0, 100, 200], [0, 0.5, 1]);
  const dislikeOpacity = useTransform(x, [-200, -100, 0], [1, 0.5, 0]);
  
  const direction = analysis.direction.toLowerCase() === 'buy' ? 'bullish' : 'bearish';
  const directionClass = direction === 'bullish' ? 'text-emerald-500' : 'text-rose-500';
  
  const dragEndHandler = (event: any, info: any) => {
    if (info.offset.x > 100) {
      onLike();
    } else if (info.offset.x < -100) {
      onDislike();
    }
    x.set(0);
    y.set(0);
  };
  
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };
  
  const formatDate = (dateString: Date) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };
  
  return (
    <motion.div
      ref={cardRef}
      style={{ x, y, rotate, opacity }}
      drag
      dragConstraints={{ top: 0, right: 0, bottom: 0, left: 0 }}
      onDragEnd={dragEndHandler}
      whileTap={{ scale: 1.05 }}
      className="absolute w-full h-full"
    >
      <Card className="relative w-full h-full overflow-hidden bg-card border-2 rounded-2xl shadow-xl">
        <div className="absolute inset-0 p-0 overflow-hidden">
          <img 
            src={analysis.imageUrl} 
            alt={`${analysis.symbol} chart`}
            className="object-cover w-full h-full"
          />
        </div>
        
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent" />
        
        {/* Status indicators */}
        <motion.div 
          style={{ opacity: likeOpacity }}
          className="absolute top-10 right-10 transform rotate-12 border-green-500 border-8 rounded-lg px-6 py-2 z-20"
        >
          <span className="text-green-500 text-3xl font-bold">LIKE</span>
        </motion.div>
        
        <motion.div 
          style={{ opacity: dislikeOpacity }}
          className="absolute top-10 left-10 transform -rotate-12 border-red-500 border-8 rounded-lg px-6 py-2 z-20"
        >
          <span className="text-red-500 text-3xl font-bold">NOPE</span>
        </motion.div>
        
        {/* Content */}
        <div className="absolute inset-0 p-4 flex flex-col justify-between z-10">
          <div className="flex items-center">
            <Avatar className="h-10 w-10 border-2 border-primary">
              <AvatarImage src={analysis.user.profileImage} />
              <AvatarFallback>{getInitials(analysis.user.fullName || analysis.user.username)}</AvatarFallback>
            </Avatar>
            <div className="ml-3">
              <p className="text-white font-medium">{analysis.user.fullName || analysis.user.username}</p>
              <div className="flex items-center text-white/70 text-xs">
                <Star className="w-3 h-3 text-yellow-500 mr-1" />
                <span>Grade: {Math.round(Math.random() * 50 + 50)}</span>
                <div className="w-1 h-1 rounded-full bg-white/40 mx-2"></div>
                <span>{formatDate(analysis.createdAt)}</span>
              </div>
            </div>
          </div>
          
          <div className="mt-auto">
            <div className="bg-black/60 backdrop-blur-sm p-4 rounded-xl">
              <div className="flex justify-between items-center mb-2">
                <Badge className="bg-primary/90">{analysis.symbol}</Badge>
                <Badge className={cn(
                  "px-3",
                  direction === 'bullish' ? "bg-emerald-500/90" : "bg-rose-500/90"
                )}>
                  {direction.toUpperCase()}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-white/10 p-2 rounded">
                  <p className="text-xs text-white/60">Entry</p>
                  <p className="text-white font-medium">{analysis.entryPoint}</p>
                </div>
                <div className="bg-white/10 p-2 rounded">
                  <p className="text-xs text-white/60">Target</p>
                  <p className="text-white font-medium">{analysis.takeProfit}</p>
                </div>
                <div className="bg-white/10 p-2 rounded">
                  <p className="text-xs text-white/60">Stop Loss</p>
                  <p className="text-white font-medium">{analysis.stopLoss}</p>
                </div>
                <div className="bg-white/10 p-2 rounded">
                  <p className="text-xs text-white/60">R:R Ratio</p>
                  <p className="text-white font-medium">{analysis.riskRewardRatio || "N/A"}</p>
                </div>
              </div>
              
              <div className="flex justify-between text-white/90 text-sm">
                <div className="flex items-center">
                  <ThumbsUp className={cn(
                    "w-5 h-5 mr-1",
                    analysis.userFeedback.hasLiked ? "text-blue-500" : "text-white/70"
                  )} />
                  <span>{analysis.feedbackCounts.likes}</span>
                </div>
                <div className="flex items-center">
                  <ThumbsDown className={cn(
                    "w-5 h-5 mr-1",
                    analysis.userFeedback.hasDisliked ? "text-orange-500" : "text-white/70"
                  )} />
                  <span>{analysis.feedbackCounts.dislikes}</span>
                </div>
                <div className="flex items-center">
                  <Bookmark className={cn(
                    "w-5 h-5 mr-1",
                    analysis.userFeedback.hasSaved ? "text-green-500" : "text-white/70"
                  )} />
                  <span>{analysis.feedbackCounts.saves}</span>
                </div>
                <div className="flex items-center">
                  <MessageSquare className="w-5 h-5 mr-1 text-white/70" />
                  <span>{analysis.feedbackCounts.comments}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
      
      {/* Action buttons */}
      <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 flex items-center gap-4 z-30">
        <Button
          variant="default"
          size="icon"
          className="rounded-full w-14 h-14 bg-rose-500 hover:bg-rose-600 shadow-lg"
          onClick={() => {
            x.set(-200);
            setTimeout(() => {
              onDislike();
              x.set(0);
            }, 300);
          }}
        >
          <X className="w-6 h-6" />
        </Button>
        
        <Button
          variant="default"
          size="icon"
          className="rounded-full w-10 h-10 bg-blue-500 hover:bg-blue-600 shadow-lg"
          onClick={onInfo}
        >
          <Info className="w-5 h-5" />
        </Button>
        
        <Button
          variant="default"
          size="icon"
          className="rounded-full w-10 h-10 bg-amber-500 hover:bg-amber-600 shadow-lg"
          onClick={onSave}
        >
          {analysis.userFeedback.hasSaved ? (
            <Bookmark className="w-5 h-5" />
          ) : (
            <BookmarkPlus className="w-5 h-5" />
          )}
        </Button>
        
        <Button
          variant="default"
          size="icon"
          className="rounded-full w-14 h-14 bg-emerald-500 hover:bg-emerald-600 shadow-lg"
          onClick={() => {
            x.set(200);
            setTimeout(() => {
              onLike();
              x.set(0);
            }, 300);
          }}
        >
          <Heart className="w-6 h-6" />
        </Button>
      </div>
    </motion.div>
  );
};

const TopTraderCard: React.FC<{
  trader: TraderProfile;
  onFollow: () => void;
}> = ({ trader, onFollow }) => {
  const getExperienceColor = (experience?: string) => {
    switch (experience) {
      case 'beginner': return 'text-green-500';
      case 'intermediate': return 'text-blue-500';
      case 'advanced': return 'text-purple-500';
      case 'expert': return 'text-amber-500';
      default: return 'text-gray-500';
    }
  };
  
  const getTradeGradeColor = (grade: number) => {
    if (grade >= 90) return 'text-emerald-500';
    if (grade >= 70) return 'text-blue-500';
    if (grade >= 50) return 'text-amber-500';
    return 'text-rose-500';
  };
  
  const getTradeGradeText = (grade: number) => {
    if (grade >= 90) return 'Elite';
    if (grade >= 80) return 'Expert';
    if (grade >= 70) return 'Advanced';
    if (grade >= 60) return 'Intermediate';
    if (grade >= 50) return 'Improving';
    return 'Beginner';
  };
  
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };
  
  return (
    <Card className="overflow-hidden hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-2">
        {/* Trader Level Badge - Moved to top for more prominence */}
        <div className="flex items-center justify-between mb-3">
          <Badge className={cn("py-1 px-2 font-bold text-sm flex items-center gap-1", getTradeGradeColor(trader.tradeGrade))}>
            <Award className="h-3.5 w-3.5" />
            {getTradeGradeText(trader.tradeGrade)} Trader • Level {Math.ceil(trader.tradeGrade / 10)}
          </Badge>
          
          <Button
            variant={trader.isFollowing ? "outline" : "default"}
            size="sm"
            onClick={onFollow}
            className={trader.isFollowing ? "border-green-500 text-green-500" : ""}
          >
            {trader.isFollowing ? "Following" : "Follow"}
          </Button>
        </div>
        
        <div className="flex items-start">
          <Avatar className="h-10 w-10 border-2 border-primary">
            <AvatarImage src={trader.profileImage} />
            <AvatarFallback>{getInitials(trader.fullName || trader.username)}</AvatarFallback>
          </Avatar>
          <div className="ml-3">
            <CardTitle className="text-lg">{trader.fullName || trader.username}</CardTitle>
            <div className="flex items-center flex-wrap gap-1 mt-1">
              <Badge variant="outline" className={getExperienceColor(trader.tradingExperience)}>
                {trader.tradingExperience || 'Trader'}
              </Badge>
              {trader.winRate > 65 && (
                <Badge className="bg-amber-500">Top Performer</Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {trader.bio && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{trader.bio}</p>
        )}
        
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 mb-3">
          <div className="bg-muted rounded-md p-2">
            <div className="text-xs text-muted-foreground mb-1">Win Rate</div>
            <div className="flex items-center">
              <span className={cn(
                "text-lg font-bold",
                trader.winRate >= 70 ? "text-emerald-500" : 
                trader.winRate >= 50 ? "text-amber-500" : "text-rose-500"
              )}>
                {trader.winRate}%
              </span>
            </div>
          </div>
          
          <div className="bg-muted rounded-md p-2">
            <div className="text-xs text-muted-foreground mb-1">Performance Score</div>
            <div className="flex items-center">
              <span className={cn("text-lg font-bold", getTradeGradeColor(trader.tradeGrade))}>
                {trader.tradeGrade}
              </span>
              <span className="text-xs ml-1 text-muted-foreground">/ 100</span>
            </div>
          </div>
          
          <div className="flex items-center text-sm">
            <Users className="w-4 h-4 mr-1 text-muted-foreground" />
            <span>{trader.followers} followers</span>
          </div>
          
          <div className="flex items-center text-sm">
            <TrendingUp className="w-4 h-4 mr-1 text-muted-foreground" />
            <span>{trader.tradingStyle || 'Mixed'} style</span>
          </div>
        </div>
        
        <div className="mt-2">
          <Link to={`/profile/${trader.userId}`} className="text-sm text-primary hover:underline">
            View Profile
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

// Mock data for development until we implement the backend
const mockTraders: TraderProfile[] = Array.from({ length: 8 }).map((_, i) => ({
  userId: i + 1,
  username: `trader${i + 1}`,
  fullName: ['Sarah Johnson', 'Michael Chen', 'Emma Wilson', 'David Rodriguez', 'Alex Turner', 'Sophia Lee', 'James Walker', 'Olivia Parker'][i],
  profileImage: `https://randomuser.me/api/portraits/${i % 2 === 0 ? 'women' : 'men'}/${(i * 13) % 99}.jpg`,
  bio: ['Forex specialist focusing on major pairs', 'Crypto day trader with 5+ years experience', 'Technical analyst specializing in reversal patterns', 'Swing trader focusing on fundamentals and macroeconomics'][i % 4],
  tradingExperience: ['beginner', 'intermediate', 'advanced', 'expert'][Math.floor(Math.random() * 4)],
  tradingStyle: ['day trading', 'swing trading', 'position trading', 'scalping'][Math.floor(Math.random() * 4)],
  tradeGrade: Math.floor(Math.random() * 40) + 60, // 60-100
  winRate: Math.floor(Math.random() * 30) + 50, // 50-80
  followers: Math.floor(Math.random() * 2000) + 100,
  following: Math.floor(Math.random() * 500),
  isFollowing: Math.random() > 0.6,
}));

const mockAnalyses: AnalysisWithDetails[] = Array.from({ length: 15 }).map((_, i) => {
  const isUptrend = Math.random() > 0.5;
  const basePrice = parseFloat((Math.random() * 100 + 10).toFixed(2));
  const takeProfitDelta = parseFloat((Math.random() * 5 + 1).toFixed(2));
  const stopLossDelta = parseFloat((Math.random() * 2 + 0.5).toFixed(2));
  const entryPrice = basePrice;
  const takeProfit = isUptrend ? (basePrice + takeProfitDelta).toFixed(2) : (basePrice - takeProfitDelta).toFixed(2);
  const stopLoss = isUptrend ? (basePrice - stopLossDelta).toFixed(2) : (basePrice + stopLossDelta).toFixed(2);
  const riskRewardRatio = (takeProfitDelta / stopLossDelta).toFixed(2);
  
  const mockUser = mockTraders[Math.floor(Math.random() * mockTraders.length)];
  
  return {
    id: i + 1,
    userId: mockUser.userId,
    imageUrl: `/uploads/analysis-${(i % 5) + 1}.jpg`,
    symbol: ['EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD', 'ETHUSD', 'GOLD', 'S&P500', 'NASDAQ'][i % 8],
    timeframe: ['1H', '4H', '1D', '1W'][Math.floor(Math.random() * 4)],
    price: entryPrice.toString(),
    direction: isUptrend ? 'buy' : 'sell',
    trend: isUptrend ? 'uptrend' : 'downtrend',
    confidence: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)],
    entryPoint: entryPrice.toString(),
    exitPoint: takeProfit,
    stopLoss: stopLoss,
    takeProfit: takeProfit,
    riskRewardRatio: riskRewardRatio,
    potentialPips: Math.floor(takeProfitDelta * 100).toString(),
    patterns: JSON.stringify([{ name: 'Double Bottom', strength: 'Strong' }]),
    indicators: JSON.stringify([{ name: 'RSI', signal: 'Bullish' }, { name: 'MACD', signal: 'Crossover' }]),
    supportResistance: JSON.stringify([{ level: basePrice.toString(), type: 'Support' }]),
    recommendation: isUptrend ? 'Strong buy opportunity' : 'Consider selling',
    notes: 'Look for confirmation before entering trade',
    shareId: `share-${i}`,
    isPublic: true,
    createdAt: new Date(Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)),
    user: {
      id: mockUser.userId,
      username: mockUser.username,
      fullName: mockUser.fullName,
      profileImage: mockUser.profileImage,
    },
    feedbackCounts: {
      likes: Math.floor(Math.random() * 200),
      dislikes: Math.floor(Math.random() * 50),
      saves: Math.floor(Math.random() * 100),
      comments: Math.floor(Math.random() * 20),
    },
    userFeedback: {
      hasLiked: Math.random() > 0.7,
      hasDisliked: Math.random() > 0.85,
      hasSaved: Math.random() > 0.75,
    }
  } as AnalysisWithDetails;
});

export default function SocialHub() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'discover' | 'followers' | 'your-feed'>('discover');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastAction, setLastAction] = useState<'like' | 'dislike' | 'none'>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisWithDetails | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  
  // States for traders tab
  const [traderFilter, setTraderFilter] = useState<'all' | 'following'>('all');
  const [traders, setTraders] = useState<TraderProfile[]>(mockTraders);
  
  // In a real app, we would fetch from the API
  // const { data: analyses, isLoading, error } = useQuery({
  //   queryKey: ['/api/social/analyses'],
  //   queryFn: getQueryFn(),
  // });
  
  const [analyses, setAnalyses] = useState<AnalysisWithDetails[]>(mockAnalyses);
  const isLoading = false;
  const error = null;
  
  const handleLike = () => {
    if (currentIndex >= analyses.length - 1) {
      // No more analyses to show
      toast({
        title: "You've seen all analyses!",
        description: "Check back later for more trading ideas.",
      });
      return;
    }
    
    setLastAction('like');
    
    // Update the feedback on the current analysis
    const updatedAnalyses = [...analyses];
    const current = updatedAnalyses[currentIndex];
    
    if (!current.userFeedback.hasLiked) {
      current.userFeedback.hasLiked = true;
      current.feedbackCounts.likes += 1;
      
      // Remove dislike if it exists
      if (current.userFeedback.hasDisliked) {
        current.userFeedback.hasDisliked = false;
        current.feedbackCounts.dislikes -= 1;
      }
      
      setAnalyses(updatedAnalyses);
      
      // In a real app, send this to the server
      // apiRequest('POST', `/api/social/analyses/${current.id}/feedback`, {
      //   type: 'like',
      // });
    }
    
    // Move to next analysis
    setCurrentIndex(prevIndex => prevIndex + 1);
  };
  
  const handleDislike = () => {
    if (currentIndex >= analyses.length - 1) {
      // No more analyses to show
      toast({
        title: "You've seen all analyses!",
        description: "Check back later for more trading ideas.",
      });
      return;
    }
    
    setLastAction('dislike');
    
    // Update the feedback on the current analysis
    const updatedAnalyses = [...analyses];
    const current = updatedAnalyses[currentIndex];
    
    if (!current.userFeedback.hasDisliked) {
      current.userFeedback.hasDisliked = true;
      current.feedbackCounts.dislikes += 1;
      
      // Remove like if it exists
      if (current.userFeedback.hasLiked) {
        current.userFeedback.hasLiked = false;
        current.feedbackCounts.likes -= 1;
      }
      
      setAnalyses(updatedAnalyses);
      
      // In a real app, send this to the server
      // apiRequest('POST', `/api/social/analyses/${current.id}/feedback`, {
      //   type: 'dislike',
      // });
    }
    
    // Move to next analysis
    setCurrentIndex(prevIndex => prevIndex + 1);
  };
  
  const handleSave = () => {
    const updatedAnalyses = [...analyses];
    const current = updatedAnalyses[currentIndex];
    
    current.userFeedback.hasSaved = !current.userFeedback.hasSaved;
    current.feedbackCounts.saves += current.userFeedback.hasSaved ? 1 : -1;
    
    setAnalyses(updatedAnalyses);
    
    // In a real app, send this to the server
    // apiRequest('POST', `/api/social/analyses/${current.id}/feedback`, {
    //   type: 'save',
    // });
    
    toast({
      title: current.userFeedback.hasSaved ? "Analysis saved" : "Analysis unsaved",
      description: current.userFeedback.hasSaved ? 
        "You can find this analysis in your saved items." : 
        "This analysis has been removed from your saved items.",
    });
  };
  
  const handleInfo = () => {
    setSelectedAnalysis(analyses[currentIndex]);
    setIsDetailModalOpen(true);
  };
  
  const handleFollowTrader = (traderId: number) => {
    const updatedTraders = traders.map(trader => 
      trader.userId === traderId 
        ? { 
            ...trader, 
            isFollowing: !trader.isFollowing,
            followers: trader.isFollowing ? trader.followers - 1 : trader.followers + 1
          }
        : trader
    );
    
    setTraders(updatedTraders);
    
    const action = updatedTraders.find(t => t.userId === traderId)?.isFollowing ? 'followed' : 'unfollowed';
    const traderName = updatedTraders.find(t => t.userId === traderId)?.fullName || 
                      updatedTraders.find(t => t.userId === traderId)?.username;
    
    toast({
      title: `You ${action} ${traderName}`,
      description: action === 'followed' 
        ? "You'll now see their analyses in your feed." 
        : "You'll no longer see their analyses in your feed.",
    });
    
    // In a real app, send this to the server
    // apiRequest('POST', `/api/social/follow`, {
    //   followingId: traderId,
    //   action: action === 'followed' ? 'follow' : 'unfollow'
    // });
  };
  
  const filteredTraders = traders.filter(trader => 
    (traderFilter === 'all' || (traderFilter === 'following' && trader.isFollowing)) &&
    (searchQuery === '' || 
     trader.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
     (trader.fullName && trader.fullName.toLowerCase().includes(searchQuery.toLowerCase())))
  );
  
  const sortedTraders = [...filteredTraders].sort((a, b) => {
    // First sort by following status
    if (a.isFollowing && !b.isFollowing) return -1;
    if (!a.isFollowing && b.isFollowing) return 1;
    
    // Then by trade grade
    return b.tradeGrade - a.tradeGrade;
  });
  
  // Get current analysis
  const currentAnalysis = analyses[currentIndex];
  
  const refreshAnalyses = () => {
    // In a real app, refetch from the API
    // refetch();
    
    // For mock data, just shuffle
    setAnalyses([...analyses].sort(() => Math.random() - 0.5));
    setCurrentIndex(0);
    toast({
      title: "Analyses refreshed",
      description: "New trading ideas have been loaded.",
    });
  };
  
  if (isLoading) {
    return (
      <div className="container max-w-7xl py-8 px-4 mx-auto">
        <div className="flex flex-col items-center justify-center space-y-6">
          <Skeleton className="h-12 w-[250px] rounded-md" />
          <Skeleton className="h-[400px] w-full max-w-md rounded-xl" />
          <div className="flex space-x-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-12 w-12 rounded-full" />
          </div>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="container max-w-7xl py-8 px-4 mx-auto">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="text-2xl font-bold text-red-500">Error loading social feed</div>
          <p className="text-muted-foreground">Please try again later</p>
          <Button onClick={refreshAnalyses}>Retry</Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container max-w-7xl py-6 px-4 mx-auto">
      <header className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            {/* Back button */}
            <div className="flex items-center gap-2 mb-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setLocation('/dashboard')}
                className="flex items-center text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to Dashboard
              </Button>
            </div>
            
            <h1 className="text-3xl font-bold tracking-tight">Social Trading</h1>
            <p className="text-muted-foreground mt-1">
              Discover trading ideas, follow traders, and share your analyses
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAnalyses}
              className="flex items-center"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            
            <Button 
              variant="default" 
              size="sm"
              onClick={() => setLocation('/analysis')}
              className="bg-gradient-to-r from-red-600 to-rose-600"
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share Analysis
            </Button>
          </div>
        </div>
      </header>
      
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="discover">Discover</TabsTrigger>
            <TabsTrigger value="followers">Traders</TabsTrigger>
            <TabsTrigger value="your-feed">Your Feed</TabsTrigger>
          </TabsList>
          
          <div className="hidden md:flex items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder={activeTab === 'followers' ? "Search for traders..." : "Search for analyses..."}
                className="pl-8 w-[250px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
        
        <TabsContent value="discover" className="mt-0">
          <div className="flex flex-col items-center">
            {analyses.length > 0 ? (
              <div className="relative w-full max-w-md h-[550px] mx-auto">
                {currentIndex < analyses.length ? (
                  <>
                    {/* Current card */}
                    <TinderCard
                      analysis={analyses[currentIndex]}
                      onLike={handleLike}
                      onDislike={handleDislike}
                      onInfo={handleInfo}
                      onSave={handleSave}
                    />
                    
                    {/* Preview of next card if available */}
                    {currentIndex < analyses.length - 1 && (
                      <div className="absolute w-full h-full -z-10 scale-[0.98] opacity-70">
                        <Card className="relative w-full h-full overflow-hidden bg-card rounded-2xl shadow-lg">
                          <div className="absolute inset-0 p-0 overflow-hidden">
                            <img 
                              src={analyses[currentIndex + 1].imageUrl} 
                              alt="Next chart"
                              className="object-cover w-full h-full opacity-70 blur-[2px]"
                            />
                          </div>
                        </Card>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Card className="w-full p-8 text-center">
                      <CardHeader>
                        <CardTitle>You've seen all analyses!</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-muted-foreground mb-6">
                          Check back later for more trading ideas or find more traders to follow.
                        </p>
                        <Button onClick={refreshAnalyses}>
                          <RefreshCcw className="mr-2 h-4 w-4" />
                          Refresh Feed
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="text-xl font-semibold mb-2">No analyses found</div>
                <p className="text-muted-foreground mb-6">Follow traders to see their analyses</p>
                <Button onClick={() => setActiveTab('followers')}>Find Traders</Button>
              </div>
            )}
            
            {/* Status indicators */}
            {analyses.length > 0 && currentIndex < analyses.length && (
              <div className="flex flex-col items-center mt-6">
                <div className="flex items-center mb-2">
                  <span className="text-sm text-muted-foreground mr-2">
                    {currentIndex + 1} of {analyses.length}
                  </span>
                  <Progress
                    value={(currentIndex / analyses.length) * 100}
                    className="w-40 h-2"
                  />
                </div>
                
                <div className="flex space-x-2 text-sm text-muted-foreground">
                  <span>Swipe left to pass</span>
                  <span>•</span>
                  <span>Swipe right to like</span>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="followers" className="mt-0">
          <div className="flex justify-between items-center mb-6">
            <div className="space-x-2">
              <Button 
                variant={traderFilter === 'all' ? "default" : "outline"} 
                size="sm"
                onClick={() => setTraderFilter('all')}
              >
                All Traders
              </Button>
              <Button 
                variant={traderFilter === 'following' ? "default" : "outline"} 
                size="sm"
                onClick={() => setTraderFilter('following')}
              >
                Following
              </Button>
            </div>
            
            <div className="md:hidden flex items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search traders..."
                  className="pl-8 w-[180px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
          
          {sortedTraders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedTraders.map(trader => (
                <TopTraderCard
                  key={trader.userId}
                  trader={trader}
                  onFollow={() => handleFollowTrader(trader.userId)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="text-xl font-semibold mb-2">No traders found</div>
              <p className="text-muted-foreground mb-4">Try adjusting your search criteria</p>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="your-feed" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {analyses
              .filter(analysis => {
                const trader = traders.find(t => t.userId === analysis.userId);
                return trader && trader.isFollowing;
              })
              .map(analysis => (
                <Card key={analysis.id} className="overflow-hidden hover:shadow-md transition-all duration-200">
                  <div className="relative aspect-video">
                    <img 
                      src={analysis.imageUrl} 
                      alt={`${analysis.symbol} chart`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                      <div>
                        <Badge className="mb-1">{analysis.symbol}</Badge>
                        <Badge className={cn(
                          "ml-2",
                          analysis.direction.toLowerCase() === 'buy' ? "bg-emerald-500" : "bg-rose-500"
                        )}>
                          {analysis.direction}
                        </Badge>
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-7 w-7 rounded-full bg-black/50 hover:bg-black/70"
                          onClick={() => {
                            setSelectedAnalysis(analysis);
                            setIsDetailModalOpen(true);
                          }}
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          size="icon"
                          className={cn(
                            "h-7 w-7 rounded-full",
                            analysis.userFeedback.hasLiked 
                              ? "bg-blue-500 hover:bg-blue-600" 
                              : "bg-black/50 hover:bg-black/70"
                          )}
                          onClick={() => {
                            const updatedAnalyses = [...analyses];
                            const target = updatedAnalyses.find(a => a.id === analysis.id);
                            if (target) {
                              target.userFeedback.hasLiked = !target.userFeedback.hasLiked;
                              target.feedbackCounts.likes += target.userFeedback.hasLiked ? 1 : -1;
                              setAnalyses(updatedAnalyses);
                            }
                          }}
                        >
                          <ThumbsUp className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <CardHeader className="pb-2 pt-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={analysis.user.profileImage} />
                          <AvatarFallback>
                            {(analysis.user.fullName || analysis.user.username).charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="ml-2">
                          <CardTitle className="text-base">{analysis.user.fullName || analysis.user.username}</CardTitle>
                          <CardDescription className="text-xs">
                            {new Date(analysis.createdAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Entry:</span>
                        <span className="font-medium">{analysis.entryPoint}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target:</span>
                        <span className="font-medium">{analysis.takeProfit}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Stop:</span>
                        <span className="font-medium">{analysis.stopLoss}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">R:R:</span>
                        <span className="font-medium">{analysis.riskRewardRatio || "N/A"}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2 pb-3 flex justify-between text-sm">
                    <div className="flex space-x-4">
                      <div className="flex items-center">
                        <ThumbsUp className={cn(
                          "w-4 h-4 mr-1",
                          analysis.userFeedback.hasLiked ? "text-blue-500" : "text-muted-foreground"
                        )} />
                        <span>{analysis.feedbackCounts.likes}</span>
                      </div>
                      <div className="flex items-center">
                        <MessageSquare className="w-4 h-4 mr-1 text-muted-foreground" />
                        <span>{analysis.feedbackCounts.comments}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => {
                        setSelectedAnalysis(analysis);
                        setIsDetailModalOpen(true);
                      }}
                    >
                      View Details
                    </Button>
                  </CardFooter>
                </Card>
              ))}
          </div>
          
          {analyses.filter(analysis => {
            const trader = traders.find(t => t.userId === analysis.userId);
            return trader && trader.isFollowing;
          }).length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="text-xl font-semibold mb-2">Your feed is empty</div>
              <p className="text-muted-foreground mb-6">Follow traders to see their analyses in your feed</p>
              <Button onClick={() => setActiveTab('followers')}>Find Traders</Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Analysis Detail Modal */}
      {selectedAnalysis && (
        <Dialog open={isDetailModalOpen} onOpenChange={setIsDetailModalOpen}>
          <DialogContent className="sm:max-w-[600px] p-0">
            <div className="relative aspect-video">
              <img 
                src={selectedAnalysis.imageUrl} 
                alt={`${selectedAnalysis.symbol} chart`}
                className="w-full h-full object-cover"
              />
            </div>
            
            <DialogHeader className="px-6 pt-6 pb-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedAnalysis.user.profileImage} />
                    <AvatarFallback>
                      {(selectedAnalysis.user.fullName || selectedAnalysis.user.username).charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="ml-3">
                    <DialogTitle>{selectedAnalysis.user.fullName || selectedAnalysis.user.username}</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      {new Date(selectedAnalysis.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge>{selectedAnalysis.symbol}</Badge>
                  <Badge className={cn(
                    selectedAnalysis.direction.toLowerCase() === 'buy' ? "bg-emerald-500" : "bg-rose-500"
                  )}>
                    {selectedAnalysis.direction.toUpperCase()}
                  </Badge>
                </div>
              </div>
              <Separator className="my-4" />
            </DialogHeader>
            
            <div className="px-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Entry Price</p>
                  <p className="text-lg font-semibold">{selectedAnalysis.entryPoint}</p>
                </div>
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Take Profit</p>
                  <p className="text-lg font-semibold text-emerald-500">{selectedAnalysis.takeProfit}</p>
                </div>
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Stop Loss</p>
                  <p className="text-lg font-semibold text-rose-500">{selectedAnalysis.stopLoss}</p>
                </div>
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Risk/Reward</p>
                  <p className="text-lg font-semibold">{selectedAnalysis.riskRewardRatio || "N/A"}</p>
                </div>
              </div>
              
              {selectedAnalysis.recommendation && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-1">Recommendation</h4>
                  <p className="text-sm p-3 bg-muted/50 rounded-md">{selectedAnalysis.recommendation}</p>
                </div>
              )}
              
              {selectedAnalysis.notes && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-1">Notes</h4>
                  <p className="text-sm p-3 bg-muted/50 rounded-md">{selectedAnalysis.notes}</p>
                </div>
              )}
              
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-1">Patterns Identified</h4>
                <div className="flex flex-wrap gap-2">
                  {JSON.parse(selectedAnalysis.patterns).map((pattern: any, i: number) => (
                    <Badge key={i} variant="outline" className="border-blue-500 text-blue-500">
                      {pattern.name} ({pattern.strength})
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-1">Indicators</h4>
                <div className="flex flex-wrap gap-2">
                  {JSON.parse(selectedAnalysis.indicators).map((indicator: any, i: number) => (
                    <Badge key={i} variant="outline" className="border-purple-500 text-purple-500">
                      {indicator.name} ({indicator.signal})
                    </Badge>
                  ))}
                </div>
              </div>
              
              <div className="flex justify-between mt-6 mb-2">
                <div className="flex space-x-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "flex items-center",
                      selectedAnalysis.userFeedback.hasLiked ? "bg-blue-500 text-white hover:bg-blue-600" : ""
                    )}
                    onClick={() => {
                      const updatedAnalyses = [...analyses];
                      const target = updatedAnalyses.find(a => a.id === selectedAnalysis.id);
                      if (target) {
                        target.userFeedback.hasLiked = !target.userFeedback.hasLiked;
                        target.feedbackCounts.likes += target.userFeedback.hasLiked ? 1 : -1;
                        setAnalyses(updatedAnalyses);
                        setSelectedAnalysis(target);
                      }
                    }}
                  >
                    <ThumbsUp className="mr-1 h-4 w-4" />
                    {selectedAnalysis.userFeedback.hasLiked ? "Liked" : "Like"}
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "flex items-center",
                      selectedAnalysis.userFeedback.hasSaved ? "bg-green-500 text-white hover:bg-green-600" : ""
                    )}
                    onClick={() => {
                      const updatedAnalyses = [...analyses];
                      const target = updatedAnalyses.find(a => a.id === selectedAnalysis.id);
                      if (target) {
                        target.userFeedback.hasSaved = !target.userFeedback.hasSaved;
                        target.feedbackCounts.saves += target.userFeedback.hasSaved ? 1 : -1;
                        setAnalyses(updatedAnalyses);
                        setSelectedAnalysis(target);
                      }
                    }}
                  >
                    {selectedAnalysis.userFeedback.hasSaved ? (
                      <>
                        <Bookmark className="mr-1 h-4 w-4" />
                        Saved
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="mr-1 h-4 w-4" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    const trader = traders.find(t => t.userId === selectedAnalysis.userId);
                    if (trader && !trader.isFollowing) {
                      handleFollowTrader(trader.userId);
                    }
                  }}
                >
                  {traders.find(t => t.userId === selectedAnalysis.userId)?.isFollowing ? (
                    <>
                      <Users className="mr-1 h-4 w-4" />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-1 h-4 w-4" />
                      Follow Trader
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            <DialogFooter className="px-6 py-4">
              <Button 
                variant="default" 
                onClick={() => setIsDetailModalOpen(false)}
                className="w-full"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}