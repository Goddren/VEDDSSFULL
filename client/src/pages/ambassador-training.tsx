import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  GraduationCap, 
  Video, 
  Share2, 
  Award, 
  CheckCircle2, 
  Circle,
  Play,
  Clock,
  Star,
  Users,
  TrendingUp,
  MessageSquare,
  Camera,
  Mic,
  Monitor,
  Target,
  Lightbulb,
  BookOpen,
  Sparkles,
  ChevronRight,
  Lock,
  Unlock,
  Trophy,
  Megaphone,
  Heart,
  Globe
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Link } from 'wouter';

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  duration: string;
  icon: typeof GraduationCap;
  lessons: {
    id: string;
    title: string;
    content: string[];
    tips: string[];
    quiz?: {
      question: string;
      options: string[];
      correct: number;
    };
  }[];
}

// Weekly content schedule for ambassadors
const weeklySchedule = [
  { day: 'Monday', action: 'YouTube Tutorial', details: 'Deep dive into one charting feature', icon: Video },
  { day: 'Tuesday', action: 'Quick Tip Reel', details: '30-60 sec chart hack using VEDD AI', icon: Camera },
  { day: 'Wednesday', action: 'Live Session', details: 'Real-time chart analysis + Q&A', icon: Mic },
  { day: 'Thursday', action: 'Community Spotlight', details: 'Share user success stories', icon: Users },
  { day: 'Friday', action: 'Market Recap', details: 'Weekly chart analysis using the tool', icon: TrendingUp },
  { day: 'Saturday', action: 'Twitter/X Space', details: 'Open dialogue on trading strategies', icon: MessageSquare },
  { day: 'Sunday', action: 'Recap & CTA', details: 'Weekly summary + subscription push', icon: Megaphone }
];

// Success metrics for ambassadors
const successMetrics = [
  { metric: 'Subscriber Growth', description: 'Growth on YouTube and social platforms tied to chart analysis content', icon: TrendingUp },
  { metric: 'Engagement Rate', description: 'Increase in live attendance and tutorial views', icon: Heart },
  { metric: 'Conversions', description: 'Track sign-ups to VEDD AI linked to ambassador content', icon: Target },
  { metric: 'Community Building', description: 'Build a following of traders who rely on you for chart insights', icon: Users }
];

// Ideal candidate traits
const idealCandidateTraits = [
  'Strong presence on live platforms; comfortable teaching technical concepts in real time',
  'Skilled at simplifying chart analysis for beginners while offering depth for advanced users',
  'Experienced in video production and editing for YouTube tutorials',
  'Active trader or analyst with credibility in financial communities',
  'Ability to consistently produce content aligned with market cycles'
];

// Core responsibilities
const coreResponsibilities = [
  {
    title: 'Content Creation',
    items: [
      'Produce weekly YouTube tutorials explaining VEDD AI features (chart layouts, indicators, overlays, analysis workflows)',
      'Create short-form content (TikTok/Instagram Reels) highlighting quick tips and chart hacks'
    ]
  },
  {
    title: 'Live Engagement',
    items: [
      'Host regular live sessions (YouTube Live, Instagram Live, Twitter/X Spaces) demonstrating real-time chart analysis',
      'Answer community questions and provide practical trading insights using the platform'
    ]
  },
  {
    title: 'Community Building',
    items: [
      'Spotlight user success stories and encourage participation in discussions',
      'Actively engage with comments, forums, and social groups to foster loyalty'
    ]
  },
  {
    title: 'Brand Representation',
    items: [
      'Embody VEDD AI\'s professional yet accessible identity',
      'Align content with product updates, campaigns, and market cycles'
    ]
  },
  {
    title: 'Growth & Conversion',
    items: [
      'Drive sign-ups and subscriptions through clear CTAs in content',
      'Track and report engagement metrics tied to ambassador activities'
    ]
  }
];

// Compensation structure
const compensationInfo = {
  base: 'Monthly stipend (negotiable based on experience and reach)',
  incentives: 'Bonuses tied to sign-ups, conversions, and engagement metrics',
  perks: ['Early access to new features', 'Branded gear', 'Opportunities to co-create educational campaigns']
};

