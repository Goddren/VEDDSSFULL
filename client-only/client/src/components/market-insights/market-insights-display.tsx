import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowBigDown, ArrowBigUp, BarChart3, Waves, LineChart, TrendingDown, TrendingUp, AlertTriangle, Lightbulb, ChevronRight } from 'lucide-react';
import { InsightTooltip } from '@/components/ui/insight-tooltip';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Link } from 'wouter';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { 
      staggerChildren: 0.15
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { 
    y: 0, 
    opacity: 1,
    transition: { type: 'spring', stiffness: 100 }
  }
};

// Insight data for market patterns
const marketInsights = [
  {
    id: 1,
    title: 'Bullish Engulfing Pattern',
    description: 'A powerful reversal pattern that forms after a downtrend and signals a potential upward move.',
    icon: <ArrowBigUp className="h-5 w-5 text-emerald-500" />,
    tooltipTitle: 'Bullish Engulfing',
    tooltipContent: 'This pattern appears when a green (bullish) candle completely engulfs the previous red (bearish) candle. It shows buyers taking control from sellers, often signaling a trend reversal.',
    animationType: 'uptrend',
    category: 'candlestick'
  },
  {
    id: 2,
    title: 'Bearish Engulfing Pattern',
    description: 'A strong reversal signal that forms after an uptrend and indicates a potential downturn.',
    icon: <ArrowBigDown className="h-5 w-5 text-rose-500" />,
    tooltipTitle: 'Bearish Engulfing',
    tooltipContent: 'This pattern forms when a red (bearish) candle completely engulfs the previous green (bullish) candle. It shows sellers overpowering buyers, often marking the beginning of a downtrend.',
    animationType: 'downtrend',
    category: 'candlestick'
  },
  {
    id: 3,
    title: 'Volatility Squeeze',
    description: 'A period of low volatility and tight price consolidation that often precedes a major price move.',
    icon: <BarChart3 className="h-5 w-5 text-purple-500" />,
    tooltipTitle: 'Volatility Squeeze',
    tooltipContent: 'When Bollinger Bands contract and price moves in a narrow range, it often indicates a period of low volatility that precedes an explosive breakout. Watch for increasing volume as a confirmation signal.',
    animationType: 'volatility',
    category: 'technical'
  },
  {
    id: 4,
    title: 'Price Consolidation',
    description: 'A period where price moves sideways within a range, often before continuing the prior trend.',
    icon: <Waves className="h-5 w-5 text-blue-500" />,
    tooltipTitle: 'Price Consolidation',
    tooltipContent: 'During consolidation, the market is in equilibrium with neither buyers nor sellers dominating. These periods often appear as rectangles on charts and can lead to powerful breakouts when resolved.',
    animationType: 'consolidation',
    category: 'technical'
  },
  {
    id: 5,
    title: 'Breakout Trading',
    description: 'A strategy focusing on entering when price breaks through a significant support or resistance level.',
    icon: <LineChart className="h-5 w-5 text-amber-500" />,
    tooltipTitle: 'Trading Breakouts',
    tooltipContent: 'Breakouts occur when price moves beyond an established support or resistance level with increased volume. The best breakouts often come after periods of tight consolidation with decreasing volume.',
    animationType: 'breakout',
    category: 'strategy'
  },
  {
    id: 6,
    title: 'Overbought Conditions',
    description: 'Market states where prices have risen too quickly and may be due for a correction.',
    icon: <TrendingUp className="h-5 w-5 text-emerald-500" />,
    tooltipTitle: 'Overbought Markets',
    tooltipContent: 'When RSI rises above 70 or stochastics above 80, the market may be overbought. While these conditions can persist in strong trends, they often precede pullbacks or trend exhaustion.',
    animationType: 'uptrend',
    category: 'technical'
  },
  {
    id: 7,
    title: 'Oversold Conditions',
    description: 'Market states where prices have fallen too quickly and may be due for a bounce.',
    icon: <TrendingDown className="h-5 w-5 text-rose-500" />,
    tooltipTitle: 'Oversold Markets',
    tooltipContent: 'When RSI falls below 30 or stochastics below 20, the market may be oversold. These conditions often present buying opportunities, especially when accompanied by bullish divergence.',
    animationType: 'downtrend',
    category: 'technical'
  },
  {
    id: 8,
    title: 'Risk Management Rules',
    description: 'Essential guidelines for protecting capital and ensuring long-term trading success.',
    icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
    tooltipTitle: 'Risk Management',
    tooltipContent: 'Never risk more than 1-2% of your capital on a single trade. Always use stop losses and have a clear exit strategy. Remember that protecting your capital is more important than making profits.',
    animationType: 'none',
    category: 'strategy'
  },
  {
    id: 9,
    title: 'Trading Psychology',
    description: 'Understanding emotional biases and maintaining discipline for consistent trading.',
    icon: <Lightbulb className="h-5 w-5 text-blue-500" />,
    tooltipTitle: 'Trading Psychology',
    tooltipContent: 'Successful trading is 80% psychology and 20% strategy. Focus on executing your plan rather than the money. Keep a trading journal to identify patterns in your behavior and improve decision-making.',
    animationType: 'none',
    category: 'strategy'
  }
];

