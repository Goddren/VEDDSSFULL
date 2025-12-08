import { createCanvas, loadImage, registerFont } from 'canvas';
import path from 'path';
import fs from 'fs';
import { getDailyScripture } from './scripture-helper';

interface ChartAnalysisSummary {
  timeframe: string;
  direction: string;
  confidence: string;
  patterns: string[];
  entryPoint: string;
  stopLoss: string;
  takeProfit: string;
  trend?: string;
  currentPrice?: string;
  riskRewardRatio?: string;
  potentialPips?: string;
  volatilityScore?: number;
  recommendation?: string;
  supportResistance?: { type: string; price: string; strength: string }[];
}

interface UnifiedSignal {
  direction: string;
  confidence: number;
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  riskReward: string;
}

interface ShareCardData {
  eaName: string;
  symbol: string;
  platformType: string;
  chartAnalyses: ChartAnalysisSummary[];
  unifiedSignal?: UnifiedSignal;
  creatorName: string;
}

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 2000;
const PADDING = 40;
const BRAND_COLOR = '#6366f1';
const BRAND_GRADIENT_START = '#4f46e5';
const BRAND_GRADIENT_END = '#7c3aed';
const TEXT_COLOR = '#ffffff';
const DARK_BG = '#0f172a';
const CARD_BG = '#1e293b';
const SUCCESS_COLOR = '#22c55e';
const DANGER_COLOR = '#ef4444';
const WARNING_COLOR = '#f59e0b';

