export interface StrategicEvent {
  id: string;
  title: string;
  description: string;
  eventType: 'live_session' | 'ama' | 'workshop' | 'webinar' | 'meetup' | 'challenge_kickoff' | 'social_raid' | 'referral_sprint';
  format: 'virtual' | 'in_person' | 'hybrid';
  weekNumber: number;
  dayNumber: number;
  hostGuide: string;
  talkingPoints: string[];
  agenda: { time: string; topic: string; notes?: string }[];
  resourceLinks: { title: string; url: string }[];
  suggestedDuration: number;
  tokenReward: number;
  hostTokenReward: number;
  growthGoal: string;
  expectedAttendees: number;
  socialAmplification: string[];
}

export interface StrategicChallenge {
  id: string;
  title: string;
  description: string;
  type: 'social_growth' | 'content_creation' | 'referral' | 'engagement' | 'skill_building' | 'community_bonding';
  weekNumber: number;
  duration: number;
  objectives: { id: string; description: string; verification: string; tokenReward: number }[];
  totalTokenReward: number;
  bonusTokens: number;
  growthMetric: string;
  targetGrowth: string;
  hashtags: string[];
}

export interface WeeklyContentItem {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  contentType: 'youtube_tutorial' | 'quick_tip_reel' | 'carousel_post' | 'live_stream' | 'story_series' | 'meme_post' | 'testimonial' | 'behind_scenes' | 'chart_breakdown' | 'community_highlight';
  title: string;
  description: string;
  platform: ('YouTube' | 'Instagram' | 'TikTok' | 'Twitter' | 'LinkedIn' | 'Facebook')[];
  suggestedTime: string;
  hashtags: string[];
  callToAction: string;
  tokenReward: number;
}

export interface WeeklyContentFlow {
  weekNumber: number;
  theme: string;
  focusArea: string;
  contentItems: WeeklyContentItem[];
}

