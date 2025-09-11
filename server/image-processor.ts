import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';
import { ChartAnalysisResponse } from '../shared/types';

/**
 * Adds a VEDDAI watermark to an image and saves it to the uploads/shared directory
 * @param originalImagePath The path to the original image
 * @param outputFilename The filename to save the watermarked image as
 * @returns The path to the watermarked image
 */
export async function addWatermarkToImage(originalImagePath: string, outputFilename: string): Promise<string> {
  try {
    // Load the original image
    const image = await loadImage(originalImagePath);
    
    // Create a canvas with the same dimensions as the image
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // Draw the original image on the canvas
    ctx.drawImage(image, 0, 0, image.width, image.height);
    
    // Add a semi-transparent overlay in the bottom-right corner
    const logoWidth = Math.min(image.width * 0.25, 150); // Logo width is 25% of image width, max 150px
    const logoHeight = logoWidth * 0.4; // Maintain aspect ratio
    const padding = 20;
    
    // Set the position (bottom-right corner with padding)
    const logoX = image.width - logoWidth - padding;
    const logoY = image.height - logoHeight - padding;
    
    // Draw a semi-transparent background for the logo
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(logoX, logoY, logoWidth, logoHeight);
    
    // Draw the VEDDAI text as a logo
    ctx.fillStyle = 'white';
    ctx.font = `bold ${logoHeight * 0.6}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VEDDAI', logoX + logoWidth / 2, logoY + logoHeight / 2);
    
    // Add a small tagline below the logo
    ctx.font = `${logoHeight * 0.25}px Arial`;
    ctx.fillText('AI-Powered Trading Analysis', logoX + logoWidth / 2, logoY + logoHeight * 0.75);
    
    // Ensure the shared directory exists
    const sharedDir = path.join('uploads', 'shared');
    if (!fs.existsSync(sharedDir)) {
      fs.mkdirSync(sharedDir, { recursive: true });
    }
    
    // Save the image to the shared directory
    const outputPath = path.join(sharedDir, outputFilename);
    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createJPEGStream({ quality: 0.95 });
    
    return new Promise((resolve, reject) => {
      stream.pipe(out);
      out.on('finish', () => resolve(outputPath));
      out.on('error', reject);
    });
  } catch (error) {
    console.error('Error adding watermark to image:', error);
    throw error;
  }
}

/**
 * Adds trade setup annotations (entry, stop loss, take profit, patterns) to a chart image
 * @param originalImagePath The path to the original chart image
 * @param analysis The analysis data containing trade setup information
 * @param outputFilename The filename to save the annotated image as
 * @returns The path to the annotated image
 */
export async function addTradeSetupAnnotations(
  originalImagePath: string, 
  analysis: ChartAnalysisResponse, 
  outputFilename: string
): Promise<string> {
  try {
    // Load the original image
    const image = await loadImage(originalImagePath);
    
    // Create a canvas with the same dimensions as the image
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // Draw the original image on the canvas
    ctx.drawImage(image, 0, 0, image.width, image.height);
    
    // Chart dimensions and price range estimation
    const chartArea = {
      left: image.width * 0.1,
      right: image.width * 0.85,
      top: image.height * 0.1,
      bottom: image.height * 0.85,
      width: image.width * 0.75,
      height: image.height * 0.75
    };

    // Helper function to convert price to Y coordinate (assuming prices increase upward)
    const priceToY = (price: string): number => {
      if (!price || price === "Unknown") return -1;
      
      // For demo purposes, we'll use a simple mapping
      // In real implementation, you'd need to analyze the chart to find actual price range
      const numPrice = parseFloat(price.replace(/[^0-9.-]/g, ''));
      if (isNaN(numPrice)) return -1;
      
      // Estimate price range from the analysis data
      const supportResistanceLevels = (analysis.supportResistance || []).map(sr => sr.level || "0");
      const prices = [
        analysis.currentPrice,
        analysis.entryPoint,
        analysis.stopLoss,
        analysis.takeProfit,
        ...supportResistanceLevels
      ].map(p => {
        const num = parseFloat(p.replace(/[^0-9.-]/g, ''));
        return isNaN(num) ? 0 : num;
      }).filter(p => p > 0);
      
      if (prices.length === 0) return chartArea.top + chartArea.height * 0.5;
      
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice || 1;
      
      // Map price to Y coordinate (invert because Y increases downward)
      const normalizedPrice = (numPrice - minPrice) / priceRange;
      return chartArea.bottom - (normalizedPrice * chartArea.height);
    };

    // Draw prominent trade direction indicator
    if (analysis.direction) {
      const isLong = analysis.direction.toUpperCase() === 'BUY';
      const arrowX = chartArea.left + 30;
      const arrowY = chartArea.top + 40;
      
      // Draw background box for better visibility
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(arrowX - 10, arrowY - 30, 120, 60);
      
      // Draw white outline
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.strokeRect(arrowX - 10, arrowY - 30, 120, 60);
      
      // Draw direction arrow with white outline
      ctx.beginPath();
      ctx.fillStyle = 'white';
      
      if (isLong) {
        // Draw up arrow (larger)
        ctx.moveTo(arrowX, arrowY + 15);
        ctx.lineTo(arrowX + 20, arrowY - 15);
        ctx.lineTo(arrowX + 40, arrowY + 15);
        ctx.lineTo(arrowX + 30, arrowY + 15);
        ctx.lineTo(arrowX + 30, arrowY + 35);
        ctx.lineTo(arrowX + 10, arrowY + 35);
        ctx.closePath();
      } else {
        // Draw down arrow (larger)
        ctx.moveTo(arrowX, arrowY - 15);
        ctx.lineTo(arrowX + 20, arrowY + 15);
        ctx.lineTo(arrowX + 40, arrowY - 15);
        ctx.lineTo(arrowX + 30, arrowY - 15);
        ctx.lineTo(arrowX + 30, arrowY - 35);
        ctx.lineTo(arrowX + 10, arrowY - 35);
        ctx.closePath();
      }
      ctx.fill();
      
      // Draw colored arrow
      ctx.beginPath();
      ctx.fillStyle = isLong ? '#00CC00' : '#FF0000';
      
      if (isLong) {
        // Draw up arrow (slightly smaller)
        ctx.moveTo(arrowX + 2, arrowY + 13);
        ctx.lineTo(arrowX + 20, arrowY - 13);
        ctx.lineTo(arrowX + 38, arrowY + 13);
        ctx.lineTo(arrowX + 28, arrowY + 13);
        ctx.lineTo(arrowX + 28, arrowY + 33);
        ctx.lineTo(arrowX + 12, arrowY + 33);
        ctx.closePath();
      } else {
        // Draw down arrow (slightly smaller)
        ctx.moveTo(arrowX + 2, arrowY - 13);
        ctx.lineTo(arrowX + 20, arrowY + 13);
        ctx.lineTo(arrowX + 38, arrowY - 13);
        ctx.lineTo(arrowX + 28, arrowY - 13);
        ctx.lineTo(arrowX + 28, arrowY - 33);
        ctx.lineTo(arrowX + 12, arrowY - 33);
        ctx.closePath();
      }
      ctx.fill();
      
      // Add direction label
      ctx.fillStyle = 'white';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(analysis.direction.toUpperCase(), arrowX + 50, arrowY + 5);
    }

    // Draw horizontal price levels with enhanced visibility
    const drawPriceLine = (price: string, color: string, label: string, style: string = 'solid') => {
      const y = priceToY(price);
      if (y === -1) return;
      
      // Draw a white background line for better visibility
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 6;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      
      // Draw the main colored line
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      
      if (style === 'dashed') {
        ctx.setLineDash([15, 8]);
      } else {
        ctx.setLineDash([]);
      }
      
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      
      // Add label with background box
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      const labelText = `${label}: ${price}`;
      const labelX = chartArea.right + 10;
      const labelY = y + 4;
      
      // Measure text to create background box
      ctx.font = 'bold 14px Arial';
      const textMetrics = ctx.measureText(labelText);
      const boxWidth = textMetrics.width + 8;
      const boxHeight = 20;
      
      // Draw background box
      ctx.fillRect(labelX - 4, labelY - 14, boxWidth, boxHeight);
      
      // Draw label text
      ctx.fillStyle = 'white';
      ctx.fillText(labelText, labelX, labelY);
    };

    // Draw entry point with enhanced visibility
    if (analysis.entryPoint && analysis.entryPoint !== "Unknown") {
      drawPriceLine(analysis.entryPoint, '#0066FF', 'ENTRY');
      
      // Add prominent entry point marker
      const entryY = priceToY(analysis.entryPoint);
      if (entryY !== -1) {
        // Draw white background circle
        ctx.beginPath();
        ctx.fillStyle = 'white';
        ctx.arc(chartArea.left - 20, entryY, 16, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw colored circle
        ctx.beginPath();
        ctx.fillStyle = '#0066FF';
        ctx.arc(chartArea.left - 20, entryY, 14, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('E', chartArea.left - 20, entryY + 4);
        ctx.textAlign = 'left';
      }
    }

    // Draw stop loss with enhanced visibility
    if (analysis.stopLoss && analysis.stopLoss !== "Unknown") {
      drawPriceLine(analysis.stopLoss, '#FF0000', 'STOP LOSS', 'dashed');
      
      // Add stop loss marker
      const slY = priceToY(analysis.stopLoss);
      if (slY !== -1) {
        // Draw white background square
        ctx.fillStyle = 'white';
        ctx.fillRect(chartArea.left - 28, slY - 12, 24, 24);
        
        // Draw red square
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(chartArea.left - 26, slY - 10, 20, 20);
        
        // Add text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('SL', chartArea.left - 16, slY + 4);
        ctx.textAlign = 'left';
      }
    }

    // Draw take profit with enhanced visibility
    if (analysis.takeProfit && analysis.takeProfit !== "Unknown") {
      drawPriceLine(analysis.takeProfit, '#00CC00', 'TAKE PROFIT', 'dashed');
      
      // Add take profit marker
      const tpY = priceToY(analysis.takeProfit);
      if (tpY !== -1) {
        // Draw white background diamond
        ctx.save();
        ctx.translate(chartArea.left - 20, tpY);
        ctx.rotate(Math.PI / 4);
        
        // White background
        ctx.fillStyle = 'white';
        ctx.fillRect(-12, -12, 24, 24);
        
        // Green diamond
        ctx.fillStyle = '#00CC00';
        ctx.fillRect(-10, -10, 20, 20);
        
        ctx.restore();
        
        // Add text
        ctx.fillStyle = 'white';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('TP', chartArea.left - 20, tpY + 3);
        ctx.textAlign = 'left';
      }
    }

    // Draw support and resistance levels
    (analysis.supportResistance || []).forEach((sr, index) => {
      if (sr && sr.level && sr.level !== "Unknown") {
        const srType = sr.type || 'support';
        const srStrength = sr.strength || 'medium';
        const isResistance = srType.toLowerCase().includes('resistance');
        const color = isResistance ? '#F59E0B' : '#8B5CF6';
        const alpha = srStrength.toLowerCase() === 'strong' ? 0.8 : 0.5;
        
        // Set global alpha for transparency
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        
        const y = priceToY(sr.level);
        if (y !== -1) {
          ctx.beginPath();
          ctx.moveTo(chartArea.left, y);
          ctx.lineTo(chartArea.right, y);
          ctx.stroke();
          
          // Add S/R label
          ctx.fillStyle = color;
          ctx.font = '10px Arial';
          ctx.fillText(`${srType.charAt(0)}${index + 1}`, chartArea.left - 25, y + 3);
        }
        
        // Reset alpha and line dash
        ctx.globalAlpha = 1.0;
        ctx.setLineDash([]);
      }
    });

    // Draw pattern annotations
    const patterns = analysis.patterns || [];
    if (patterns.length > 0 && patterns[0] && patterns[0].name) {
      ctx.fillStyle = 'rgba(139, 92, 246, 0.2)';
      ctx.strokeStyle = '#8B5CF6';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      
      // Draw a pattern highlight box (simplified)
      const patternBox = {
        x: chartArea.left + chartArea.width * 0.3,
        y: chartArea.top + chartArea.height * 0.2,
        width: chartArea.width * 0.4,
        height: chartArea.height * 0.3
      };
      
      ctx.fillRect(patternBox.x, patternBox.y, patternBox.width, patternBox.height);
      ctx.strokeRect(patternBox.x, patternBox.y, patternBox.width, patternBox.height);
      
      // Add pattern label
      ctx.fillStyle = '#8B5CF6';
      ctx.font = 'bold 12px Arial';
      const patternText = patterns[0].name || 'Pattern Detected';
      ctx.fillText(patternText, patternBox.x + 5, patternBox.y - 5);
    }

    // Add analysis summary box
    const summaryBox = {
      x: chartArea.left,
      y: chartArea.top - 80,
      width: chartArea.width * 0.4,
      height: 70
    };
    
    // Draw summary background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(summaryBox.x, summaryBox.y, summaryBox.width, summaryBox.height);
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.strokeRect(summaryBox.x, summaryBox.y, summaryBox.width, summaryBox.height);
    
    // Add summary text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`${analysis.symbol} - ${analysis.timeframe}`, summaryBox.x + 10, summaryBox.y + 20);
    
    ctx.font = '12px Arial';
    ctx.fillStyle = analysis.direction === 'BUY' ? '#10B981' : '#EF4444';
    ctx.fillText(`${analysis.direction} Signal`, summaryBox.x + 10, summaryBox.y + 35);
    
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText(`Confidence: ${analysis.confidence}`, summaryBox.x + 10, summaryBox.y + 50);
    
    // Add risk/reward ratio if available
    if (analysis.riskRewardRatio && analysis.riskRewardRatio !== "Unknown") {
      ctx.fillStyle = '#3B82F6';
      ctx.fillText(`R:R ${analysis.riskRewardRatio}`, summaryBox.x + 150, summaryBox.y + 35);
    }

    // Ensure the annotated directory exists
    const annotatedDir = path.join('uploads', 'annotated');
    if (!fs.existsSync(annotatedDir)) {
      fs.mkdirSync(annotatedDir, { recursive: true });
    }
    
    // Save the annotated image
    const outputPath = path.join(annotatedDir, outputFilename);
    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createJPEGStream({ quality: 0.95 });
    
    return new Promise((resolve, reject) => {
      stream.pipe(out);
      out.on('finish', () => resolve(outputPath));
      out.on('error', reject);
    });
  } catch (error) {
    console.error('Error adding trade setup annotations:', error);
    throw error;
  }
}

/**
 * Creates a shared image URL for a watermarked image
 * @param filename The filename of the watermarked image
 * @returns The URL to access the shared image
 */
export function createSharedImageUrl(filename: string): string {
  return `/api/shared-image/${filename}`;
}

/**
 * Creates an annotated image URL for a trade setup annotated image
 * @param filename The filename of the annotated image
 * @returns The URL to access the annotated image
 */
export function createAnnotatedImageUrl(filename: string): string {
  return `/api/annotated-image/${filename}`;
}