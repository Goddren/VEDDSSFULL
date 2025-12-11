import React from 'react';
import ContentPage from '@/components/layout/content-page';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3, Award, Cpu, LucideIcon, TrendingUp, LineChart, BarChart2 } from 'lucide-react';

interface FeatureProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

const Feature: React.FC<FeatureProps> = ({ title, description, icon: Icon }) => {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-medium mb-2">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </div>
  );
};

const AboutPage: React.FC = () => {
  const features = [
    {
      title: 'AI-Powered Analysis',
      description: 'Our cutting-edge AI analyzes trading charts to identify patterns, trends, and optimal entry/exit points with high accuracy.',
      icon: Cpu
    },
    {
      title: 'Multi-Platform Support',
      description: 'Compatible with screenshots from MT5, TradingView, and TradeLocker platforms, making it accessible for all traders.',
      icon: BarChart3
    },
    {
      title: 'Achievement System',
      description: 'Gamified trading journey with achievements to track your progress and improve your trading discipline.',
      icon: Award
    },
    {
      title: 'Comprehensive Insights',
      description: 'Get detailed breakdowns of support/resistance levels, trend strength, pattern recognition, and risk/reward metrics.',
      icon: TrendingUp
    },
    {
      title: 'Historical Analysis',
      description: 'Review your past analyses to learn from successful trades and improve your strategy over time.',
      icon: LineChart
    },
    {
      title: 'Actionable Signals',
      description: 'Clear buy/sell signals with specific price targets to help you make informed trading decisions.',
      icon: BarChart2
    }
  ];
  
  const team = [
    {
      name: 'Christopher Don Chism II',
      role: 'Founder, CEO & SEO',
      bio: 'Visionary leader and trading expert with extensive experience in financial markets and algorithmic trading systems.',
    },
    {
      name: 'Christopher Don Chism II',
      role: 'Chief AI Officer',
      bio: 'Expert in machine learning and AI systems with specialized knowledge in computer vision and pattern recognition for financial markets.',
    },
    {
      name: 'Christopher Don Chism II',
      role: 'Head of Trading Strategy',
      bio: 'Seasoned trader with a proven track record of developing profitable systems and strategies across multiple market conditions.',
    },
  ];

  return (
    <ContentPage 
      title="About VEDD" 
      subtitle="AI-powered trading chart analysis platform built for modern traders"
    >
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Our Mission</h2>
        <p className="mb-4">
          At VEDD, we're on a mission to democratize access to professional-grade trading analysis tools. 
          We believe that every trader, regardless of experience level or account size, 
          should have access to powerful AI-driven insights that were once available only to institutional traders.
        </p>
        <p>
          By combining cutting-edge artificial intelligence with an intuitive user experience, 
          we're helping traders make more informed decisions, identify high-probability setups, 
          and ultimately improve their trading performance.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Key Features</h2>
        <div className="grid gap-8 md:grid-cols-2">
          {features.map((feature, index) => (
            <Feature 
              key={index}
              title={feature.title}
              description={feature.description}
              icon={feature.icon}
            />
          ))}
        </div>
      </section>
      
      <section className="mb-12">
        <h2 className="text-2xl font-bold mb-6">Our Team</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {team.map((member, index) => (
            <Card key={index}>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="w-20 h-20 bg-muted rounded-full mx-auto mb-3"></div>
                  <h3 className="font-bold">{member.name}</h3>
                  <p className="text-primary text-sm mb-2">{member.role}</p>
                  <p className="text-muted-foreground text-sm">{member.bio}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      
      <section>
        <h2 className="text-2xl font-bold mb-6">Our Story</h2>
        <p className="mb-4">
          VEDD was founded in 2023 by Christopher Don Chism II, a visionary trader and AI expert who identified 
          significant limitations in existing trading tools. After years of manually analyzing charts and developing 
          trading strategies, he was determined to create a revolutionary platform that would transform the trading industry.
        </p>
        <p className="mb-4">
          Christopher built the first prototype of the AI chart analysis system for his own trading, and the results were 
          impressive. The pattern recognition accuracy increased significantly, and high-probability setups could be identified 
          much faster than with traditional analysis methods, leading to consistently profitable trading strategies.
        </p>
        <p>
          Today, under Christopher Don Chism II's leadership, VEDD has grown into a comprehensive trading analysis platform 
          used by thousands of traders worldwide, from beginners to professional fund managers. We're constantly improving our 
          AI models and adding new features based on user feedback to ensure VEDD remains at the cutting edge of trading technology.
        </p>
      </section>
    </ContentPage>
  );
};

export default AboutPage;