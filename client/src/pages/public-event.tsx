import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, User, ChevronRight, Sparkles, CheckCircle, LogIn, Copy, Share2 } from "lucide-react";
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
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const slug = params?.slug;

  const { data, isLoading, error } = useQuery<PublicEventData>({
    queryKey: ['/api/public/events', slug],
    queryFn: async () => {
      const res = await fetch(`/api/public/events/${slug}`);
      if (!res.ok) throw new Error('Event not found');
      return res.json();
    },
    enabled: !!slug
  });

  const registerMutation = useMutation({
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
    },
    onError: (err: any) => {
      if (err.message?.includes('Not authenticated')) {
        setLocation(`/auth?redirect=/event/${slug}`);
        return;
      }
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const copyShareLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link Copied!", description: "Share this link to invite attendees." });
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

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-gray-900 to-transparent">
          <div className="max-w-4xl mx-auto">
            {user ? (
              <Button
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-lg py-6"
                onClick={() => registerMutation.mutate(schedule.id)}
                disabled={isFull || registerMutation.isPending}
              >
                {registerMutation.isPending ? (
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
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-lg py-6"
                onClick={() => setLocation(`/auth?redirect=/event/${slug}`)}
              >
                <LogIn className="w-5 h-5 mr-2" />
                Sign In to Register
              </Button>
            )}
          </div>
        </div>

        <div className="h-24" />
      </div>
    </div>
  );
}
