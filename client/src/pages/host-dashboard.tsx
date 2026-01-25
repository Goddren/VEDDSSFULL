import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { LiveStreamHost } from "@/components/live-stream-host";
import { PresentationSlides } from "@/components/presentation-slides";
import { 
  Mic, 
  Video, 
  VideoOff,
  MicOff,
  Camera,
  Monitor,
  Users, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Star, 
  Trophy,
  Target,
  MessageSquare,
  Upload,
  Play,
  FileText,
  Lightbulb,
  ChevronRight,
  Award,
  Sparkles,
  Crown,
  Radio,
  StopCircle,
  Timer,
  ArrowLeft,
  User,
  Square,
  Copy,
  Link,
  Share2,
  ExternalLink
} from "lucide-react";
import { format } from "date-fns";

interface HostedEvent {
  id: number;
  eventId?: number;
  scheduleId?: number | null;
  title: string;
  description: string;
  eventType: string;
  format: string;
  hostGuide: string;
  talkingPoints: string[];
  agenda: { time: string; topic: string; notes?: string }[];
  resourceLinks: { title: string; url: string }[];
  suggestedDuration: number;
  tokenReward: number;
  hostTokenReward: number;
  scheduledDate: string | null;
  status: string;
  recordingUrl: string | null;
  recordingUploadedAt: string | null;
  attendeeCount?: number;
  role: string;
  aiAgenda?: any;
  shareSlug?: string;
}

interface HostSchedule {
  id: number;
  eventId: number;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  capacity: number;
  currentAttendees: number;
  meetingLink: string | null;
  shareSlug: string | null;
  aiAgenda: {
    overview: string;
    agenda: { time: string; topic: string; description: string }[];
    preparationTips: string[];
    hostingTips: string[];
  } | null;
  status: string;
  createdAt: string;
  event: {
    id: number;
    title: string;
    description: string | null;
    eventType: string;
    format: string;
    hostGuide: string | null;
    talkingPoints: string[];
    agenda: { time: string; topic: string; notes?: string }[];
    resourceLinks: { title: string; url: string }[];
    tokenReward: number;
    hostTokenReward: number;
  } | null;
}

interface HostStats {
  totalEventsHosted: number;
  upcomingEvents: number;
  totalAttendees: number;
  averageRating: number;
  tokensEarned: number;
  hostTier: string;
}

interface Attendee {
  id: number;
  userId: number;
  username: string;
  fullName: string;
  role: string;
  status: string;
  registeredAt: string;
  attendedAt: string | null;
}

