import React from 'react';
import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import InteractiveInsightTooltip from '@/components/ui/interactive-insight-tooltip';

const InteractiveTooltipShowcase: React.FC = () => {
  const patterns = [
    {
      type: 'bullish',
      insight: 'A bullish trend indicates upward price movement. Look for higher highs and higher lows in the price action. Consider long positions with appropriate stop losses.',
      marketTrend: 'bullish'
    },
    {
      type: 'bearish',
      insight: 'A bearish trend suggests downward price movement. Watch for lower highs and lower lows. Consider short positions or staying out of the market.',
      marketTrend: 'bearish'
    },
    {
      type: 'double_top',
      insight: 'Double top pattern occurs when prices rise to a resistance level, retreat, and then return to the resistance level before declining again. This indicates a potential bearish reversal.',
      marketTrend: 'bearish'
    },
    {
      type: 'double_bottom',
      insight: 'Double bottom pattern forms when prices fall to a support level, bounce, and then return to that support level before rising again. This signals a potential bullish reversal.',
      marketTrend: 'bullish'
    },
    {
      type: 'head_and_shoulders',
      insight: 'This pattern consists of three peaks with the middle peak (head) being the highest and the two outer peaks (shoulders) being lower. It signals a bearish reversal after an uptrend.',
      marketTrend: 'bearish'
    },
    {
      type: 'inverse_head_and_shoulders',
      insight: 'This is an inverted version of the head and shoulders pattern. It forms during downtrends and signals a potential bullish reversal with three troughs, the middle being the lowest.',
      marketTrend: 'bullish'
    },
    {
      type: 'triangle',
      insight: 'Triangle patterns occur when price moves form converging trend lines. Depending on the type (ascending, descending, or symmetrical), they can indicate continuation or reversal.',
      marketTrend: 'neutral'
    },
    {
      type: 'wedge',
      insight: 'Wedge patterns form when trend lines converge. A rising wedge in an uptrend is bearish, while a falling wedge in a downtrend is bullish.',
      marketTrend: 'bullish'
    },
    {
      type: 'flag',
      insight: 'Flag patterns are continuation patterns that form after a sharp price movement followed by a consolidation period. They suggest the previous trend will continue.',
      marketTrend: 'bullish'
    },
    {
      type: 'channel',
      insight: 'Price channels form when prices move between parallel support and resistance trend lines. They can indicate trends and potential reversal points.',
      marketTrend: 'neutral'
    },
    {
      type: 'support',
      insight: 'Support levels are price points where buying pressure overcomes selling pressure, causing the price to stop falling and potentially reverse upward.',
      marketTrend: 'bullish'
    },
    {
      type: 'resistance',
      insight: 'Resistance levels are price points where selling pressure overcomes buying pressure, causing the price to stop rising and potentially reverse downward.',
      marketTrend: 'bearish'
    },
    {
      type: 'breakout',
      insight: 'Breakouts occur when price moves above resistance or below support with increased volume. They signal potential new trends or trend accelerations.',
      marketTrend: 'bullish'
    },
    {
      type: 'reversal',
      insight: 'Reversal patterns indicate a potential change in the price direction. Look for confirmation such as increased volume or other technical indicators.',
      marketTrend: 'bullish'
    },
    {
      type: 'continuation',
      insight: 'Continuation patterns suggest the current trend will continue after a period of consolidation. Examples include flags, pennants, and triangles.',
      marketTrend: 'bullish'
    }
  ];

  // Different types of tooltips (info, warning, success, error)
  const tooltipTypes = [
    {
      type: 'info',
      insight: 'This is an informational tooltip providing context about market conditions.',
      patternType: undefined,
    },
    {
      type: 'warning',
      insight: 'High market volatility detected. Consider reducing position sizes and using wider stop losses.',
      patternType: undefined,
    },
    {
      type: 'success',
      insight: 'Your technical analysis identified the correct pattern! The market moved as predicted.',
      patternType: undefined,
    },
    {
      type: 'error',
      insight: 'Strong market factors overriding technical patterns. Consider staying out until conditions stabilize.',
      patternType: undefined,
    }
  ];

  return (
    <div className="container py-10 max-w-5xl">
      <div className="mb-6">
        <Link to="/dashboard">
          <Button variant="outline" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Interactive Market Insight Tooltips</h1>
        <p className="text-muted-foreground mt-2">
          Contextual tooltips with animated visualizations for different chart patterns and market conditions.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Chart Pattern Tooltips</CardTitle>
            <CardDescription>
              Tooltips showing different technical analysis patterns with contextual animations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {patterns.map((pattern, index) => (
                <InteractiveInsightTooltip
                  key={index}
                  insight={pattern.insight}
                  patternType={pattern.type as any}
                  marketTrend={pattern.marketTrend as any}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alert Type Tooltips</CardTitle>
            <CardDescription>
              Different types of alerts and notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {tooltipTypes.map((tooltip, index) => (
                <InteractiveInsightTooltip
                  key={index}
                  insight={tooltip.insight}
                  type={tooltip.type as any}
                  patternType={tooltip.patternType}
                />
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Using Tooltips in Analysis</CardTitle>
            <CardDescription>
              Example of how the tooltips can be used in real analysis context
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 border rounded-lg">
              <h3 className="text-lg font-medium mb-3">EURUSD Analysis - Daily Timeframe</h3>
              <p className="mb-3">
                The EURUSD has been showing signs of a <InteractiveInsightTooltip 
                  insight="A bullish trend that accelerates as more buyers enter the market."
                  patternType="breakout"
                  marketTrend="bullish"
                  className="inline-block"
                /> 
                from its previous range, with prices moving above the <InteractiveInsightTooltip 
                  insight="A resistance level at 1.0850 that was tested multiple times in the past month."
                  patternType="resistance"
                  className="inline-block"
                />. 
              </p>
              <p className="mb-3">
                We can also observe a <InteractiveInsightTooltip 
                  insight="This pattern suggests a potential change in the trend direction from bearish to bullish."
                  patternType="inverse_head_and_shoulders"
                  marketTrend="bullish"
                  className="inline-block"
                /> 
                on the 4-hour timeframe, confirming the bullish sentiment.
              </p>
              <p>
                <InteractiveInsightTooltip 
                  type="warning"
                  insight="The ECB meeting tomorrow could cause increased volatility in EUR pairs."
                  className="inline-block"
                /> Although the technical outlook is bullish, traders should be aware of upcoming economic events.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InteractiveTooltipShowcase;