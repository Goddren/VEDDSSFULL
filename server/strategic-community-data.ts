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

export default { strategicEvents, strategicChallenges };