const trainingModules: TrainingModule[] = [
  {
    id: 'intro',
    title: 'Introduction to VEDD AI',
    description: 'Learn what makes VEDD AI unique and how it helps traders',
    duration: '15 min',
    icon: BookOpen,
    lessons: [
      {
        id: 'intro-1',
        title: 'What is VEDD AI?',
        content: [
          'VEDD AI is a cutting-edge chart analysis platform designed to empower traders and analysts with intuitive tools for technical market insights',
          'Our mission is to make professional-grade charting accessible, educational, and community-driven',
          'Features include AI-powered chart analysis, EA generation, marketplace, and social trading',
          'Available for Forex, Stocks, Crypto, and Indices traders on MT5, TradingView, and TradeLocker'
        ],
        tips: [
          'Emphasize that VEDD AI makes professional-grade charting accessible to everyone',
          'Highlight the educational and community-driven aspects of the platform'
        ]
      },
      {
        id: 'intro-2',
        title: 'Key Value Propositions',
        content: [
          'Save hours of manual chart analysis with AI automation',
          'Generate professional EA code without programming knowledge',
          'Earn passive income by sharing strategies in the marketplace',
          'Join a community of like-minded traders',
          'Access intuitive tools for technical market insights'
        ],
        tips: [
          'Focus on time-saving benefits for busy traders',
          'Mention the earning potential through the marketplace'
        ],
        quiz: {
          question: 'What is the main benefit of VEDD AI for traders?',
          options: [
            'Free trading signals',
            'AI-powered chart analysis that saves time',
            'Guaranteed profits',
            'Free trading platform'
          ],
          correct: 1
        }
      }
    ]
  },
  {
    id: 'features',
    title: 'Core Features Deep Dive',
    description: 'Master all features to explain them confidently',
    duration: '30 min',
    icon: Target,
    lessons: [
      {
        id: 'features-1',
        title: 'Chart Analysis Features',
        content: [
          'Upload any chart screenshot for instant AI analysis',
          'Multi-timeframe analysis combines signals from M15, H1, H4, D1',
          'Pattern recognition identifies 20+ chart patterns',
          'Entry/exit points with specific price levels',
          'Risk/reward calculations for trade planning'
        ],
        tips: [
          'Demo the upload process in your videos',
          'Show real examples of analysis results'
        ]
      },
      {
        id: 'features-2',
        title: 'EA Generation',
        content: [
          'One-click EA code generation from any analysis',
          'Supports MT5, TradingView Pine Script, and TradeLocker',
          'Code includes proper risk management',
          'Customizable parameters for your trading style'
        ],
        tips: [
          'Explain that no coding knowledge is required',
          'Show how easy it is to download and use the code'
        ]
      },
      {
        id: 'features-3',
        title: 'Marketplace & Social',
        content: [
          'EA Marketplace for buying and selling strategies',
          'Social Hub for following traders and sharing analyses',
          'Referral program for earning credits',
          'Achievement system for gamified progress'
        ],
        tips: [
          'Highlight the passive income opportunity',
          'Explain the social proof from community engagement'
        ],
        quiz: {
          question: 'How many platforms can VEDD AI generate EA code for?',
          options: ['1', '2', '3', '5'],
          correct: 2
        }
      }
    ]
  },
  {
    id: 'social-media',
    title: 'Social Media Promotion',
    description: 'Strategies for promoting VEDD AI on social platforms',
    duration: '25 min',
    icon: Share2,
    lessons: [
      {
        id: 'social-1',
        title: 'Platform-Specific Strategies',
        content: [
          'Twitter/X: Share quick analysis screenshots with your referral link',
          'Instagram: Create carousel posts showing before/after analysis',
          'TikTok: Short videos demonstrating the upload and analysis process',
          'YouTube: In-depth tutorials and trading education content',
          'LinkedIn: Professional content targeting serious traders'
        ],
        tips: [
          'Use platform-native features (Reels, Stories, Threads)',
          'Post consistently at optimal times for your audience'
        ]
      },
      {
        id: 'social-2',
        title: 'Content Ideas That Work',
        content: [
          'Before/after analysis comparisons',
          '"Day in the life" of using VEDD AI',
          'Weekly market analysis using the platform',
          'Tutorial walkthroughs for new features',
          'Success stories and testimonials',
          'Live trading sessions using AI insights'
        ],
        tips: [
          'Always include a clear call-to-action',
          'Use your branded referral link in bio/description'
        ]
      },
      {
        id: 'social-3',
        title: 'Hashtags & SEO',
        content: [
          'Use trading-related hashtags: #forex #trading #crypto #stocks',
          'Add AI hashtags: #AI #tradingAI #automation',
          'Include platform tags: #MT5 #TradingView',
          'Create a unique hashtag for your content'
        ],
        tips: [
          'Research trending hashtags in the trading niche',
          'Mix popular and niche hashtags for reach'
        ],
        quiz: {
          question: 'What should always be included in your social media posts?',
          options: [
            'Your personal trading results',
            'A clear call-to-action with referral link',
            'Criticism of other platforms',
            'Guaranteed profit claims'
          ],
          correct: 1
        }
      }
    ]
  },
  {
    id: 'video-creation',
    title: 'Creating Explainer Videos',
    description: 'Learn to create compelling video content',
    duration: '35 min',
    icon: Video,
    lessons: [
      {
        id: 'video-1',
        title: 'Video Equipment & Setup',
        content: [
          'Smartphone camera is sufficient for starting out',
          'Use good lighting - natural light or ring light',
          'Clear audio is essential - consider a lapel mic',
          'Clean, professional background',
          'Screen recording software for demos (OBS, Loom, etc.)'
        ],
        tips: [
          'Test your setup before recording',
          'Record in a quiet environment'
        ]
      },
      {
        id: 'video-2',
        title: 'Video Structure',
        content: [
          'Hook (0-5 sec): Grab attention with a bold statement or question',
          'Problem (5-15 sec): Address the pain point of manual analysis',
          'Solution (15-45 sec): Introduce VEDD AI as the answer',
          'Demo (45-90 sec): Show the platform in action',
          'CTA (last 10 sec): Direct viewers to sign up'
        ],
        tips: [
          'Keep videos under 2 minutes for social media',
          'Longer tutorials can be 5-10 minutes for YouTube'
        ]
      },
      {
        id: 'video-3',
        title: 'Scripting Your Videos',
        content: [
          'Start with: "Are you tired of spending hours analyzing charts?"',
          'Transition: "What if AI could do it for you in seconds?"',
          'Demo: "Let me show you how VEDD AI works..."',
          'Benefits: "This saves me X hours every week"',
          'Close: "Click the link below to try it yourself"'
        ],
        tips: [
          'Speak naturally - don\'t read word-for-word',
          'Show your personality and enthusiasm'
        ],
        quiz: {
          question: 'How long should social media explainer videos be?',
          options: [
            'Under 30 seconds',
            'Under 2 minutes',
            '5-10 minutes',
            '30+ minutes'
          ],
          correct: 1
        }
      },
      {
        id: 'video-4',
        title: 'Editing Tips',
        content: [
          'Use jump cuts to keep pace engaging',
          'Add text overlays for key points',
          'Include the VEDD AI logo/branding',
          'Add background music (royalty-free)',
          'Use transitions between sections'
        ],
        tips: [
          'Free editing apps: CapCut, DaVinci Resolve, iMovie',
          'Keep branding consistent across videos'
        ]
      }
    ]
  },
  {
    id: 'live-demos',
    title: 'Live Demonstration Skills',
    description: 'Master live presentations and demos',
    duration: '20 min',
    icon: Monitor,
    lessons: [
      {
        id: 'live-1',
        title: 'Preparing for Live Demos',
        content: [
          'Have sample charts ready to upload',
          'Pre-load the platform and log in',
          'Test your internet connection',
          'Prepare talking points for each feature',
          'Have backup content if something fails'
        ],
        tips: [
          'Practice your demo multiple times',
          'Anticipate common questions'
        ]
      },
      {
        id: 'live-2',
        title: 'Engaging Your Audience',
        content: [
          'Ask questions to involve viewers',
          'Respond to comments in real-time',
          'Use polls and Q&A features',
          'Share personal experiences and results',
          'Create urgency with limited-time offers'
        ],
        tips: [
          'Have a co-host to manage chat',
          'Acknowledge viewers by name when possible'
        ]
      },
      {
        id: 'live-3',
        title: 'Handling Objections',
        content: [
          '"Is this a scam?" - Explain the legitimate AI technology',
          '"Does it guarantee profits?" - Never guarantee, focus on analysis quality',
          '"Why should I pay?" - Highlight time savings and value',
          '"Is my data safe?" - Explain security measures'
        ],
        tips: [
          'Stay calm and professional',
          'Redirect to positive aspects'
        ],
        quiz: {
          question: 'How should you respond to profit guarantee questions?',
          options: [
            'Promise high returns',
            'Never guarantee, focus on analysis quality',
            'Ignore the question',
            'Show past trade results'
          ],
          correct: 1
        }
      }
    ]
  },
  {
    id: 'compliance',
    title: 'Compliance & Best Practices',
    description: 'Stay compliant and build trust',
    duration: '15 min',
    icon: Award,
    lessons: [
      {
        id: 'compliance-1',
        title: 'What NOT to Do',
        content: [
          'Never guarantee profits or returns',
          'Don\'t make false claims about the AI',
          'Avoid showing fake testimonials',
          'Don\'t pressure people aggressively',
          'Never share others\' personal trading data'
        ],
        tips: [
          'When in doubt, keep claims modest',
          'Focus on features, not unrealistic promises'
        ]
      },
      {
        id: 'compliance-2',
        title: 'Building Trust',
        content: [
          'Be transparent about how the AI works',
          'Share your own genuine experience',
          'Acknowledge limitations honestly',
          'Provide value before asking for signups',
          'Respond promptly to questions and concerns'
        ],
        tips: [
          'Trust leads to long-term followers',
          'Quality over quantity in referrals'
        ]
      },
      {
        id: 'compliance-3',
        title: 'Disclosure Requirements',
        content: [
          'Always disclose affiliate/referral relationships',
          'Use #ad or #sponsored when required',
          'Be clear that you earn from referrals',
          'Follow platform-specific guidelines'
        ],
        tips: [
          'Transparency builds credibility',
          'Check local regulations for financial promotions'
        ],
        quiz: {
          question: 'What must you always disclose in your promotions?',
          options: [
            'Your personal trading results',
            'Your affiliate/referral relationship',
            'Your trading strategy',
            'Your real name'
          ],
          correct: 1
        }
      }
    ]
  }
];

