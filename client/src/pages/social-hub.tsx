import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  Users, 
  Share2, 
  MessageSquare, 
  Globe, 
  Copy, 
  ExternalLink,
  UserPlus,
  Filter,
  Search,
  TrendingUp,
  Award,
  Bookmark
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

// Mock data types
type TradingNetwork = {
  id: string;
  name: string;
  icon: string;
  url: string;
  connected: boolean;
  username?: string;
  followerCount?: number;
  description: string;
};

type Trader = {
  id: string;
  name: string;
  avatar: string;
  network: string;
  networkIcon: string;
  winRate: number;
  followers: number;
  isFollowing: boolean;
  tradingPairs: string[];
  verified: boolean;
};

type TradeIdea = {
  id: string;
  traderId: string;
  traderName: string;
  traderAvatar: string;
  network: string;
  networkIcon: string;
  symbol: string;
  direction: 'buy' | 'sell';
  entryPrice: string;
  targetPrice: string;
  stopLoss: string;
  timestamp: number;
  likes: number;
  comments: number;
  liked: boolean;
  saved: boolean;
};

// Mock data
const TRADING_NETWORKS: TradingNetwork[] = [
  {
    id: 'tradingview',
    name: 'TradingView',
    icon: 'https://s3.tradingview.com/userpics/6171439-Zjt5.png',
    url: 'https://www.tradingview.com/',
    connected: false,
    description: 'Connect to TradingView to follow traders and import ideas'
  },
  {
    id: 'metatrader',
    name: 'MetaTrader',
    icon: 'https://play-lh.googleusercontent.com/f_VSjzwAJDO9oPYgwJlCb_icZ9HVbHsJv8QIu-wYr9QpzA-UxFpiV_yXznk7XQXgqw',
    url: 'https://www.metatrader5.com/',
    connected: true,
    username: 'trader_pro89',
    followerCount: 245,
    description: 'Import signals from MetaTrader and share your analyses'
  },
  {
    id: 'discord',
    name: 'Discord',
    icon: 'https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png',
    url: 'https://discord.com/',
    connected: false,
    description: 'Connect to trading Discord servers for community insights'
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/2048px-Telegram_logo.svg.png',
    url: 'https://telegram.org/',
    connected: true,
    username: '@tradingpro',
    followerCount: 89,
    description: 'Import signals from Telegram channels and trading groups'
  }
];

const POPULAR_TRADERS: Trader[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    network: 'TradingView',
    networkIcon: 'https://s3.tradingview.com/userpics/6171439-Zjt5.png',
    winRate: 78,
    followers: 12453,
    isFollowing: true,
    tradingPairs: ['EURUSD', 'GBPUSD', 'BTCUSD'],
    verified: true
  },
  {
    id: '2',
    name: 'Michael Chen',
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    network: 'MetaTrader',
    networkIcon: 'https://play-lh.googleusercontent.com/f_VSjzwAJDO9oPYgwJlCb_icZ9HVbHsJv8QIu-wYr9QpzA-UxFpiV_yXznk7XQXgqw',
    winRate: 83,
    followers: 8721,
    isFollowing: false,
    tradingPairs: ['BTCUSD', 'ETHUSD', 'XRPUSD'],
    verified: true
  },
  {
    id: '3',
    name: 'Emma Wilson',
    avatar: 'https://randomuser.me/api/portraits/women/63.jpg',
    network: 'Telegram',
    networkIcon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/2048px-Telegram_logo.svg.png',
    winRate: 72,
    followers: 5239,
    isFollowing: false,
    tradingPairs: ['USDJPY', 'AUDUSD', 'USDCHF'],
    verified: false
  },
  {
    id: '4',
    name: 'David Rodriguez',
    avatar: 'https://randomuser.me/api/portraits/men/21.jpg',
    network: 'TradingView',
    networkIcon: 'https://s3.tradingview.com/userpics/6171439-Zjt5.png',
    winRate: 68,
    followers: 3980,
    isFollowing: true,
    tradingPairs: ['USDCAD', 'EURJPY', 'GBPUSD'],
    verified: true
  }
];

