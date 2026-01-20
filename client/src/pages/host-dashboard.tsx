import { useState } from "react";
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
import { 
  Mic, 
  Video, 
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
  Crown
} from "lucide-react";
import { format } from "date-fns";

interface HostedEvent {
  id: number;
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
}

interface HostStats {
  totalEventsHosted: number;
  upcomingEvents: number;
  totalAttendees: number;
  averageRating: number;
  tokensEarned: number;
  hostTier: string;
}

export default function HostDashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedEvent, setSelectedEvent] = useState<HostedEvent | null>(null);
  const [recordingUrl, setRecordingUrl] = useState("");

  const { data: hostedEvents, isLoading: eventsLoading } = useQuery<HostedEvent[]>({
    queryKey: ["/api/ambassador/host/my-events"],
  });

  const { data: hostStats } = useQuery<HostStats>({
    queryKey: ["/api/ambassador/host/stats"],
  });

  const uploadRecordingMutation = useMutation({
    mutationFn: async ({ eventId, url }: { eventId: number; url: string }) => {
      return apiRequest("POST", `/api/ambassador/events/${eventId}/recording`, { recordingUrl: url });
    },
    onSuccess: () => {
      toast({ title: "Recording uploaded!", description: "Attendees can now replay the event." });
      queryClient.invalidateQueries({ queryKey: ["/api/ambassador/host/my-events"] });
      setRecordingUrl("");
    },
    onError: () => {
      toast({ title: "Upload failed", description: "Please try again.", variant: "destructive" });
    },
  });

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

  if (eventsLoading) {
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
            <Calendar className="h-4 w-4" /> Upcoming ({upcomingEvents.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Completed ({completedEvents.length})
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" /> Host Guide
          </TabsTrigger>
        </TabsList>

        {/* Upcoming Events */}
        <TabsContent value="upcoming" className="space-y-4">
          {upcomingEvents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No upcoming events scheduled.</p>
                <p className="text-sm text-muted-foreground mt-2">Register as a host for community events to get started!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {upcomingEvents.map((event) => (
                <Card key={event.id} className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setSelectedEvent(event)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {getEventTypeBadge(event.eventType)}
                          <Badge variant="outline">{event.format}</Badge>
                          <Badge variant="secondary">{event.role}</Badge>
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
                      </div>
                      <Button variant="outline" size="sm" className="flex items-center gap-1">
                        View Details <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Completed Events */}
        <TabsContent value="completed" className="space-y-4">
          {completedEvents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Trophy className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No completed events yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {completedEvents.map((event) => (
                <Card key={event.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          {getEventTypeBadge(event.eventType)}
                          <Badge variant="outline" className="text-green-500 border-green-500">Completed</Badge>
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
                        {event.recordingUrl ? (
                          <Button variant="outline" size="sm" asChild>
                            <a href={event.recordingUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                              <Play className="h-4 w-4" /> Watch Recording
                            </a>
                          </Button>
                        ) : (
                          <div className="space-y-2">
                            <Input
                              placeholder="Paste recording URL..."
                              value={recordingUrl}
                              onChange={(e) => setRecordingUrl(e.target.value)}
                              className="w-48"
                            />
                            <Button 
                              size="sm" 
                              onClick={() => uploadRecordingMutation.mutate({ eventId: event.id, url: recordingUrl })}
                              disabled={!recordingUrl || uploadRecordingMutation.isPending}
                              className="w-full"
                            >
                              <Upload className="h-4 w-4 mr-1" /> Upload Recording
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Host Guide */}
        <TabsContent value="guide" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-500" />
                Host Success Guide
              </CardTitle>
              <CardDescription>Tips and best practices for hosting successful community events</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pre-Event Checklist */}
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                  <Target className="h-4 w-4 text-blue-500" /> Pre-Event Checklist
                </h3>
                <div className="grid gap-2 pl-6">
                  {[
                    "Review the event talking points and agenda",
                    "Test your audio and video equipment",
                    "Prepare any slides or visual materials",
                    "Set up a quiet, well-lit space",
                    "Have backup internet connection ready",
                    "Send reminder notifications to attendees",
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
                    "Encourage questions and participation",
                    "Keep track of time for each agenda item",
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
        <Card className="fixed inset-4 md:inset-auto md:fixed md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[800px] md:max-h-[80vh] z-50 overflow-hidden">
          <CardHeader className="border-b">
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
          <ScrollArea className="max-h-[60vh]">
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
          </ScrollArea>
        </Card>
      )}
      
      {/* Backdrop for modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
