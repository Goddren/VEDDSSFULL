import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useDropzone } from "react-dropzone";
import { motion } from "framer-motion";
import { 
  ArrowLeft, BookOpen, Sparkles, Copy, Check, Upload, Image, 
  Video, Star, Flame, Send, Loader2, CheckCircle, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
              Create Content
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
        </Tabs>
      </div>
    </div>
  );
}
