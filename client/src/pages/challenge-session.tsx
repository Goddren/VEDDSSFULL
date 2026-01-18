import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, Trophy, Target, CheckCircle, Circle, Sparkles, 
  Upload, Send, Loader2, Star, Clock, Award, MessageCircle,
  ChevronRight, Gift, Lightbulb, ThumbsUp, Reply
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Step {
  stepNumber: number;
  title: string;
  description: string;
  tips: string[];
  completed: boolean;
}

interface AIContext {
  guidance: string;
  tips: string[];
  encouragement: string;
}

interface Session {
  id: number;
  challengeId: number;
  userId: number;
  status: string;
  currentStep: number;
  totalSteps: number;
  aiContext: AIContext;
  aiSteps: Step[];
  evidenceUrl?: string;
  evidenceNotes?: string;
  tokensClaimed: boolean;
  startedAt: string;
  completedAt?: string;
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
  badgeReward?: string;
}

interface Comment {
  id: number;
  content: string;
  authorId: number;
  author?: { id: number; username: string; fullName?: string };
  likes: number;
  createdAt: string;
  replies?: Comment[];
}

interface SessionData {
  challenge: Challenge;
  session: Session;
}

export default function ChallengeSession() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState("");

  const challengeId = parseInt(id || "0");

  const { data, isLoading, error } = useQuery<SessionData>({
    queryKey: ['/api/ambassador/community/challenges', challengeId, 'session'],
    queryFn: async () => {
      const res = await fetch(`/api/ambassador/community/challenges/${challengeId}/session`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load session');
      return res.json();
    },
    enabled: !!challengeId
  });

  const { data: commentsData, refetch: refetchComments } = useQuery<{ comments: Comment[] }>({
    queryKey: ['/api/ambassador/community/comments', 'challenge', challengeId],
    queryFn: async () => {
      const res = await fetch(`/api/ambassador/community/comments/challenge/${challengeId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load comments');
      return res.json();
    },
    enabled: !!challengeId
  });

  const completeStepMutation = useMutation({
    mutationFn: async (stepNumber: number) => {
      const res = await apiRequest('POST', `/api/ambassador/community/challenges/${challengeId}/session/step`, { stepNumber });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/community/challenges', challengeId, 'session'] });
      if (data.allComplete) {
        toast({ title: "All steps completed!", description: "Submit your evidence to claim your reward!" });
      } else {
        toast({ title: "Step completed!", description: "Keep going!" });
      }
    }
  });

  const submitEvidenceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/ambassador/community/challenges/${challengeId}/session/evidence`, { 
        evidenceNotes 
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/community/challenges', challengeId, 'session'] });
      toast({ title: "Evidence submitted!", description: "You can now claim your tokens!" });
    }
  });

  const claimTokensMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/ambassador/community/challenges/${challengeId}/session/claim`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ambassador/community/challenges', challengeId, 'session'] });
      toast({ title: "Tokens claimed!", description: `You earned ${data.tokensAwarded} tokens!` });
    }
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId?: number }) => {
      const res = await apiRequest('POST', `/api/ambassador/community/comments`, {
        targetType: 'challenge',
        targetId: challengeId,
        content,
        parentId
      });
      return res.json();
    },
    onSuccess: () => {
      refetchComments();
      setNewComment("");
      setReplyContent("");
      setReplyingTo(null);
      toast({ title: "Comment posted!" });
    }
  });

  const likeCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiRequest('POST', `/api/ambassador/community/comments/${commentId}/like`);
      return res.json();
    },
    onSuccess: () => refetchComments()
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-amber-400 mx-auto mb-4" />
          <p className="text-gray-400">Preparing your challenge with AI guidance...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 p-6">
        <div className="max-w-4xl mx-auto text-center py-20">
          <p className="text-red-400">Failed to load challenge session</p>
          <Button variant="outline" onClick={() => setLocation('/content-flow')} className="mt-4">
            Back to Content Journey
          </Button>
        </div>
      </div>
    );
  }

  const { challenge, session } = data;
  const completedSteps = session.aiSteps?.filter((s: Step) => s.completed).length || 0;
  const progressPercent = session.totalSteps > 0 ? (completedSteps / session.totalSteps) * 100 : 0;
  const allStepsComplete = completedSteps === session.totalSteps;
  const canClaimTokens = session.status === 'completed' && !session.tokensClaimed;

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'hard': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'expert': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Button 
          variant="ghost" 
          onClick={() => setLocation('/content-flow')}
          className="text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Content Journey
        </Button>

        <Card className="bg-gradient-to-br from-amber-900/40 to-orange-900/30 border-amber-500/40">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-amber-400" />
                  <CardTitle className="text-2xl text-white">{challenge.title}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getDifficultyColor(challenge.difficulty)}>{challenge.difficulty}</Badge>
                  <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                    <Star className="w-3 h-3 mr-1" />
                    {challenge.tokenReward} tokens
                  </Badge>
                  {challenge.badgeReward && (
                    <Badge variant="outline" className="text-purple-400 border-purple-500/30">
                      <Award className="w-3 h-3 mr-1" />
                      Badge
                    </Badge>
                  )}
                </div>
              </div>
              {session.tokensClaimed && (
                <Badge className="bg-green-500 text-white">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Completed
                </Badge>
              )}
            </div>
            <CardDescription className="text-gray-300 mt-2">
              {challenge.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Progress</span>
                <span className="text-amber-400">{completedSteps} / {session.totalSteps} steps</span>
              </div>
              <Progress value={progressPercent} className="h-3 bg-gray-700" />
            </div>
          </CardContent>
        </Card>

        {session.aiContext && (
          <Card className="bg-gradient-to-br from-purple-900/30 to-indigo-900/20 border-purple-500/30">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                AI Coach Guidance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-300">{session.aiContext.guidance}</p>
              
              {session.aiContext.tips && session.aiContext.tips.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-gray-500 flex items-center gap-1">
                    <Lightbulb className="w-4 h-4 text-yellow-400" />
                    Pro Tips:
                  </p>
                  <ul className="space-y-1">
                    {session.aiContext.tips.map((tip, idx) => (
                      <li key={idx} className="text-sm text-gray-400 flex items-start gap-2">
                        <ChevronRight className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                <p className="text-purple-300 text-sm italic">"{session.aiContext.encouragement}"</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-400" />
              Challenge Steps
            </CardTitle>
            <CardDescription>Complete each step to finish the challenge</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {session.aiSteps?.map((step: Step, idx: number) => (
              <motion.div
                key={step.stepNumber}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`border rounded-lg p-4 ${
                  step.completed 
                    ? 'bg-green-900/20 border-green-500/30' 
                    : 'bg-gray-800/70 border-gray-700'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    {step.completed ? (
                      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                        <CheckCircle className="w-6 h-6 text-white" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold">
                        {step.stepNumber}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <h4 className={`font-semibold ${step.completed ? 'text-green-400' : 'text-white'}`}>
                      {step.title}
                    </h4>
                    <p className="text-sm text-gray-400">{step.description}</p>
                    
                    {step.tips && step.tips.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {step.tips.map((tip, tipIdx) => (
                          <p key={tipIdx} className="text-xs text-gray-500 flex items-start gap-1">
                            <Lightbulb className="w-3 h-3 text-yellow-400 mt-0.5" />
                            {tip}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    {!step.completed && (
                      <Button
                        size="sm"
                        onClick={() => completeStepMutation.mutate(step.stepNumber)}
                        disabled={completeStepMutation.isPending}
                        className="bg-amber-500 hover:bg-amber-600"
                      >
                        {completeStepMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Done
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        {allStepsComplete && session.status !== 'completed' && (
          <Card className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border-green-500/30">
            <CardHeader>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-green-400" />
                Submit Your Evidence
              </CardTitle>
              <CardDescription>Share what you accomplished to complete the challenge</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Describe what you did to complete this challenge... (optional but encouraged!)"
                value={evidenceNotes}
                onChange={(e) => setEvidenceNotes(e.target.value)}
                className="bg-gray-800 border-gray-700 min-h-[100px]"
              />
              <Button
                onClick={() => submitEvidenceMutation.mutate()}
                disabled={submitEvidenceMutation.isPending}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {submitEvidenceMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Submit & Complete Challenge
              </Button>
            </CardContent>
          </Card>
        )}

        {canClaimTokens && (
          <Card className="bg-gradient-to-br from-amber-900/50 to-yellow-900/30 border-amber-500/50">
            <CardContent className="py-8 text-center">
              <Gift className="w-16 h-16 text-amber-400 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-white mb-2">Challenge Completed!</h3>
              <p className="text-gray-300 mb-6">Claim your reward of {challenge.tokenReward} tokens</p>
              <Button
                size="lg"
                onClick={() => claimTokensMutation.mutate()}
                disabled={claimTokensMutation.isPending}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              >
                {claimTokensMutation.isPending ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <Star className="w-5 h-5 mr-2" />
                )}
                Claim {challenge.tokenReward} Tokens
              </Button>
            </CardContent>
          </Card>
        )}

        <Separator className="bg-gray-700" />

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg text-white flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-400" />
              Community Discussion
            </CardTitle>
            <CardDescription>Share your progress and tips with fellow ambassadors</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Textarea
                placeholder="Share your experience or ask a question..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="bg-gray-700 border-gray-600 flex-1"
              />
              <Button
                onClick={() => addCommentMutation.mutate({ content: newComment })}
                disabled={!newComment.trim() || addCommentMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {addCommentMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>

            {commentsData?.comments && commentsData.comments.length > 0 ? (
              <div className="space-y-4 mt-6">
                {commentsData.comments.map((comment) => (
                  <div key={comment.id} className="space-y-2">
                    <div className="bg-gray-700/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-white">
                          {comment.author?.fullName || comment.author?.username || 'Anonymous'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm">{comment.content}</p>
                      <div className="flex items-center gap-4 mt-3">
                        <button
                          onClick={() => likeCommentMutation.mutate(comment.id)}
                          className="text-gray-400 hover:text-blue-400 flex items-center gap-1 text-sm"
                        >
                          <ThumbsUp className="w-4 h-4" />
                          {comment.likes || 0}
                        </button>
                        <button
                          onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                          className="text-gray-400 hover:text-blue-400 flex items-center gap-1 text-sm"
                        >
                          <Reply className="w-4 h-4" />
                          Reply
                        </button>
                      </div>
                    </div>

                    {replyingTo === comment.id && (
                      <div className="ml-8 flex gap-2">
                        <Textarea
                          placeholder="Write a reply..."
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          className="bg-gray-700 border-gray-600 flex-1 text-sm"
                        />
                        <Button
                          size="sm"
                          onClick={() => addCommentMutation.mutate({ content: replyContent, parentId: comment.id })}
                          disabled={!replyContent.trim() || addCommentMutation.isPending}
                        >
                          <Send className="w-3 h-3" />
                        </Button>
                      </div>
                    )}

                    {comment.replies && comment.replies.length > 0 && (
                      <div className="ml-8 space-y-2">
                        {comment.replies.map((reply) => (
                          <div key={reply.id} className="bg-gray-700/30 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-white text-sm">
                                {reply.author?.fullName || reply.author?.username || 'Anonymous'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(reply.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-gray-300 text-sm">{reply.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No comments yet. Be the first to share!</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