const TRADE_IDEAS: TradeIdea[] = [
  {
    id: '1',
    traderId: '1',
    traderName: 'Sarah Johnson',
    traderAvatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    network: 'TradingView',
    networkIcon: 'https://s3.tradingview.com/userpics/6171439-Zjt5.png',
    symbol: 'EURUSD',
    direction: 'buy',
    entryPrice: '1.0850',
    targetPrice: '1.0950',
    stopLoss: '1.0810',
    timestamp: Date.now() - 3600000 * 2,
    likes: 124,
    comments: 47,
    liked: true,
    saved: false
  },
  {
    id: '2',
    traderId: '2',
    traderName: 'Michael Chen',
    traderAvatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    network: 'MetaTrader',
    networkIcon: 'https://play-lh.googleusercontent.com/f_VSjzwAJDO9oPYgwJlCb_icZ9HVbHsJv8QIu-wYr9QpzA-UxFpiV_yXznk7XQXgqw',
    symbol: 'BTCUSD',
    direction: 'sell',
    entryPrice: '28750',
    targetPrice: '28000',
    stopLoss: '29200',
    timestamp: Date.now() - 3600000 * 8,
    likes: 236,
    comments: 89,
    liked: false,
    saved: true
  },
  {
    id: '3',
    traderId: '3',
    traderName: 'Emma Wilson',
    traderAvatar: 'https://randomuser.me/api/portraits/women/63.jpg',
    network: 'Telegram',
    networkIcon: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/2048px-Telegram_logo.svg.png',
    symbol: 'USDJPY',
    direction: 'buy',
    entryPrice: '146.20',
    targetPrice: '147.40',
    stopLoss: '145.50',
    timestamp: Date.now() - 3600000 * 24,
    likes: 93,
    comments: 31,
    liked: false,
    saved: false
  }
];