export const weeklyContentFlow: WeeklyContentFlow[] = [
  {
    weekNumber: 1,
    theme: 'Getting Started - Welcome to the Fam',
    focusArea: 'Platform introduction and first chart analysis',
    contentItems: [
      {
        day: 'Monday',
        contentType: 'youtube_tutorial',
        title: 'VEDD AI Complete Walkthrough - From Zero to Hero',
        description: 'Full tutorial showing how to sign up, upload your first chart, and read AI analysis. Keep it beginner friendly, no cap.',
        platform: ['YouTube', 'Facebook'],
        suggestedTime: '10:00 AM',
        hashtags: ['#VEDDAi', '#TradingTutorial', '#ForexBeginner', '#LearnToTrade'],
        callToAction: 'Drop a comment with your trading goals for 2025!',
        tokenReward: 50
      },
      {
        day: 'Tuesday',
        contentType: 'quick_tip_reel',
        title: '60 Second Chart Reading Hack',
        description: 'Quick tip showing one thing to look for on any chart before trading. Make it snappy and valuable.',
        platform: ['Instagram', 'TikTok', 'YouTube'],
        suggestedTime: '12:00 PM',
        hashtags: ['#TradingTips', '#ChartReading', '#QuickTip', '#VEDDAi'],
        callToAction: 'Save this for later and follow for more tips!',
        tokenReward: 25
      },
      {
        day: 'Wednesday',
        contentType: 'carousel_post',
        title: '5 Mistakes New Traders Make (And How AI Fixes Them)',
        description: 'Swipeable carousel breaking down common trading mistakes with solutions using VEDD AI.',
        platform: ['Instagram', 'LinkedIn'],
        suggestedTime: '2:00 PM',
        hashtags: ['#TradingMistakes', '#TraderEducation', '#AITrading', '#VEDDAi'],
        callToAction: 'Which mistake have you made? Drop a number in the comments!',
        tokenReward: 30
      },
      {
        day: 'Thursday',
        contentType: 'live_stream',
        title: 'Live Chart Analysis Session - We Analyzing Together',
        description: 'Go live and analyze real charts with the community. Show VEDD AI in action, answer questions.',
        platform: ['YouTube', 'Instagram', 'TikTok'],
        suggestedTime: '7:00 PM',
        hashtags: ['#LiveTrading', '#ChartAnalysis', '#TradingCommunity', '#VEDDAi'],
        callToAction: 'Drop your chart in the comments and we might analyze it live!',
        tokenReward: 75
      },
      {
        day: 'Friday',
        contentType: 'meme_post',
        title: 'Trading Meme Friday - When The AI Says SELL But You Hold',
        description: 'Relatable trading meme that gets engagement. Keep it funny but educational.',
        platform: ['Instagram', 'Twitter', 'TikTok'],
        suggestedTime: '11:00 AM',
        hashtags: ['#TradingMemes', '#ForexMemes', '#TraderLife', '#VEDDAi'],
        callToAction: 'Tag a friend who does this!',
        tokenReward: 15
      },
      {
        day: 'Saturday',
        contentType: 'testimonial',
        title: 'Ambassador Spotlight - Real Results Real Talk',
        description: 'Share a community members success story or testimonial. Keep it authentic.',
        platform: ['Instagram', 'Facebook', 'Twitter'],
        suggestedTime: '10:00 AM',
        hashtags: ['#SuccessStory', '#TradingResults', '#CommunityLove', '#VEDDAi'],
        callToAction: 'Want to be featured? DM us your VEDD AI journey!',
        tokenReward: 20
      },
      {
        day: 'Sunday',
        contentType: 'story_series',
        title: 'Sunday Scripture & Strategy - Faith Meets Trading',
        description: 'Share the daily devotional with a trading mindset lesson. Connect faith and discipline.',
        platform: ['Instagram', 'Facebook'],
        suggestedTime: '9:00 AM',
        hashtags: ['#SundayMotivation', '#TradingMindset', '#FaithAndFinance', '#VEDDAi'],
        callToAction: 'Share this to your story if it blessed you!',
        tokenReward: 20
      }
    ]
  },
  {
    weekNumber: 2,
    theme: 'Level Up - Advanced Chart Game',
    focusArea: 'Multi-timeframe analysis and EA strategies',
    contentItems: [
      {
        day: 'Monday',
        contentType: 'youtube_tutorial',
        title: 'Multi-Timeframe Analysis Masterclass - See The Bigger Picture',
        description: 'Deep dive into using 4H, 1H, 15M, 5M timeframes together. Show how VEDD AI synthesizes them all.',
        platform: ['YouTube', 'Facebook'],
        suggestedTime: '10:00 AM',
        hashtags: ['#MultiTimeframe', '#TechnicalAnalysis', '#TradingMasterclass', '#VEDDAi'],
        callToAction: 'Subscribe and hit the bell for more advanced trading content!',
        tokenReward: 50
      },
      {
        day: 'Tuesday',
        contentType: 'quick_tip_reel',
        title: 'The 4H-1H Confirmation Trick That Changed My Trading',
        description: 'Show how higher timeframe direction + lower timeframe entry = better trades.',
        platform: ['Instagram', 'TikTok', 'YouTube'],
        suggestedTime: '12:00 PM',
        hashtags: ['#TradingStrategy', '#TimeframeAnalysis', '#ProTraderTips', '#VEDDAi'],
        callToAction: 'Try this on your next trade and let me know!',
        tokenReward: 25
      },
      {
        day: 'Wednesday',
        contentType: 'chart_breakdown',
        title: 'Gold (XAU/USD) Weekly Breakdown - Where The Money At',
        description: 'Full chart breakdown of Gold showing key levels, AI analysis, and what to watch.',
        platform: ['Instagram', 'Twitter', 'YouTube'],
        suggestedTime: '3:00 PM',
        hashtags: ['#GoldTrading', '#XAUUSD', '#ChartBreakdown', '#VEDDAi'],
        callToAction: 'Are you bullish or bearish on Gold? Comment below!',
        tokenReward: 35
      },
      {
        day: 'Thursday',
        contentType: 'live_stream',
        title: 'EA Building Workshop - Create Your Bot Live',
        description: 'Live session showing how to generate an EA from multi-timeframe analysis. Interactive and hands-on.',
        platform: ['YouTube', 'Instagram'],
        suggestedTime: '7:00 PM',
        hashtags: ['#ExpertAdvisor', '#TradingBot', '#AutoTrading', '#VEDDAi'],
        callToAction: 'Join us live and build your first EA together!',
        tokenReward: 75
      },
      {
        day: 'Friday',
        contentType: 'behind_scenes',
        title: 'A Day In The Life of a VEDD AI Trader',
        description: 'Behind the scenes of morning routine, chart check, and using the platform. Keep it real.',
        platform: ['Instagram', 'TikTok'],
        suggestedTime: '11:00 AM',
        hashtags: ['#TraderLife', '#BehindTheScenes', '#DayInTheLife', '#VEDDAi'],
        callToAction: 'What does your trading morning look like?',
        tokenReward: 20
      },
      {
        day: 'Saturday',
        contentType: 'community_highlight',
        title: 'Top Ambassadors This Week - Shoutout Time',
        description: 'Highlight the most active community members. Show their stats, wins, and contributions.',
        platform: ['Instagram', 'Twitter', 'Facebook'],
        suggestedTime: '10:00 AM',
        hashtags: ['#CommunityLove', '#TopAmbassadors', '#SquadGoals', '#VEDDAi'],
        callToAction: 'Congrats to our top performers! Keep grinding!',
        tokenReward: 25
      },
      {
        day: 'Sunday',
        contentType: 'story_series',
        title: 'Week 2 Wins - Celebrate The Journey',
        description: 'Recap the weeks content, share wins from the community, preview next week.',
        platform: ['Instagram', 'Facebook'],
        suggestedTime: '6:00 PM',
        hashtags: ['#WeeklyWins', '#TradingJourney', '#Progress', '#VEDDAi'],
        callToAction: 'Share your biggest win from this week!',
        tokenReward: 15
      }
    ]
  },
  {
    weekNumber: 3,
    theme: 'Squad Up - Referral & Growth Week',
    focusArea: 'Bringing in new members and viral content',
    contentItems: [
      {
        day: 'Monday',
        contentType: 'youtube_tutorial',
        title: 'How To Earn Passive Income With VEDD AI Referrals',
        description: 'Complete guide on the referral program, how tokens work, and maximizing earnings.',
        platform: ['YouTube', 'Facebook'],
        suggestedTime: '10:00 AM',
        hashtags: ['#PassiveIncome', '#ReferralProgram', '#EarnMoney', '#VEDDAi'],
        callToAction: 'Get your referral link and start earning today!',
        tokenReward: 50
      },
      {
        day: 'Tuesday',
        contentType: 'quick_tip_reel',
        title: '3 Ways To Share VEDD AI Without Being Spammy',
        description: 'Quick tips on authentic promotion that converts without annoying your followers.',
        platform: ['Instagram', 'TikTok', 'YouTube'],
        suggestedTime: '12:00 PM',
        hashtags: ['#MarketingTips', '#AuthenticPromotion', '#GrowthHacks', '#VEDDAi'],
        callToAction: 'Which method are you trying first?',
        tokenReward: 25
      },
      {
        day: 'Wednesday',
        contentType: 'carousel_post',
        title: 'Before & After - My Trading Journey With AI',
        description: 'Visual carousel showing transformation from confused trader to confident analyst.',
        platform: ['Instagram', 'LinkedIn'],
        suggestedTime: '2:00 PM',
        hashtags: ['#Transformation', '#TradingJourney', '#BeforeAfter', '#VEDDAi'],
        callToAction: 'Share your before and after story!',
        tokenReward: 30
      },
      {
        day: 'Thursday',
        contentType: 'live_stream',
        title: 'AMA With Top Ambassadors - Get Your Questions Answered',
        description: 'Live Q&A with successful ambassadors. Share strategies, answer questions, build connections.',
        platform: ['YouTube', 'Instagram', 'TikTok'],
        suggestedTime: '7:00 PM',
        hashtags: ['#AMA', '#AskMeAnything', '#TradingQA', '#VEDDAi'],
        callToAction: 'Drop your questions in the chat!',
        tokenReward: 75
      },
      {
        day: 'Friday',
        contentType: 'meme_post',
        title: 'When You Put Your Friend On To VEDD AI And They Win',
        description: 'Celebratory meme about successful referrals. Make it shareable.',
        platform: ['Instagram', 'Twitter', 'TikTok'],
        suggestedTime: '11:00 AM',
        hashtags: ['#ReferralWins', '#SquadGoals', '#TradingMemes', '#VEDDAi'],
        callToAction: 'Tag your friend who needs this!',
        tokenReward: 15
      },
      {
        day: 'Saturday',
        contentType: 'testimonial',
        title: 'From Skeptic To Believer - Real Member Story',
        description: 'Authentic testimonial from someone who was doubtful but became a success.',
        platform: ['Instagram', 'Facebook', 'YouTube'],
        suggestedTime: '10:00 AM',
        hashtags: ['#RealResults', '#Testimonial', '#SuccessStory', '#VEDDAi'],
        callToAction: 'Were you skeptical at first too? Share your story!',
        tokenReward: 25
      },
      {
        day: 'Sunday',
        contentType: 'story_series',
        title: 'Sunday Sermon - Patience In Trading & Life',
        description: 'Connect biblical patience with trading discipline. Inspirational and practical.',
        platform: ['Instagram', 'Facebook'],
        suggestedTime: '9:00 AM',
        hashtags: ['#SundayWisdom', '#TradingPatience', '#FaithJourney', '#VEDDAi'],
        callToAction: 'Share if this message spoke to you!',
        tokenReward: 20
      }
    ]
  },
  {
    weekNumber: 4,
    theme: 'Gold & Crypto Focus - High Volatility Mastery',
    focusArea: 'Trading Gold and Bitcoin with enhanced AI accuracy',
    contentItems: [
      {
        day: 'Monday',
        contentType: 'youtube_tutorial',
        title: 'Trading Gold Like A Pro - XAU/USD Masterclass',
        description: 'Complete guide to trading Gold with VEDD AI. Cover volatility, correlations with DXY, and our enhanced accuracy.',
        platform: ['YouTube', 'Facebook'],
        suggestedTime: '10:00 AM',
        hashtags: ['#GoldTrading', '#XAUUSD', '#GoldMasterclass', '#VEDDAi'],
        callToAction: 'Gold gang, drop a comment if you trade XAU!',
        tokenReward: 50
      },
      {
        day: 'Tuesday',
        contentType: 'quick_tip_reel',
        title: 'Why Gold Needs Wider Stop Losses - 60 Second Lesson',
        description: 'Quick explanation of why volatile assets need different risk management.',
        platform: ['Instagram', 'TikTok', 'YouTube'],
        suggestedTime: '12:00 PM',
        hashtags: ['#GoldTrading', '#RiskManagement', '#StopLoss', '#VEDDAi'],
        callToAction: 'What stop loss do you use on Gold?',
        tokenReward: 25
      },
      {
        day: 'Wednesday',
        contentType: 'chart_breakdown',
        title: 'Bitcoin Weekly Outlook - Bull or Bear?',
        description: 'Full BTC analysis with AI insights, key levels, and what the charts are telling us.',
        platform: ['Instagram', 'Twitter', 'YouTube'],
        suggestedTime: '3:00 PM',
        hashtags: ['#Bitcoin', '#CryptoAnalysis', '#BTCTrading', '#VEDDAi'],
        callToAction: 'Bullish or bearish? Drop your prediction!',
        tokenReward: 35
      },
      {
        day: 'Thursday',
        contentType: 'live_stream',
        title: 'Live Gold & Crypto Trading Session',
        description: 'Real-time analysis of Gold and BTC. Show how VEDD AI handles high volatility assets.',
        platform: ['YouTube', 'Instagram'],
        suggestedTime: '7:00 PM',
        hashtags: ['#LiveTrading', '#GoldBTC', '#CryptoLive', '#VEDDAi'],
        callToAction: 'Join us for live analysis - drop your questions!',
        tokenReward: 75
      },
      {
        day: 'Friday',
        contentType: 'meme_post',
        title: 'Gold Traders When Volatility Hits Different',
        description: 'Relatable Gold trading meme about the wild swings.',
        platform: ['Instagram', 'Twitter', 'TikTok'],
        suggestedTime: '11:00 AM',
        hashtags: ['#GoldMemes', '#TraderProblems', '#Volatility', '#VEDDAi'],
        callToAction: 'Gold traders know the struggle - tag one!',
        tokenReward: 15
      },
      {
        day: 'Saturday',
        contentType: 'testimonial',
        title: 'How AI Improved My Gold Win Rate',
        description: 'Success story specifically about Gold trading improvements with VEDD AI.',
        platform: ['Instagram', 'Facebook', 'Twitter'],
        suggestedTime: '10:00 AM',
        hashtags: ['#GoldWins', '#TradingSuccess', '#AITrading', '#VEDDAi'],
        callToAction: 'Share your best Gold trade this week!',
        tokenReward: 25
      },
      {
        day: 'Sunday',
        contentType: 'story_series',
        title: 'Sunday Strategy Session - Planning The Week Ahead',
        description: 'Share key levels to watch, upcoming events, and weekly game plan.',
        platform: ['Instagram', 'Facebook'],
        suggestedTime: '6:00 PM',
        hashtags: ['#WeeklyPlanning', '#TradingStrategy', '#PrepWork', '#VEDDAi'],
        callToAction: 'Whats on your watchlist this week?',
        tokenReward: 20
      }
    ]
  },
  {
    weekNumber: 5,
    theme: 'Content Creator Week - Build Your Brand',
    focusArea: 'Creating viral content and building personal brand',
    contentItems: [
      {
        day: 'Monday',
        contentType: 'youtube_tutorial',
        title: 'How To Create Fire Trading Content That Gets Views',
        description: 'Complete content creation guide - hooks, editing tips, what performs best on each platform.',
        platform: ['YouTube', 'Facebook'],
        suggestedTime: '10:00 AM',
        hashtags: ['#ContentCreation', '#TradingContent', '#CreatorTips', '#VEDDAi'],
        callToAction: 'What content do you want to create? Comment below!',
        tokenReward: 50
      },
      {
        day: 'Tuesday',
        contentType: 'quick_tip_reel',
        title: 'Hook Your Audience In 3 Seconds - The Secret Formula',
        description: 'Quick tip on creating attention-grabbing content openings.',
        platform: ['Instagram', 'TikTok', 'YouTube'],
        suggestedTime: '12:00 PM',
        hashtags: ['#ContentHooks', '#ViralContent', '#CreatorHacks', '#VEDDAi'],
        callToAction: 'Save this for your next video!',
        tokenReward: 25
      },
      {
        day: 'Wednesday',
        contentType: 'carousel_post',
        title: '10 Trading Post Ideas That Always Perform',
        description: 'Swipeable list of proven content ideas for trading creators.',
        platform: ['Instagram', 'LinkedIn'],
        suggestedTime: '2:00 PM',
        hashtags: ['#ContentIdeas', '#TradingCreator', '#PostInspiration', '#VEDDAi'],
        callToAction: 'Screenshot this for later!',
        tokenReward: 30
      },
      {
        day: 'Thursday',
        contentType: 'live_stream',
        title: 'Content Creation Workshop - Edit With Me Live',
        description: 'Live editing session showing how to create trading content from screen recordings.',
        platform: ['YouTube', 'Instagram'],
        suggestedTime: '7:00 PM',
        hashtags: ['#ContentWorkshop', '#LiveEditing', '#CreatorCommunity', '#VEDDAi'],
        callToAction: 'Bring your questions and lets create together!',
        tokenReward: 75
      },
      {
        day: 'Friday',
        contentType: 'behind_scenes',
        title: 'My Content Setup - Tools I Use Daily',
        description: 'Show your content creation setup, tools, and workflow.',
        platform: ['Instagram', 'TikTok'],
        suggestedTime: '11:00 AM',
        hashtags: ['#CreatorSetup', '#ToolsOfTrade', '#BTS', '#VEDDAi'],
        callToAction: 'Whats your go-to content tool?',
        tokenReward: 20
      },
      {
        day: 'Saturday',
        contentType: 'community_highlight',
        title: 'Best Content This Week - Creator Shoutouts',
        description: 'Highlight the best content from community members. Encourage more creation.',
        platform: ['Instagram', 'Twitter', 'Facebook'],
        suggestedTime: '10:00 AM',
        hashtags: ['#CreatorShoutout', '#CommunityContent', '#Inspiration', '#VEDDAi'],
        callToAction: 'Tag your content and we might feature you next!',
        tokenReward: 25
      },
      {
        day: 'Sunday',
        contentType: 'story_series',
        title: 'Sunday Reset - Content Planning For The Week',
        description: 'Share content planning process and inspire others to plan ahead.',
        platform: ['Instagram', 'Facebook'],
        suggestedTime: '6:00 PM',
        hashtags: ['#ContentPlanning', '#SundayReset', '#CreatorLife', '#VEDDAi'],
        callToAction: 'Plan your week with us!',
        tokenReward: 15
      }
    ]
  },
  {
    weekNumber: 6,
    theme: 'Graduation & Certification Week',
    focusArea: 'Ambassador certification and celebrating achievements',
    contentItems: [
      {
        day: 'Monday',
        contentType: 'youtube_tutorial',
        title: 'Ambassador Certification Guide - Everything You Need To Know',
        description: 'Complete walkthrough of the certification process, requirements, and benefits.',
        platform: ['YouTube', 'Facebook'],
        suggestedTime: '10:00 AM',
        hashtags: ['#Certification', '#AmbassadorProgram', '#LevelUp', '#VEDDAi'],
        callToAction: 'Ready to get certified? Start today!',
        tokenReward: 50
      },
      {
        day: 'Tuesday',
        contentType: 'quick_tip_reel',
        title: 'Top 3 Things That Got Me Certified',
        description: 'Quick tips from certified ambassadors on what helped them succeed.',
        platform: ['Instagram', 'TikTok', 'YouTube'],
        suggestedTime: '12:00 PM',
        hashtags: ['#CertificationTips', '#SuccessSecrets', '#AmbassadorLife', '#VEDDAi'],
        callToAction: 'Which tip resonates with you?',
        tokenReward: 25
      },
      {
        day: 'Wednesday',
        contentType: 'carousel_post',
        title: 'Your 6 Week Journey - From Newbie To Certified',
        description: 'Visual timeline showing the transformation and milestones.',
        platform: ['Instagram', 'LinkedIn'],
        suggestedTime: '2:00 PM',
        hashtags: ['#JourneyRecap', '#Transformation', '#6WeekChallenge', '#VEDDAi'],
        callToAction: 'Share your favorite moment from the journey!',
        tokenReward: 30
      },
      {
        day: 'Thursday',
        contentType: 'live_stream',
        title: 'Graduation Ceremony - Celebrating Our Certified Ambassadors',
        description: 'Live celebration for those who completed the program. Awards, recognition, next steps.',
        platform: ['YouTube', 'Instagram', 'Facebook'],
        suggestedTime: '7:00 PM',
        hashtags: ['#Graduation', '#Celebration', '#Ambassadors', '#VEDDAi'],
        callToAction: 'Congratulations to all our graduates!',
        tokenReward: 100
      },
      {
        day: 'Friday',
        contentType: 'testimonial',
        title: 'How VEDD AI Changed My Trading Career - Graduate Story',
        description: 'Powerful testimonial from a graduating ambassador.',
        platform: ['Instagram', 'Facebook', 'YouTube'],
        suggestedTime: '11:00 AM',
        hashtags: ['#GraduateStory', '#CareerChange', '#Success', '#VEDDAi'],
        callToAction: 'Your journey could inspire someone - share yours!',
        tokenReward: 30
      },
      {
        day: 'Saturday',
        contentType: 'community_highlight',
        title: 'Hall of Fame - Our Top Ambassadors',
        description: 'Permanent recognition for top performers. Stats, achievements, and impact.',
        platform: ['Instagram', 'Twitter', 'Facebook'],
        suggestedTime: '10:00 AM',
        hashtags: ['#HallOfFame', '#TopAmbassadors', '#Legends', '#VEDDAi'],
        callToAction: 'Aspire to be here? Start your journey today!',
        tokenReward: 25
      },
      {
        day: 'Sunday',
        contentType: 'story_series',
        title: 'Whats Next - Advanced Training Preview',
        description: 'Tease upcoming advanced content and keep graduates engaged.',
        platform: ['Instagram', 'Facebook'],
        suggestedTime: '6:00 PM',
        hashtags: ['#WhatsNext', '#AdvancedTraining', '#KeepGrowing', '#VEDDAi'],
        callToAction: 'Ready for the next level?',
        tokenReward: 20
      }
    ]
  }
];