interface FilterProps {
  category: string;
  active: boolean;
  onClick: () => void;
}

function CategoryFilter({ category, active, onClick }: FilterProps) {
  return (
    <Badge 
      variant={active ? "default" : "outline"}
      className={`cursor-pointer ${active ? 'bg-primary' : 'hover:bg-secondary'}`}
      onClick={onClick}
    >
      {category === 'all' ? 'All' : 
       category === 'candlestick' ? 'Candlestick Patterns' :
       category === 'technical' ? 'Technical Indicators' : 'Trading Strategies'}
    </Badge>
  );
}

export function MarketInsightsDisplay() {
  const [activeCategory, setActiveCategory] = React.useState('all');
  
  const filteredInsights = React.useMemo(() => {
    if (activeCategory === 'all') {
      return marketInsights;
    }
    return marketInsights.filter(insight => insight.category === activeCategory);
  }, [activeCategory]);

  return (
    <div className="container py-8">
      <div className="mb-6">
        <Link href="/dashboard">
          <Badge 
            variant="outline" 
            className="cursor-pointer hover:bg-secondary flex items-center gap-1 pl-2 pr-3 py-1.5"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            <span>Back to Dashboard</span>
          </Badge>
        </Link>
      </div>
      
      <div className="flex flex-col space-y-4 md:flex-row md:justify-between md:space-y-0 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Market Insights</h1>
          <p className="text-muted-foreground mt-1">
            Interactive guides to common market patterns and indicators
          </p>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-8">
        <CategoryFilter 
          category="all" 
          active={activeCategory === 'all'} 
          onClick={() => setActiveCategory('all')}
        />
        <CategoryFilter 
          category="candlestick" 
          active={activeCategory === 'candlestick'} 
          onClick={() => setActiveCategory('candlestick')}
        />
        <CategoryFilter 
          category="technical" 
          active={activeCategory === 'technical'} 
          onClick={() => setActiveCategory('technical')}
        />
        <CategoryFilter 
          category="strategy" 
          active={activeCategory === 'strategy'} 
          onClick={() => setActiveCategory('strategy')}
        />
      </div>
      
      <motion.div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {filteredInsights.map((insight) => (
          <motion.div key={insight.id} variants={itemVariants}>
            <Card className="h-full bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow duration-300">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-start space-x-4">
                    <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-800">
                      {insight.icon}
                    </div>
                    <div>
                      <CardTitle className="text-lg text-left">{insight.title}</CardTitle>
                      <CardDescription className="text-left mt-1">
                        {insight.description}
                      </CardDescription>
                    </div>
                  </div>
                  <InsightTooltip 
                    title={insight.tooltipTitle}
                    content={insight.tooltipContent}
                    icon={insight.category === 'candlestick' ? 
                      (insight.title.includes('Bullish') ? 'bullish' : 'bearish') : 
                      insight.category === 'technical' ? 'volatility' : 'info'}
                    animationType={insight.animationType as any}
                    showButton={true}
                    buttonText="Apply to Analysis"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <Badge variant="outline" className="mr-2">
                    {insight.category === 'candlestick' ? 'Pattern' : 
                     insight.category === 'technical' ? 'Indicator' : 'Strategy'}
                  </Badge>
                  {insight.category === 'candlestick' && (
                    <span className="flex items-center gap-1">
                      <span className={insight.title.includes('Bullish') ? 'text-emerald-500' : 'text-rose-500'}>
                        {insight.title.includes('Bullish') ? 'Bullish' : 'Bearish'}
                      </span> 
                      signal
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}