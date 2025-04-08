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
      description: 'Compatible with screenshots from MT4, MT5, and TradingView platforms, making it accessible for all traders.',
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
      name: 'Alex Johnson',
      role: 'Founder & CEO',
      bio: 'Former hedge fund analyst with over 15 years of experience in the financial markets.',
    },
    {
      name: 'Dr. Maria Chen',
      role: 'Chief AI Officer',
      bio: 'PhD in Machine Learning with expertise in computer vision and financial pattern recognition.',
    },
    {
      name: 'David Williams',
      role: 'Head of Trading Strategy',
      bio: 'Professional trader with a track record of developing profitable systems across multiple markets.',
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
          VEDD was founded in 2023 by a team of traders, data scientists, and software engineers who were frustrated 
          with the limitations of existing trading tools. After years of manually analyzing charts and developing 
          trading strategies, we realized there had to be a better way.
        </p>
        <p className="mb-4">
          We built the first prototype of our AI chart analysis system for our own trading, and the results were 
          impressive. Our pattern recognition accuracy increased significantly, and we were able to identify 
          high-probability setups much faster than with traditional analysis methods.
        </p>
        <p>
          Today, VEDD has grown into a comprehensive trading analysis platform used by thousands of traders worldwide, 
          from beginners to professional fund managers. We're constantly improving our AI models and adding new features 
          based on user feedback to ensure VEDD remains at the cutting edge of trading technology.
        </p>
      </section>
    </ContentPage>
  );
};

export default AboutPage;