export const strategicEvents: StrategicEvent[] = [
  // Week 1: Foundation & Welcome
  {
    id: 'week1-welcome',
    title: 'Welcome to the Fam - Lets Get This Bag',
    description: 'Yo, welcome to the squad! Pull up, meet the crew, and learn how to stack them VEDD tokens. We bout to show you the vision fr fr.',
    eventType: 'live_session',
    format: 'virtual',
    weekNumber: 1,
    dayNumber: 1,
    hostGuide: 'Bring the energy! Make everyone feel like they just joined something lit. Share your story, show love to the newcomers, and get everyone hyped about stacking tokens.',
    talkingPoints: [
      'What VEDD AI is all about - AI doing the heavy lifting on charts',
      'How you get paid - tokens for putting in work',
      'The vibe here - faith, smart moves, and leveling up together',
      'Quick tour - where everything is at',
      'This weeks focus - learning the basics, no cap',
      'How to link up with the squad for help'
    ],
    agenda: [
      { time: '0:00', topic: 'Whats Good Everybody!', notes: 'Get the energy right' },
      { time: '0:05', topic: 'Host Intro - My Story', notes: 'Keep it real' },
      { time: '0:15', topic: 'Platform Tour - The Rundown', notes: 'Show em around' },
      { time: '0:25', topic: 'How You Get Paid', notes: 'This is the money talk' },
      { time: '0:35', topic: 'This Week Game Plan', notes: 'What to expect' },
      { time: '0:45', topic: 'Q&A - Holla At Us', notes: 'Answer questions, build connections' }
    ],
    resourceLinks: [
      { title: 'Getting Started Guide', url: '/user-guide' },
      { title: 'Ambassador Training', url: '/ambassador-training' },
      { title: 'Token Rewards Explained', url: '/vedd-wallet' }
    ],
    suggestedDuration: 60,
    tokenReward: 50,
    hostTokenReward: 150,
    growthGoal: 'Convert 80% of new signups into active ambassadors',
    expectedAttendees: 25,
    socialAmplification: ['Drop that event selfie', 'Tag 3 homies who trade', 'Share your biggest takeaway']
  },
  {
    id: 'week1-chart-basics',
    title: 'Chart Game 101 - Learn To Read The Market',
    description: 'We breaking down charts so you can see what the market is really saying. Candlesticks, support levels, trends - all that. Hands on, no fluff.',
    eventType: 'workshop',
    format: 'virtual',
    weekNumber: 1,
    dayNumber: 3,
    hostGuide: 'This is teaching time - share your screen with real charts! Use VEDD AI live to show how the AI breaks it down. Keep it simple, answer questions, make trading feel doable for everyone.',
    talkingPoints: [
      'Candlesticks - what the green and red really mean',
      'Bulls vs Bears - whos winning the fight',
      'Support & Resistance - where price bounces',
      'Trends - knowing which way the money flowing',
      'Let VEDD AI do the hard work for you',
      'Practice time - we analyzing charts together'
    ],
    agenda: [
      { time: '0:00', topic: 'Week 1 Check-In - Whos Winning', notes: 'Shout out the grinders' },
      { time: '0:10', topic: 'Candlestick Breakdown', notes: 'Keep it visual' },
      { time: '0:25', topic: 'Support & Resistance - The Zones', notes: 'Draw it out live' },
      { time: '0:40', topic: 'VEDD AI In Action', notes: 'Upload a chart, show the magic' },
      { time: '0:50', topic: 'Yall Turn - Practice', notes: 'Everyone gets hands on' },
      { time: '0:55', topic: 'Homework - Post Your Analysis', notes: 'Social media time' }
    ],
    resourceLinks: [
      { title: 'Candlestick Cheat Sheet', url: '/user-guide#patterns' },
      { title: 'Chart Analysis Tool', url: '/analysis' }
    ],
    suggestedDuration: 60,
    tokenReward: 40,
    hostTokenReward: 120,
    growthGoal: 'Each attendee posts 1 chart analysis on social media',
    expectedAttendees: 30,
    socialAmplification: ['Drop your chart breakdown', 'Tag VEDD AI', 'Use #ChartGame101']
  },
  {
    id: 'week1-friday-wins',
    title: 'Friday Flex - Celebrating The Grind',
    description: 'Its Friday and we celebrating! Showing love to the top performers, highlighting the best posts, and getting ready to go crazy this weekend.',
    eventType: 'live_session',
    format: 'virtual',
    weekNumber: 1,
    dayNumber: 5,
    hostGuide: 'This is a CELEBRATION! Call out names, show the wins, make people feel seen. Create FOMO for anyone not in the room. End strong with a weekend challenge to keep the momentum.',
    talkingPoints: [
      'Top earners - who put in that work this week',
      'Best posts - showing love to the content creators',
      'Referral MVPs - who brought the crew',
      'Faith moment - that weekly word to keep us grounded',
      'Weekend challenge - lets go even harder',
      'Next week preview - what we cooking up'
    ],
    agenda: [
      { time: '0:00', topic: 'Lets Gooo! Hype Intro', notes: 'Music, energy, vibes' },
      { time: '0:05', topic: 'Leaderboard - Top 10 Flexin', notes: 'Call out the winners' },
      { time: '0:15', topic: 'Best Content - Fire Posts', notes: 'Show the social wins' },
      { time: '0:25', topic: 'Referral Heroes - Who Brought The Crew', notes: 'Shout out the recruiters' },
      { time: '0:35', topic: 'Faith Moment - Stay Grounded', notes: 'Scripture check' },
      { time: '0:40', topic: 'Weekend Challenge Drop', notes: 'Get them motivated' },
      { time: '0:45', topic: 'Squad Photo + Post Up', notes: 'Everyone screenshot and post' }
    ],
    resourceLinks: [],
    suggestedDuration: 50,
    tokenReward: 30,
    hostTokenReward: 100,
    growthGoal: '100% of attendees post about the event',
    expectedAttendees: 40,
    socialAmplification: ['Screenshot the moment', 'Shout out your accountability partner', 'Drop the weekend challenge']
  },
  
  // Week 2: Strategy & Growth Momentum
  {
    id: 'week2-indicator-mastery',
    title: 'Level Up - Master The Indicators',
    description: 'Time to go deeper! RSI, MACD, Moving Averages - these tools help you spot moves before they happen. Stack these together and you gonna be reading charts like a pro.',
    eventType: 'workshop',
    format: 'virtual',
    weekNumber: 2,
    dayNumber: 8,
    hostGuide: 'Break down indicators step by step. Show real chart examples - when RSI is too high, when MACD is crossing, how moving averages act like magnets. Let VEDD AI show them how it spots all this automatically.',
    talkingPoints: [
      'RSI - when the market is exhausted and about to flip',
      'MACD - which way the trend going and how strong',
      'Moving Averages - lines that show where price likes to bounce',
      'Stacking indicators - getting that confirmation',
      'VEDD AI reading these for you automatically',
      'Building your own EA with these indicators'
    ],
    agenda: [
      { time: '0:00', topic: 'Week 1 Recap - Who Leveled Up', notes: 'Keep the momentum' },
      { time: '0:10', topic: 'RSI Breakdown - The Exhaustion Meter', notes: 'Real examples' },
      { time: '0:25', topic: 'MACD - Reading The Cross', notes: 'Crossover setups' },
      { time: '0:40', topic: 'Moving Averages - The Price Magnet', notes: 'EMA vs SMA' },
      { time: '0:50', topic: 'VEDD AI Demo - Auto Detection', notes: 'Show the magic' },
      { time: '0:55', topic: 'Your Turn - Build Your Setup', notes: 'Homework assignment' }
    ],
    resourceLinks: [
      { title: 'Indicator Guide', url: '/user-guide#indicators' },
      { title: 'Multi-Timeframe Analysis', url: '/multi-timeframe' }
    ],
    suggestedDuration: 60,
    tokenReward: 50,
    hostTokenReward: 150,
    growthGoal: 'Each attendee creates their first indicator-based EA',
    expectedAttendees: 35,
    socialAmplification: ['Drop your indicator setup', 'Show the before/after AI analysis', 'Tag your trading homie']
  },
  {
    id: 'week2-referral-race',
    title: 'Bring The Crew - Referral Race Kickoff',
    description: 'Special event launching a 48-hour referral competition. Top referrers win bonus VEDD tokens and exclusive recognition.',
    eventType: 'challenge_kickoff',
    format: 'virtual',
    weekNumber: 2,
    dayNumber: 10,
    hostGuide: 'CREATE URGENCY! This is a growth accelerator event. Show the referral leaderboard. Explain prizes. Give everyone their unique referral link. Make it competitive but fun!',
    talkingPoints: [
      '48-hour referral sprint rules',
      'Token prizes for top 10 referrers',
      'How to share your referral link effectively',
      'Social media templates that convert',
      'Live countdown begins NOW',
      'Bonus tokens for first referral'
    ],
    agenda: [
      { time: '0:00', topic: 'Energy Boost & Why Referrals Matter', notes: 'Get hyped' },
      { time: '0:10', topic: 'Prize Pool Announcement', notes: 'Show the rewards' },
      { time: '0:20', topic: 'Your Referral Link Tutorial', notes: 'Show how to get it' },
      { time: '0:30', topic: 'Effective Sharing Strategies', notes: 'Templates & tips' },
      { time: '0:40', topic: 'LIVE: First Referral Bonus', notes: 'Reward instantly' },
      { time: '0:45', topic: 'COUNTDOWN BEGINS', notes: 'Start the race!' }
    ],
    resourceLinks: [
      { title: 'Referral Dashboard', url: '/profile' },
      { title: 'Share Templates', url: '/ambassador-training' }
    ],
    suggestedDuration: 50,
    tokenReward: 25,
    hostTokenReward: 100,
    growthGoal: 'Each attendee refers at least 2 new members in 48 hours',
    expectedAttendees: 50,
    socialAmplification: ['Post your referral link', 'DM 10 friends', 'Story takeover']
  },
  
  // Week 3: Community Building & Engagement
  {
    id: 'week3-ama',
    title: 'AMA: Top Ambassador Secrets',
    description: 'Ask-Me-Anything session with top-earning ambassadors sharing their strategies for content creation, engagement, and token earning.',
    eventType: 'ama',
    format: 'virtual',
    weekNumber: 3,
    dayNumber: 15,
    hostGuide: 'Feature 2-3 top ambassadors as guests. Let them share their journey, tips, and answer questions. This creates aspiration and shows whats possible.',
    talkingPoints: [
      'Guest introductions and their journey',
      'Content strategies that work',
      'How they balance trading and content creation',
      'Their biggest lessons learned',
      'Rapid-fire Q&A from audience',
      'Challenge: implement one tip this week'
    ],
    agenda: [
      { time: '0:00', topic: 'Guest Introductions', notes: 'Build credibility' },
      { time: '0:10', topic: 'Journey Stories', notes: 'Each guest 5 mins' },
      { time: '0:25', topic: 'Top Tips Roundtable', notes: 'Best practices' },
      { time: '0:40', topic: 'Audience Q&A', notes: 'Engage everyone' },
      { time: '0:55', topic: 'One Tip Challenge', notes: 'Action item' }
    ],
    resourceLinks: [],
    suggestedDuration: 60,
    tokenReward: 35,
    hostTokenReward: 120,
    growthGoal: 'Increase weekly content posts by 50%',
    expectedAttendees: 60,
    socialAmplification: ['Quote a guest insight', 'Tag the guests', 'Share your one tip commitment']
  },
  {
    id: 'week3-social-raid',
    title: 'Social Raid Night - Community Engagement Blitz',
    description: 'Coordinated social media engagement session. Everyone likes, comments, and shares each others content to boost visibility.',
    eventType: 'social_raid',
    format: 'virtual',
    weekNumber: 3,
    dayNumber: 17,
    hostGuide: 'This is TEAM activity. Everyone shares their latest post link in chat. On your signal, everyone engages with everyones content simultaneously. Creates viral momentum!',
    talkingPoints: [
      'How algorithm boosting works',
      'Rules: genuine comments only, no spam',
      'Tonight we raid together',
      'Drop your links in chat',
      'Engage with at least 20 posts',
      'Track your engagement growth after'
    ],
    agenda: [
      { time: '0:00', topic: 'Raid Briefing', notes: 'Explain the strategy' },
      { time: '0:10', topic: 'Link Collection', notes: 'Everyone shares' },
      { time: '0:15', topic: 'RAID BEGINS', notes: '30 min engagement session' },
      { time: '0:45', topic: 'Results Check-In', notes: 'Share notifications' },
      { time: '0:50', topic: 'Schedule Next Raid', notes: 'Build habit' }
    ],
    resourceLinks: [],
    suggestedDuration: 55,
    tokenReward: 40,
    hostTokenReward: 100,
    growthGoal: 'Each participants content gets 50+ engagements',
    expectedAttendees: 45,
    socialAmplification: ['Screenshot your notifications', 'Thank the community', 'Recruit for next raid']
  },
  
  // Week 4: Advanced Skills & Monetization
  {
    id: 'week4-ea-marketplace',
    title: 'EA Marketplace Masterclass - Monetize Your Strategies',
    description: 'Learn how to publish your Expert Advisors on the marketplace and earn passive income from subscriptions.',
    eventType: 'webinar',
    format: 'virtual',
    weekNumber: 4,
    dayNumber: 22,
    hostGuide: 'Show the full EA publishing flow. Highlight top-earning EAs on the marketplace. Explain subscription economics. Make everyone see the passive income potential.',
    talkingPoints: [
      'EA Marketplace overview and opportunity',
      'What makes an EA worth subscribing to',
      'Step-by-step publishing tutorial',
      'Pricing strategies for different markets',
      'How subscriptions generate passive income',
      'Marketing your EA effectively'
    ],
    agenda: [
      { time: '0:00', topic: 'Marketplace Tour', notes: 'Show top EAs' },
      { time: '0:15', topic: 'Publishing Walkthrough', notes: 'Live demo' },
      { time: '0:30', topic: 'Pricing Psychology', notes: 'Value positioning' },
      { time: '0:45', topic: 'Marketing Your EA', notes: 'Social strategies' },
      { time: '0:55', topic: 'Publish Challenge', notes: 'Everyone publishes' }
    ],
    resourceLinks: [
      { title: 'EA Marketplace', url: '/ea-marketplace' },
      { title: 'My EAs', url: '/my-eas' }
    ],
    suggestedDuration: 60,
    tokenReward: 60,
    hostTokenReward: 180,
    growthGoal: 'Every attendee publishes at least 1 EA',
    expectedAttendees: 40,
    socialAmplification: ['Announce your published EA', 'Share strategy teaser', 'Invite followers to subscribe']
  },
  
  // Week 5: Leadership & Mentorship
  {
    id: 'week5-host-training',
    title: 'Become a Community Host - Leadership Training',
    description: 'Train ambassadors to become event hosts. Learn presentation skills, community engagement, and how to run successful events.',
    eventType: 'workshop',
    format: 'virtual',
    weekNumber: 5,
    dayNumber: 29,
    hostGuide: 'This creates your future hosts! Teach them everything: energy, structure, engagement, tech setup. Give everyone a chance to practice hosting a 5-minute segment.',
    talkingPoints: [
      'Why becoming a host multiplies your earnings',
      'Event types and their purposes',
      'Presentation and engagement skills',
      'Technical setup and troubleshooting',
      'Practice: everyone hosts 5 minutes',
      'Scheduling your first event'
    ],
    agenda: [
      { time: '0:00', topic: 'Host Benefits Overview', notes: 'Token potential' },
      { time: '0:10', topic: 'Hosting Skills Training', notes: 'Energy, pacing' },
      { time: '0:25', topic: 'Tech Setup Tutorial', notes: 'Screen share, audio' },
      { time: '0:40', topic: 'Practice Sessions', notes: 'Everyone tries' },
      { time: '0:55', topic: 'Sign Up as Host', notes: 'Commitment' }
    ],
    resourceLinks: [
      { title: 'Host Dashboard', url: '/host-dashboard' },
      { title: 'Event Calendar', url: '/ambassador-training' }
    ],
    suggestedDuration: 60,
    tokenReward: 75,
    hostTokenReward: 200,
    growthGoal: 'Train 10 new community hosts',
    expectedAttendees: 25,
    socialAmplification: ['Announce your host application', 'Share hosting tips learned', 'Recruit attendees']
  },
  
  // Week 6: AI Mastery & Scaling
  {
    id: 'week6-ai-trading',
    title: 'AI Trading Deep Dive - Multi-Timeframe Mastery',
    description: 'Advanced session on leveraging VEDD AI for multi-timeframe analysis, automated EAs, and live market refresh.',
    eventType: 'webinar',
    format: 'virtual',
    weekNumber: 6,
    dayNumber: 36,
    hostGuide: 'This is the advanced technical session. Demo the multi-timeframe analysis flow. Show MT5 EA generation. Demonstrate live refresh features. Make AI feel accessible.',
    talkingPoints: [
      'Multi-timeframe analysis workflow',
      '4H+1H+15M+5M synergy explained',
      'Generating MT5-ready Expert Advisors',
      'Live AI Refresh for pattern updates',
      'Webhook signals for trade copying',
      'Building your AI trading system'
    ],
    agenda: [
      { time: '0:00', topic: 'MTF Concept', notes: 'Why multiple timeframes' },
      { time: '0:15', topic: 'Live Analysis Demo', notes: 'Upload 4 charts' },
      { time: '0:30', topic: 'EA Generation', notes: 'Create MT5 EA' },
      { time: '0:45', topic: 'Webhooks & Signals', notes: 'Automation setup' },
      { time: '0:55', topic: 'Build Challenge', notes: 'Create your system' }
    ],
    resourceLinks: [
      { title: 'Multi-Timeframe', url: '/multi-timeframe' },
      { title: 'MT5 Chart Data', url: '/mt5-chart-data' },
      { title: 'Webhooks', url: '/webhooks' }
    ],
    suggestedDuration: 60,
    tokenReward: 75,
    hostTokenReward: 200,
    growthGoal: 'Every attendee creates a multi-timeframe EA',
    expectedAttendees: 35,
    socialAmplification: ['Share your AI analysis', 'Post your generated EA', 'Tag traders who need this']
  },
  
  // Weekly Celebration (Every Week)
  {
    id: 'weekly-graduation',
    title: 'Weekly Graduation & Recognition',
    description: 'Celebrate ambassadors completing training milestones, top performers, and community achievements.',
    eventType: 'live_session',
    format: 'virtual',
    weekNumber: 0,
    dayNumber: 7,
    hostGuide: 'Maximum celebration energy! This is where we recognize achievements, create aspirations, and build community bonds. Call out names. Show faces. Make people feel special.',
    talkingPoints: [
      'This weeks graduates and certifications',
      'Top content creators showcase',
      'Referral champions recognition',
      'Community impact stories',
      'Next week preview and challenges',
      'Group photo and social moment'
    ],
    agenda: [
      { time: '0:00', topic: 'Celebration Intro', notes: 'High energy!' },
      { time: '0:10', topic: 'Graduate Recognition', notes: 'Call names' },
      { time: '0:25', topic: 'Top Performers', notes: 'Showcase work' },
      { time: '0:40', topic: 'Community Stories', notes: 'Testimonials' },
      { time: '0:50', topic: 'Next Week Preview', notes: 'Build excitement' },
      { time: '0:55', topic: 'Group Photo & Post', notes: 'Social moment' }
    ],
    resourceLinks: [],
    suggestedDuration: 60,
    tokenReward: 40,
    hostTokenReward: 120,
    growthGoal: 'Every attendee shares a post about the celebration',
    expectedAttendees: 75,
    socialAmplification: ['Celebrate a peer', 'Share your achievement', 'Invite next weeks guests']
  }
];

