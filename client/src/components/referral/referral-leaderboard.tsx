import React from 'react';
import { Trophy, Users, Medal, Award, Gift, Crown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';

interface LeaderboardEntry {
  username: string;
  referrals: number;
  position?: number;
}

interface ReferralLeaderboardProps {
  className?: string;
  preview?: boolean;
}

export function ReferralLeaderboard({ className = '', preview = false }: ReferralLeaderboardProps) {
  const { toast } = useToast();
  
  // Referral system is now active
  preview = false;
  
  // Mock leaderboard data for preview
  const mockLeaderboard: LeaderboardEntry[] = [
    { username: 'trader1', referrals: 15, position: 1 },
    { username: 'cryptoqueen', referrals: 12, position: 2 },
    { username: 'forexmaster', referrals: 10, position: 3 },
    { username: 'investorpro', referrals: 8, position: 4 },
    { username: 'wallstreetbets', referrals: 5, position: 5 }
  ];

  const getAvatarFallback = (username: string) => {
    return username.substring(0, 2).toUpperCase();
  };
  
  const getPositionBadge = (position: number) => {
    switch (position) {
      case 1:
        return (
          <div className="flex items-center">
            <Crown className="h-5 w-5 mr-1 text-amber-400" />
            <span className="font-bold text-amber-400">1st</span>
          </div>
        );
      case 2:
        return (
          <div className="flex items-center">
            <Medal className="h-5 w-5 mr-1 text-gray-400" />
            <span className="font-bold text-gray-400">2nd</span>
          </div>
        );
      case 3:
        return (
          <div className="flex items-center">
            <Award className="h-5 w-5 mr-1 text-amber-600" />
            <span className="font-bold text-amber-600">3rd</span>
          </div>
        );
      default:
        return <span className="font-semibold">{position}th</span>;
    }
  };

  const handleViewProfile = (username: string) => {
    if (preview) {
      toast({
        title: "Coming Soon!",
        description: "Our referral program will be available soon.",
      });
      return;
    }
    
    // Navigate to user profile - will be implemented when feature is live
    toast({
      title: "Profile View",
      description: `Viewing ${username}'s profile`,
    });
  };

  if (preview) {
    return (
      <Card className={`${className} relative overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/30 to-purple-600/30 z-0" />
        <div className="absolute top-0 right-0 bg-gradient-to-bl from-pink-500 to-purple-600 text-white px-4 py-1 rounded-bl-lg font-bold text-xs z-10">
          COMING SOON
        </div>
        <CardHeader className="relative z-10">
          <CardTitle className="flex items-center text-xl">
            <Trophy className="h-5 w-5 mr-2 text-amber-500" /> Referral Leaderboard
          </CardTitle>
          <CardDescription>
            Top traders with the most successful referrals
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10">
          <div className="space-y-4">
            {mockLeaderboard.slice(0, 3).map((entry) => (
              <div key={entry.username} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  {getPositionBadge(entry.position!)}
                  <Avatar>
                    <AvatarFallback>{getAvatarFallback(entry.username)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{entry.username}</p>
                    <p className="text-xs text-muted-foreground">{entry.referrals} referrals</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled>View</Button>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="relative z-10 flex justify-center">
          <Button variant="outline" disabled>
            <Users className="h-4 w-4 mr-2" /> See Full Leaderboard
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Trophy className="h-5 w-5 mr-2 text-amber-500" /> Referral Leaderboard
        </CardTitle>
        <CardDescription>
          Top traders with the most successful referrals this month
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="monthly">
          <TabsList className="mb-4">
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="alltime">All Time</TabsTrigger>
          </TabsList>
          
          <TabsContent value="monthly" className="space-y-4">
            {mockLeaderboard.map((entry) => (
              <div key={entry.username} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  {getPositionBadge(entry.position!)}
                  <Avatar>
                    <AvatarFallback>{getAvatarFallback(entry.username)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{entry.username}</p>
                    <div className="flex items-center">
                      <Gift className="h-3.5 w-3.5 mr-1 text-amber-500" />
                      <p className="text-xs">{entry.referrals} referrals</p>
                    </div>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleViewProfile(entry.username)}
                >
                  View
                </Button>
              </div>
            ))}
          </TabsContent>
          
          <TabsContent value="alltime" className="space-y-4">
            {mockLeaderboard.map((entry) => (
              <div key={entry.username} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  {getPositionBadge(entry.position!)}
                  <Avatar>
                    <AvatarFallback>{getAvatarFallback(entry.username)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{entry.username}</p>
                    <div className="flex items-center">
                      <Gift className="h-3.5 w-3.5 mr-1 text-amber-500" />
                      <p className="text-xs">{entry.referrals * 2} referrals</p> {/* Double for all-time */}
                    </div>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleViewProfile(entry.username)}
                >
                  View
                </Button>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="text-xs text-muted-foreground">
          Leaderboard updates daily at 00:00 UTC
        </div>
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-300">
          <Trophy className="h-3 w-3 mr-1" /> Top 10
        </Badge>
      </CardFooter>
    </Card>
  );
}

export default ReferralLeaderboard;