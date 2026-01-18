import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { 
  ArrowLeft, BookOpen, Sparkles, Copy, Check, Upload, Image, 
  Video, Star, Flame, Send, Loader2, CheckCircle, Clock, Users,
  Trophy, Calendar, Target, Zap, Twitter, Instagram, Linkedin, Hash,
  Play, ExternalLink, Award
} from "lucide-react";
import { SiTiktok } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SocialDirection {
  id: number;
  dayNumber: number;
  platform: string;
  contentType: string;
  postIdea: string;
  captionTemplate: string;
  hookLine: string;
  callToAction: string;
  hashtags: string[];
  bestPostingTime: string | null;
  engagementTips: string[];
}

interface Challenge {
  id: number;
  title: string;
  description: string;
  challengeType: string;
  category: string;
  difficulty: string;
  objectives: string[];
  successCriteria: string;
  tokenReward: number;
  bonusReward: number;
  badgeReward: string | null;
  startDate: string;
  endDate: string;
  status: string;
}

interface CommunityEvent {
  id: number;
  title: string;
  description: string;
  eventType: string;
  format: string;
  hostGuide: string;
  talkingPoints: string[];
  agenda: { time: string; topic: string; details: string }[];
  suggestedDuration: number;
  tokenReward: number;
  hostTokenReward: number;
  status: string;
}

interface CommunityData {
  socialDirections: SocialDirection[];
  challenges: Challenge[];
  events: CommunityEvent[];
  isEmpty: boolean;
}

interface DailyLesson {
  dayNumber: number;
  title: string;
  tradingTopic: string;
  tradingLesson: string;
  scriptureReference: string;
  scriptureText: string;
  devotionalMessage: string;
  contentPrompt: string;
  suggestedHashtags: string[];
  mediaType: 'image' | 'video' | 'carousel';
  tokenReward: number;
  bonusTokens: number;
  weekNumber: number;
  category: string;
}

interface DayData {
  lesson: DailyLesson;
  progress: {
    status: string;
    aiGeneratedContent?: string;
    userMediaUrl?: string;
    tokensEarned?: number;
    completedAt?: string;
  };
  isUnlocked: boolean;
}

interface GeneratedContent {
  shortPost: string;
  longPost: string;
  suggestedHashtags: string[];
}