export default function AmbassadorTrainingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeModule, setActiveModule] = useState<string>(trainingModules[0].id);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [showCertificate, setShowCertificate] = useState(false);

  const totalLessons = trainingModules.reduce((acc, m) => acc + m.lessons.length, 0);
  const progress = (completedLessons.size / totalLessons) * 100;
  const isComplete = completedLessons.size === totalLessons;

  const markLessonComplete = (lessonId: string) => {
    setCompletedLessons(prev => new Set(Array.from(prev).concat(lessonId)));
    toast({
      title: 'Lesson Complete!',
      description: 'Keep going to earn your Ambassador certificate.'
    });
  };

  const handleQuizAnswer = (lessonId: string, answerIndex: number, correctIndex: number) => {
    setQuizAnswers(prev => ({ ...prev, [lessonId]: answerIndex }));
    if (answerIndex === correctIndex) {
      toast({
        title: 'Correct!',
        description: 'Great job! You can now mark this lesson complete.'
      });
    } else {
      toast({
        title: 'Not quite right',
        description: 'Review the content and try again.',
        variant: 'destructive'
      });
    }
  };

  const currentModule = trainingModules.find(m => m.id === activeModule);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-gray-950 py-8 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-amber-500/20 text-amber-400 border-amber-500/30">
            Ambassador Program
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-training-title">
            VEDD AI Ambassador Training
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Complete this training to become a certified VEDD AI Ambassador. 
            Serve as the public educator and promoter of VEDD AI's chart analysis capabilities through live social presence and clear video tutorials.
          </p>
        </div>

        {/* Position Overview Section */}
        <Card className="mb-8 bg-gradient-to-r from-amber-900/30 to-gray-900 border-amber-500/30">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-3">
              <Target className="w-7 h-7 text-amber-400" />
              Position Overview
            </CardTitle>
            <CardDescription className="text-base">
              We are seeking a dynamic Ambassador to represent VEDD AI across social platforms
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-300 mb-6">
              This individual will serve as the face and voice of the platform, educating users through tutorials, live sessions, and community engagement. The Ambassador will simplify complex charting concepts, showcase platform features, and inspire traders to adopt VEDD AI as their go-to analysis tool.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 text-gray-400">
                <Video className="w-5 h-5 text-amber-400" />
                <span>YouTube tutorials & educational content</span>
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <Mic className="w-5 h-5 text-amber-400" />
                <span>Live sessions on YouTube, Instagram, Twitter/X</span>
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <Camera className="w-5 h-5 text-amber-400" />
                <span>Short-form content (TikTok/Instagram Reels)</span>
              </div>
              <div className="flex items-center gap-3 text-gray-400">
                <Users className="w-5 h-5 text-amber-400" />
                <span>Community building & engagement</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Core Responsibilities Section */}
        <Card className="mb-8 bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <Megaphone className="w-6 h-6 text-blue-400" />
              Core Responsibilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {coreResponsibilities.map((resp, idx) => (
                <Card key={idx} className="bg-gray-800/50 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-amber-400">{resp.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {resp.items.map((item, itemIdx) => (
                        <li key={itemIdx} className="flex items-start gap-2 text-sm text-gray-400">
                          <ChevronRight className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Schedule Section */}
        <Card className="mb-8 bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <Clock className="w-6 h-6 text-green-400" />
              Suggested Weekly Content Flow
            </CardTitle>
            <CardDescription>
              Follow this schedule to maintain consistent engagement with your audience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {weeklySchedule.map((day, idx) => (
                <Card key={idx} className="bg-gray-800/50 border-gray-700 text-center">
                  <CardContent className="p-4">
                    <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-green-500/20 flex items-center justify-center">
                      <day.icon className="w-5 h-5 text-green-400" />
                    </div>
                    <h4 className="font-semibold text-sm text-gray-200">{day.day}</h4>
                    <p className="text-xs text-amber-400 font-medium mt-1">{day.action}</p>
                    <p className="text-xs text-gray-500 mt-1">{day.details}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Success Metrics & Ideal Candidate */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-purple-400" />
                Success Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {successMetrics.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-200">{item.metric}</h4>
                    <p className="text-sm text-gray-400">{item.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-3">
                <Star className="w-6 h-6 text-yellow-400" />
                Ideal Candidate Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {idealCandidateTraits.map((trait, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-gray-400">
                    <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                    {trait}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Compensation Section */}
        <Card className="mb-8 bg-gradient-to-r from-green-900/30 to-gray-900 border-green-500/30">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <Award className="w-6 h-6 text-green-400" />
              Compensation & Perks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-gray-800/50 rounded-lg">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-400" />
                </div>
                <h4 className="font-semibold text-gray-200 mb-1">Base Compensation</h4>
                <p className="text-sm text-gray-400">{compensationInfo.base}</p>
              </div>
              <div className="text-center p-4 bg-gray-800/50 rounded-lg">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Target className="w-6 h-6 text-amber-400" />
                </div>
                <h4 className="font-semibold text-gray-200 mb-1">Performance Incentives</h4>
                <p className="text-sm text-gray-400">{compensationInfo.incentives}</p>
              </div>
              <div className="text-center p-4 bg-gray-800/50 rounded-lg">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-purple-400" />
                </div>
                <h4 className="font-semibold text-gray-200 mb-1">Additional Perks</h4>
                <ul className="text-sm text-gray-400">
                  {compensationInfo.perks.map((perk, idx) => (
                    <li key={idx}>• {perk}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-8" />
        
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
          <GraduationCap className="w-7 h-7 text-amber-400" />
          Training Modules
        </h2>

        <div className="grid lg:grid-cols-4 gap-6 mb-8">
          <Card className="lg:col-span-1 bg-gray-900/50 border-gray-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-amber-400" />
                Your Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">Overall Progress</span>
                    <span className="text-amber-400">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
                <div className="text-sm text-gray-400">
                  {completedLessons.size} of {totalLessons} lessons completed
                </div>
                {isComplete && (
                  <Button 
                    onClick={() => setShowCertificate(true)}
                    className="w-full bg-amber-600 hover:bg-amber-700"
                    data-testid="button-view-certificate"
                  >
                    <Trophy className="w-4 h-4 mr-2" />
                    View Certificate
                  </Button>
                )}
              </div>
              <Separator className="my-4" />
              <div className="space-y-2">
                {trainingModules.map((module) => {
                  const moduleLessons = module.lessons.length;
                  const moduleCompleted = module.lessons.filter(l => completedLessons.has(l.id)).length;
                  const isModuleComplete = moduleCompleted === moduleLessons;
                  
                  return (
                    <button
                      key={module.id}
                      onClick={() => setActiveModule(module.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                        activeModule === module.id 
                          ? 'bg-amber-500/20 text-amber-400' 
                          : 'text-gray-400 hover:text-white hover:bg-gray-800'
                      }`}
                      data-testid={`nav-module-${module.id}`}
                    >
                      {isModuleComplete ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <Circle className="w-4 h-4" />
                      )}
                      <span className="flex-1 truncate">{module.title}</span>
                      <span className="text-xs opacity-60">{moduleCompleted}/{moduleLessons}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-3">
            {currentModule && (
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                      <currentModule.icon className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-xl" data-testid={`text-module-${currentModule.id}`}>
                        {currentModule.title}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {currentModule.duration}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {currentModule.lessons.map((lesson, idx) => {
                    const isLessonComplete = completedLessons.has(lesson.id);
                    const isExpanded = expandedLesson === lesson.id;
                    const hasQuiz = !!lesson.quiz;
                    const quizPassed = hasQuiz && quizAnswers[lesson.id] === lesson.quiz?.correct;

                    return (
                      <Card 
                        key={lesson.id}
                        className={`border transition-colors ${
                          isLessonComplete 
                            ? 'bg-green-500/10 border-green-500/30' 
                            : 'bg-gray-800/50 border-gray-700'
                        }`}
                      >
                        <CardHeader 
                          className="cursor-pointer"
                          onClick={() => setExpandedLesson(isExpanded ? null : lesson.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {isLessonComplete ? (
                                <CheckCircle2 className="w-5 h-5 text-green-400" />
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-gray-600 flex items-center justify-center text-xs">
                                  {idx + 1}
                                </div>
                              )}
                              <CardTitle className="text-base">{lesson.title}</CardTitle>
                            </div>
                            <ChevronRight className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </div>
                        </CardHeader>
                        {isExpanded && (
                          <CardContent className="pt-0">
                            <div className="space-y-4">
                              <div>
                                <h4 className="font-medium mb-2 text-gray-300">Key Points:</h4>
                                <ul className="space-y-2">
                                  {lesson.content.map((point, pIdx) => (
                                    <li key={pIdx} className="flex items-start gap-2 text-gray-400">
                                      <ChevronRight className="w-4 h-4 mt-0.5 text-amber-400 flex-shrink-0" />
                                      {point}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                                <h4 className="font-medium mb-2 text-amber-400 flex items-center gap-2">
                                  <Lightbulb className="w-4 h-4" />
                                  Ambassador Tips
                                </h4>
                                <ul className="space-y-1">
                                  {lesson.tips.map((tip, tIdx) => (
                                    <li key={tIdx} className="text-sm text-amber-200/80">
                                      • {tip}
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              {lesson.quiz && (
                                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                                  <h4 className="font-medium mb-3 text-blue-400 flex items-center gap-2">
                                    <Award className="w-4 h-4" />
                                    Quick Quiz
                                  </h4>
                                  <p className="text-gray-300 mb-3">{lesson.quiz.question}</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {lesson.quiz.options.map((option, oIdx) => {
                                      const isSelected = quizAnswers[lesson.id] === oIdx;
                                      const isCorrect = oIdx === lesson.quiz?.correct;
                                      const showResult = quizAnswers[lesson.id] !== undefined;

                                      return (
                                        <Button
                                          key={oIdx}
                                          variant="outline"
                                          onClick={() => handleQuizAnswer(lesson.id, oIdx, lesson.quiz!.correct)}
                                          disabled={showResult}
                                          className={`justify-start ${
                                            showResult && isCorrect 
                                              ? 'border-green-500 bg-green-500/20 text-green-400' 
                                              : showResult && isSelected && !isCorrect
                                                ? 'border-red-500 bg-red-500/20 text-red-400'
                                                : ''
                                          }`}
                                          data-testid={`quiz-option-${lesson.id}-${oIdx}`}
                                        >
                                          {option}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {!isLessonComplete && (!hasQuiz || quizPassed) && (
                                <Button
                                  onClick={() => markLessonComplete(lesson.id)}
                                  className="w-full bg-green-600 hover:bg-green-700"
                                  data-testid={`button-complete-${lesson.id}`}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-2" />
                                  Mark as Complete
                                </Button>
                              )}

                              {!isLessonComplete && hasQuiz && !quizPassed && (
                                <p className="text-sm text-gray-400 text-center">
                                  Complete the quiz above to mark this lesson as done
                                </p>
                              )}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-2">
                <Share2 className="w-6 h-6 text-blue-400" />
              </div>
              <CardTitle>Social Media Assets</CardTitle>
              <CardDescription>Ready-to-use promotional materials</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Branded graphics & templates
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Caption templates
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Hashtag lists
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" disabled={!isComplete}>
                {isComplete ? 'Access Assets' : 'Complete Training First'}
              </Button>
            </CardFooter>
          </Card>

          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mb-2">
                <TrendingUp className="w-6 h-6 text-green-400" />
              </div>
              <CardTitle>Referral Benefits</CardTitle>
              <CardDescription>Earn while promoting</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Earn credits per referral
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Recurring commissions
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Exclusive ambassador perks
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/social-hub" className="w-full">
                <Button variant="outline" className="w-full">
                  View Referral Program
                </Button>
              </Link>
            </CardFooter>
          </Card>

          <Card className="bg-gray-900/50 border-gray-800">
            <CardHeader>
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-2">
                <Globe className="w-6 h-6 text-purple-400" />
              </div>
              <CardTitle>Community Support</CardTitle>
              <CardDescription>Connect with other ambassadors</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-gray-400">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Private ambassador group
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Monthly strategy calls
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  Direct support channel
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="w-full" disabled={!isComplete}>
                {isComplete ? 'Join Community' : 'Complete Training First'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {showCertificate && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <Card className="max-w-2xl w-full bg-gradient-to-br from-amber-900/50 to-gray-900 border-amber-500/50">
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Trophy className="w-10 h-10 text-amber-400" />
                </div>
                <Badge className="mb-4 bg-amber-500/20 text-amber-400 border-amber-500/30">
                  Certificate of Completion
                </Badge>
                <h2 className="text-3xl font-bold mb-2">Congratulations!</h2>
                <p className="text-xl text-gray-300 mb-4">{user?.username || 'Trader'}</p>
                <p className="text-gray-400 mb-6">
                  You have successfully completed the VEDD AI Ambassador Training Program 
                  and are now certified to promote VEDD AI through social media and live videos.
                </p>
                <div className="flex items-center justify-center gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-400">{totalLessons}</div>
                    <div className="text-sm text-gray-400">Lessons</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-400">{trainingModules.length}</div>
                    <div className="text-sm text-gray-400">Modules</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-400">100%</div>
                    <div className="text-sm text-gray-400">Complete</div>
                  </div>
                </div>
                <div className="flex gap-4 justify-center">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowCertificate(false)}
                    data-testid="button-close-certificate"
                  >
                    Close
                  </Button>
                  <Link href="/social-hub">
                    <Button className="bg-amber-600 hover:bg-amber-700">
                      Start Promoting
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