export default function HostDashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedEvent, setSelectedEvent] = useState<HostedEvent | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<HostSchedule | null>(null);
  const [presenterEvent, setPresenterEvent] = useState<HostedEvent | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isLive, setIsLive] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState("");

  const { data: hostedEvents, isLoading: eventsLoading } = useQuery<HostedEvent[]>({
    queryKey: ["/api/ambassador/host/my-events"],
  });

  const { data: hostSchedules, isLoading: schedulesLoading } = useQuery<HostSchedule[]>({
    queryKey: ["/api/ambassador/host/schedules"],
  });

  const { data: hostStats } = useQuery<HostStats>({
    queryKey: ["/api/ambassador/host/stats"],
  });

  // Query attendees for presenter mode
  const { data: attendees = [], refetch: refetchAttendees } = useQuery<Attendee[]>({
    queryKey: [`/api/ambassador/events/${presenterEvent?.id}/attendees`],
    enabled: !!presenterEvent,
  });

  // Timer effect for presenter mode
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLive && presenterEvent) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLive, presenterEvent]);

  const uploadRecordingMutation = useMutation({
    mutationFn: async ({ eventId, scheduleId, url }: { eventId: number; scheduleId?: number | null; url: string }) => {
      if (scheduleId) {
        return apiRequest("POST", `/api/ambassador/schedules/${scheduleId}/recording`, { recordingUrl: url });
      }
      return apiRequest("POST", `/api/ambassador/events/${eventId}/recording`, { recordingUrl: url });
    },
    onSuccess: () => {
      toast({ title: "Recording uploaded!", description: "Registered attendees can now replay the event." });
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/host/my-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/host/schedules"] });
      setRecordingUrl("");
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ eventId, scheduleId, status }: { eventId: number; scheduleId?: number | null; status: string }) => {
      if (scheduleId) {
        return apiRequest("PATCH", `/api/ambassador/schedules/${scheduleId}/status`, { status });
      }
      return apiRequest("PATCH", `/api/ambassador/events/${eventId}/status`, { status });
    },
    onSuccess: (_, variables) => {
      if (variables.status === 'live') {
        toast({ title: "You're Live!", description: "Event is now in progress. Registered attendees can now join." });
        setIsLive(true);
        setElapsedTime(0);
      } else if (variables.status === 'completed') {
        toast({ title: "Event Completed!", description: "Great job hosting! You can now upload the recording." });
        setIsLive(false);
        setPresenterEvent(null);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/host/my-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/host/schedules"] });
    },
    onError: () => {
      toast({ title: "Status update failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startPresenterMode = (event: HostedEvent) => {
    setPresenterEvent(event);
    setElapsedTime(0);
    setIsLive(event.status === 'live');
  };

  const getHostTierBadge = (tier: string) => {
    const tiers: Record<string, { color: string; icon: React.ReactNode }> = {
      "Bronze Host": { color: "bg-orange-600", icon: <Mic className="h-3 w-3" /> },
      "Silver Host": { color: "bg-gray-400", icon: <Award className="h-3 w-3" /> },
      "Gold Host": { color: "bg-yellow-500", icon: <Trophy className="h-3 w-3" /> },
      "Platinum Host": { color: "bg-purple-500", icon: <Crown className="h-3 w-3" /> },
    };
    const tierInfo = tiers[tier] || tiers["Bronze Host"];
    return (
      <Badge className={`${tierInfo.color} text-white flex items-center gap-1`}>
        {tierInfo.icon} {tier}
      </Badge>
    );
  };

  const getEventTypeBadge = (type: string) => {
    const types: Record<string, string> = {
      live_session: "bg-green-500",
      ama: "bg-blue-500",
      workshop: "bg-purple-500",
      webinar: "bg-indigo-500",
      meetup: "bg-pink-500",
      challenge_kickoff: "bg-orange-500",
    };
    return <Badge className={types[type] || "bg-gray-500"}>{type.replace("_", " ").toUpperCase()}</Badge>;
  };

  const upcomingEvents = hostedEvents?.filter(e => e.status === "scheduled" && e.scheduledDate) || [];
  const completedEvents = hostedEvents?.filter(e => e.status === "completed") || [];
  
  const upcomingSchedules = hostSchedules?.filter(s => s.status === "scheduled") || [];
  const completedSchedules = hostSchedules?.filter(s => s.status === "completed") || [];
  const allUpcoming = [...upcomingEvents.map(e => ({ ...e, eventId: e.id, scheduleId: null })), ...upcomingSchedules.map(s => ({
    id: s.eventId,
    eventId: s.eventId,
    title: s.title,
    description: s.description || s.event?.description || '',
    eventType: s.event?.eventType || 'live_session',
    format: s.event?.format || 'virtual',
    hostGuide: s.event?.hostGuide || '',
    talkingPoints: s.event?.talkingPoints || [],
    agenda: s.aiAgenda?.agenda?.map(a => ({ time: a.time, topic: a.topic, notes: a.description })) || s.event?.agenda || [],
    resourceLinks: s.event?.resourceLinks || [],
    suggestedDuration: 60,
    tokenReward: s.event?.tokenReward || 0,
    hostTokenReward: s.event?.hostTokenReward || 0,
    scheduledDate: s.startAt,
    status: s.status,
    recordingUrl: null,
    recordingUploadedAt: null,
    attendeeCount: s.currentAttendees,
    role: 'host',
    aiAgenda: s.aiAgenda,
    scheduleId: s.id,
    shareSlug: s.shareSlug,
  }))];

  if (eventsLoading || schedulesLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Host Profile Header */}
      <Card className="bg-gradient-to-r from-amber-900/30 via-yellow-900/20 to-orange-900/30 border-yellow-600/30">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center">
                <Crown className="h-8 w-8 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{user?.fullName || user?.username}</h1>
                  {hostStats && getHostTierBadge(hostStats.hostTier)}
                </div>
                <p className="text-muted-foreground">Community Event Host</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-black/20 rounded-lg p-3">
                <div className="text-2xl font-bold text-yellow-400">{hostStats?.totalEventsHosted || 0}</div>
                <div className="text-xs text-muted-foreground">Events Hosted</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <div className="text-2xl font-bold text-green-400">{hostStats?.upcomingEvents || 0}</div>
                <div className="text-xs text-muted-foreground">Upcoming</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <div className="text-2xl font-bold text-blue-400">{hostStats?.totalAttendees || 0}</div>
                <div className="text-xs text-muted-foreground">Total Attendees</div>
              </div>
              <div className="bg-black/20 rounded-lg p-3">
                <div className="text-2xl font-bold text-purple-400">{hostStats?.tokensEarned || 0}</div>
                <div className="text-xs text-muted-foreground">VEDD Earned</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="upcoming" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upcoming" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Upcoming ({allUpcoming.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Completed ({completedEvents.length + completedSchedules.length})
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" /> Host Guide
          </TabsTrigger>
        </TabsList>

        {/* Upcoming Events */}
        <TabsContent value="upcoming" className="space-y-4">
          {allUpcoming.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No upcoming events scheduled.</p>
                <p className="text-sm text-muted-foreground mt-2">Register as a host for community events to get started!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {allUpcoming.map((event: any, index: number) => (
                <Card key={`upcoming-${event.scheduleId || event.eventId}-${index}`} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setSelectedEvent(event)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {getEventTypeBadge(event.eventType)}
                          <Badge variant="outline">{event.format}</Badge>
                          <Badge variant="secondary">{event.role}</Badge>
                          {event.shareSlug && (
                            <Badge className="bg-purple-600">Shareable</Badge>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold">{event.title}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                        {event.scheduledDate && (
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {format(new Date(event.scheduledDate), "PPP")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {format(new Date(event.scheduledDate), "p")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {event.attendeeCount || 0} registered
                            </span>
                          </div>
                        )}
                        {event.aiAgenda && (
                          <div className="mt-2 p-2 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                            <p className="text-xs text-blue-400 font-medium">AI-Generated Agenda Available</p>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button 
                          variant="default" 
                          size="sm" 
                          className="flex items-center gap-1 bg-green-600 hover:bg-green-500"
                          onClick={(e) => { e.stopPropagation(); startPresenterMode(event); }}
                        >
                          <Radio className="h-4 w-4" /> Start Presenting
                        </Button>
                        {event.shareSlug && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex items-center gap-1 border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(`${window.location.origin}/event/${event.shareSlug}?action=register`);
                              toast({ title: "Event Link Copied!", description: "Share this link to invite attendees" });
                            }}
                          >
                            <Share2 className="h-4 w-4" /> Share Event
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          View Guide <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Completed Events */}
        <TabsContent value="completed" className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Completed & Recorded Events
              </h2>
              <p className="text-sm text-muted-foreground">Share your recorded sessions with your community</p>
            </div>
          </div>

          {completedEvents.length === 0 && completedSchedules.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No completed events yet.</p>
                <p className="text-sm text-muted-foreground mt-2">Host your first event to see it here!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {/* Events with recordings first */}
              {completedEvents.filter(e => e.recordingUrl).length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-green-500 flex items-center gap-2">
                    <Play className="h-4 w-4" /> With Recordings - Ready to Share
                  </h3>
                  {completedEvents.filter(e => e.recordingUrl).map((event) => (
                    <Card key={event.id} className="border-green-500/30 bg-green-500/5">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              {getEventTypeBadge(event.eventType)}
                              <Badge variant="outline" className="text-green-500 border-green-500">Recorded</Badge>
                            </div>
                            <h3 className="text-lg font-semibold">{event.title}</h3>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {event.attendeeCount || 0} attended
                              </span>
                              <span className="flex items-center gap-1">
                                <Trophy className="h-4 w-4 text-yellow-500" />
                                +{event.hostTokenReward} VEDD earned
                              </span>
                              {event.recordingUploadedAt && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  Recorded {format(new Date(event.recordingUploadedAt), 'MMM d, yyyy')}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <Button variant="outline" size="sm" asChild>
                              <a href={event.recordingUrl!} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                                <Play className="h-4 w-4" /> Watch
                              </a>
                            </Button>
                            <Button 
                              variant="secondary" 
                              size="sm"
                              onClick={() => {
                                const shareLink = event.shareSlug 
                                  ? `${window.location.origin}/event/${event.shareSlug}?action=register`
                                  : event.recordingUrl!;
                                navigator.clipboard.writeText(shareLink);
                                toast({ 
                                  title: "Link Copied!", 
                                  description: "Share this link - recipients can register directly!" 
                                });
                              }}
                              className="flex items-center gap-1"
                            >
                              <Share2 className="h-4 w-4" /> Share Event
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Events without recordings */}
              {completedEvents.filter(e => !e.recordingUrl).length > 0 && (
                <div className="space-y-3 mt-4">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Upload className="h-4 w-4" /> Awaiting Recording Upload
                  </h3>
                  {completedEvents.filter(e => !e.recordingUrl).map((event) => (
                    <Card key={event.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              {getEventTypeBadge(event.eventType)}
                              <Badge variant="outline" className="text-yellow-500 border-yellow-500">Needs Recording</Badge>
                            </div>
                            <h3 className="text-lg font-semibold">{event.title}</h3>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {event.attendeeCount || 0} attended
                              </span>
                              <span className="flex items-center gap-1">
                                <Trophy className="h-4 w-4 text-yellow-500" />
                                +{event.hostTokenReward} VEDD earned
                              </span>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <Input
                              placeholder="Paste recording URL..."
                              value={recordingUrl}
                              onChange={(e) => setRecordingUrl(e.target.value)}
                              className="w-56"
                            />
                            <Button 
                              size="sm" 
                              onClick={() => uploadRecordingMutation.mutate({ eventId: event.eventId || event.id, scheduleId: event.scheduleId, url: recordingUrl })}
                              disabled={!recordingUrl || uploadRecordingMutation.isPending}
                              className="w-full"
                            >
                              <Upload className="h-4 w-4 mr-1" /> Upload Recording
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Host Guide */}
        <TabsContent value="guide" className="space-y-4">
          {/* Event-Specific Guides */}
          {allUpcoming.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                Your Event-Specific Guides
              </h2>
              {allUpcoming.map((event: any, index: number) => (
                <Card key={`guide-${event.scheduleId || event.eventId}-${index}`} className="border-blue-500/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getEventTypeBadge(event.eventType)}
                        <CardTitle className="text-base">{event.title}</CardTitle>
                      </div>
                      {event.scheduledDate && (
                        <Badge variant="outline" className="text-xs">
                          {format(new Date(event.scheduledDate), "MMM d, h:mm a")}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* AI-Generated Agenda */}
                    {event.aiAgenda && (
                      <div className="space-y-3">
                        <div className="p-3 bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg border border-blue-500/30">
                          <h4 className="font-medium text-blue-400 flex items-center gap-2 mb-2">
                            <Sparkles className="h-4 w-4" /> AI-Generated Session Guide
                          </h4>
                          <p className="text-sm text-gray-300 mb-3">{event.aiAgenda.overview}</p>
                          
                          {/* Agenda Timeline */}
                          <div className="space-y-2 mb-4">
                            <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Session Agenda</h5>
                            {event.aiAgenda.agenda?.map((item: any, i: number) => (
                              <div key={i} className="flex gap-3 text-sm">
                                <span className="text-blue-400 font-mono min-w-[80px]">{item.time}</span>
                                <div>
                                  <span className="font-medium text-white">{item.topic}</span>
                                  {item.description && (
                                    <p className="text-gray-400 text-xs mt-0.5">{item.description}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {/* Preparation Tips */}
                          {event.aiAgenda.preparationTips?.length > 0 && (
                            <div className="mb-3">
                              <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Preparation Tips</h5>
                              <div className="grid gap-1">
                                {event.aiAgenda.preparationTips.map((tip: string, i: number) => (
                                  <div key={i} className="flex items-start gap-2 text-sm">
                                    <Target className="h-3 w-3 text-green-400 mt-1 flex-shrink-0" />
                                    <span className="text-gray-300">{tip}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Hosting Tips */}
                          {event.aiAgenda.hostingTips?.length > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">During Your Session</h5>
                              <div className="grid gap-1">
                                {event.aiAgenda.hostingTips.map((tip: string, i: number) => (
                                  <div key={i} className="flex items-start gap-2 text-sm">
                                    <Mic className="h-3 w-3 text-yellow-400 mt-1 flex-shrink-0" />
                                    <span className="text-gray-300">{tip}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Fallback to Event Talking Points if no AI agenda */}
                    {!event.aiAgenda && event.talkingPoints?.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-green-500" /> Key Talking Points
                        </h4>
                        <div className="grid gap-1 pl-2">
                          {event.talkingPoints.map((point: string, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                              <ChevronRight className="h-4 w-4 text-primary mt-0.5" />
                              <span>{point}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Share Link */}
                    {event.shareSlug && (
                      <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-purple-400">Share this event (register link):</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/event/${event.shareSlug}?action=register`);
                              toast({ 
                                title: "Link Copied!", 
                                description: "Recipients can register directly from this link" 
                              });
                            }}
                          >
                            <Copy className="h-3 w-3 mr-1" /> Copy
                          </Button>
                        </div>
                        <code className="text-xs text-purple-300 bg-black/30 px-2 py-1 rounded block truncate">
                          {window.location.origin}/event/{event.shareSlug}?action=register
                        </code>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          <Separator className="my-6" />
          
          {/* General Host Guide */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-500" />
                General Host Success Guide
              </CardTitle>
              <CardDescription>Universal tips for hosting successful community events that can be duplicated</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pre-Event Checklist */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <Target className="h-4 w-4 text-blue-500" /> Pre-Event Checklist
                </h3>
                <div className="grid gap-2 pl-6">
                  {[
                    "Review your AI-generated event agenda above",
                    "Test your audio and video equipment 15 mins before",
                    "Prepare any slides or visual materials",
                    "Set up a quiet, well-lit space",
                    "Have backup internet connection ready",
                    "Share your event link with potential attendees",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* During Event Tips */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <Mic className="h-4 w-4 text-green-500" /> During the Event
                </h3>
                <div className="grid gap-2 pl-6">
                  {[
                    "Start on time - respect everyone's schedule",
                    "Introduce yourself and set expectations",
                    "Follow your AI-generated agenda timeline",
                    "Encourage questions and participation",
                    "Use screen sharing for demonstrations",
                    "Save 5-10 minutes for Q&A at the end",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <ChevronRight className="h-4 w-4 text-primary" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Making Events Duplicatable */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <Award className="h-4 w-4 text-orange-500" /> Make Events Duplicatable
                </h3>
                <div className="grid gap-2 pl-6">
                  {[
                    "Record your session for others to learn from",
                    "Document what worked well and what didn't",
                    "Create a template from your successful events",
                    "Share your hosting tips with other ambassadors",
                    "Build a library of reusable content and slides",
                    "Mentor new hosts to replicate your success",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Sparkles className="h-4 w-4 text-orange-400" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Post-Event Actions */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <Video className="h-4 w-4 text-purple-500" /> Post-Event Actions
                </h3>
                <div className="grid gap-2 pl-6">
                  {[
                    "Upload your event recording for replay",
                    "Thank attendees in the community chat",
                    "Review feedback and ratings",
                    "Note improvements for next time",
                    "Claim your host token rewards",
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Star className="h-4 w-4 text-yellow-500" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Event Details Modal */}
      {selectedEvent && (
        <Card className="fixed inset-2 md:inset-auto md:fixed md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[800px] md:max-h-[90vh] z-50 flex flex-col">
          <CardHeader className="border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  {getEventTypeBadge(selectedEvent.eventType)}
                  <Badge variant="outline">{selectedEvent.format}</Badge>
                </div>
                <CardTitle>{selectedEvent.title}</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(null)}>×</Button>
            </div>
          </CardHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain touch-pan-y">
            <CardContent className="p-6 space-y-6">
              {/* Event Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">Duration</div>
                  <div className="font-semibold">{selectedEvent.suggestedDuration} minutes</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">Your Reward</div>
                  <div className="font-semibold text-yellow-500">+{selectedEvent.hostTokenReward} VEDD</div>
                </div>
              </div>

              {/* Host Guide */}
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4" /> Host Guide
                </h4>
                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  {selectedEvent.hostGuide}
                </p>
              </div>

              {/* Talking Points */}
              {selectedEvent.talkingPoints && selectedEvent.talkingPoints.length > 0 && (
                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-2">
                    <MessageSquare className="h-4 w-4" /> Key Talking Points
                  </h4>
                  <div className="space-y-2">
                    {selectedEvent.talkingPoints.map((point, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm bg-blue-500/10 p-2 rounded">
                        <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded">{i + 1}</span>
                        {point}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agenda */}
              {selectedEvent.agenda && selectedEvent.agenda.length > 0 && (
                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4" /> Event Agenda
                  </h4>
                  <div className="space-y-2">
                    {selectedEvent.agenda.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm border-l-2 border-primary pl-3 py-1">
                        <span className="font-mono text-primary">{item.time}</span>
                        <div>
                          <div className="font-medium">{item.topic}</div>
                          {item.notes && <div className="text-muted-foreground text-xs">{item.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resources */}
              {selectedEvent.resourceLinks && selectedEvent.resourceLinks.length > 0 && (
                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4" /> Resources
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedEvent.resourceLinks.map((link, i) => (
                      <Button key={i} variant="outline" size="sm" asChild>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.title}
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </div>
        </Card>
      )}
      
      {/* Backdrop for modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelectedEvent(null)} />
      )}

      {/* Presenter Mode Full-Screen View */}
      {presenterEvent && (
        <div className="fixed inset-0 z-50 bg-gray-950 overflow-hidden">
          {/* Top Bar */}
          <div className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { setPresenterEvent(null); setIsLive(false); }}
                className="text-gray-400 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Exit Presenter Mode
              </Button>
              <Separator orientation="vertical" className="h-8" />
              <div>
                <h2 className="font-semibold text-white">{presenterEvent.title}</h2>
                <p className="text-xs text-gray-400">{getEventTypeBadge(presenterEvent.eventType)}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              {/* Timer */}
              <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg">
                <Timer className="h-4 w-4 text-gray-400" />
                <span className="font-mono text-lg text-white">{formatTime(elapsedTime)}</span>
                <span className="text-xs text-gray-500">/ {presenterEvent.suggestedDuration}min</span>
              </div>
              
              {/* Live Status */}
              {isLive ? (
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-red-400 font-semibold">LIVE</span>
                </div>
              ) : (
                <Badge variant="outline" className="text-gray-400">Not Started</Badge>
              )}
              
              {/* Share Event Link */}
              {presenterEvent.shareSlug && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                  onClick={() => {
                    const shareLink = `${window.location.origin}/event/${presenterEvent.shareSlug}?action=register`;
                    navigator.clipboard.writeText(shareLink);
                    toast({ 
                      title: "Event Link Copied!", 
                      description: "Share this link so attendees can register" 
                    });
                  }}
                >
                  <Share2 className="h-4 w-4 mr-2" /> Share Event
                </Button>
              )}
              
              {/* Controls */}
              <div className="flex gap-2">
                {!isLive ? (
                  <Button 
                    className="bg-green-600 hover:bg-green-500"
                    onClick={() => updateStatusMutation.mutate({ eventId: presenterEvent.eventId || presenterEvent.id, scheduleId: presenterEvent.scheduleId, status: 'live' })}
                    disabled={updateStatusMutation.isPending}
                  >
                    <Radio className="h-4 w-4 mr-2" /> Go Live
                  </Button>
                ) : (
                  <Button 
                    variant="destructive"
                    onClick={() => updateStatusMutation.mutate({ eventId: presenterEvent.eventId || presenterEvent.id, scheduleId: presenterEvent.scheduleId, status: 'completed' })}
                    disabled={updateStatusMutation.isPending}
                  >
                    <StopCircle className="h-4 w-4 mr-2" /> End Event
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          {/* Main Content */}
          <div className="flex h-[calc(100vh-4rem)]">
            {/* Left Panel - Agenda & Notes */}
            <div className="w-1/2 border-r border-gray-800 overflow-auto p-6">
              <div className="space-y-6">
                {/* AI Presentation Outline */}
                <PresentationSlides
                  eventId={presenterEvent.eventId || presenterEvent.id}
                  scheduleId={presenterEvent.scheduleId || undefined}
                  eventTitle={presenterEvent.title}
                  eventDescription={presenterEvent.hostGuide}
                  talkingPoints={presenterEvent.talkingPoints || []}
                  agenda={presenterEvent.agenda || []}
                  duration={presenterEvent.suggestedDuration || 30}
                />

                {/* Host Guide */}
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-400" /> Host Guide
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-300 text-sm leading-relaxed">{presenterEvent.hostGuide}</p>
                  </CardContent>
                </Card>

                {/* Talking Points */}
                {presenterEvent.talkingPoints && presenterEvent.talkingPoints.length > 0 && (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-green-400" /> Key Talking Points
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {presenterEvent.talkingPoints.map((point, i) => (
                        <div key={i} className="flex items-start gap-3 bg-gray-800/50 p-3 rounded-lg">
                          <span className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded min-w-[28px] text-center">{i + 1}</span>
                          <p className="text-gray-200 text-sm flex-1">{point}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Agenda Timeline */}
                {presenterEvent.agenda && presenterEvent.agenda.length > 0 && (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Clock className="h-5 w-5 text-purple-400" /> Agenda
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {presenterEvent.agenda.map((item, i) => (
                        <div key={i} className="flex gap-4 items-start border-l-2 border-purple-500 pl-4 py-2">
                          <span className="font-mono text-purple-400 text-sm min-w-[60px]">{item.time}</span>
                          <div>
                            <p className="font-medium text-white">{item.topic}</p>
                            {item.notes && <p className="text-xs text-gray-400 mt-1">{item.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Resources */}
                {presenterEvent.resourceLinks && presenterEvent.resourceLinks.length > 0 && (
                  <Card className="bg-gray-900 border-gray-800">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-yellow-400" /> Resources
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {presenterEvent.resourceLinks.map((link, i) => (
                          <Button key={i} variant="outline" size="sm" asChild className="border-gray-700">
                            <a href={link.url} target="_blank" rel="noopener noreferrer">
                              {link.title}
                            </a>
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
            
            {/* Right Panel - Streaming & Attendees */}
            <div className="w-1/2 overflow-auto p-6 space-y-4">
              {/* Live Streaming Panel */}
              <LiveStreamHost
                roomId={`${presenterEvent.scheduleId ? 'schedule' : 'event'}-${presenterEvent.scheduleId || presenterEvent.eventId || presenterEvent.id}`}
                userId={user?.id || 0}
                streamType={presenterEvent.scheduleId ? 'schedule' : 'event'}
                streamId={presenterEvent.scheduleId || presenterEvent.eventId || presenterEvent.id}
                eventTitle={presenterEvent.title}
                onStreamEnd={() => {
                  updateStatusMutation.mutate({ 
                    eventId: presenterEvent.eventId || presenterEvent.id, 
                    scheduleId: presenterEvent.scheduleId, 
                    status: 'completed' 
                  });
                }}
                onRecordingSaved={async (blob) => {
                  const formData = new FormData();
                  formData.append('recording', blob, `recording-${Date.now()}.webm`);
                  formData.append('streamType', presenterEvent.scheduleId ? 'schedule' : 'event');
                  formData.append('streamId', String(presenterEvent.scheduleId || presenterEvent.eventId || presenterEvent.id));
                  
                  try {
                    await fetch('/api/stream/recording', {
                      method: 'POST',
                      body: formData,
                      credentials: 'include'
                    });
                    toast({
                      title: 'Recording Uploaded',
                      description: 'Your stream recording has been saved for attendees to watch later.'
                    });
                  } catch (error) {
                    console.error('Failed to upload recording:', error);
                  }
                }}
              />
              
              {/* Attendees Panel */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5 text-amber-400" /> 
                      Attendees ({attendees.length})
                    </CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => refetchAttendees()} className="text-gray-400">
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    {attendees.length === 0 ? (
                      <div className="text-center py-6 text-gray-500">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No attendees registered yet</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {attendees.map((attendee) => (
                          <div 
                            key={attendee.id} 
                            className="flex items-center justify-between bg-gray-800/50 rounded-lg p-2"
                          >
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                                <User className="h-4 w-4 text-white" />
                              </div>
                              <div>
                                <p className="font-medium text-white text-sm">{attendee.fullName}</p>
                                <p className="text-xs text-gray-400">@{attendee.username}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {attendee.role !== 'attendee' && (
                                <Badge variant="secondary" className="text-xs">{attendee.role}</Badge>
                              )}
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${attendee.status === 'attended' 
                                  ? 'text-green-400 border-green-500/50' 
                                  : 'text-gray-400 border-gray-600'
                                }`}
                              >
                                {attendee.status === 'attended' ? 'Present' : 'Registered'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