export default function ContentFlowDay() {
  const { dayNumber } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [customContext, setCustomContext] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [joinedChallenges, setJoinedChallenges] = useState<Set<number>>(new Set());
  const [registeredEvents, setRegisteredEvents] = useState<Set<number>>(new Set());
  const [hostingEvent, setHostingEvent] = useState<Event | null>(null);
  const [hostFormData, setHostFormData] = useState({
    title: '',
    description: '',
    startAt: '',
    capacity: 50,
    meetingLink: ''
  });

  const day = parseInt(dayNumber || "1");

  const { data: dayData, isLoading } = useQuery<DayData>({
    queryKey: ['/api/ambassador/content-flow/day', day],
    queryFn: async () => {
      const res = await fetch(`/api/ambassador/content-flow/day/${day}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load day data');
      return res.json();
    },
    enabled: !!dayNumber
  });

  const weekNumber = Math.ceil(day / 7);
  
  const { data: communityData, isLoading: communityLoading, refetch: refetchCommunity } = useQuery<CommunityData>({
    queryKey: ['/api/ambassador/community/hub', day],
    queryFn: async () => {
      const res = await fetch(`/api/ambassador/community/hub?day=${day}&week=${weekNumber}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load community data');
      return res.json();
    },
    enabled: !!dayNumber
  });

  const joinChallengeMutation = useMutation({
    mutationFn: async (challengeId: number) => {
      const res = await apiRequest('POST', `/api/ambassador/community/challenges/${challengeId}/join`);
      return { challengeId, data: await res.json() };
    },
    onSuccess: ({ challengeId }) => {
      setJoinedChallenges(prev => new Set([...Array.from(prev), challengeId]));
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/community/hub', day] });
      toast({ title: "Challenge Joined!", description: "Redirecting to challenge..." });
      setLocation(`/ambassador/challenge/${challengeId}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const registerEventMutation = useMutation({
    mutationFn: async ({ eventId, role }: { eventId: number; role?: string }) => {
      const res = await apiRequest('POST', `/api/ambassador/community/events/${eventId}/register`, { role });
      return { eventId, data: await res.json() };
    },
    onSuccess: ({ eventId }) => {
      setRegisteredEvents(prev => new Set([...Array.from(prev), eventId]));
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/community/hub', day] });
      toast({ title: "Registered!", description: "You're signed up for this event." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const hostEventMutation = useMutation({
    mutationFn: async ({ eventId, ...data }: { eventId: number; title: string; description: string; startAt: string; capacity: number; meetingLink: string }) => {
      const res = await apiRequest('POST', `/api/ambassador/community/events/${eventId}/host`, data);
      return res.json();
    },
    onSuccess: (data) => {
      setHostingEvent(null);
      setHostFormData({ title: '', description: '', startAt: '', capacity: 50, meetingLink: '' });
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/community/hub', day] });
      toast({ title: "Event Created!", description: `You earned ${data.tokensAwarded} tokens for hosting!` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'twitter': return <Twitter className="w-5 h-5 text-blue-400" />;
      case 'instagram': return <Instagram className="w-5 h-5 text-pink-400" />;
      case 'linkedin': return <Linkedin className="w-5 h-5 text-blue-500" />;
      case 'tiktok': return <SiTiktok className="w-5 h-5 text-white" />;
      default: return <Hash className="w-5 h-5 text-gray-400" />;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'hard': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'expert': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const startMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/ambassador/content-flow/day/${day}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/content-flow/day', day] });
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/content-flow/stats'] });
    }
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/ambassador/content-flow/day/${day}/generate`, { customContext });
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedContent(data.content);
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/content-flow/day', day] });
      toast({
        title: "Content Generated!",
        description: "Your AI-powered social media post is ready."
      });
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Could not generate content. Please try again.",
        variant: "destructive"
      });
    }
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (uploadedFile) {
        formData.append('media', uploadedFile);
      }
      formData.append('customContent', customContext);
      
      const res = await fetch(`/api/ambassador/content-flow/day/${day}/complete`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Completion failed');
      }
      return data;
    },
    onSuccess: (data) => {
      // Invalidate all content flow related queries
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/content-flow/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/content-flow/progress'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/content-flow/day', day] });
      toast({
        title: "Day Completed!",
        description: `You earned ${data.tokensEarned} tokens! ${data.bonusEarned > 0 ? `(+${data.bonusEarned} bonus for media)` : ''}`
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Completion Failed",
        description: error.message || "Could not mark day as complete. Please try again.",
        variant: "destructive"
      });
    }
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setUploadedFile(acceptedFiles[0]);
      toast({
        title: "File Uploaded",
        description: `${acceptedFiles[0].name} ready for submission.`
      });
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
      'video/*': ['.mp4', '.mov', '.webm']
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024
  });

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({ title: "Copied!", description: "Text copied to clipboard." });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-400" />
      </div>
    );
  }

  if (!dayData || !dayData.isUnlocked) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">
        <Card className="bg-gray-800 border-gray-700 max-w-md">
          <CardContent className="p-8 text-center">
            <Clock className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Day Not Available</h2>
            <p className="text-gray-400 mb-4">Complete previous days to unlock this content.</p>
            <Button onClick={() => setLocation('/ambassador/content-flow')}>
              Return to Calendar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { lesson, progress } = dayData;
  const isCompleted = progress?.status === 'completed';
  const isInProgress = progress?.status === 'in_progress';

  const savedContent = progress?.aiGeneratedContent ? JSON.parse(progress.aiGeneratedContent) : null;
  const displayContent = generatedContent || savedContent;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button 
            variant="ghost" 
            onClick={() => setLocation('/ambassador/content-flow')}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Calendar
          </Button>
          
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                <CheckCircle className="w-4 h-4 mr-1" />
                Completed
              </Badge>
            ) : isInProgress ? (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                <Clock className="w-4 h-4 mr-1" />
                In Progress
              </Badge>
            ) : (
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                Available
              </Badge>
            )}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-gray-700">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant="outline" className="mb-2 text-green-400 border-green-500/30">
                    Day {lesson.dayNumber} of 44
                  </Badge>
                  <CardTitle className="text-2xl md:text-3xl text-white">{lesson.title}</CardTitle>
                  <CardDescription className="text-lg text-gray-300">{lesson.tradingTopic}</CardDescription>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-amber-400">
                    <Star className="w-5 h-5" />
                    <span className="text-lg font-bold">{lesson.tokenReward}</span>
                  </div>
                  {lesson.bonusTokens > 0 && (
                    <p className="text-xs text-green-400">+{lesson.bonusTokens} with media</p>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>
        </motion.div>

        <Tabs defaultValue="lesson" className="w-full">
          <TabsList className="w-full bg-gray-800/50 border border-gray-700 p-1">
            <TabsTrigger value="lesson" className="flex-1 data-[state=active]:bg-green-500/20">
              <BookOpen className="w-4 h-4 mr-2" />
              Lesson
            </TabsTrigger>
            <TabsTrigger value="content" className="flex-1 data-[state=active]:bg-green-500/20">
              <Sparkles className="w-4 h-4 mr-2" />
              Create
            </TabsTrigger>
            <TabsTrigger value="community" className="flex-1 data-[state=active]:bg-purple-500/20">
              <Users className="w-4 h-4 mr-2" />
              Community
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lesson" className="mt-4 space-y-4">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg text-white">Trading Lesson</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 leading-relaxed">{lesson.tradingLesson}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/30">
              <CardHeader>
                <CardTitle className="text-lg text-amber-400 flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Scripture: {lesson.scriptureReference}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <blockquote className="text-lg italic text-gray-200 border-l-4 border-amber-500/50 pl-4">
                  "{lesson.scriptureText}"
                </blockquote>
                <div className="pt-4 border-t border-amber-500/20">
                  <p className="text-gray-300">{lesson.devotionalMessage}</p>
                </div>
              </CardContent>
            </Card>

            {!isInProgress && !isCompleted && (
              <Button 
                className="w-full bg-green-500 hover:bg-green-600"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
              >
                {startMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Flame className="w-4 h-4 mr-2" />
                )}
                Start This Day
              </Button>
            )}
          </TabsContent>

          <TabsContent value="content" className="mt-4 space-y-4">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg text-white">AI Content Generator</CardTitle>
                <CardDescription>
                  Generate social media posts based on today's lesson. Add your own context to personalize.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    Add Your Context (Optional)
                  </label>
                  <Textarea
                    placeholder="Share your personal trading experience or insights to personalize the content..."
                    value={customContext}
                    onChange={(e) => setCustomContext(e.target.value)}
                    className="bg-gray-700 border-gray-600 text-white"
                    rows={3}
                  />
                </div>

                <Button 
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600"
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Generate AI Content
                </Button>
              </CardContent>
            </Card>

            {displayContent && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-lg text-white flex items-center justify-between">
                      <span>Short Post (Twitter/X)</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(displayContent.shortPost, 'short')}
                      >
                        {copiedField === 'short' ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-300 bg-gray-700/50 p-4 rounded-lg">{displayContent.shortPost}</p>
                  </CardContent>
                </Card>

                <Card className="bg-gray-800/50 border-gray-700">
                  <CardHeader>
                    <CardTitle className="text-lg text-white flex items-center justify-between">
                      <span>Long Post (Instagram/LinkedIn)</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(displayContent.longPost, 'long')}
                      >
                        {copiedField === 'long' ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-300 bg-gray-700/50 p-4 rounded-lg whitespace-pre-wrap">{displayContent.longPost}</p>
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-2">
                  {(displayContent.suggestedHashtags || lesson.suggestedHashtags)?.map((tag: string, idx: number) => (
                    <Badge 
                      key={idx}
                      variant="outline"
                      className="cursor-pointer hover:bg-gray-700"
                      onClick={() => copyToClipboard(tag, `tag-${idx}`)}
                    >
                      {copiedField === `tag-${idx}` ? <Check className="w-3 h-3 mr-1" /> : null}
                      {tag}
                    </Badge>
                  ))}
                </div>
              </motion.div>
            )}

            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-lg text-white flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Upload Media
                  <Badge variant="outline" className="text-green-400 border-green-500/30">
                    +{lesson.bonusTokens} bonus tokens
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Upload an {lesson.mediaType === 'video' ? 'video' : 'image'} to earn bonus tokens
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                    isDragActive 
                      ? 'border-green-500 bg-green-500/10' 
                      : uploadedFile 
                        ? 'border-green-500/50 bg-green-500/5'
                        : 'border-gray-600 hover:border-gray-500'
                  }`}
                >
                  <input {...getInputProps()} />
                  {uploadedFile ? (
                    <div className="space-y-2">
                      <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
                      <p className="text-green-400 font-medium">{uploadedFile.name}</p>
                      <p className="text-sm text-gray-400">Click or drag to replace</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lesson.mediaType === 'video' ? (
                        <Video className="w-12 h-12 text-gray-500 mx-auto" />
                      ) : (
                        <Image className="w-12 h-12 text-gray-500 mx-auto" />
                      )}
                      <p className="text-gray-300">
                        {isDragActive ? 'Drop your file here' : 'Drag & drop or click to upload'}
                      </p>
                      <p className="text-sm text-gray-500">
                        Supports {lesson.mediaType === 'video' ? 'MP4, MOV, WebM' : 'PNG, JPG, GIF'}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {!isCompleted && (isInProgress || displayContent) && (
              <Button 
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 py-6 text-lg"
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending}
              >
                {completeMutation.isPending ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Send className="w-5 h-5 mr-2" />
                )}
                Complete Day {lesson.dayNumber} & Claim {lesson.tokenReward + (uploadedFile ? lesson.bonusTokens : 0)} Tokens
              </Button>
            )}

            {isCompleted && (
              <div className="text-center p-6 bg-green-500/10 rounded-xl border border-green-500/30">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-green-400 font-medium">Day Completed!</p>
                <p className="text-gray-400">You earned {progress.tokensEarned} tokens</p>
              </div>
            )}
          </TabsContent>

          {/* Community Tab - nas.io style features */}
          <TabsContent value="community" className="mt-4 space-y-6">
            {communityLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              </div>
            ) : (
              <>
                {/* Social Content Directions */}
                <Card className="bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border-purple-500/30">
                  <CardHeader>
                    <CardTitle className="text-lg text-white flex items-center gap-2">
                      <Target className="w-5 h-5 text-purple-400" />
                      Social Content Directions
                    </CardTitle>
                    <CardDescription>
                      Platform-specific post ideas to maximize your reach today
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {communityData?.socialDirections && communityData.socialDirections.length > 0 ? (
                      <Accordion type="single" collapsible className="space-y-2">
                        {communityData.socialDirections.map((direction) => (
                          <AccordionItem 
                            key={direction.id} 
                            value={`direction-${direction.id}`}
                            className="border border-gray-700 rounded-lg bg-gray-800/50"
                          >
                            <AccordionTrigger className="px-4 py-3 hover:no-underline">
                              <div className="flex items-center gap-3">
                                {getPlatformIcon(direction.platform)}
                                <span className="text-white capitalize font-medium">{direction.platform}</span>
                                <Badge variant="outline" className="text-xs">
                                  {direction.contentType}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4 space-y-4">
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Hook Line</p>
                                <p className="text-purple-300 font-medium">{direction.hookLine}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Post Idea</p>
                                <p className="text-gray-300">{direction.postIdea}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Ready-to-Use Caption</p>
                                <div className="bg-gray-700/50 p-3 rounded-lg relative">
                                  <p className="text-gray-200 text-sm whitespace-pre-wrap">{direction.captionTemplate}</p>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="absolute top-2 right-2"
                                    onClick={() => copyToClipboard(direction.captionTemplate, `caption-${direction.id}`)}
                                  >
                                    {copiedField === `caption-${direction.id}` ? (
                                      <Check className="w-4 h-4 text-green-400" />
                                    ) : (
                                      <Copy className="w-4 h-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">Call to Action</p>
                                <p className="text-amber-400">{direction.callToAction}</p>
                              </div>
                              {direction.hashtags && direction.hashtags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {direction.hashtags.map((tag, idx) => (
                                    <Badge 
                                      key={idx}
                                      variant="outline"
                                      className="text-xs cursor-pointer hover:bg-purple-500/20"
                                      onClick={() => copyToClipboard(tag, `hash-${direction.id}-${idx}`)}
                                    >
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {direction.bestPostingTime && (
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                  <Clock className="w-4 h-4" />
                                  Best time: {direction.bestPostingTime}
                                </div>
                              )}
                              {direction.engagementTips && direction.engagementTips.length > 0 && (
                                <div className="bg-green-500/10 p-3 rounded-lg">
                                  <p className="text-xs text-green-400 font-medium mb-2">Engagement Tips</p>
                                  <ul className="space-y-1">
                                    {direction.engagementTips.map((tip, idx) => (
                                      <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                                        <Zap className="w-3 h-3 text-green-400 mt-1 flex-shrink-0" />
                                        {tip}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    ) : (
                      <div className="text-center py-6">
                        <Button
                          variant="outline"
                          onClick={() => {
                            refetchCommunity();
                            fetch(`/api/ambassador/community/social-directions/${day}`, { credentials: 'include' })
                              .then(() => refetchCommunity());
                          }}
                          className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Social Content Ideas
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Weekly Challenges */}
                <Card className="bg-gradient-to-br from-amber-900/30 to-orange-900/20 border-amber-500/30">
                  <CardHeader>
                    <CardTitle className="text-lg text-white flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-amber-400" />
                      Week {weekNumber} Challenges
                    </CardTitle>
                    <CardDescription>
                      Join challenges to earn bonus tokens and badges
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {communityData?.challenges && communityData.challenges.length > 0 ? (
                      communityData.challenges.map((challenge) => (
                        <div 
                          key={challenge.id}
                          className="bg-gray-800/70 border border-gray-700 rounded-lg p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-white">{challenge.title}</h4>
                                <Badge className={getDifficultyColor(challenge.difficulty)}>
                                  {challenge.difficulty}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-400">{challenge.description}</p>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-1 text-amber-400">
                                <Star className="w-4 h-4" />
                                <span className="font-bold">{challenge.tokenReward}</span>
                              </div>
                              {challenge.badgeReward && (
                                <div className="flex items-center gap-1 text-xs text-purple-400 mt-1">
                                  <Award className="w-3 h-3" />
                                  Badge
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {challenge.objectives && (
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500">Objectives:</p>
                              <ul className="space-y-1">
                                {(challenge.objectives as string[]).slice(0, 3).map((obj, idx) => (
                                  <li key={idx} className="text-sm text-gray-300 flex items-start gap-2">
                                    <Target className="w-3 h-3 text-amber-400 mt-1 flex-shrink-0" />
                                    {obj}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {joinedChallenges.has(challenge.id) ? (
                            <Button
                              size="sm"
                              className="w-full bg-green-600 hover:bg-green-700"
                              onClick={() => setLocation(`/ambassador/challenge/${challenge.id}`)}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Continue Challenge
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                              onClick={() => joinChallengeMutation.mutate(challenge.id)}
                              disabled={joinChallengeMutation.isPending}
                            >
                              {joinChallengeMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4 mr-2" />
                              )}
                              Join Challenge
                            </Button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-gray-400 mb-3">No challenges yet for Week {weekNumber}</p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            fetch(`/api/ambassador/community/challenges?week=${weekNumber}`, { credentials: 'include' })
                              .then(() => refetchCommunity());
                          }}
                          className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        >
                          <Trophy className="w-4 h-4 mr-2" />
                          Generate Weekly Challenges
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Community Events */}
                <Card className="bg-gradient-to-br from-blue-900/30 to-cyan-900/20 border-blue-500/30">
                  <CardHeader>
                    <CardTitle className="text-lg text-white flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-400" />
                      Community Events
                    </CardTitle>
                    <CardDescription>
                      Host or join virtual events to earn tokens and build community
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {communityData?.events && communityData.events.length > 0 ? (
                      communityData.events.map((event) => (
                        <div 
                          key={event.id}
                          className="bg-gray-800/70 border border-gray-700 rounded-lg p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-white">{event.title}</h4>
                                <Badge variant="outline" className="text-blue-400 border-blue-500/30">
                                  {event.eventType.replace('_', ' ')}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-400">{event.description}</p>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-1 text-blue-400 text-sm">
                                <Clock className="w-4 h-4" />
                                {event.suggestedDuration}m
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-3 text-sm">
                            <div className="flex items-center gap-1 text-green-400">
                              <Star className="w-4 h-4" />
                              <span>Attend: +{event.tokenReward}</span>
                            </div>
                            <div className="flex items-center gap-1 text-purple-400">
                              <Trophy className="w-4 h-4" />
                              <span>Host: +{event.hostTokenReward}</span>
                            </div>
                          </div>

                          {event.talkingPoints && (
                            <div className="bg-blue-500/10 p-3 rounded-lg">
                              <p className="text-xs text-blue-400 font-medium mb-2">Key Topics</p>
                              <div className="flex flex-wrap gap-1">
                                {(event.talkingPoints as string[]).slice(0, 4).map((point, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {point.slice(0, 30)}{point.length > 30 ? '...' : ''}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex gap-2">
                            {registeredEvents.has(event.id) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 bg-green-900/30 border-green-500/30 text-green-400"
                                disabled
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Registered
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                                onClick={() => registerEventMutation.mutate({ eventId: event.id, role: 'attendee' })}
                                disabled={registerEventMutation.isPending}
                              >
                                <Users className="w-4 h-4 mr-2" />
                                Register
                              </Button>
                            )}
                            <Button
                              size="sm"
                              className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                              onClick={() => {
                                setHostingEvent(event);
                                setHostFormData({
                                  title: event.title,
                                  description: event.description || '',
                                  startAt: '',
                                  capacity: 50,
                                  meetingLink: ''
                                });
                              }}
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Host This
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-gray-400 mb-3">No events yet for Week {weekNumber}</p>
                        <Button
                          variant="outline"
                          onClick={() => {
                            fetch(`/api/ambassador/community/events?week=${weekNumber}`, { credentials: 'include' })
                              .then(() => refetchCommunity());
                          }}
                          className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                        >
                          <Calendar className="w-4 h-4 mr-2" />
                          Generate Event Templates
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Event Hosting Modal */}
      <Dialog open={!!hostingEvent} onOpenChange={() => setHostingEvent(null)}>
        <DialogContent className="bg-gray-900 border-gray-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              Host: {hostingEvent?.title}
            </DialogTitle>
            <DialogDescription>
              Set up your session and AI will generate an agenda to help you host effectively.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="host-title">Session Title</Label>
              <Input
                id="host-title"
                value={hostFormData.title}
                onChange={(e) => setHostFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Your session title"
                className="bg-gray-800 border-gray-700"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="host-description">Description</Label>
              <Textarea
                id="host-description"
                value={hostFormData.description}
                onChange={(e) => setHostFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What will you cover in this session?"
                className="bg-gray-800 border-gray-700"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="host-date">Date & Time</Label>
                <Input
                  id="host-date"
                  type="datetime-local"
                  value={hostFormData.startAt}
                  onChange={(e) => setHostFormData(prev => ({ ...prev, startAt: e.target.value }))}
                  className="bg-gray-800 border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="host-capacity">Max Attendees</Label>
                <Input
                  id="host-capacity"
                  type="number"
                  value={hostFormData.capacity}
                  onChange={(e) => setHostFormData(prev => ({ ...prev, capacity: parseInt(e.target.value) || 50 }))}
                  className="bg-gray-800 border-gray-700"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="host-link">Meeting Link (optional)</Label>
              <Input
                id="host-link"
                value={hostFormData.meetingLink}
                onChange={(e) => setHostFormData(prev => ({ ...prev, meetingLink: e.target.value }))}
                placeholder="Zoom, Google Meet, or Discord link"
                className="bg-gray-800 border-gray-700"
              />
            </div>
            
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-medium">AI will generate:</span>
              </div>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• Detailed session agenda with timing</li>
                <li>• Preparation tips for hosting</li>
                <li>• Talking points and engagement strategies</li>
              </ul>
            </div>
            
            <div className="flex items-center justify-between pt-4 border-t border-gray-700">
              <div className="text-sm text-purple-400">
                <Trophy className="w-4 h-4 inline mr-1" />
                Earn +{hostingEvent?.hostTokenReward || 50} tokens
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setHostingEvent(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => hostingEvent && hostEventMutation.mutate({
                    eventId: hostingEvent.id,
                    ...hostFormData
                  })}
                  disabled={!hostFormData.startAt || hostEventMutation.isPending}
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                >
                  {hostEventMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Create & Generate Agenda
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
