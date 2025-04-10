import React, { useEffect, useRef, useState } from 'react';
import { ChartAnalysisResponse } from '@shared/types';
import { ArrowUpCircle, ArrowDownCircle, Ban, CheckCircle2, Crosshair } from 'lucide-react';
import { motion } from 'framer-motion';

interface ChartAnnotatorProps {
  analysis: ChartAnalysisResponse;
  imageUrl: string;
  className?: string;
}

/**
 * Component to display the chart image with trade setup signals overlaid
 * This uses a canvas element to draw annotations on top of the chart image
 */
const ChartAnnotator: React.FC<ChartAnnotatorProps> = ({
  analysis,
  imageUrl,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const [canvasHeight, setCanvasHeight] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Parse the price values
  const entryPrice = parseFloat(analysis.entryPoint.replace(/[^\d.-]/g, ''));
  const exitPrice = parseFloat(analysis.exitPoint.replace(/[^\d.-]/g, ''));
  const stopLossPrice = parseFloat(analysis.stopLoss.replace(/[^\d.-]/g, ''));
  const takeProfitPrice = parseFloat(analysis.takeProfit.replace(/[^\d.-]/g, ''));
  
  // Determine if prices are valid numbers
  const arePricesValid = !isNaN(entryPrice) && !isNaN(exitPrice) && !isNaN(stopLossPrice) && !isNaN(takeProfitPrice);
  
  // Prepare support/resistance levels if available
  const supportResistanceLevels = analysis.supportResistance?.map(level => ({
    price: parseFloat(level.level.replace(/[^\d.-]/g, '')),
    type: level.type.toLowerCase(),
    strength: level.strength.toLowerCase()
  })).filter(level => !isNaN(level.price)) || [];

  // Load the image and set up the canvas
  useEffect(() => {
    if (!imageUrl) return;
    
    const img = new Image();
    img.crossOrigin = "anonymous";  // Handle CORS if needed
    
    img.onload = () => {
      setIsImageLoaded(true);
      imageRef.current = img;
      setCanvasWidth(img.width);
      setCanvasHeight(img.height);
    };
    
    img.onerror = () => {
      setError("Failed to load chart image");
    };
    
    img.src = imageUrl;
  }, [imageUrl]);

  // Draw the annotations when the image loads
  useEffect(() => {
    if (!isImageLoaded || !imageRef.current || !canvasRef.current) return;
    
    // If prices are not valid, we'll just show the original image
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas dimensions
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // Draw the image first
    ctx.drawImage(imageRef.current, 0, 0, canvasWidth, canvasHeight);
    
    // If prices are not valid, just show the original image without annotations
    if (!arePricesValid) return;
    
    // Get price range from the chart (assumes prices are displayed vertically)
    // In a real app, this might need more sophisticated analysis of the chart
    const maxPrice = Math.max(entryPrice, exitPrice, stopLossPrice, takeProfitPrice, 
                             ...supportResistanceLevels.map(l => l.price));
    const minPrice = Math.min(entryPrice, exitPrice, stopLossPrice, takeProfitPrice,
                             ...supportResistanceLevels.map(l => l.price));
    const priceRange = maxPrice - minPrice;
    
    // Convert a price to a Y coordinate
    const priceToY = (price: number) => {
      // Estimate position (assumes chart fills 80% of the image vertically and is centered)
      // This is simplified and would need to be adjusted based on actual chart structure
      const chartTopMargin = canvasHeight * 0.1;
      const chartHeight = canvasHeight * 0.8;
      
      // Invert because on canvas Y increases downward, but prices increase upward
      return chartTopMargin + chartHeight - ((price - minPrice) / priceRange * chartHeight);
    };
    
    // Draw horizontal lines for key price levels
    const drawPriceLevel = (price: number, color: string, dashPattern: number[] = []) => {
      const y = priceToY(price);
      ctx.beginPath();
      ctx.setLineDash(dashPattern);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    };
    
    // Draw arrow markers for entry and exit
    const drawMarker = (price: number, type: string, position: 'left' | 'right') => {
      const y = priceToY(price);
      const x = position === 'left' ? 40 : canvasWidth - 40;
      
      ctx.fillStyle = type === 'entry' ? '#22c55e' : 
                     type === 'exit' ? '#3b82f6' : 
                     type === 'stop' ? '#ef4444' : '#f59e0b';
                     
      // Draw circle with label
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Labels
      const label = type === 'entry' ? 'E' : 
                   type === 'exit' ? 'X' : 
                   type === 'stop' ? 'S' : 'TP';
      ctx.fillText(label, x, y);
      
      // Draw price label
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - 40, y - 25, 80, 20);
      
      ctx.fillStyle = 'white';
      ctx.font = '10px Arial';
      ctx.fillText(price.toFixed(2), x, y - 15);
    };
    
    // Draw trend direction arrow
    const drawTrendArrow = () => {
      const isBuy = analysis.direction.toLowerCase() === 'buy';
      ctx.fillStyle = isBuy ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      
      const arrowX = canvasWidth / 2;
      const arrowY = canvasHeight * 0.85;
      const arrowSize = 40;
      
      ctx.beginPath();
      if (isBuy) {
        // Draw up arrow
        ctx.moveTo(arrowX, arrowY - arrowSize);
        ctx.lineTo(arrowX + arrowSize / 2, arrowY);
        ctx.lineTo(arrowX - arrowSize / 2, arrowY);
      } else {
        // Draw down arrow
        ctx.moveTo(arrowX, arrowY + arrowSize);
        ctx.lineTo(arrowX + arrowSize / 2, arrowY);
        ctx.lineTo(arrowX - arrowSize / 2, arrowY);
      }
      ctx.closePath();
      ctx.fill();
      
      // Label
      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(isBuy ? 'BUY' : 'SELL', arrowX, arrowY + (isBuy ? 15 : -15));
    };
    
    // Clear any previous drawings
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.drawImage(imageRef.current, 0, 0, canvasWidth, canvasHeight);
    
    // Add semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw support/resistance levels
    supportResistanceLevels.forEach(level => {
      const color = level.type === 'support' ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
      const linePattern = level.strength === 'strong' ? [] : [5, 5];
      drawPriceLevel(level.price, color, linePattern);
      
      // Add label
      ctx.fillStyle = color;
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`${level.type.charAt(0).toUpperCase() + level.type.slice(1)} (${level.strength})`, 10, priceToY(level.price) - 5);
    });
    
    // Draw price levels
    drawPriceLevel(entryPrice, 'rgba(34, 197, 94, 0.8)', [5, 5]); // Entry - dashed green
    drawPriceLevel(exitPrice, 'rgba(59, 130, 246, 0.8)', [5, 5]);  // Exit - dashed blue
    drawPriceLevel(stopLossPrice, 'rgba(239, 68, 68, 0.8)'); // Stop Loss - solid red
    drawPriceLevel(takeProfitPrice, 'rgba(245, 158, 11, 0.8)'); // Take Profit - solid orange
    
    // Draw markers
    drawMarker(entryPrice, 'entry', 'left');
    drawMarker(exitPrice, 'exit', 'right');
    drawMarker(stopLossPrice, 'stop', 'left');
    drawMarker(takeProfitPrice, 'tp', 'right');
    
    // Draw trend arrow
    drawTrendArrow();
    
    // Add title with confidence level
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(canvasWidth / 2 - 150, 10, 300, 30);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${analysis.symbol} (${analysis.timeframe}) - ${analysis.confidence} Confidence`, canvasWidth / 2, 30);
    
  }, [isImageLoaded, canvasWidth, canvasHeight, analysis, entryPrice, exitPrice, stopLossPrice, takeProfitPrice, supportResistanceLevels, arePricesValid]);

  // Show error if image fails to load
  if (error) {
    return (
      <div className={`relative rounded-md overflow-hidden ${className}`}>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white p-4">
          <Ban className="w-12 h-12 text-red-500 mb-2" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Show loading state
  if (!isImageLoaded) {
    return (
      <div className={`relative rounded-md overflow-hidden ${className}`}>
        <img 
          src={imageUrl} 
          alt={`${analysis.symbol} chart loading`}
          className="w-full h-auto"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full mb-2"
          />
          <p>Preparing trade signals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative rounded-md overflow-hidden ${className}`}>
      <canvas 
        ref={canvasRef} 
        width={canvasWidth} 
        height={canvasHeight} 
        className="w-full h-auto"
      />
      
      {/* Trade signal legend */}
      <div className="absolute bottom-3 left-3 flex flex-row flex-wrap gap-2 bg-black/70 p-2 rounded-md text-xs">
        <div className="flex items-center">
          <ArrowUpCircle className="w-4 h-4 text-green-500 mr-1" />
          <span className="text-white">Entry</span>
        </div>
        <div className="flex items-center">
          <ArrowDownCircle className="w-4 h-4 text-blue-500 mr-1" />
          <span className="text-white">Exit</span>
        </div>
        <div className="flex items-center">
          <Ban className="w-4 h-4 text-red-500 mr-1" />
          <span className="text-white">Stop Loss</span>
        </div>
        <div className="flex items-center">
          <CheckCircle2 className="w-4 h-4 text-amber-500 mr-1" />
          <span className="text-white">Take Profit</span>
        </div>
      </div>
    </div>
  );
};

export default ChartAnnotator;