export const strategicChallenges: StrategicChallenge[] = [
  // Week 1 Challenges
  {
    id: 'week1-foundation',
    title: 'Week 1 Grind - Lock In Challenge',
    description: 'Finish all Week 1 lessons and drop your first chart analysis on socials. This your foundation - dont skip it!',
    type: 'skill_building',
    weekNumber: 1,
    duration: 7,
    objectives: [
      { id: 'w1-1', description: 'Complete all Day 1-7 lessons - no skipping', verification: 'System tracks completion', tokenReward: 50 },
      { id: 'w1-2', description: 'Upload 3 charts and let VEDD AI break em down', verification: 'Analysis count in profile', tokenReward: 30 },
      { id: 'w1-3', description: 'Post your analysis on socials with #VEDDAi', verification: 'Submit post link', tokenReward: 25 },
      { id: 'w1-4', description: 'Pull up to at least 2 community events', verification: 'Attendance tracking', tokenReward: 20 }
    ],
    totalTokenReward: 125,
    bonusTokens: 50,
    growthMetric: 'Active users completing first week',
    targetGrowth: '85% completion rate',
    hashtags: ['#VEDDWeek1', '#ChartGame', '#TradingJourney', '#VEDDAi']
  },
  {
    id: 'week1-social-starter',
    title: 'Social Sprint - Get On The Timeline',
    description: '48 hours to drop 5 fire trading posts. Get active on socials and start building your presence!',
    type: 'content_creation',
    weekNumber: 1,
    duration: 2,
    objectives: [
      { id: 'ss-1', description: 'Drop a chart analysis screenshot', verification: 'Submit post link', tokenReward: 15 },
      { id: 'ss-2', description: 'Share a trading tip you just learned', verification: 'Submit post link', tokenReward: 15 },
      { id: 'ss-3', description: 'Tell people why you joined VEDD AI', verification: 'Submit post link', tokenReward: 15 },
      { id: 'ss-4', description: 'Share the daily scripture wisdom', verification: 'Submit post link', tokenReward: 15 },
      { id: 'ss-5', description: 'Show love to 10 other ambassador posts', verification: 'Screenshot engagement', tokenReward: 20 }
    ],
    totalTokenReward: 80,
    bonusTokens: 30,
    growthMetric: 'Social media posts with VEDD AI mention',
    targetGrowth: '500 new posts',
    hashtags: ['#VEDDStarter', '#TradingContent', '#ContentCreator', '#VEDDAi']
  },
  
  // Week 2 Challenges
  {
    id: 'week2-referral-rush',
    title: 'Squad Up - Bring Your People',
    description: 'Put your homies on to VEDD AI! Invite 5 friends and help them get their first analysis done.',
    type: 'referral',
    weekNumber: 2,
    duration: 7,
    objectives: [
      { id: 'rr-1', description: 'Bring in 3 new members', verification: 'Referral tracking', tokenReward: 75 },
      { id: 'rr-2', description: 'Bring in 5 new members (BONUS bag)', verification: 'Referral tracking', tokenReward: 100 },
      { id: 'rr-3', description: 'Help 2 of your referrals finish their first analysis', verification: 'Referral activity', tokenReward: 50 },
      { id: 'rr-4', description: 'Post about why your friends need to join', verification: 'Submit post link', tokenReward: 25 }
    ],
    totalTokenReward: 250,
    bonusTokens: 100,
    growthMetric: 'New user signups',
    targetGrowth: '500 new users this week',
    hashtags: ['#SquadUp', '#GrowWithVEDD', '#TradingCrew', '#VEDDAi']
  },
  {
    id: 'week2-indicator-mastery',
    title: 'Indicator Boss - Teach What You Learn',
    description: 'Create content breaking down RSI, MACD, or Moving Averages. Share knowledge, get tokens.',
    type: 'content_creation',
    weekNumber: 2,
    duration: 7,
    objectives: [
      { id: 'im-1', description: 'Make a carousel explaining one indicator', verification: 'Submit post link', tokenReward: 40 },
      { id: 'im-2', description: 'Drop a video explaining how indicators work', verification: 'Submit post link', tokenReward: 50 },
      { id: 'im-3', description: 'Share 3 real chart examples with your breakdown', verification: 'Submit post links', tokenReward: 35 },
      { id: 'im-4', description: 'Get 50+ likes/comments on your content', verification: 'Screenshot metrics', tokenReward: 25 }
    ],
    totalTokenReward: 150,
    bonusTokens: 75,
    growthMetric: 'Educational content views',
    targetGrowth: '10,000 views on indicator content',
    hashtags: ['#IndicatorBoss', '#TradingEducation', '#RSI', '#MACD', '#VEDDAi']
  },
  
  // Week 3 Challenges
  {
    id: 'week3-engagement-king',
    title: 'Engagement King/Queen - Be Everywhere',
    description: 'Build real connections by showing up and showing love to the community. Comment, DM, engage!',
    type: 'engagement',
    weekNumber: 3,
    duration: 7,
    objectives: [
      { id: 'ek-1', description: 'Drop real comments on 50 community posts', verification: 'Screenshot comments', tokenReward: 30 },
      { id: 'ek-2', description: 'Welcome 10 new ambassadors personally', verification: 'Screenshot DMs', tokenReward: 25 },
      { id: 'ek-3', description: 'Start 5 good convos in trading communities', verification: 'Submit thread links', tokenReward: 40 },
      { id: 'ek-4', description: 'Get featured in community highlights', verification: 'Host verification', tokenReward: 50 }
    ],
    totalTokenReward: 145,
    bonusTokens: 60,
    growthMetric: 'Community engagement rate',
    targetGrowth: '3x engagement on community content',
    hashtags: ['#EngagementKing', '#CommunityFirst', '#TradingFam', '#VEDDAi']
  },
  {
    id: 'week3-viral-video',
    title: 'Go Viral - Video Challenge',
    description: 'Create a short video about VEDD AI or trading that gets numbers. Time to blow up!',
    type: 'content_creation',
    weekNumber: 3,
    duration: 7,
    objectives: [
      { id: 'vv-1', description: 'Drop a 60-second trading tip video', verification: 'Submit video link', tokenReward: 50 },
      { id: 'vv-2', description: 'Hit 1,000+ views', verification: 'Screenshot metrics', tokenReward: 50 },
      { id: 'vv-3', description: 'Get 100+ likes', verification: 'Screenshot metrics', tokenReward: 30 },
      { id: 'vv-4', description: 'Get 10+ shares/saves', verification: 'Screenshot metrics', tokenReward: 40 }
    ],
    totalTokenReward: 170,
    bonusTokens: 100,
    growthMetric: 'Video content reach',
    targetGrowth: '50,000 total video views',
    hashtags: ['#TradingTok', '#VEDDViral', '#TradingTips', '#VEDDAi']
  },
  
  // Week 4 Challenges
  {
    id: 'week4-ea-creator',
    title: 'EA Creator - Build Your Bot',
    description: 'Create your own Expert Advisor, publish it on the marketplace, and start getting subscribers. This is how you build passive income!',
    type: 'skill_building',
    weekNumber: 4,
    duration: 7,
    objectives: [
      { id: 'ec-1', description: 'Run multi-timeframe analysis to build your EA', verification: 'EA generated', tokenReward: 40 },
      { id: 'ec-2', description: 'Publish your EA on the marketplace', verification: 'Published EA visible', tokenReward: 60 },
      { id: 'ec-3', description: 'Create promo content for your EA (3 posts)', verification: 'Submit 3 post links', tokenReward: 35 },
      { id: 'ec-4', description: 'Get your first subscriber', verification: 'Subscription notification', tokenReward: 100 }
    ],
    totalTokenReward: 235,
    bonusTokens: 100,
    growthMetric: 'Published EAs and subscriptions',
    targetGrowth: '100 new published EAs',
    hashtags: ['#EACreator', '#PassiveIncome', '#AlgoTrading', '#VEDDAi']
  },
  
  // Week 5 Challenges
  {
    id: 'week5-mentor',
    title: 'OG Mode - Mentor The New Ones',
    description: 'You been here a minute now. Time to put the new ambassadors on game and help them win their first week.',
    type: 'community_bonding',
    weekNumber: 5,
    duration: 7,
    objectives: [
      { id: 'mc-1', description: 'Mentor 3 new ambassadors through Week 1', verification: 'Mentee completion', tokenReward: 100 },
      { id: 'mc-2', description: 'Host a mini-tutorial session', verification: 'Recording link', tokenReward: 75 },
      { id: 'mc-3', description: 'Create a helpful resource guide', verification: 'Guide link', tokenReward: 50 },
      { id: 'mc-4', description: 'Get mentee testimonial', verification: 'Submit testimonial', tokenReward: 30 }
    ],
    totalTokenReward: 255,
    bonusTokens: 100,
    growthMetric: 'New user retention through mentorship',
    targetGrowth: '95% mentee completion rate',
    hashtags: ['#VEDDMentor', '#PayItForward', '#TradingMentor', '#VEDDAi']
  },
  
  // Week 6 Challenges
  {
    id: 'week6-ai-champion',
    title: 'AI Master - Use Every Feature',
    description: 'Time to go all in on AI! Master every AI feature and show people how its done. This is next level stuff.',
    type: 'skill_building',
    weekNumber: 6,
    duration: 7,
    objectives: [
      { id: 'ac-1', description: 'Run 10 AI chart analyses', verification: 'Analysis count', tokenReward: 30 },
      { id: 'ac-2', description: 'Build a multi-timeframe EA', verification: 'EA created', tokenReward: 40 },
      { id: 'ac-3', description: 'Set up webhook signals for trade alerts', verification: 'Webhook configured', tokenReward: 35 },
      { id: 'ac-4', description: 'Make tutorial content on AI features (5 posts)', verification: 'Submit 5 posts', tokenReward: 50 },
      { id: 'ac-5', description: 'Get 500+ engagements on your AI content', verification: 'Screenshot metrics', tokenReward: 50 }
    ],
    totalTokenReward: 205,
    bonusTokens: 100,
    growthMetric: 'AI feature adoption',
    targetGrowth: '80% of active users using AI features',
    hashtags: ['#AIMaster', '#AITrading', '#FutureOfTrading', '#VEDDAi']
  },
  
  // Ongoing/Repeatable Challenges
  {
    id: 'weekly-streak',
    title: 'No Days Off - 7 Day Streak',
    description: 'Show up every single day for a week. Engage, post, learn. Consistency is how you win.',
    type: 'engagement',
    weekNumber: 0,
    duration: 7,
    objectives: [
      { id: 'ws-1', description: 'Log in and do something every day for 7 days', verification: 'Streak tracker', tokenReward: 35 },
      { id: 'ws-2', description: 'Post trading content 5 out of 7 days', verification: 'Submit post links', tokenReward: 40 },
      { id: 'ws-3', description: 'Pull up to 2 community events', verification: 'Attendance tracking', tokenReward: 25 },
      { id: 'ws-4', description: 'Finish your daily lessons', verification: 'Progress tracker', tokenReward: 25 }
    ],
    totalTokenReward: 125,
    bonusTokens: 50,
    growthMetric: 'Daily active users',
    targetGrowth: 'Maintain 70% weekly retention',
    hashtags: ['#NoDaysOff', '#ConsistencyWins', '#DailyGrind', '#VEDDAi']
  },
  {
    id: 'monthly-ambassador',
    title: 'Ambassador MVP - Monthly Crown',
    description: 'Go for the top spot! Highest engagement, most referrals, biggest impact. The MVP gets the bag.',
    type: 'social_growth',
    weekNumber: 0,
    duration: 30,
    objectives: [
      { id: 'am-1', description: 'Stack the most tokens this month', verification: 'Leaderboard position', tokenReward: 500 },
      { id: 'am-2', description: 'Bring in the most referrals', verification: 'Referral tracking', tokenReward: 300 },
      { id: 'am-3', description: 'Get the highest content engagement', verification: 'Engagement metrics', tokenReward: 200 },
      { id: 'am-4', description: 'Host 4+ community events', verification: 'Host tracking', tokenReward: 250 }
    ],
    totalTokenReward: 1250,
    bonusTokens: 500,
    growthMetric: 'Overall community growth',
    targetGrowth: '1000+ new active users monthly',
    hashtags: ['#AmbassadorMVP', '#VEDDLeader', '#TopAmbassador', '#VEDDAi']
  }
];

export default { strategicEvents, strategicChallenges, weeklyContentFlow };
