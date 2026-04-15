import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Link2, Copy, Check, QrCode, Users, TrendingUp, Bell, Gift,
  Star, RefreshCw, ExternalLink, Share2, ChevronRight, Trophy,
  UserCheck, CreditCard, Clock
} from "lucide-react";

export default function ReferralHubPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const { data: linkData, isLoading: linkLoading } = useQuery({
    queryKey: ["/api/referral/my-link"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/referral/my-link");
      return res.json();
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/referral/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/referral/stats");
      return res.json();
    },
  });

  const { data: leaderboard } = useQuery({
    queryKey: ["/api/referral/leaderboard"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/referral/leaderboard");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const remindMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/referral/remind");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: `${data.reminded} reminder(s) sent`,
        description: "Non-subscribed signups have been notified.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/referral/stats"] });
    },
    onError: () => {
      toast({ title: "Failed to send reminders", variant: "destructive" });
    },
  });

  const copyLink = () => {
    if (!linkData?.url) return;
    navigator.clipboard.writeText(linkData.url);
    setCopiedLink(true);
    toast({ title: "Referral link copied!", description: "Share it anywhere to earn credits." });
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const copyCode = () => {
    if (!linkData?.code) return;
    navigator.clipboard.writeText(linkData.code);
    setCopiedCode(true);
    toast({ title: "Referral code copied!" });
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const shareLink = async () => {
    if (navigator.share && linkData?.url) {
      try {
        await navigator.share({
          title: "Join VEDD AI Trading",
          text: "I use VEDD AI for trading signals & analysis. Try it free!",
          url: linkData.url,
        });
      } catch {}
    } else {
      copyLink();
    }
  };

  const statCards = [
    { label: "Total Clicks", value: stats?.totalClicks ?? 0, icon: Link2, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Signed Up", value: stats?.signedUp ?? 0, icon: UserCheck, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "Subscribed", value: stats?.subscribed ?? 0, icon: CreditCard, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Not Subscribed", value: stats?.notSubscribed ?? 0, icon: Clock, color: "text-orange-400", bg: "bg-orange-500/10" },
  ];

  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Gift className="w-6 h-6 text-amber-400" />
          <h1 className="text-2xl font-bold">Referral Hub</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Share your link, track who joins, and earn credits for every successful referral.
        </p>
      </div>

      {/* Your Referral Link Card */}
      <Card className="mb-6 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4 text-amber-400" />
            Your Referral Link
          </CardTitle>
          <CardDescription>Every click, signup, and subscription is tracked automatically</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {linkLoading ? (
            <div className="h-10 bg-muted animate-pulse rounded" />
          ) : (
            <>
              {/* Full URL */}
              <div className="flex gap-2">
                <Input
                  value={linkData?.url || ""}
                  readOnly
                  className="font-mono text-sm bg-background/60"
                />
                <Button size="icon" variant="outline" onClick={copyLink} className="shrink-0">
                  {copiedLink ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button size="icon" variant="outline" onClick={shareLink} className="shrink-0">
                  <Share2 className="w-4 h-4" />
                </Button>
              </div>

              {/* Code + Short URL */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Your Code</p>
                  <div className="flex items-center gap-2">
                    <code className="text-lg font-bold tracking-wider text-amber-400">{linkData?.code}</code>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyCode}>
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">Short Link</p>
                  <p className="text-sm font-mono text-blue-400 truncate">{linkData?.shortUrl}</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" className="bg-amber-500 hover:bg-amber-400 text-black gap-2" onClick={copyLink}>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Link
                </Button>
                <Button size="sm" variant="outline" className="gap-2" onClick={shareLink}>
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => window.open(linkData?.url, '_blank')}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Preview
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {statCards.map((card) => (
          <Card key={card.label} className="border-border/50">
            <CardContent className="p-4">
              <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${card.bg} mb-2`}>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <p className="text-2xl font-bold">
                {statsLoading ? <span className="h-7 w-10 bg-muted animate-pulse rounded inline-block" /> : card.value}
              </p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="how-it-works">How It Works</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Conversion funnel */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  Conversion Funnel
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "Link Clicks", value: stats?.totalClicks ?? 0, color: "bg-blue-500" },
                  { label: "Signed Up", value: stats?.signedUp ?? 0, color: "bg-green-500" },
                  { label: "Subscribed", value: stats?.subscribed ?? 0, color: "bg-amber-500" },
                ].map((step, i) => {
                  const pct = i === 0 ? 100 : stats?.totalClicks ? Math.round((step.value / stats.totalClicks) * 100) : 0;
                  return (
                    <div key={step.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span>{step.label}</span>
                        <span className="font-bold">{step.value} <span className="text-muted-foreground font-normal">({pct}%)</span></span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${step.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Credits earned */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  Credits Earned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-amber-400 mb-1">{user?.referralCredits ?? 0}</p>
                <p className="text-xs text-muted-foreground mb-4">Total referral credits balance</p>
                <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span>Per signup</span>
                    <span className="font-semibold text-green-400">+100 credits</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Per subscription</span>
                    <span className="font-semibold text-amber-400">+500 credits</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bonus (5+ referrals)</span>
                    <span className="font-semibold text-purple-400">+1,000 credits</span>
                  </div>
                </div>
                <Button size="sm" className="w-full mt-3" variant="outline" onClick={() => window.location.href = '/subscription'}>
                  Redeem Credits <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Reminders Tab */}
        <TabsContent value="reminders">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Bell className="w-4 h-4 text-orange-400" />
                Non-Subscriber Reminders
              </CardTitle>
              <CardDescription>
                {stats?.notSubscribed ?? 0} people signed up through your link but haven't subscribed yet.
                Send them a friendly reminder to upgrade.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(stats?.notSubscribed ?? 0) === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No non-subscribed users yet.</p>
                  <p className="text-xs mt-1">Share your link to start tracking referrals.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <Bell className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">
                          {stats?.pendingReminder ?? 0} reminder(s) ready to send
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          We'll send a reminder notification to users who signed up via your link
                          but haven't subscribed yet. Reminders already sent won't be duplicated.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-muted/40 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-orange-400">{stats?.notSubscribed ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Not Subscribed</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-3 text-center">
                      <p className="text-2xl font-bold text-green-400">{(stats?.signedUp ?? 0) - (stats?.pendingReminder ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">Reminders Sent</p>
                    </div>
                  </div>

                  <Button
                    className="w-full gap-2 bg-orange-500 hover:bg-orange-400 text-white"
                    onClick={() => remindMutation.mutate()}
                    disabled={remindMutation.isPending || (stats?.pendingReminder ?? 0) === 0}
                  >
                    {remindMutation.isPending ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                    Send Reminders ({stats?.pendingReminder ?? 0} pending)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* How It Works Tab */}
        <TabsContent value="how-it-works">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {[
                {
                  step: "1",
                  title: "Share Your Link",
                  desc: "Copy your unique referral link and share it on social media, DMs, or anywhere your audience is. Use the short link for cleaner posts.",
                  icon: Share2, color: "bg-blue-500/20 text-blue-400",
                },
                {
                  step: "2",
                  title: "They Click & Sign Up",
                  desc: "Every click is tracked. When they create an account using your link, they're tagged as your referral and you earn 100 credits.",
                  icon: UserCheck, color: "bg-green-500/20 text-green-400",
                },
                {
                  step: "3",
                  title: "They Subscribe = You Earn",
                  desc: "When your referral upgrades to a paid plan, you earn 500 credits. Stack referrals to unlock bonus multipliers.",
                  icon: CreditCard, color: "bg-amber-500/20 text-amber-400",
                },
                {
                  step: "4",
                  title: "Send Reminders",
                  desc: "Track who hasn't subscribed yet and send a reminder with one click. This nudge converts non-subscribers into paying members.",
                  icon: Bell, color: "bg-orange-500/20 text-orange-400",
                },
                {
                  step: "5",
                  title: "Redeem Credits",
                  desc: "Use your accumulated credits to pay for your own subscription or unlock premium VEDD features.",
                  icon: Gift, color: "bg-purple-500/20 text-purple-400",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${item.color}`}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
