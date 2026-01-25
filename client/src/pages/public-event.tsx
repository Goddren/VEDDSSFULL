import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Clock, Users, User, ChevronRight, Sparkles, CheckCircle, LogIn, Copy, Share2, UserPlus, Play, Video, Eye } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";

interface PublicEventData {
  schedule: {
    id: number;
    title: string;
    description: string;
    startAt: string;
    endAt?: string;
    capacity: number;
    currentAttendees: number;
    status: string;
    shareSlug: string;
    recordingUrl?: string;
    aiAgenda?: {
      overview: string;
      agenda: { time: string; topic: string; description: string }[];
      preparationTips: string[];
      hostingTips: string[];
    };
  };
  event: {
    id: number;
    title: string;
    eventType: string;
    tokenReward: number;
    recordingUrl?: string;
  } | null;
  host: {
    username: string;
    fullName?: string;
  } | null;
}

export default function PublicEventPage() {
  const [, params] = useRoute("/event/:slug");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, loginMutation, registerMutation: authRegisterMutation } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("register");
  const [authForm, setAuthForm] = useState({ username: "", password: "", confirmPassword: "" });
  const [autoRegisterAfterAuth, setAutoRegisterAfterAuth] = useState(false);
  const slug = params?.slug;

  // Check for action=register query param - only show auth form if not logged in
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'register') {
      if (!user) {
        setShowAuthForm(true);
        setAutoRegisterAfterAuth(true);
      } else {
        // User is already logged in, just set auto-register flag
        setAutoRegisterAfterAuth(true);
      }
    }
  }, []);
  
  // Close auth form when user logs in
  useEffect(() => {
    if (user && showAuthForm) {
      setShowAuthForm(false);
    }
  }, [user, showAuthForm]);

  const { data, isLoading, error } = useQuery<PublicEventData>({
    queryKey: ['/api/public/events', slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/events/${slug}`);
      if (!res.ok) throw new Error('Event not found');
      return res.json();
    },
    enabled: !!slug
  });

  const eventRegisterMutation = useMutation({
    mutationFn: async (scheduleId: number) => {
      const res = await apiRequest('POST', `/api/ambassador/community/schedules/${scheduleId}/register`, {});
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Registration failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/public/events', slug] });
      toast({ title: "Registered!", description: "You're signed up for this event." });
      setAutoRegisterAfterAuth(false);
    },
    onError: (err: any) => {
      if (err.message?.includes('Not authenticated')) {
        setShowAuthForm(true);
        setAutoRegisterAfterAuth(true);
        return;
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  // Auto-register after successful auth
  useEffect(() => {
    if (user && autoRegisterAfterAuth && data?.schedule?.id) {
      eventRegisterMutation.mutate(data.schedule.id);
    }
  }, [user, autoRegisterAfterAuth, data?.schedule?.id]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (authTab === "register") {
      if (authForm.password !== authForm.confirmPassword) {
        toast({ title: "Error", description: "Passwords don't match", variant: "destructive" });
        return;
      }
      if (authForm.password.length < 6) {
        toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
        return;
      }
      authRegisterMutation.mutate({ 
        username: authForm.username, 
        password: authForm.password 
      });
    } else {
      loginMutation.mutate({ 
        username: authForm.username, 
        password: authForm.password 
      });
    }
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/event/${slug}?action=register`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link Copied!", description: "Share this link - recipients can register directly!" });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <div className="animate-pulse text-amber-400">Loading event...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center">
        <Card className="bg-gray-900/80 border-red-500/30 max-w-md">
          <CardContent className="p-8 text-center">
            <h2 className="text-xl text-white mb-4">Event Not Found</h2>
            <p className="text-gray-400 mb-6">This event link may be expired or invalid.</p>
            <Button onClick={() => setLocation("/")} variant="outline">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { schedule, event, host } = data;
  const spotsLeft = schedule.capacity - schedule.currentAttendees;
  const isFull = spotsLeft <= 0;
  const eventDate = new Date(schedule.startAt);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Badge variant="outline" className="text-amber-400 border-amber-500/30">
            {event?.eventType?.replace('_', ' ') || 'Community Event'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={copyShareLink}
            className="border-gray-600"
          >
            {copied ? <CheckCircle className="w-4 h-4 mr-2 text-green-400" /> : <Share2 className="w-4 h-4 mr-2" />}
            {copied ? 'Copied!' : 'Share Event'}
          </Button>
        </div>

        <Card className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-amber-500/20 mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl md:text-3xl text-white">{schedule.title}</CardTitle>
            {schedule.description && (
              <CardDescription className="text-gray-300 text-lg mt-2">
                {schedule.description}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-4">
                <Calendar className="w-6 h-6 text-blue-400" />
                <div>
                  <p className="text-xs text-gray-400">Date</p>
                  <p className="text-white font-medium">{format(eventDate, 'PPP')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-4">
                <Clock className="w-6 h-6 text-green-400" />
                <div>
                  <p className="text-xs text-gray-400">Time</p>
                  <p className="text-white font-medium">{format(eventDate, 'p')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-4">
                <Users className="w-6 h-6 text-purple-400" />
                <div>
                  <p className="text-xs text-gray-400">Spots</p>
                  <p className={`font-medium ${isFull ? 'text-red-400' : 'text-white'}`}>
                    {isFull ? 'Full' : `${spotsLeft} remaining`}
                  </p>
                </div>
              </div>
            </div>

            {host && (
              <div className="flex items-center gap-3 bg-amber-900/20 border border-amber-500/20 rounded-lg p-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-amber-400">Hosted by</p>
                  <p className="text-white font-medium">{host.fullName || host.username}</p>
                </div>
              </div>
            )}

            {event?.tokenReward && (
              <div className="flex items-center gap-2 text-green-400">
                <Sparkles className="w-5 h-5" />
                <span>Earn {event.tokenReward} tokens by attending!</span>
              </div>
            )}
          </CardContent>
        </Card>

        {schedule.aiAgenda && (
          <Card className="bg-gray-800/50 border-blue-500/20 mb-6">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400" />
                Session Agenda
              </CardTitle>
              {schedule.aiAgenda.overview && (
                <CardDescription className="text-gray-300">
                  {schedule.aiAgenda.overview}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {schedule.aiAgenda.agenda?.map((item, idx) => (
                  <div key={idx} className="flex gap-4 bg-gray-900/50 rounded-lg p-4">
                    <div className="text-blue-400 font-mono text-sm whitespace-nowrap">{item.time}</div>
                    <div className="flex-1">
                      <p className="text-white font-medium">{item.topic}</p>
                      <p className="text-sm text-gray-400">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recording Section */}
        {(schedule.recordingUrl || event?.recordingUrl) && (
          <Card className="bg-gradient-to-br from-purple-900/30 to-pink-900/20 border-purple-500/30 mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-purple-400" />
                Watch Recording
              </CardTitle>
              <CardDescription>This event has a recording available</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                asChild
              >
                <a href={schedule.recordingUrl || event?.recordingUrl} target="_blank" rel="noopener noreferrer">
                  <Play className="w-5 h-5 mr-2" />
                  Watch Now
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Inline Auth Form */}
        {showAuthForm && !user && (
          <Card className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 border-amber-500/30 mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" />
                Join & Register for This Event
              </CardTitle>
              <CardDescription>Create an account or sign in to register for this event</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={authTab} onValueChange={(v) => setAuthTab(v as "login" | "register")}>
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="register">Create Account</TabsTrigger>
                  <TabsTrigger value="login">Sign In</TabsTrigger>
                </TabsList>
                
                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={authForm.username}
                      onChange={(e) => setAuthForm(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="Choose a username"
                      className="mt-1.5"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={authForm.password}
                      onChange={(e) => setAuthForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Enter your password"
                      className="mt-1.5"
                      required
                    />
                  </div>
                  {authTab === "register" && (
                    <div>
                      <Label htmlFor="confirmPassword">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={authForm.confirmPassword}
                        onChange={(e) => setAuthForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Confirm your password"
                        className="mt-1.5"
                        required
                      />
                    </div>
                  )}
                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                    disabled={authRegisterMutation.isPending || loginMutation.isPending}
                  >
                    {(authRegisterMutation.isPending || loginMutation.isPending) ? (
                      "Processing..."
                    ) : authTab === "register" ? (
                      <>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Create Account & Register
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4 mr-2" />
                        Sign In & Register
                      </>
                    )}
                  </Button>
                </form>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Fixed Bottom Bar */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-900 to-transparent">
          <div className="max-w-4xl mx-auto flex gap-3">
            {user ? (
              <Button
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-lg py-6"
                onClick={() => eventRegisterMutation.mutate(schedule.id)}
                disabled={isFull || eventRegisterMutation.isPending}
              >
                {eventRegisterMutation.isPending ? (
                  "Registering..."
                ) : isFull ? (
                  "Event Full"
                ) : (
                  <>
                    Register Now
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-lg py-6"
                onClick={() => setShowAuthForm(true)}
              >
                <UserPlus className="w-5 h-5 mr-2" />
                Join & Register
              </Button>
            )}
            {(schedule.recordingUrl || event?.recordingUrl) && (
              <Button
                variant="outline"
                className="py-6 border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                asChild
              >
                <a href={schedule.recordingUrl || event?.recordingUrl} target="_blank" rel="noopener noreferrer">
                  <Eye className="w-5 h-5 mr-2" />
                  Watch
                </a>
              </Button>
            )}
          </div>
        </div>

        <div className="h-28" />
      </div>
    </div>
  );
}