export default function SocialHub() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('networks');
  const [searchQuery, setSearchQuery] = useState('');
  const [traderFilter, setTraderFilter] = useState<'all' | 'following'>('all');
  const [ideaFilter, setIdeaFilter] = useState<'all' | 'saved'>('all');
  
  // Network connection states
  const [networks, setNetworks] = useState<TradingNetwork[]>(TRADING_NETWORKS);
  const [traders, setTraders] = useState<Trader[]>(POPULAR_TRADERS);
  const [tradeIdeas, setTradeIdeas] = useState<TradeIdea[]>(TRADE_IDEAS);

  // Connect/disconnect network handler
  const toggleNetworkConnection = (networkId: string) => {
    setNetworks(networks.map(network => 
      network.id === networkId 
        ? {...network, connected: !network.connected} 
        : network
    ));
  };

  // Follow/unfollow trader handler
  const toggleFollowTrader = (traderId: string) => {
    setTraders(traders.map(trader => 
      trader.id === traderId 
        ? {...trader, isFollowing: !trader.isFollowing} 
        : trader
    ));
  };

  // Like/unlike trade idea handler
  const toggleLikeIdea = (ideaId: string) => {
    setTradeIdeas(tradeIdeas.map(idea => {
      if (idea.id !== ideaId) return idea;
      return {
        ...idea,
        liked: !idea.liked,
        likes: idea.liked ? idea.likes - 1 : idea.likes + 1
      };
    }));
  };

  // Save/unsave trade idea handler
  const toggleSaveIdea = (ideaId: string) => {
    setTradeIdeas(tradeIdeas.map(idea => {
      if (idea.id !== ideaId) return idea;
      return {
        ...idea,
        saved: !idea.saved
      };
    }));
  };

  // Format timestamp
  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return new Date(timestamp).toLocaleDateString();
  };

  const filteredTraders = traders.filter(trader => 
    (traderFilter === 'all' || (traderFilter === 'following' && trader.isFollowing)) &&
    (trader.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
     trader.tradingPairs.some(pair => pair.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const filteredIdeas = tradeIdeas.filter(idea => 
    (ideaFilter === 'all' || (ideaFilter === 'saved' && idea.saved)) &&
    (idea.traderName.toLowerCase().includes(searchQuery.toLowerCase()) || 
     idea.symbol.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Social Trading Hub</h1>
            <p className="text-gray-400 mt-1">
              Connect with trading networks, follow top traders, and discover trade ideas
            </p>
          </div>
          <div className="hidden md:flex space-x-2">
            <Button variant="outline" className="flex items-center">
              <Share2 className="mr-2 h-4 w-4" />
              Share Your Analysis
            </Button>
            <Button variant="default" className="bg-gradient-to-r from-red-600 to-rose-600">
              <UserPlus className="mr-2 h-4 w-4" />
              Find Connections
            </Button>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between mb-6">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            placeholder="Search networks, traders, or trading pairs..."
            className="pl-10 bg-background text-foreground"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="ml-4 flex items-center space-x-2 md:space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center">
                <Filter className="mr-2 h-4 w-4" />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Trader Filters</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setTraderFilter('all')}>
                All Traders
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTraderFilter('following')}>
                Following
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Idea Filters</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setIdeaFilter('all')}>
                All Ideas
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIdeaFilter('saved')}>
                Saved Ideas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 max-w-md mx-auto">
          <TabsTrigger value="networks" className="flex items-center">
            <Globe className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline-block">Networks</span>
          </TabsTrigger>
          <TabsTrigger value="traders" className="flex items-center">
            <Users className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline-block">Top Traders</span>
          </TabsTrigger>
          <TabsTrigger value="ideas" className="flex items-center">
            <MessageSquare className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline-block">Trade Ideas</span>
          </TabsTrigger>
        </TabsList>

        {/* Networks Tab */}
        <TabsContent value="networks" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {networks.map((network) => (
              <Card key={network.id} className="overflow-hidden bg-card border-border hover:border-primary/50 transition-all duration-200">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <img 
                        src={network.icon} 
                        alt={network.name} 
                        className="w-10 h-10 mr-3 rounded-full object-contain" 
                      />
                      <div>
                        <h3 className="font-semibold text-card-foreground">{network.name}</h3>
                        {network.connected && network.username && (
                          <p className="text-xs text-muted-foreground">{network.username}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant={network.connected ? "default" : "outline"} className={network.connected ? "bg-green-600" : ""}>
                      {network.connected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-card-foreground/80 mb-4">{network.description}</p>
                  
                  {network.connected && network.followerCount && (
                    <div className="flex items-center mb-4 text-sm text-muted-foreground">
                      <Users className="h-4 w-4 mr-1" />
                      <span>{network.followerCount} followers</span>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <Button
                      variant={network.connected ? "destructive" : "default"}
                      size="sm"
                      onClick={() => toggleNetworkConnection(network.id)}
                      className={cn(
                        "transition-all duration-300",
                        network.connected ? "hover:bg-red-700" : "hover:bg-emerald-700"
                      )}
                    >
                      {network.connected ? "Disconnect" : "Connect"}
                    </Button>
                    
                    <a 
                      href={network.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary flex items-center hover:underline"
                    >
                      Visit <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Traders Tab */}
        <TabsContent value="traders" className="space-y-4">
          <div className="flex justify-between mb-4">
            <div className="space-x-2">
              <Button 
                variant={traderFilter === 'all' ? "default" : "outline"} 
                size="sm"
                onClick={() => setTraderFilter('all')}
                className={traderFilter === 'all' ? "bg-primary" : ""}
              >
                All Traders
              </Button>
              <Button 
                variant={traderFilter === 'following' ? "default" : "outline"} 
                size="sm"
                onClick={() => setTraderFilter('following')}
                className={traderFilter === 'following' ? "bg-primary" : ""}
              >
                Following
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTraders.length > 0 ? (
              filteredTraders.map((trader) => (
                <Card key={trader.id} className="overflow-hidden bg-card border-border hover:border-primary/50 transition-all duration-200">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <Avatar className="mr-3 h-12 w-12 border-2 border-background">
                          <AvatarImage src={trader.avatar} alt={trader.name} />
                          <AvatarFallback>{trader.name.substring(0, 2)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center">
                            <h3 className="font-semibold text-card-foreground">{trader.name}</h3>
                            {trader.verified && (
                              <Badge className="ml-2 bg-blue-600 h-5 px-1">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                  <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                                </svg>
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center mt-1">
                            <img 
                              src={trader.networkIcon} 
                              alt={trader.network} 
                              className="w-4 h-4 mr-1 rounded-full" 
                            />
                            <span className="text-xs text-muted-foreground">{trader.network}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-background/50 rounded-md p-2 text-center">
                        <div className="text-lg font-semibold">{trader.winRate}%</div>
                        <div className="text-xs text-muted-foreground">Win Rate</div>
                      </div>
                      <div className="bg-background/50 rounded-md p-2 text-center">
                        <div className="text-lg font-semibold">{trader.followers.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Followers</div>
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <div className="text-sm text-muted-foreground mb-2">Trading Pairs</div>
                      <div className="flex flex-wrap gap-2">
                        {trader.tradingPairs.map((pair) => (
                          <Badge key={pair} variant="outline" className="bg-background/80">
                            {pair}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Button
                        variant={trader.isFollowing ? "outline" : "default"}
                        size="sm"
                        onClick={() => toggleFollowTrader(trader.id)}
                        className={trader.isFollowing ? "border-primary text-primary" : ""}
                      >
                        {trader.isFollowing ? "Following" : "Follow"}
                      </Button>
                      
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/profile/${trader.id}`}>View Profile</Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="col-span-3 flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No traders found</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  {traderFilter === 'following' 
                    ? "You're not following any traders yet. Explore top traders and follow them to see their updates here."
                    : "No traders match your search criteria. Try adjusting your search terms."}
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Trade Ideas Tab */}
        <TabsContent value="ideas" className="space-y-4">
          <div className="flex justify-between mb-4">
            <div className="space-x-2">
              <Button 
                variant={ideaFilter === 'all' ? "default" : "outline"} 
                size="sm"
                onClick={() => setIdeaFilter('all')}
                className={ideaFilter === 'all' ? "bg-primary" : ""}
              >
                All Ideas
              </Button>
              <Button 
                variant={ideaFilter === 'saved' ? "default" : "outline"} 
                size="sm"
                onClick={() => setIdeaFilter('saved')}
                className={ideaFilter === 'saved' ? "bg-primary" : ""}
              >
                Saved
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
            {filteredIdeas.length > 0 ? (
              filteredIdeas.map((idea) => (
                <Card key={idea.id} className="overflow-hidden bg-card border-border hover:border-primary/50 transition-all duration-300">
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <Avatar className="mr-3 h-10 w-10 border-2 border-background">
                          <AvatarImage src={idea.traderAvatar} alt={idea.traderName} />
                          <AvatarFallback>{idea.traderName.substring(0, 2)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center">
                            <h3 className="font-medium text-card-foreground">{idea.traderName}</h3>
                          </div>
                          <div className="flex items-center">
                            <img 
                              src={idea.networkIcon} 
                              alt={idea.network} 
                              className="w-3 h-3 mr-1 rounded-full" 
                            />
                            <span className="text-xs text-muted-foreground">{idea.network}</span>
                            <span className="mx-1 text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">{formatTimestamp(idea.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                      <Badge 
                        className={cn(
                          "px-2 py-0.5",
                          idea.direction === 'buy' ? "bg-emerald-600" : "bg-red-600"
                        )}
                      >
                        {idea.direction === 'buy' ? 'BUY' : 'SELL'}
                      </Badge>
                    </div>
                    
                    <div className="bg-background/50 rounded-lg p-4 mb-4">
                      <div className="flex justify-between mb-3">
                        <div className="font-bold text-xl text-card-foreground">{idea.symbol}</div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 rounded-full"
                          onClick={() => toggleSaveIdea(idea.id)}
                        >
                          <Bookmark 
                            className={cn(
                              "h-4 w-4",
                              idea.saved ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"
                            )} 
                          />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Entry</div>
                          <div className={cn(
                            "font-semibold",
                            idea.direction === 'buy' ? "text-emerald-500" : "text-red-500"
                          )}>
                            {idea.entryPrice}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Target</div>
                          <div className="font-semibold text-primary">{idea.targetPrice}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Stop</div>
                          <div className="font-semibold text-destructive">{idea.stopLoss}</div>
                        </div>
                      </div>
                      
                      {/* Trade direction indicator */}
                      <div className="relative h-2 bg-muted rounded-full overflow-hidden mt-4">
                        <div 
                          className={cn(
                            "absolute h-full",
                            idea.direction === 'buy' ? "bg-emerald-500" : "bg-red-500"
                          )}
                          style={{ 
                            left: idea.direction === 'buy' ? '0' : 'auto',
                            right: idea.direction === 'sell' ? '0' : 'auto',
                            width: '40%'
                          }}
                        ></div>
                        <div 
                          className="absolute h-4 w-0.5 bg-white top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2"
                        ></div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex items-center space-x-1 text-muted-foreground hover:text-primary"
                          onClick={() => toggleLikeIdea(idea.id)}
                        >
                          <TrendingUp className={cn(
                            "h-4 w-4",
                            idea.liked ? "text-primary fill-primary" : ""
                          )} />
                          <span>{idea.likes}</span>
                        </Button>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex items-center space-x-1 text-muted-foreground hover:text-primary"
                          asChild
                        >
                          <Link href={`/trade-idea/${idea.id}`}>
                            <MessageSquare className="h-4 w-4" />
                            <span>{idea.comments}</span>
                          </Link>
                        </Button>
                      </div>
                      
                      <Button variant="ghost" size="sm" className="text-muted-foreground">
                        <Copy className="h-4 w-4 mr-1" />
                        <span className="hidden sm:inline-block">Copy</span>
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="col-span-2 flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No trade ideas found</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  {ideaFilter === 'saved' 
                    ? "You haven't saved any trade ideas yet. Browse ideas from top traders and save them to view here."
                    : "No trade ideas match your search criteria. Try adjusting your search terms."}
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}