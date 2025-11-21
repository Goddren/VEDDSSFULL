import { useState, useRef, useEffect } from "react";
import { useGesture } from "@use-gesture/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ZoomIn, ZoomOut, RotateCcw, TrendingUp, TrendingDown } from "lucide-react";
import type { ChartAnalysis } from "@shared/schema";

interface MobileChartViewerProps {
  analysis: ChartAnalysis;
  onClose?: () => void;
}

export function MobileChartViewer({ analysis, onClose }: MobileChartViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLDivElement>(null);

  const bind = useGesture(
    {
      onPinch: ({ offset: [d] }) => {
        const newScale = Math.min(Math.max(1 + d / 200, 0.5), 3);
        setScale(newScale);
      },
      onDrag: ({ offset: [x, y], pinching }) => {
        if (!pinching && scale > 1) {
          setPosition({ x, y });
        }
      },
      onWheel: ({ event, delta: [, dy] }) => {
        event.preventDefault();
        const newScale = Math.min(Math.max(scale - dy * 0.001, 0.5), 3);
        setScale(newScale);
      },
    },
    {
      drag: { from: () => [position.x, position.y] },
      pinch: { scaleBounds: { min: 0.5, max: 3 }, rubberband: true },
    }
  );

  const resetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const directionIcon = analysis.direction?.toUpperCase() === 'BUY' 
    ? <TrendingUp className="w-5 h-5 text-green-500" />
    : analysis.direction?.toUpperCase() === 'SELL'
    ? <TrendingDown className="w-5 h-5 text-red-500" />
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-background" data-testid="mobile-chart-viewer">
      <div className="h-full flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold" data-testid="text-chart-symbol">{analysis.symbol}</h2>
              {directionIcon}
            </div>
            {onClose && (
              <Button onClick={onClose} variant="ghost" size="sm" data-testid="button-close-viewer">
                Close
              </Button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" data-testid="badge-timeframe">{analysis.timeframe}</Badge>
            <Badge variant="outline" data-testid="badge-direction">{analysis.direction}</Badge>
            <Badge variant="outline" data-testid="badge-confidence">{analysis.confidence}</Badge>
          </div>
        </div>

        <div className="flex-1 overflow-hidden relative touch-none">
          <div
            ref={imageRef}
            {...bind()}
            className="absolute inset-0 flex items-center justify-center"
            style={{
              touchAction: 'none',
            }}
            data-testid="chart-image-container"
          >
            <img
              src={analysis.imageUrl}
              alt={`${analysis.symbol} chart analysis`}
              className="max-w-full max-h-full object-contain select-none"
              style={{
                transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
                transition: 'transform 0.1s ease-out',
              }}
              draggable={false}
              data-testid="chart-image"
            />
          </div>

          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 bg-background/90 backdrop-blur-sm p-2 rounded-lg border shadow-lg">
            <Button
              onClick={zoomOut}
              variant="outline"
              size="icon"
              disabled={scale <= 0.5}
              data-testid="button-zoom-out"
            >
              <ZoomOut className="w-5 h-5" />
            </Button>
            <Button
              onClick={resetZoom}
              variant="outline"
              size="icon"
              data-testid="button-reset-zoom"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
            <Button
              onClick={zoomIn}
              variant="outline"
              size="icon"
              disabled={scale >= 3}
              data-testid="button-zoom-in"
            >
              <ZoomIn className="w-5 h-5" />
            </Button>
            <div className="flex items-center px-3 text-sm font-mono" data-testid="text-zoom-level">
              {Math.round(scale * 100)}%
            </div>
          </div>
        </div>

        <Card className="m-4 p-4" data-testid="card-analysis-details">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Entry</div>
              <div className="font-semibold" data-testid="text-entry-point">{analysis.entryPoint}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Stop Loss</div>
              <div className="font-semibold" data-testid="text-stop-loss">{analysis.stopLoss}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Take Profit</div>
              <div className="font-semibold" data-testid="text-take-profit">{analysis.takeProfit}</div>
            </div>
            <div>
              <div className="text-muted-foreground">R:R Ratio</div>
              <div className="font-semibold" data-testid="text-risk-reward">{analysis.riskRewardRatio}</div>
            </div>
          </div>
          {analysis.recommendation && (
            <div className="mt-3 pt-3 border-t">
              <div className="text-muted-foreground text-xs mb-1">Recommendation</div>
              <div className="text-sm" data-testid="text-recommendation">{analysis.recommendation}</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