export async function generateShareCard(data: ShareCardData): Promise<Buffer> {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, DARK_BG);
  gradient.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const headerGradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, 200);
  headerGradient.addColorStop(0, BRAND_GRADIENT_START);
  headerGradient.addColorStop(1, BRAND_GRADIENT_END);
  ctx.fillStyle = headerGradient;
  ctx.fillRect(0, 0, CARD_WIDTH, 180);

  try {
    const logoPath = path.join(process.cwd(), 'attached_assets', 'IMG_3645.png');
    if (fs.existsSync(logoPath)) {
      const logo = await loadImage(logoPath);
      const logoHeight = 80;
      const logoWidth = (logo.width / logo.height) * logoHeight;
      ctx.drawImage(logo, PADDING, 50, logoWidth, logoHeight);
    } else {
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = 'bold 48px Arial, sans-serif';
      ctx.fillText('VEDD AI', PADDING, 100);
    }
  } catch (error) {
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.fillText('VEDD AI', PADDING, 100);
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '18px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('AI-Powered Trading Analysis', CARD_WIDTH - PADDING, 90);
  ctx.fillText('www.vedd.ai', CARD_WIDTH - PADDING, 115);
  ctx.textAlign = 'left';

  let yPos = 220;

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.fillText(data.eaName, PADDING, yPos);
  yPos += 45;

  ctx.fillStyle = '#94a3b8';
  ctx.font = '24px Arial, sans-serif';
  ctx.fillText(`${data.symbol} | ${data.platformType} | by ${data.creatorName}`, PADDING, yPos);
  yPos += 60;

  if (data.unifiedSignal) {
    ctx.fillStyle = CARD_BG;
    roundRect(ctx, PADDING, yPos, CARD_WIDTH - PADDING * 2, 180, 16);
    ctx.fill();

    const signal = data.unifiedSignal;
    const directionColor = signal.direction.toUpperCase() === 'BUY' ? SUCCESS_COLOR : 
                          signal.direction.toUpperCase() === 'SELL' ? DANGER_COLOR : WARNING_COLOR;
    
    ctx.fillStyle = directionColor;
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.fillText(signal.direction.toUpperCase(), PADDING + 20, yPos + 55);

    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.fillText(`${signal.confidence}% Confidence`, PADDING + 200, yPos + 55);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px Arial, sans-serif';
    ctx.fillText(`Entry: ${signal.entryPrice}  |  SL: ${signal.stopLoss}  |  TP: ${signal.takeProfit}`, PADDING + 20, yPos + 100);
    ctx.fillText(`Risk/Reward: ${signal.riskReward}`, PADDING + 20, yPos + 135);

    yPos += 210;
  }

  const firstAnalysis = data.chartAnalyses[0];
  if (firstAnalysis) {
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText('Market Overview', PADDING, yPos);
    yPos += 35;

    ctx.fillStyle = CARD_BG;
    roundRect(ctx, PADDING, yPos, CARD_WIDTH - PADDING * 2, 100, 12);
    ctx.fill();

    const overviewItems = [
      { label: 'Price', value: firstAnalysis.currentPrice || 'N/A' },
      { label: 'Trend', value: firstAnalysis.trend || 'N/A' },
      { label: 'R:R', value: firstAnalysis.riskRewardRatio || 'N/A' },
      { label: 'Pips', value: firstAnalysis.potentialPips || 'N/A' }
    ];

    const itemWidth = (CARD_WIDTH - PADDING * 2) / 4;
    overviewItems.forEach((item, i) => {
      const x = PADDING + i * itemWidth + itemWidth / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Arial, sans-serif';
      ctx.fillText(item.label, x, yPos + 35);
      ctx.fillStyle = TEXT_COLOR;
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.fillText(item.value, x, yPos + 65);
    });
    ctx.textAlign = 'left';

    yPos += 130;

    if (firstAnalysis.volatilityScore !== undefined) {
      ctx.fillStyle = CARD_BG;
      roundRect(ctx, PADDING, yPos, CARD_WIDTH - PADDING * 2, 60, 12);
      ctx.fill();

      ctx.fillStyle = '#64748b';
      ctx.font = '14px Arial, sans-serif';
      ctx.fillText('Volatility Score', PADDING + 20, yPos + 25);

      const volScore = firstAnalysis.volatilityScore;
      const volColor = volScore > 70 ? DANGER_COLOR : volScore > 40 ? WARNING_COLOR : SUCCESS_COLOR;
      const barWidth = (CARD_WIDTH - PADDING * 2 - 200) * (volScore / 100);
      
      ctx.fillStyle = '#334155';
      roundRect(ctx, PADDING + 150, yPos + 15, CARD_WIDTH - PADDING * 2 - 200, 30, 6);
      ctx.fill();
      
      ctx.fillStyle = volColor;
      roundRect(ctx, PADDING + 150, yPos + 15, barWidth, 30, 6);
      ctx.fill();

      ctx.fillStyle = TEXT_COLOR;
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText(`${volScore}%`, CARD_WIDTH - PADDING - 40, yPos + 38);

      yPos += 80;
    }
  }

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'bold 28px Arial, sans-serif';
  ctx.fillText('Multi-Timeframe Analysis', PADDING, yPos);
  yPos += 40;

  const analysisCardWidth = (CARD_WIDTH - PADDING * 2 - 20) / 2;
  const analysisCardHeight = 180;
  
  for (let i = 0; i < data.chartAnalyses.length && i < 6; i++) {
    const analysis = data.chartAnalyses[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = PADDING + col * (analysisCardWidth + 20);
    const y = yPos + row * (analysisCardHeight + 15);

    ctx.fillStyle = CARD_BG;
    roundRect(ctx, x, y, analysisCardWidth, analysisCardHeight, 12);
    ctx.fill();

    ctx.fillStyle = BRAND_COLOR;
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.fillText(analysis.timeframe, x + 15, y + 35);

    const dirColor = analysis.direction.toUpperCase() === 'BUY' ? '#22c55e' : 
                    analysis.direction.toUpperCase() === 'SELL' ? '#ef4444' : '#f59e0b';
    ctx.fillStyle = dirColor;
    ctx.font = 'bold 20px Arial, sans-serif';
    ctx.fillText(analysis.direction.toUpperCase(), x + analysisCardWidth - 80, y + 35);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px Arial, sans-serif';
    ctx.fillText(`Confidence: ${analysis.confidence}`, x + 15, y + 65);

    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '14px Arial, sans-serif';
    const patterns = analysis.patterns.slice(0, 2).join(', ');
    ctx.fillText(`Patterns: ${patterns || 'N/A'}`, x + 15, y + 95);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText(`Entry: ${analysis.entryPoint}`, x + 15, y + 125);
    ctx.fillText(`SL: ${analysis.stopLoss}`, x + 15, y + 145);
    ctx.fillText(`TP: ${analysis.takeProfit}`, x + 15, y + 165);
  }

  const numRows = Math.ceil(Math.min(data.chartAnalyses.length, 6) / 2);
  yPos += numRows * (analysisCardHeight + 15) + 30;

  if (firstAnalysis?.recommendation) {
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText('AI Recommendation', PADDING, yPos);
    yPos += 35;

    ctx.fillStyle = 'rgba(34, 197, 94, 0.1)';
    roundRect(ctx, PADDING, yPos, CARD_WIDTH - PADDING * 2, 80, 12);
    ctx.fill();
    
    ctx.strokeStyle = SUCCESS_COLOR;
    ctx.lineWidth = 1;
    roundRect(ctx, PADDING, yPos, CARD_WIDTH - PADDING * 2, 80, 12);
    ctx.stroke();

    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '16px Arial, sans-serif';
    const recLines = wrapText(ctx, firstAnalysis.recommendation, CARD_WIDTH - PADDING * 2 - 40);
    recLines.slice(0, 3).forEach((line, i) => {
      ctx.fillText(line, PADDING + 20, yPos + 30 + i * 22);
    });

    yPos += 110;
  }

  if (firstAnalysis?.supportResistance && firstAnalysis.supportResistance.length > 0) {
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText('Key Price Levels', PADDING, yPos);
    yPos += 35;

    const levels = firstAnalysis.supportResistance.slice(0, 4);
    const levelWidth = (CARD_WIDTH - PADDING * 2 - (levels.length - 1) * 15) / levels.length;

    levels.forEach((level, i) => {
      const x = PADDING + i * (levelWidth + 15);
      const isSupport = level.type.toLowerCase() === 'support';
      
      ctx.fillStyle = CARD_BG;
      roundRect(ctx, x, yPos, levelWidth, 70, 10);
      ctx.fill();

      ctx.fillStyle = isSupport ? SUCCESS_COLOR : DANGER_COLOR;
      ctx.font = 'bold 14px Arial, sans-serif';
      ctx.fillText(level.type.toUpperCase(), x + 10, yPos + 25);

      ctx.fillStyle = TEXT_COLOR;
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText(level.price, x + 10, yPos + 50);

      ctx.fillStyle = '#64748b';
      ctx.font = '12px Arial, sans-serif';
      ctx.fillText(level.strength, x + levelWidth - 50, yPos + 50);
    });

    yPos += 100;
  }

  const devotion = getDailyScripture();
  
  ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
  roundRect(ctx, PADDING, yPos, CARD_WIDTH - PADDING * 2, 200, 16);
  ctx.fill();

  ctx.strokeStyle = BRAND_COLOR;
  ctx.lineWidth = 2;
  roundRect(ctx, PADDING, yPos, CARD_WIDTH - PADDING * 2, 200, 16);
  ctx.stroke();

  ctx.fillStyle = BRAND_COLOR;
  ctx.font = 'bold 20px Arial, sans-serif';
  ctx.fillText('Daily Trading Wisdom', PADDING + 20, yPos + 35);

  ctx.fillStyle = TEXT_COLOR;
  ctx.font = 'italic 18px Arial, sans-serif';
  const verseLines = wrapText(ctx, `"${devotion.verse}"`, CARD_WIDTH - PADDING * 2 - 40);
  let verseY = yPos + 70;
  for (const line of verseLines.slice(0, 3)) {
    ctx.fillText(line, PADDING + 20, verseY);
    verseY += 24;
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px Arial, sans-serif';
  ctx.fillText(`- ${devotion.reference}`, PADDING + 20, verseY + 10);

  ctx.fillStyle = '#64748b';
  ctx.font = '14px Arial, sans-serif';
  const wisdomLines = wrapText(ctx, devotion.tradingWisdom, CARD_WIDTH - PADDING * 2 - 40);
  ctx.fillText(wisdomLines[0] || '', PADDING + 20, verseY + 40);

  ctx.fillStyle = '#475569';
  ctx.font = '14px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Generated by VEDD AI - Your AI Trading Assistant', CARD_WIDTH / 2, CARD_HEIGHT - 20);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

function roundRect(ctx: any, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapText(ctx: any, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}
