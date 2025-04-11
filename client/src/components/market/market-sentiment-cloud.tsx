import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore
import * as d3 from 'd3';
// @ts-ignore
import cloud from 'd3-cloud';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface Word {
  text: string;
  size: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  importance: number; // 1-10 scale for importance
}

interface MarketSentimentCloudProps {
  symbol?: string;
  timeframe?: string;
  className?: string;
}

export const MarketSentimentCloud: React.FC<MarketSentimentCloudProps> = ({
  symbol = 'BTC/USD',
  timeframe = '1h',
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [loading, setLoading] = useState(true);
  const [words, setWords] = useState<Word[]>([]);
  
  // Generate word data based on symbol and timeframe
  useEffect(() => {
    setLoading(true);
    
    // Simulate API call or data generation
    setTimeout(() => {
      // Generate words based on the symbol
      const generatedWords = generateMarketSentimentWords(symbol, timeframe);
      setWords(generatedWords);
      setLoading(false);
    }, 800);
  }, [symbol, timeframe]);
  
  // Render the word cloud
  useEffect(() => {
    if (loading || !words.length || !svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    
    // Clear any previous content
    svg.selectAll('*').remove();
    
    // Create the word cloud layout
    const layout = cloud()
      .size([width, height])
      .words(words.map((d) => ({
        text: d.text,
        size: d.size,
        sentiment: d.sentiment,
        importance: d.importance,
      })))
      .padding(5)
      .rotate(() => 0)
      .fontSize((d: any) => d.size)
      .on('end', (words: any) => {
        // Draw the word cloud
        svg.append('g')
          .attr('transform', `translate(${width / 2},${height / 2})`)
          .selectAll('text')
          .data(words)
          .enter()
          .append('text')
          .style('font-size', (d: any) => `${d.size}px`)
          .style('font-family', 'Inter, system-ui, sans-serif')
          .style('font-weight', (d: any) => d.importance > 6 ? 'bold' : 'normal')
          .style('fill', (d: any) => {
            switch (d.sentiment) {
              case 'bullish':
                return '#10b981'; // Emerald-500
              case 'bearish':
                return '#ef4444'; // Red-500
              case 'neutral':
                return '#f59e0b'; // Amber-500
              default:
                return '#94a3b8'; // Slate-400
            }
          })
          .attr('text-anchor', 'middle')
          .attr('transform', (d: any) => `translate(${d.x},${d.y})`)
          .text((d: any) => d.text)
          .style('cursor', 'pointer')
          .on('mouseenter', function(this: SVGTextElement) {
            d3.select(this)
              .transition()
              .duration(200)
              .style('font-size', (d: any) => `${d.size * 1.2}px`);
          })
          .on('mouseleave', function(this: SVGTextElement) {
            d3.select(this)
              .transition()
              .duration(200)
              .style('font-size', (d: any) => `${d.size}px`);
          });
      });
      
    layout.start();
    
  }, [loading, words]);
  
  return (
    <Card className={`${className} overflow-hidden`}>
      <CardContent className="p-6">
        <h3 className="text-lg font-semibold mb-3">Market Sentiment</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Popular terms and sentiment for {symbol} {timeframe ? `(${timeframe})` : ''}
        </p>
        
        {loading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <span className="mt-2 text-sm text-muted-foreground">Analyzing market sentiment...</span>
            </div>
          </div>
        ) : (
          <div className="h-[300px] w-full">
            <svg ref={svgRef} width="100%" height="100%" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Helper function to generate words for the word cloud
function generateMarketSentimentWords(symbol: string, timeframe?: string): Word[] {
  // Real-world implementation would fetch this data from an API
  
  // Common market terms with randomized size and sentiment
  const baseWords: Partial<Word>[] = [
    { text: 'Bullish', sentiment: 'bullish', importance: 9 },
    { text: 'Bearish', sentiment: 'bearish', importance: 8 },
    { text: 'Support', sentiment: 'bullish', importance: 7 },
    { text: 'Resistance', sentiment: 'bearish', importance: 7 },
    { text: 'Breakout', sentiment: 'bullish', importance: 8 },
    { text: 'Breakdown', sentiment: 'bearish', importance: 7 },
    { text: 'Volatility', sentiment: 'neutral', importance: 6 },
    { text: 'Momentum', sentiment: 'neutral', importance: 6 },
    { text: 'Consolidation', sentiment: 'neutral', importance: 5 },
    { text: 'Trend', sentiment: 'neutral', importance: 7 },
    { text: 'Reversal', sentiment: 'neutral', importance: 7 },
    { text: 'Overbought', sentiment: 'bearish', importance: 6 },
    { text: 'Oversold', sentiment: 'bullish', importance: 6 },
    { text: 'Volume', sentiment: 'neutral', importance: 5 },
    { text: 'Rally', sentiment: 'bullish', importance: 7 },
    { text: 'Correction', sentiment: 'bearish', importance: 6 },
    { text: 'Divergence', sentiment: 'neutral', importance: 5 },
    { text: 'Accumulation', sentiment: 'bullish', importance: 6 },
    { text: 'Distribution', sentiment: 'bearish', importance: 6 },
    { text: 'Channel', sentiment: 'neutral', importance: 4 },
    { text: 'Fibonacci', sentiment: 'neutral', importance: 5 },
    { text: 'Bottoming', sentiment: 'bullish', importance: 6 },
    { text: 'Topping', sentiment: 'bearish', importance: 6 },
    { text: 'Swing', sentiment: 'neutral', importance: 4 },
    { text: 'Pivot', sentiment: 'neutral', importance: 5 },
    { text: 'Rejection', sentiment: 'bearish', importance: 6 },
    { text: 'Confirmation', sentiment: 'bullish', importance: 5 },
    { text: 'Range-bound', sentiment: 'neutral', importance: 4 },
    { text: 'Squeeze', sentiment: 'neutral', importance: 5 },
    { text: 'Liquidity', sentiment: 'neutral', importance: 5 },
  ];
  
  // Add currency-specific terms
  const symbolTerms: Partial<Word>[] = [];
  
  if (symbol.includes('BTC') || symbol.includes('Bitcoin')) {
    symbolTerms.push(
      { text: 'Halving', sentiment: 'bullish', importance: 8 },
      { text: 'Mining', sentiment: 'neutral', importance: 5 },
      { text: 'HODL', sentiment: 'bullish', importance: 7 },
      { text: 'Whales', sentiment: 'neutral', importance: 6 },
      { text: 'Institutional', sentiment: 'bullish', importance: 7 },
      { text: 'Regulations', sentiment: 'bearish', importance: 6 },
      { text: 'ETF', sentiment: 'bullish', importance: 8 },
    );
  } else if (symbol.includes('ETH') || symbol.includes('Ethereum')) {
    symbolTerms.push(
      { text: 'Merge', sentiment: 'bullish', importance: 8 },
      { text: 'Gas', sentiment: 'neutral', importance: 6 },
      { text: 'Staking', sentiment: 'bullish', importance: 7 },
      { text: 'DeFi', sentiment: 'neutral', importance: 7 },
      { text: 'Layer2', sentiment: 'bullish', importance: 6 },
      { text: 'Smart Contracts', sentiment: 'neutral', importance: 5 },
    );
  } else if (symbol.includes('EUR') || symbol.includes('USD') || symbol.includes('GBP')) {
    symbolTerms.push(
      { text: 'Interest Rates', sentiment: 'neutral', importance: 8 },
      { text: 'Inflation', sentiment: 'bearish', importance: 7 },
      { text: 'Central Bank', sentiment: 'neutral', importance: 7 },
      { text: 'GDP', sentiment: 'neutral', importance: 6 },
      { text: 'Recession', sentiment: 'bearish', importance: 7 },
      { text: 'Employment', sentiment: 'bullish', importance: 6 },
      { text: 'Fiscal Policy', sentiment: 'neutral', importance: 5 },
    );
  }
  
  const allWords = [...baseWords, ...symbolTerms];
  
  // Calculate sentiment bias based on string hash of currency pair and timeframe
  const hash = (symbol + timeframe).split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
  const sentimentBias = (hash % 100) / 100; // 0-1 value to bias sentiment
  
  // Adjust word sizes based on "recent market data" (our random bias)
  const result: Word[] = allWords.map(word => {
    // Assign base size based on importance (1-10 scale)
    const baseSize = 14 + (word.importance || 5) * 3;
    
    // Apply random importance adjustments based on "current market conditions"
    let multiplier = 1;
    
    if (word.sentiment === 'bullish' && sentimentBias > 0.6) {
      // Bullish market - emphasize bullish words
      multiplier = 1.2 + Math.random() * 0.3;
    } else if (word.sentiment === 'bearish' && sentimentBias < 0.4) {
      // Bearish market - emphasize bearish words
      multiplier = 1.2 + Math.random() * 0.3;
    } else if (word.sentiment === 'neutral') {
      // Neutral words get random adjustment
      multiplier = 0.9 + Math.random() * 0.2;
    } else {
      // Other words get mild randomization
      multiplier = 0.8 + Math.random() * 0.4;
    }
    
    // Apply final sizing
    const size = Math.round(baseSize * multiplier);
    
    return {
      text: word.text || '',
      size,
      sentiment: word.sentiment || 'neutral',
      importance: word.importance || 5
    } as Word;
  });
  
  return result;
}