import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { User, userApiKeys } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { z } from "zod";

const scryptAsync = promisify(scrypt);

async function hashPasswordForWallet(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}
import { analyzeChartImage, testOpenAIApiKey, generateTradingTip, generateMarketTrendPredictions, generatePresentationOutline } from "./openai";
import { setupTwilio, sendTradingSignal } from "./twilio";
import { checkUserAchievements } from "./achievement-tracker";
import { generateMT5EACode, generateTradingViewCode, generateTradeLockerCode } from './ea-generators';
import { tradingCoachHandler, tradingTipsHandler } from "./trading-coach";
import { marketInsightsHandler, contextualInsightHandler } from "./market-insights";
import { 
  getSubscriptionPlans,
  getUserSubscription,
  createSubscription,
  cancelSubscription,
  checkUserSubscriptionLimits
} from "./stripe";
import multer from "multer";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { 
  insertChartAnalysisSchema, 
  insertAchievementSchema, 
  insertUserAchievementSchema,
  insertUserProfileSchema,
  insertFollowSchema,
  insertAnalysisFeedbackSchema,
  insertWebhookConfigSchema
} from "@shared/schema";
import { addTradeSetupAnnotations, createAnnotatedImageUrl } from "./image-processor";
import { newsService, type NewsItem, type NewsSentiment } from "./news-service";
import { extractFramesFromVideo, cleanupFrames } from "./video-processor";
import { getGoldSentiment, getMockGoldSentiment, isTelegramConfigured } from "./telegram-sentiment";
import { encryptPassword, executeMT5SignalOnTradeLocker, TradeLockerService, decryptPassword } from "./tradelocker";
import veddTokenRouter from "./routes/vedd-token";
import { veddTokenService } from "./services/vedd-token-service";
import { streamingService } from "./streaming";
import { scanAndAnalyzeTokens, searchSolanaToken, analyzeToken, fetchTrendingSolanaTokens, fetchMultiDexTokens, type DexSource } from "./solana-scanner";

// Configure multer for file uploads (images)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, JPG and PNG image files are allowed'));
    }
    cb(null, true);
  }
});

// Configure multer for video uploads
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for videos
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only MP4, MOV, WebM and AVI video files are allowed'));
    }
    cb(null, true);
  }
});

// Configure multer for combined media uploads (images + videos)
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, GIF images and MP4, MOV, WebM videos are allowed'));
    }
    cb(null, true);
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Helper function to get affected currency pairs for a given currency
function getAffectedPairs(currency: string): string[] {
  const pairMap: Record<string, string[]> = {
    'USD': ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD'],
    'EUR': ['EUR/USD', 'EUR/GBP', 'EUR/JPY', 'EUR/CHF', 'EUR/AUD'],
    'GBP': ['GBP/USD', 'EUR/GBP', 'GBP/JPY', 'GBP/CHF'],
    'JPY': ['USD/JPY', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY'],
    'CHF': ['USD/CHF', 'EUR/CHF', 'GBP/CHF'],
    'AUD': ['AUD/USD', 'EUR/AUD', 'AUD/JPY', 'AUD/NZD'],
    'CAD': ['USD/CAD', 'CAD/JPY', 'EUR/CAD'],
    'NZD': ['NZD/USD', 'AUD/NZD', 'NZD/JPY']
  };
  return pairMap[currency.toUpperCase()] || [`${currency}/USD`];
}

// Helper function to trigger webhooks for a user
async function triggerWebhooks(userId: number, triggerType: string, signal: any): Promise<void> {
  try {
    const webhooks = await storage.getActiveWebhooksByTrigger(userId, triggerType);
    
    if (webhooks.length === 0) {
      return;
    }
    
    await Promise.all(webhooks.map(async (webhook) => {
      const payload = {
        type: triggerType,
        source: 'VEDD AI',
        timestamp: new Date().toISOString(),
        signal
      };
      
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        if (webhook.headers) {
          Object.assign(headers, webhook.headers);
        }
        
        if (webhook.secretKey) {
          headers['X-Webhook-Secret'] = webhook.secretKey;
        }
        
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        
        const responseText = await response.text();
        
        await storage.logWebhookCall({
          webhookId: webhook.id,
          userId,
          triggerType,
          payload,
          responseStatus: response.status,
          responseBody: responseText.substring(0, 1000),
          status: response.ok ? 'success' : 'failed',
          errorMessage: response.ok ? null : `HTTP ${response.status}`
        });
        
        await storage.updateWebhook(webhook.id, {
          lastTriggeredAt: new Date(),
          lastStatus: response.ok ? 'success' : 'failed',
          failureCount: response.ok ? 0 : (webhook.failureCount + 1)
        });
      } catch (err) {
        await storage.logWebhookCall({
          webhookId: webhook.id,
          userId,
          triggerType,
          payload,
          responseStatus: null,
          responseBody: null,
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Connection failed'
        });
        
        await storage.updateWebhook(webhook.id, {
          lastTriggeredAt: new Date(),
          lastStatus: 'failed',
          failureCount: webhook.failureCount + 1
        });
      }
    }));
  } catch (error) {
    console.error('triggerWebhooks error:', error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Twilio if credentials are available
  setupTwilio();
  
  // Initialize news service
  newsService.initialize(process.env.FINNHUB_API_KEY, process.env.OPENAI_API_KEY);
  
  // Register VEDD token routes
  app.use('/api/vedd', veddTokenRouter);

  // Health check endpoint for keeping the app awake and verifying connectivity
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      message: "VEDD AI is running"
    });
  });

  // Sample charts endpoint
  app.get("/api/sample-charts", (_req: Request, res: Response) => {
    // Return sample chart IDs - in production these would be real files
    res.json({
      sampleCharts: [
        { id: "sample1", name: "EUR/USD 4H" },
        { id: "sample2", name: "BTC/USD Daily" },
        { id: "sample3", name: "GBP/JPY 1H" },
      ],
    });
  });

  // Image upload endpoint
  app.post("/api/upload", upload.single('chart'), async (req: Request, res: Response) => {
    try {
      console.log('Upload endpoint called');
      console.log('Request body fields:', req.body);
      console.log('Request file:', req.file ? 'File present' : 'No file');
      
      if (req.file) {
        console.log('File details:', {
          fieldname: req.file.fieldname,
          mimetype: req.file.mimetype,
          size: req.file.size
        });
      }
      
      // Check if user is authenticated
      console.log('User authenticated:', req.isAuthenticated());
      if (!req.isAuthenticated()) {
        console.log('Authentication required, returning 401');
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      if (!req.file) {
        console.log('No file in request, returning 400');
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Generate a unique filename
      const fileName = `${uuidv4()}.${req.file.mimetype.split('/')[1]}`;
      const filePath = path.join(uploadsDir, fileName);
      console.log('Generated filename:', fileName);
      console.log('Full file path:', filePath);

      // Save file to disk
      try {
        await fs.promises.writeFile(filePath, req.file.buffer);
        console.log('File saved successfully to disk');
      } catch (writeError) {
        console.error('Error writing file to disk:', writeError);
        return res.status(500).json({ message: "Error saving file to disk" });
      }

      // Return the file path for further processing
      const url = `/uploads/${fileName}`;
      console.log('Returning success with URL:', url);
      res.json({ url });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Error uploading file" });
    }
  });

  // Avatar upload endpoint
  app.post("/api/upload-avatar", upload.single('avatar'), async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed." });
      }

      // Create avatars directory if it doesn't exist
      const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
      if (!fs.existsSync(avatarsDir)) {
        fs.mkdirSync(avatarsDir, { recursive: true });
      }

      // Generate unique filename
      const ext = req.file.mimetype.split('/')[1];
      const fileName = `avatar-${(req.user as any).id}-${Date.now()}.${ext}`;
      const filePath = path.join(avatarsDir, fileName);

      // Save file to disk
      await fs.promises.writeFile(filePath, req.file.buffer);

      // Return the avatar URL
      const avatarUrl = `/uploads/avatars/${fileName}`;
      res.json({ avatarUrl });
    } catch (error) {
      console.error("Avatar upload error:", error);
      res.status(500).json({ message: "Error uploading avatar" });
    }
  });

  // Direct base64 image analysis endpoint (skips file upload)
  app.post("/api/analyze-base64", async (req: Request, res: Response) => {
    try {
      console.log('Base64 analysis endpoint called');
      
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const { base64Image, filename, multiTimeframeGroupId } = req.body;
      
      if (!base64Image) {
        return res.status(400).json({ message: "No base64 image data provided" });
      }

      // Validate and sanitize base64 input
      let cleanBase64 = base64Image;
      
      // Strip data URI prefix if present (e.g., "data:image/png;base64,")
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }
      
      // Validate base64 string length (limit to ~10MB when decoded)
      const maxBase64Length = 13 * 1024 * 1024; // ~10MB when decoded (base64 is ~33% larger)
      if (cleanBase64.length > maxBase64Length) {
        return res.status(413).json({ 
          message: "Image too large", 
          error: "Maximum image size is 10MB" 
        });
      }
      
      // Validate base64 format
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(cleanBase64)) {
        return res.status(400).json({ 
          message: "Invalid image data", 
          error: "Base64 format is invalid" 
        });
      }
      
      console.log('Received base64 image data, calling OpenAI');

      // Call OpenAI for analysis with optional known symbol for enhanced Gold/BTC analysis
      const knownSymbol = req.body.symbol || undefined;
      const analysis = await analyzeChartImage(cleanBase64, knownSymbol, req.user?.id);
      console.log('Analysis completed successfully');
      
      // Fetch news sentiment for the detected symbol and adjust confidence
      let newsImpact: { sentiment: string; adjustment: number; headlines: string[] } | null = null;
      try {
        if (analysis.symbol && analysis.symbol !== 'Unknown') {
          const symbolNews = await newsService.fetchCompanyNews(analysis.symbol, 2);
          if (symbolNews.length > 0) {
            const sentiment = await newsService.analyzeNewsSentiment(symbolNews, analysis.symbol);
            
            // Determine if news aligns with the signal direction
            // Explicitly check for bullish AND bearish signals - don't assume non-bullish = bearish
            const dirUpper = (analysis.direction || '').toUpperCase();
            const trendLower = (analysis.trend || '').toLowerCase();
            const signalIsBullish = dirUpper.includes('BUY') || dirUpper.includes('LONG') || 
                                    trendLower.includes('bullish');
            const signalIsBearish = dirUpper.includes('SELL') || dirUpper.includes('SHORT') || 
                                    trendLower.includes('bearish');
            const newsIsBullish = sentiment.overallScore > 20;
            const newsIsBearish = sentiment.overallScore < -20;
            
            // Only apply adjustments if we have a clear directional signal
            // Skip adjustments for neutral/unknown signals
            let newsAligns = false;
            let newsConflicts = false;
            
            if (signalIsBullish) {
              newsAligns = newsIsBullish;
              newsConflicts = newsIsBearish;
            } else if (signalIsBearish) {
              newsAligns = newsIsBearish;
              newsConflicts = newsIsBullish;
            }
            // If neither bullish nor bearish (neutral/unknown), newsAligns and newsConflicts stay false
            
            // Calculate confidence adjustment
            let adjustment = 0;
            if (newsAligns) {
              adjustment = Math.abs(sentiment.overallScore) > 50 ? 10 : 5; // +5% or +10%
            } else if (newsConflicts) {
              adjustment = Math.abs(sentiment.overallScore) > 50 ? -10 : -5; // -5% or -10%
            }
            
            // Apply adjustment to confidence level
            if (adjustment !== 0) {
              const confidenceMap: Record<string, number> = { 'Low': 45, 'Medium': 65, 'High': 85 };
              const currentConfidence = confidenceMap[analysis.confidence || 'Medium'] || 65;
              const newConfidence = Math.max(30, Math.min(95, currentConfidence + adjustment));
              
              // Update confidence level based on new score
              if (newConfidence >= 75) {
                analysis.confidence = 'High';
              } else if (newConfidence >= 55) {
                analysis.confidence = 'Medium';
              } else {
                analysis.confidence = 'Low';
              }
            }
            
            newsImpact = {
              sentiment: sentiment.overallLabel || 'Neutral',
              adjustment,
              headlines: symbolNews.slice(0, 3).map(n => n.headline)
            };
            
            console.log(`News analysis for ${analysis.symbol}: ${sentiment.overallLabel}, adjustment: ${adjustment}%`);
          }
        }
      } catch (newsError) {
        console.log('News fetch skipped (service unavailable or symbol not supported)');
      }
      
      // Create a filename for storage
      const extension = filename?.split('.').pop() || 'png';
      const generatedFilename = `${uuidv4()}.${extension}`;
      const filePath = path.join(uploadsDir, generatedFilename);
      const imageUrl = `/uploads/${generatedFilename}`;
      
      // Save the image to disk (decode base64 to binary)
      try {
        const imageBuffer = Buffer.from(cleanBase64, 'base64');
        await fs.promises.writeFile(filePath, imageBuffer);
        console.log('Saved image to', filePath);
      } catch (writeError) {
        console.error('Error saving image to disk:', writeError);
        // Continue even if save fails
      }
      
      // Store analysis in database with the new file path
      try {
        const userId = (req.user as Express.User).id;
        await storage.createChartAnalysis({
          userId,
          imageUrl: imageUrl,
          symbol: analysis.symbol || "Unknown",
          timeframe: analysis.timeframe || "Unknown",
          price: analysis.currentPrice || "Unknown",
          direction: analysis.direction || "Unknown",
          trend: analysis.trend || "Unknown",
          confidence: analysis.confidence || "Medium",
          entryPoint: analysis.entryPoint || "Unknown",
          exitPoint: analysis.exitPoint || "Unknown",
          stopLoss: analysis.stopLoss || "Unknown",
          takeProfit: analysis.takeProfit || "Unknown",
          riskRewardRatio: analysis.riskRewardRatio || "Unknown",
          potentialPips: analysis.potentialPips || "Unknown",
          patterns: Array.isArray(analysis.patterns) ? analysis.patterns : [],
          indicators: Array.isArray(analysis.indicators) ? analysis.indicators : [],
          supportResistance: Array.isArray(analysis.supportResistance) ? analysis.supportResistance : [],
          recommendation: analysis.recommendation || "No recommendation available",
          multiTimeframeGroupId: multiTimeframeGroupId || null
        });
        // Track activity for streak
        try {
          await storage.recordActivity(userId, 'chart');
        } catch (streakError) {
          console.error('Error recording streak activity:', streakError);
        }
        
        // Trigger webhooks for analysis signals (non-blocking)
        triggerWebhooks(userId, 'analysis', {
          symbol: analysis.symbol || 'Unknown',
          timeframe: analysis.timeframe,
          direction: analysis.direction,
          confidence: analysis.confidence,
          entryPrice: analysis.entryPoint,
          stopLoss: analysis.stopLoss,
          takeProfit: analysis.takeProfit,
          trend: analysis.trend,
          patterns: analysis.patterns?.map((p: any) => p.name).join(', ') || 'None'
        }).catch(err => console.error('Webhook trigger error:', err));
      } catch (dbError) {
        console.error('Error storing analysis in database:', dbError);
        // Continue even if database storage fails
      }

      // Generate annotated chart with trade setup
      let annotatedImageUrl = '';
      try {
        console.log('Generating trade setup annotations for image');
        const annotatedFilename = `annotated_${generatedFilename}`;
        const annotatedPath = await addTradeSetupAnnotations(filePath, analysis, annotatedFilename);
        annotatedImageUrl = createAnnotatedImageUrl(annotatedFilename);
        console.log('Annotated image generated successfully:', annotatedPath);
      } catch (annotationError) {
        console.error('Error generating trade setup annotations:', annotationError);
        // Continue without annotated image if annotation fails
      }

      // Return the analysis result with both original and annotated image URLs
      res.json({
        ...analysis,
        imageUrl,
        annotatedImageUrl: annotatedImageUrl || undefined,
        newsImpact: newsImpact || undefined
      });
    } catch (error: any) {
      console.error("Analysis error:", error);
      
      // Handle specific OpenAI errors
      if (error && error.code === 'billing_not_active' || 
          (error && error.error && error.error.code === 'billing_not_active')) {
        return res.status(403).json({ 
          message: "OpenAI API key billing issue", 
          error: "Your OpenAI account is not active. Please check your billing details on the OpenAI website.",
          code: "BILLING_INACTIVE"
        });
      }
      
      res.status(500).json({ 
        message: "Error analyzing chart", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Video upload and analysis endpoint - extracts frames for multi-timeframe analysis
  app.post("/api/analyze-video", videoUpload.single('video'), async (req: Request, res: Response) => {
    try {
      console.log('Video analysis endpoint called');
      
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No video file uploaded" });
      }

      const userId = (req.user as any).id;
      const numFrames = parseInt(req.body.numFrames) || 4;
      const analysisType = req.body.analysisType || 'multi'; // 'single' or 'multi'
      
      console.log(`Processing video: ${req.file.originalname}, extracting ${numFrames} frames`);

      // Check subscription limits
      const limitCheck = await checkUserSubscriptionLimits(userId, 'analysis');
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: "Analysis limit reached",
          error: `You have reached your monthly limit of ${limitCheck.limit} analyses. Please upgrade your subscription.`,
          currentCount: limitCheck.currentCount,
          limit: limitCheck.limit,
          planName: limitCheck.planName
        });
      }

      // Extract frames from video
      const frames = await extractFramesFromVideo(req.file.buffer, numFrames, req.file.mimetype);
      
      if (frames.length === 0) {
        return res.status(400).json({ message: "Could not extract frames from video" });
      }

      console.log(`Extracted ${frames.length} frames, analyzing...`);

      // Analyze each frame
      const analyses = [];
      const groupId = uuidv4();
      
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        try {
          // Pass symbol if detected from previous frame for enhanced Gold/BTC analysis
          const detectedSymbol = analyses.length > 0 ? analyses[analyses.length - 1].symbol : undefined;
          const analysis = await analyzeChartImage(frame.base64, detectedSymbol, req.user?.id);
          
          // Save frame to uploads
          const frameFileName = `video_frame_${groupId}_${i + 1}.jpg`;
          const framePath = path.join(uploadsDir, frameFileName);
          const frameBuffer = Buffer.from(frame.base64, 'base64');
          await fs.promises.writeFile(framePath, frameBuffer);
          
          const imageUrl = `/uploads/${frameFileName}`;
          
          // Store in database
          await storage.createChartAnalysis({
            userId,
            imageUrl,
            symbol: analysis.symbol || "Unknown",
            timeframe: analysis.timeframe || `Frame ${i + 1}`,
            price: analysis.currentPrice || "Unknown",
            direction: analysis.direction || "Unknown",
            trend: analysis.trend || "Unknown",
            confidence: analysis.confidence || "Medium",
            entryPoint: analysis.entryPoint || "Unknown",
            exitPoint: analysis.exitPoint || "Unknown",
            stopLoss: analysis.stopLoss || "Unknown",
            takeProfit: analysis.takeProfit || "Unknown",
            riskRewardRatio: analysis.riskRewardRatio || "Unknown",
            potentialPips: analysis.potentialPips || "Unknown",
            patterns: analysis.patterns || [],
            indicators: analysis.indicators || [],
            supportResistance: analysis.supportResistance || [],
            recommendation: analysis.recommendation || "",
            notes: `Extracted from video at ${frame.timestamp.toFixed(1)}s`,
            multiTimeframeGroupId: analysisType === 'multi' ? groupId : undefined,
          });

          analyses.push({
            ...analysis,
            imageUrl,
            frameIndex: i + 1,
            timestamp: frame.timestamp
          });
        } catch (frameError) {
          console.error(`Error analyzing frame ${i + 1}:`, frameError);
        }
      }

      // Cleanup extracted frames
      await cleanupFrames(frames);

      res.json({
        success: true,
        groupId: analysisType === 'multi' ? groupId : undefined,
        framesAnalyzed: analyses.length,
        analyses
      });

    } catch (error: any) {
      console.error("Video analysis error:", error);
      res.status(500).json({ 
        message: "Error analyzing video", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Auto-detect timeframe from multiple uploaded images
  app.post("/api/auto-detect-charts", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { images } = req.body;
      if (!Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: "At least 1 image required" });
      }

      // Analyze each image to detect its timeframe
      const results = await Promise.all(
        images.map(async (base64Image: string, index: number) => {
          try {
            // Use vision API to detect timeframe
            const prompt = `Analyze this trading chart image and detect ONLY the timeframe. 
Look for timeframe indicators (M1, M5, M15, M30, H1, H4, D1, W1) in the chart UI.
Return ONLY a JSON object with:
{
  "detectedTimeframe": "M5" or similar,
  "confidence": "high|medium|low",
  "reasoning": "brief explanation of how you detected it"
}`;

            const OpenAI = (await import("openai")).default;
            const client = new OpenAI({
              apiKey: process.env.OPENAI_API_KEY,
            });

            const response = await client.chat.completions.create({
              model: "gpt-4o-mini",
              max_tokens: 256,
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:image/png;base64,${base64Image}`,
                      },
                    },
                    {
                      type: "text",
                      text: prompt,
                    },
                  ],
                },
              ],
            });

            const responseText = response.choices[0].message.content || "";
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              throw new Error("Failed to parse timeframe detection");
            }

            const detection = JSON.parse(jsonMatch[0]);
            return {
              index,
              base64Image,
              ...detection,
            };
          } catch (error) {
            return {
              index,
              base64Image,
              detectedTimeframe: null,
              confidence: "low",
              error: error instanceof Error ? error.message : "Detection failed",
            };
          }
        })
      );

      res.json({ results });
    } catch (error: any) {
      console.error("Auto-detect error:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to auto-detect charts",
      });
    }
  });

  // Synthesize unified trade signal from multiple chart analyses
  app.post("/api/synthesize-trade-signal", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { analyses } = req.body;
      if (!Array.isArray(analyses) || analyses.length < 2) {
        return res.status(400).json({ error: "At least 2 chart analyses required" });
      }

      // Create synthesis prompt for OpenAI
      const analysesText = analyses.map((a: any, i: number) => `
Timeframe ${i + 1} (${a.timeframe}):
- Direction: ${a.direction}
- Confidence: ${a.confidence}
- Trend: ${a.trend}
- Entry: ${a.entryPoint}
- Exit: ${a.exitPoint}
- Stop Loss: ${a.stopLoss}
- Take Profit: ${a.takeProfit}
- Patterns: ${a.patterns?.map((p: any) => p.name).join(', ') || 'None'}
- RSI: ${a.momentumIndicators?.rsi?.value || 'N/A'}
- MACD: ${a.momentumIndicators?.macd?.signal || 'N/A'}
`).join('\n');

      const prompt = `You are a professional forex trader synthesizing multiple timeframe analyses into ONE unified trading signal.

MULTI-TIMEFRAME ANALYSES:
${analysesText}

SYNTHESIZE these into a single unified recommendation with:
1. Consensus Direction (BUY/SELL/NEUTRAL)
2. Overall Confidence (Low/Medium/High)
3. Best Entry Point (synthesis of all)
4. Unified Stop Loss
5. Unified Take Profit
6. Reasoning (why these timeframes align or conflict)
7. Risk/Reward assessment
8. BEST TIMEFRAME FOR EA ENTRY: Which single timeframe should the EA be attached to for the best entry signal? Return just the timeframe (e.g., "H1", "D1", "M5")
9. Preferred Volume Threshold: Recommend the ideal volume level as a percentage (e.g., "150% above average" or "2x volume")
10. BIDIRECTIONAL TRADING: If BUY and SELL signals are equally strong/valid (within 1 confidence level), set allowBidirectionalTrading to true and list both directions. Otherwise false.
11. PENDING BREAKOUT ORDERS:
    - For BUY breakout: Calculate a resistance level that price must break above to trigger entry (typically highest resistance + 0.1-0.5% margin)
    - For SELL breakout: Calculate a support level that price must break below to trigger entry (typically lowest support - 0.1-0.5% margin)
    - These are conditional pending orders that activate when price breaks through

Respond ONLY in valid JSON format with these exact keys:
{
  "direction": "BUY|SELL|NEUTRAL",
  "confidence": "Low|Medium|High",
  "entryPoint": "string",
  "stopLoss": "string",
  "takeProfit": "string",
  "reasoning": "string explaining the synthesis",
  "riskRewardRatio": "string like 1:2",
  "strength": "number 1-10",
  "convergence": "string explaining timeframe alignment",
  "bestChartTimeframe": "string - the recommended timeframe for EA entry",
  "preferredVolumeThreshold": "string describing ideal volume level for this trade",
  "allowBidirectionalTrading": "boolean - true if both BUY and SELL are equally valid",
  "alternateDirection": "BUY|SELL|null - the opposite valid direction if bidirectional trading is allowed",
  "pendingBuyBreakout": "string - price level where a pending BUY order triggers on breakout above this level",
  "pendingBuyStopLoss": "string - stop loss for pending buy breakout order",
  "pendingBuyTakeProfit": "string - take profit for pending buy breakout order",
  "pendingSellBreakout": "string - price level where a pending SELL order triggers on breakout below this level",
  "pendingSellStopLoss": "string - stop loss for pending sell breakout order",
  "pendingSellTakeProfit": "string - take profit for pending sell breakout order",
  "breakoutReasoning": "string explaining the breakout levels and why they're good entry points"
}`;

      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      });

      // Extract text content
      const responseText = response.choices[0].message.content || "";

      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("Failed to parse AI response as JSON");
      }

      const synthesis = JSON.parse(jsonMatch[0]);
      
      // Set defaults for bidirectional trading
      if (!synthesis.allowBidirectionalTrading) {
        synthesis.allowBidirectionalTrading = false;
        synthesis.alternateDirection = null;
      }

      // Set defaults for pending breakout orders
      if (!synthesis.pendingBuyBreakout) {
        synthesis.pendingBuyBreakout = null;
        synthesis.pendingBuyStopLoss = null;
        synthesis.pendingBuyTakeProfit = null;
      }
      if (!synthesis.pendingSellBreakout) {
        synthesis.pendingSellBreakout = null;
        synthesis.pendingSellStopLoss = null;
        synthesis.pendingSellTakeProfit = null;
      }
      if (!synthesis.breakoutReasoning) {
        synthesis.breakoutReasoning = "Breakout levels calculated from support/resistance analysis";
      }
      
      // Add chart details for the recommended timeframe
      // Use the unified consensus direction instead of individual timeframe direction to ensure consistency
      const recommendedAnalysis = analyses.find((a: any) => a.timeframe === synthesis.bestChartTimeframe);
      if (recommendedAnalysis) {
        synthesis.recommendedChart = {
          timeframe: synthesis.bestChartTimeframe,
          direction: synthesis.direction, // Use consensus direction for consistency
          confidence: synthesis.confidence, // Use unified confidence
          patterns: recommendedAnalysis.patterns || [],
          rsi: recommendedAnalysis.momentumIndicators?.rsi?.value,
          preferredVolumeThreshold: synthesis.preferredVolumeThreshold || "150% above average",
          allowBidirectionalTrading: synthesis.allowBidirectionalTrading,
          alternateDirection: synthesis.alternateDirection,
          pendingBuyBreakout: synthesis.pendingBuyBreakout,
          pendingBuyStopLoss: synthesis.pendingBuyStopLoss,
          pendingBuyTakeProfit: synthesis.pendingBuyTakeProfit,
          pendingSellBreakout: synthesis.pendingSellBreakout,
          pendingSellStopLoss: synthesis.pendingSellStopLoss,
          pendingSellTakeProfit: synthesis.pendingSellTakeProfit,
          breakoutReasoning: synthesis.breakoutReasoning,
          reasoning: `This ${synthesis.bestChartTimeframe} timeframe provides the strongest entry signal aligned with the unified analysis`
        };
      }
      
      // Trigger webhooks for synthesis signals (non-blocking)
      const userId = (req.user as User).id;
      const symbol = analyses[0]?.symbol || 'Unknown';
      triggerWebhooks(userId, 'synthesis', {
        symbol,
        direction: synthesis.direction,
        confidence: synthesis.confidence,
        entryPrice: synthesis.entryPoint,
        stopLoss: synthesis.stopLoss,
        takeProfit: synthesis.takeProfit,
        riskRewardRatio: synthesis.riskRewardRatio,
        reasoning: synthesis.reasoning
      }).catch(err => console.error('Webhook trigger error:', err));
      
      res.json(synthesis);
    } catch (error: any) {
      console.error("Synthesis error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to synthesize signal"
      });
    }
  });

  // Generate EA code based on multi-timeframe analysis
  app.post("/api/generate-ea-code", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const { 
        groupId, 
        symbol, 
        platformType, 
        timeframes, 
        strategyType, 
        eaName, 
        tradeDuration,
        validityDays,
        chartDate,
        useTrailingStop,
        trailingStopDistance,
        trailingStopStep,
        multiTradeStrategy,
        maxSimultaneousTrades,
        pyramidingRatio,
        volumeThreshold,
        tradingDays
      } = req.body;
      
      if (!groupId || !symbol || !platformType || !Array.isArray(timeframes)) {
        return res.status(400).json({ 
          message: "Missing required parameters",
          error: "groupId, symbol, platformType, and timeframes are required" 
        });
      }

      if (!['MT5', 'TradingView', 'TradeLocker'].includes(platformType)) {
        return res.status(400).json({ 
          message: "Invalid platform type",
          error: "platformType must be 'MT5', 'TradingView', or 'TradeLocker'" 
        });
      }

      if (timeframes.length < 2) {
        return res.status(400).json({ 
          message: "Insufficient timeframes",
          error: "At least 2 timeframes are required for multi-timeframe analysis" 
        });
      }

      // Generate the EA code based on platform type with enhanced parameters
      let generatedCode: string;
      const eaConfig = {
        strategyType: strategyType || 'day_trading',
        eaName: eaName || 'Multi-Timeframe Strategy',
        tradeDuration: tradeDuration || 'Variable',
        validityDays: validityDays || 30,
        chartDate: chartDate || new Date().toISOString().split('T')[0],
        useTrailingStop: useTrailingStop !== false,
        trailingStopDistance: trailingStopDistance || 50,
        trailingStopStep: trailingStopStep || 10,
        multiTradeStrategy: multiTradeStrategy || 'single',
        maxSimultaneousTrades: maxSimultaneousTrades || 1,
        pyramidingRatio: pyramidingRatio || 0.5,
        volumeThreshold: volumeThreshold || 0,
        tradingDays: tradingDays || {
          Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: false, Sunday: false
        }
      };

      if (platformType === 'MT5') {
        generatedCode = generateMT5EACode(symbol, timeframes, eaConfig);
      } else if (platformType === 'TradingView') {
        generatedCode = generateTradingViewCode(symbol, timeframes, eaConfig);
      } else if (platformType === 'TradeLocker') {
        generatedCode = generateTradeLockerCode(symbol, timeframes, eaConfig);
      }

      // Store the generated strategy in the database
      try {
        const userId = (req.user as Express.User).id;
        const strategyId = await storage.createTradingStrategy({
          userId,
          groupId,
          symbol,
          platformType,
          generatedCode,
          timeframes: timeframes.map((tf: any) => ({
            timeframe: tf.timeframe,
            direction: tf.analysis?.direction,
            confidence: tf.analysis?.confidence
          })),
          entryConditions: `Multi-timeframe ${platformType} strategy for ${symbol}`,
          exitConditions: "ATR-based take profit",
          riskManagement: {
            stopLoss: "ATR-based",
            takeProfit: "2:1 risk-reward",
            atrMultiplier: 1.5
          }
        });

        res.json({
          code: generatedCode,
          strategyId,
          platform: platformType,
          symbol,
          timeframesCount: timeframes.length
        });
      } catch (dbError) {
        console.error('Error storing trading strategy:', dbError);
        // Return the code even if database storage fails
        res.json({
          code: generatedCode,
          platform: platformType,
          symbol,
          timeframesCount: timeframes.length
        });
      }
    } catch (error: any) {
      console.error("EA code generation error:", error);
      res.status(500).json({ 
        message: "Error generating EA code", 
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Original file upload + chart analysis endpoint (kept for backward compatibility)
  app.post("/api/analyze", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const { imageUrl } = req.body;
      
      if (!imageUrl) {
        return res.status(400).json({ message: "No image URL provided" });
      }

      // Get absolute path to image
      const filePath = path.join(process.cwd(), imageUrl.replace(/^\//, ''));
      
      console.log('Attempting to analyze image at path:', filePath);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        // Try alternative path for uploads directory
        const alternativePath = path.join(uploadsDir, path.basename(imageUrl));
        console.log('Image not found, trying alternative path:', alternativePath);
        
        if (!fs.existsSync(alternativePath)) {
          return res.status(404).json({ message: "Image file not found" });
        }
        
        // Use the alternative path if it exists
        console.log('Found image at alternative path');
        return res.status(400).json({ 
          message: "Please use the analyze-base64 endpoint instead", 
          error: "Direct file analysis is deprecated" 
        });
      }

      // Read file as base64
      const imageBuffer = await fs.promises.readFile(filePath);
      const base64Image = imageBuffer.toString('base64');

      // Call OpenAI for analysis with optional known symbol for enhanced Gold/BTC analysis
      const knownSymbol = req.body.symbol || undefined;
      const analysis = await analyzeChartImage(base64Image, knownSymbol, req.user?.id);
      
      console.log("Analysis result from OpenAI:", JSON.stringify(analysis, null, 2));

      // Validate the analysis object to ensure all required fields are present
      if (!analysis || typeof analysis !== 'object') {
        throw new Error("Invalid analysis result from OpenAI");
      }

      // Store the analysis in the database
      try {
        // Get the user ID from the authenticated user
        const userId = (req.user as Express.User).id;
        
        const chartAnalysis = await storage.createChartAnalysis({
          userId,
          imageUrl: imageUrl,
          symbol: analysis.symbol || "Unknown",
          timeframe: analysis.timeframe || "Unknown",
          price: analysis.currentPrice || "Unknown",
          direction: analysis.direction || "Unknown",
          trend: analysis.trend || "Unknown",
          confidence: analysis.confidence || "Medium",
          entryPoint: analysis.entryPoint || "Unknown",
          exitPoint: analysis.exitPoint || "Unknown",
          stopLoss: analysis.stopLoss || "Unknown",
          takeProfit: analysis.takeProfit || "Unknown",
          riskRewardRatio: analysis.riskRewardRatio || "Unknown",
          potentialPips: analysis.potentialPips || "Unknown",
          patterns: Array.isArray(analysis.patterns) ? analysis.patterns : [],
          indicators: Array.isArray(analysis.indicators) ? analysis.indicators : [],
          supportResistance: Array.isArray(analysis.supportResistance) ? analysis.supportResistance : [],
          recommendation: analysis.recommendation || "No recommendation available"
        });
        
        console.log("Stored analysis in database with ID:", chartAnalysis.id);
        
        // Trigger achievement check for analysis creation
        try {
          await checkUserAchievements({
            trigger: 'analysis_created',
            userId: (req.user as Express.User).id,
            data: {
              analysisId: chartAnalysis.id,
              symbol: analysis.symbol,
              timeframe: analysis.timeframe,
              patterns: analysis.patterns
            }
          });
        } catch (achievementError) {
          console.error("Error checking achievements:", achievementError);
          // Don't fail the request if achievement checking fails
        }

        // Track activity for streak
        try {
          await storage.recordActivity(userId, 'chart');
        } catch (streakError) {
          console.error('Error recording streak activity:', streakError);
        }
        
        // Trigger webhooks for analysis signals (non-blocking)
        triggerWebhooks(userId, 'analysis', {
          symbol: analysis.symbol || 'Unknown',
          timeframe: analysis.timeframe,
          direction: analysis.direction,
          confidence: analysis.confidence,
          entryPrice: analysis.entryPoint,
          stopLoss: analysis.stopLoss,
          takeProfit: analysis.takeProfit,
          trend: analysis.trend,
          patterns: analysis.patterns?.map((p: any) => p.name).join(', ') || 'None'
        }).catch(err => console.error('Webhook trigger error:', err));
      } catch (storageError) {
        console.error("Error storing analysis in database:", storageError);
        // Continue processing even if storage fails
      }

      // Return the full analysis to the client with the image URL
      res.json({
        ...analysis,
        imageUrl
      });
    } catch (error: any) {
      console.error("Analysis error:", error);
      
      // Check for specific OpenAI error types
      if (error && error.code === 'billing_not_active' || 
          (error && error.error && error.error.code === 'billing_not_active')) {
        return res.status(403).json({ 
          message: "OpenAI API key billing issue", 
          error: "Your OpenAI account is not active. Please check your billing details on the OpenAI website.",
          code: "BILLING_INACTIVE",
          apiKeyPresent: !!process.env.OPENAI_API_KEY
        });
      } else if (error && error.status === 401 || 
                (error && error.error && error.error.type === 'invalid_request_error')) {
        return res.status(401).json({ 
          message: "Invalid OpenAI API key", 
          error: "The provided API key is invalid. Please check your API key and try again.",
          code: "INVALID_API_KEY",
          apiKeyPresent: !!process.env.OPENAI_API_KEY
        });
      } else if (error && error.status === 429 || 
                (error && error.error && error.error.type === 'rate_limit_exceeded')) {
        return res.status(429).json({ 
          message: "OpenAI rate limit exceeded", 
          error: "You've exceeded your OpenAI API rate limit. Please try again later or check your usage tier.",
          code: "RATE_LIMIT_EXCEEDED",
          apiKeyPresent: !!process.env.OPENAI_API_KEY
        });
      }
      
      // Provide more detailed error information for other errors
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorDetails = error instanceof Error && (error as any).response ? 
        JSON.stringify((error as any).response.data || {}) : '';
      
      res.status(500).json({ 
        message: "Error analyzing chart", 
        error: errorMessage,
        details: errorDetails || '',
        apiKeyPresent: !!process.env.OPENAI_API_KEY,
        apiKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0
      });
    }
  });

  // Get all analyses
  app.get("/api/analyses", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      // Get user ID from session
      const userId = (req.user as Express.User).id;
      
      // Get only analyses for this user
      const analyses = await storage.getChartAnalysesByUserId(userId);
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching analyses:", error);
      res.status(500).json({ message: "Error fetching analyses" });
    }
  });

  // Get single analysis by ID
  app.get("/api/analyses/:id", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const analysis = await storage.getChartAnalysis(id);
      if (!analysis) {
        return res.status(404).json({ message: "Analysis not found" });
      }

      // Check if the analysis belongs to the user
      if (analysis.userId !== (req.user as Express.User).id) {
        return res.status(403).json({ 
          success: false,
          message: "You don't have permission to access this analysis" 
        });
      }

      res.json(analysis);
    } catch (error) {
      console.error("Error fetching analysis:", error);
      res.status(500).json({ message: "Error fetching analysis" });
    }
  });
  
  // Share an analysis with optional notes
  app.post("/api/analyses/:id/share", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }
      
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid analysis ID" });
      }
      
      const { notes } = req.body;
      
      // Get analysis to verify ownership
      const analysis = await storage.getChartAnalysis(id);
      if (!analysis) {
        return res.status(404).json({ message: "Analysis not found" });
      }
      
      // Check if the user owns this analysis
      if (analysis.userId !== (req.user as Express.User).id) {
        return res.status(403).json({ 
          success: false,
          message: "You can only share your own analyses" 
        });
      }
      
      // Import the image processor
      const { addWatermarkToImage, createSharedImageUrl } = await import('./image-processor');
      
      try {
        // Get the original image path
        const originalImageUrl = analysis.imageUrl;
        console.log("Original image URL:", originalImageUrl);
        
        // Extract the filename from the URL
        const imagePath = originalImageUrl.startsWith('/') ? originalImageUrl.substring(1) : originalImageUrl;
        const basename = path.basename(imagePath);
        console.log("Image basename:", basename);
        
        // Create the full path to the image
        const originalImagePath = path.join(process.cwd(), 'uploads', basename);
        console.log("Full image path:", originalImagePath);
        
        // Verify the original image exists
        if (!fs.existsSync(originalImagePath)) {
          console.error("Original image not found at path:", originalImagePath);
          throw new Error(`Original image not found: ${originalImagePath}`);
        }
        
        // Create a unique filename for the watermarked image
        const timestamp = Date.now();
        const watermarkedFilename = `${id}_${timestamp}_watermarked.jpg`;
        console.log("Watermarked filename:", watermarkedFilename);
        
        // Add watermark to the image
        const watermarkedImagePath = await addWatermarkToImage(originalImagePath, watermarkedFilename);
        console.log("Watermarked image created at:", watermarkedImagePath);
        
        // Create URL for the watermarked image
        const watermarkedImageUrl = createSharedImageUrl(watermarkedFilename);
        console.log("Watermarked image URL:", watermarkedImageUrl);
        
        // Update analysis with the watermarked image URL before sharing
        await storage.updateChartAnalysis(id, {
          sharedImageUrl: watermarkedImageUrl
        });
        
        // Share the analysis
        const sharedAnalysis = await storage.shareChartAnalysis(id, notes);
        res.json(sharedAnalysis);
      } catch (watermarkError) {
        console.error("Error adding watermark to image:", watermarkError);
        // If watermarking fails, still share the analysis with the original image
        const sharedAnalysis = await storage.shareChartAnalysis(id, notes);
        res.json(sharedAnalysis);
      }
    } catch (error) {
      console.error("Error sharing analysis:", error);
      res.status(500).json({ message: "Error sharing analysis" });
    }
  });
  
  // Get a shared analysis by its share ID (public endpoint - no auth required)
  app.get("/api/shared/:shareId", async (req: Request, res: Response) => {
    try {
      const { shareId } = req.params;
      
      const analysis = await storage.getAnalysisByShareId(shareId);
      if (!analysis || !analysis.isPublic) {
        return res.status(404).json({ message: "Shared analysis not found" });
      }
      
      res.json(analysis);
    } catch (error) {
      console.error("Error retrieving shared analysis:", error);
      res.status(500).json({ message: "Error retrieving shared analysis" });
    }
  });

  // Publish analysis to the social hub
  app.post("/api/analyses/:id/publish-to-social", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }
      
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid analysis ID" });
      }
      
      const { isPublic } = req.body;
      
      // Get analysis to verify ownership
      const analysis = await storage.getChartAnalysis(id);
      if (!analysis) {
        return res.status(404).json({ message: "Analysis not found" });
      }
      
      // Check if the user owns this analysis
      if (analysis.userId !== (req.user as Express.User).id) {
        return res.status(403).json({ 
          success: false,
          message: "You don't have permission to modify this analysis" 
        });
      }
      
      // Update the analysis isPublic status
      const updatedAnalysis = await storage.updateChartAnalysis(id, {
        isPublic: isPublic === false ? false : true  // Default to true if not explicitly set to false
      });
      
      if (!updatedAnalysis) {
        return res.status(500).json({ message: "Failed to update analysis" });
      }
      
      // Trigger achievement check for publishing to social hub
      if (isPublic !== false) {
        try {
          await checkUserAchievements({
            trigger: 'PUBLISH_ANALYSIS',
            userId: (req.user as Express.User).id,
            data: {
              analysisId: id
            }
          });
        } catch (err) {
          console.error("Error checking achievements:", err);
          // Don't fail the request if achievement checking fails
        }
      }
      
      res.json({
        success: true,
        analysis: updatedAnalysis
      });
    } catch (error) {
      console.error("Error publishing to social hub:", error);
      res.status(500).json({ 
        success: false,
        message: "Error publishing analysis to social hub" 
      });
    }
  });

  // Special endpoint for serving shared images directly
  app.get("/api/shared-image/:filename", (req: Request, res: Response) => {
    try {
      const filename = req.params.filename;
      // Sanitize the filename to prevent directory traversal attacks
      const sanitizedFilename = path.basename(filename);
      
      // First check in shared directory for watermarked images
      const sharedPath = path.join(process.cwd(), 'uploads', 'shared', sanitizedFilename);
      if (fs.existsSync(sharedPath)) {
        return res.sendFile(sharedPath);
      }
      
      // If not found in shared directory, check in regular uploads
      const regularPath = path.join(process.cwd(), 'uploads', sanitizedFilename);
      if (fs.existsSync(regularPath)) {
        return res.sendFile(regularPath);
      }
      
      // If file doesn't exist in either location
      return res.status(404).json({ message: "Image not found" });
    } catch (error) {
      console.error("Error serving image:", error);
      res.status(500).json({ message: "Error serving image" });
    }
  });

  // Annotated image endpoint - serves trade setup annotated images
  app.get("/api/annotated-image/:filename", (req: Request, res: Response) => {
    try {
      const filename = req.params.filename;
      // Sanitize the filename to prevent directory traversal attacks
      const sanitizedFilename = path.basename(filename);
      
      // Check in annotated directory for trade setup annotated images
      const annotatedPath = path.join(process.cwd(), 'uploads', 'annotated', sanitizedFilename);
      if (fs.existsSync(annotatedPath)) {
        return res.sendFile(annotatedPath);
      }
      
      // If file doesn't exist
      return res.status(404).json({ message: "Annotated image not found" });
    } catch (error) {
      console.error("Error serving annotated image:", error);
      res.status(500).json({ message: "Error serving annotated image" });
    }
  });
  
  // API key validation endpoint
  app.get("/api/validate-key", async (_req: Request, res: Response) => {
    try {
      const isValid = await testOpenAIApiKey();
      
      res.json({ 
        valid: isValid,
        apiKeyPresent: !!process.env.OPENAI_API_KEY,
        apiKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0
      });
    } catch (error: any) {
      console.error("Error validating API key:", error);
      
      // Check for specific OpenAI error types
      if (error && error.code === 'billing_not_active' || 
          (error && error.error && error.error.code === 'billing_not_active')) {
        return res.status(403).json({ 
          message: "Billing not active",
          error: "Your OpenAI account is not active. Please check your billing details on the OpenAI website.",
          code: "BILLING_INACTIVE",
          valid: false,
          apiKeyPresent: !!process.env.OPENAI_API_KEY
        });
      } else if (error && error.status === 401 || 
                (error && error.error && error.error.type === 'invalid_request_error')) {
        return res.status(401).json({ 
          message: "Invalid API key",
          error: "The provided API key is invalid. Please check your API key and try again.",
          code: "INVALID_API_KEY",
          valid: false,
          apiKeyPresent: !!process.env.OPENAI_API_KEY
        });
      }
      
      res.status(500).json({ 
        message: "Error validating API key",
        error: error instanceof Error ? error.message : "Unknown error",
        valid: false,
        apiKeyPresent: !!process.env.OPENAI_API_KEY,
        apiKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0
      });
    }
  });
  
  // API key configuration endpoint
  app.post("/api/configure-key", async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;
      
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
        return res.status(400).json({ message: "Invalid API key provided" });
      }
      
      // Set the API key in environment
      process.env.OPENAI_API_KEY = apiKey.trim();
      
      // Test if it works
      const isValid = await testOpenAIApiKey();
      
      res.json({ 
        message: isValid ? "API key configured successfully" : "API key saved but validation failed",
        valid: isValid
      });
    } catch (error: any) {
      console.error("Error configuring API key:", error);
    }
  });
  
  // Generate trading tips based on symbol, timeframe, and market context
  app.post("/api/generate-trading-tip", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }
      
      const { symbol, timeframe, marketContext } = req.body;
      
      if (!symbol) {
        return res.status(400).json({ error: "Symbol is required" });
      }

      const tip = await generateTradingTip(symbol, timeframe, marketContext);
      res.json(tip);
    } catch (error: any) {
      console.error("Error generating trading tip:", error);
      
      // Handle specific OpenAI errors like we do for other endpoints
      if (error && error.code === 'billing_not_active' || 
          (error && error.error && error.error.code === 'billing_not_active')) {
        return res.status(403).json({ 
          message: "OpenAI API key billing issue", 
          error: "Your OpenAI account is not active. Please check your billing details on the OpenAI website.",
          code: "BILLING_INACTIVE"
        });
      }
      
      res.status(500).json({ 
        message: "Error generating trading tip", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Generate market trend predictions for related currency pairs
  app.post("/api/market-trends", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const { symbol } = req.body;
      if (!symbol) {
        return res.status(400).json({ error: 'Symbol is required' });
      }
      
      console.log('Generating market trends for symbol:', symbol);
      const trends = await generateMarketTrendPredictions(symbol);
      res.json(trends);
    } catch (error: any) {
      console.error('Error generating market trends:', error);
      
      // Handle specific OpenAI errors like we do for other endpoints
      if (error && error.code === 'billing_not_active' || 
          (error && error.error && error.error.code === 'billing_not_active')) {
        return res.status(403).json({ 
          message: "OpenAI API key billing issue", 
          error: "Your OpenAI account is not active. Please check your billing details on the OpenAI website.",
          code: "BILLING_INACTIVE"
        });
      }
      
      res.status(500).json({ 
        message: "Error generating market trends", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Send trading signal via SMS
  app.post("/api/send-signal", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }
      
      // Call the Twilio function to send the SMS
      await sendTradingSignal(req, res);
      
    } catch (error: any) {
      console.error("Error sending trading signal:", error);
      res.status(500).json({ 
        success: false, 
        message: "Error sending trading signal", 
        error: error.message 
      });
    }
  });

  // Achievement endpoints
  
  // Get all achievements
  app.get("/api/achievements", async (req: Request, res: Response) => {
    try {
      const achievements = await storage.getAllAchievements();
      res.json(achievements);
    } catch (error) {
      console.error("Error fetching achievements:", error);
      res.status(500).json({ message: "Error fetching achievements" });
    }
  });

  // Get achievements by category
  app.get("/api/achievements/category/:category", async (req: Request, res: Response) => {
    try {
      const category = req.params.category;
      const achievements = await storage.getAchievementsByCategory(category);
      res.json(achievements);
    } catch (error) {
      console.error("Error fetching achievements by category:", error);
      res.status(500).json({ message: "Error fetching achievements by category" });
    }
  });

  // Get user achievements
  app.get("/api/user-achievements", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const userId = (req.user as Express.User).id;
      const userAchievements = await storage.getUserAchievements(userId);
      res.json(userAchievements);
    } catch (error) {
      console.error("Error fetching user achievements:", error);
      res.status(500).json({ message: "Error fetching user achievements" });
    }
  });

  // Check and update achievement progress
  app.post("/api/check-achievements", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }
      
      const userId = (req.user as Express.User).id;
      
      // Get trigger and data from request body
      const { trigger, data } = req.body;
      
      if (!trigger) {
        return res.status(400).json({ message: "Missing trigger parameter" });
      }
      
      // Use our achievement tracker module
      const request = {
        trigger,
        data,
        userId
      };
      
      // Import and use the checkUserAchievements function
      const { checkUserAchievements } = await import('./achievement-tracker');
      
      // Check for unlocked achievements
      const unlockedAchievements = await checkUserAchievements(request);
      
      // If any achievements were unlocked, return them
      res.json(unlockedAchievements);
    } catch (error) {
      console.error("Error checking achievements:", error);
      res.status(500).json({ message: "Error checking achievements" });
    }
  });

  // -------------------- SOCIAL NETWORK ROUTES --------------------

  // Get user profile
  app.get("/api/profile/:userId", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const profile = await storage.getUserProfile(userId);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Get user basic info
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if the current user follows this user
      const currentUserId = (req.user as Express.User).id;
      const isFollowing = await storage.isFollowing(currentUserId, userId);

      res.json({
        ...profile,
        username: user.username,
        fullName: user.fullName,
        profileImage: user.profileImage,
        isFollowing
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Error fetching profile" });
    }
  });

  // Create or update user profile
  app.post("/api/profile", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const userId = (req.user as Express.User).id;
      const profileData = req.body;

      // Validate profile data
      const result = insertUserProfileSchema.safeParse({
        userId,
        ...profileData
      });

      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid profile data",
          errors: result.error.format()
        });
      }

      // Check if profile exists
      const existingProfile = await storage.getUserProfile(userId);
      
      if (existingProfile) {
        // Update existing profile
        const updatedProfile = await storage.updateUserProfile(userId, profileData);
        return res.json(updatedProfile);
      } else {
        // Create new profile
        const newProfile = await storage.createUserProfile({
          userId,
          ...profileData
        });
        return res.json(newProfile);
      }
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Error updating profile" });
    }
  });

  // Follow user
  app.post("/api/social/follow", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const { followingId } = req.body;
      if (!followingId) {
        return res.status(400).json({ message: "Missing followingId parameter" });
      }

      const followerId = (req.user as Express.User).id;
      
      // Prevent self-following
      if (followerId === followingId) {
        return res.status(400).json({ message: "Cannot follow yourself" });
      }

      // Check if already following
      const isAlreadyFollowing = await storage.isFollowing(followerId, followingId);
      
      if (isAlreadyFollowing) {
        return res.status(400).json({ message: "Already following this user" });
      }

      // Create follow relationship
      const follow = await storage.followUser(followerId, followingId);
      
      // Trigger achievement check for new follow
      try {
        await checkUserAchievements({
          trigger: "user_followed",
          userId: followerId,
          data: { followingId }
        });
      } catch (achievementError) {
        console.error("Error checking achievements for follow:", achievementError);
      }
      
      res.json(follow);
    } catch (error) {
      console.error("Error following user:", error);
      res.status(500).json({ message: "Error following user" });
    }
  });

  // Unfollow user
  app.post("/api/social/unfollow", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const { followingId } = req.body;
      if (!followingId) {
        return res.status(400).json({ message: "Missing followingId parameter" });
      }

      const followerId = (req.user as Express.User).id;
      
      // Remove follow relationship
      const success = await storage.unfollowUser(followerId, followingId);
      
      if (!success) {
        return res.status(404).json({ message: "Follow relationship not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error unfollowing user:", error);
      res.status(500).json({ message: "Error unfollowing user" });
    }
  });

  // Get followers
  app.get("/api/social/followers/:userId", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const followers = await storage.getFollowers(userId);
      res.json(followers);
    } catch (error) {
      console.error("Error getting followers:", error);
      res.status(500).json({ message: "Error getting followers" });
    }
  });

  // Get following
  app.get("/api/social/following/:userId", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const following = await storage.getFollowing(userId);
      res.json(following);
    } catch (error) {
      console.error("Error getting following:", error);
      res.status(500).json({ message: "Error getting following" });
    }
  });

  // Get public analyses for social feed
  app.get("/api/social/analyses", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const analyses = await storage.getPublicChartAnalyses(limit);
      
      // Get user data for each analysis
      const analysesWithUserData = await Promise.all(analyses.map(async (analysis) => {
        if (!analysis.userId) {
          return {
            ...analysis,
            user: { id: 0, username: "Anonymous" },
            feedbackCounts: { likes: 0, dislikes: 0, saves: 0, comments: 0 },
            userFeedback: { hasLiked: false, hasDisliked: false, hasSaved: false }
          };
        }
        
        const user = await storage.getUser(analysis.userId);
        const feedback = await storage.getAnalysisFeedback(analysis.id);
        const currentUserId = (req.user as Express.User).id;
        
        const feedbackCounts = {
          likes: feedback.filter(f => f.feedbackType === 'like').length,
          dislikes: feedback.filter(f => f.feedbackType === 'dislike').length,
          saves: feedback.filter(f => f.feedbackType === 'save').length,
          comments: feedback.filter(f => f.feedbackType === 'comment').length
        };
        
        const userFeedback = {
          hasLiked: feedback.some(f => f.userId === currentUserId && f.feedbackType === 'like'),
          hasDisliked: feedback.some(f => f.userId === currentUserId && f.feedbackType === 'dislike'),
          hasSaved: feedback.some(f => f.userId === currentUserId && f.feedbackType === 'save')
        };
        
        return {
          ...analysis,
          user: {
            id: user?.id || 0,
            username: user?.username || "Unknown",
            fullName: user?.fullName,
            profileImage: user?.profileImage
          },
          feedbackCounts,
          userFeedback
        };
      }));
      
      res.json(analysesWithUserData);
    } catch (error) {
      console.error("Error getting social analyses:", error);
      res.status(500).json({ message: "Error getting social analyses" });
    }
  });

  // Get feed for a user (analyses from followed users)
  app.get("/api/social/feed", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const userId = (req.user as Express.User).id;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      
      const analyses = await storage.getAnalysisFeed(userId, limit);
      
      // Get user data for each analysis (same as above)
      const analysesWithUserData = await Promise.all(analyses.map(async (analysis) => {
        if (!analysis.userId) {
          return {
            ...analysis,
            user: { id: 0, username: "Anonymous" },
            feedbackCounts: { likes: 0, dislikes: 0, saves: 0, comments: 0 },
            userFeedback: { hasLiked: false, hasDisliked: false, hasSaved: false }
          };
        }
        
        const user = await storage.getUser(analysis.userId);
        const feedback = await storage.getAnalysisFeedback(analysis.id);
        
        const feedbackCounts = {
          likes: feedback.filter(f => f.feedbackType === 'like').length,
          dislikes: feedback.filter(f => f.feedbackType === 'dislike').length,
          saves: feedback.filter(f => f.feedbackType === 'save').length,
          comments: feedback.filter(f => f.feedbackType === 'comment').length
        };
        
        const userFeedback = {
          hasLiked: feedback.some(f => f.userId === userId && f.feedbackType === 'like'),
          hasDisliked: feedback.some(f => f.userId === userId && f.feedbackType === 'dislike'),
          hasSaved: feedback.some(f => f.userId === userId && f.feedbackType === 'save')
        };
        
        return {
          ...analysis,
          user: {
            id: user?.id || 0,
            username: user?.username || "Unknown",
            fullName: user?.fullName,
            profileImage: user?.profileImage
          },
          feedbackCounts,
          userFeedback
        };
      }));
      
      res.json(analysesWithUserData);
    } catch (error) {
      console.error("Error getting feed:", error);
      res.status(500).json({ message: "Error getting feed" });
    }
  });

  // Add feedback to analysis (like, dislike, save)
  app.post("/api/social/analyses/:analysisId/feedback", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const analysisId = parseInt(req.params.analysisId);
      if (isNaN(analysisId)) {
        return res.status(400).json({ message: "Invalid analysis ID" });
      }

      const { feedbackType, comment } = req.body;
      if (!feedbackType) {
        return res.status(400).json({ message: "Missing feedbackType parameter" });
      }

      if (!['like', 'dislike', 'save', 'comment'].includes(feedbackType)) {
        return res.status(400).json({ message: "Invalid feedbackType. Must be 'like', 'dislike', 'save', or 'comment'" });
      }

      const userId = (req.user as Express.User).id;
      
      // Check if analysis exists
      const analysis = await storage.getChartAnalysis(analysisId);
      if (!analysis) {
        return res.status(404).json({ message: "Analysis not found" });
      }

      // Check if feedback already exists and remove it to toggle
      const existingFeedback = await storage.getAnalysisFeedback(analysisId);
      const hasExistingFeedback = existingFeedback.some(
        f => f.userId === userId && f.feedbackType === feedbackType
      );
      
      if (hasExistingFeedback) {
        // Remove existing feedback (toggle off)
        await storage.removeAnalysisFeedback(analysisId, userId, feedbackType);
        res.json({ success: true, action: "removed" });
      } else {
        // If adding a new like, remove any existing dislike (and vice versa)
        if (feedbackType === 'like') {
          await storage.removeAnalysisFeedback(analysisId, userId, 'dislike');
        } else if (feedbackType === 'dislike') {
          await storage.removeAnalysisFeedback(analysisId, userId, 'like');
        }
        
        // Add the new feedback
        const feedback = await storage.addAnalysisFeedback({
          analysisId,
          userId,
          feedbackType,
          comment: comment || null
        });
        
        // If it's a like, trigger achievement check
        if (feedbackType === 'like' && analysis.userId) {
          try {
            await checkUserAchievements({
              trigger: "analysis_liked",
              userId: analysis.userId,
              data: { analysisId }
            });
          } catch (achievementError) {
            console.error("Error checking achievements for like:", achievementError);
          }
        }
        
        res.json({ success: true, action: "added", feedback });
      }
    } catch (error) {
      console.error("Error adding feedback:", error);
      res.status(500).json({ message: "Error adding feedback" });
    }
  });

  // Get popular traders
  app.get("/api/social/popular-traders", async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const currentUserId = (req.user as Express.User).id;
      
      // This would be replaced with a more sophisticated algorithm in a real app
      // For now, just get users who have profiles
      const allUsers = await Promise.all((await storage.getAllUsers()).map(async (user: User) => {
        const profile = await storage.getUserProfile(user.id);
        const isFollowing = await storage.isFollowing(currentUserId, user.id);
        
        return {
          userId: user.id,
          username: user.username,
          fullName: user.fullName,
          profileImage: user.profileImage,
          bio: profile?.bio,
          tradingExperience: profile?.tradingExperience,
          tradingStyle: profile?.tradingStyle,
          tradeGrade: profile?.tradeGrade || Math.floor(Math.random() * 40) + 60, // Fallback for demo
          winRate: profile?.winRate || Math.floor(Math.random() * 30) + 50, // Fallback for demo
          followers: profile?.followers || 0,
          following: profile?.following || 0,
          isFollowing
        };
      }));
      
      // Sort by tradeGrade for now
      const popularTraders = allUsers
        .filter(user => user.userId !== currentUserId) // Exclude current user
        .sort((a, b) => b.tradeGrade - a.tradeGrade)
        .slice(0, limit);
      
      res.json(popularTraders);
    } catch (error) {
      console.error("Error getting popular traders:", error);
      res.status(500).json({ message: "Error getting popular traders" });
    }
  });

  // ===== Subscription Management Endpoints =====
  
  // Get subscription plans
  app.get("/api/subscription/plans", async (_req: Request, res: Response) => {
    try {
      const plans = await getSubscriptionPlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching subscription plans:", error);
      res.status(500).json({ message: "Error fetching subscription plans" });
    }
  });

  // Get user's current subscription
  app.get("/api/subscription", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = (req.user as Express.User).id;
      const user = req.user as User;
      const subscription = await getUserSubscription(userId);
      
      const baseResponse = subscription || { planId: 1, planName: "Free", status: "active" };
      
      const membershipTier = user.membershipTier || 'none';
      if (membershipTier !== 'none') {
        const TIER_PLAN_MAP: Record<string, string> = { basic: 'Starter', pro: 'Premium', elite: 'Yearly' };
        const equivalentPlan = TIER_PLAN_MAP[membershipTier];
        if (equivalentPlan) {
          const plans = await getSubscriptionPlans();
          const tokenPlan = plans.find((p: any) => p.name === equivalentPlan);
          if (tokenPlan) {
            (baseResponse as any).tokenGatedPlanName = equivalentPlan;
            (baseResponse as any).tokenGatedAnalysisLimit = tokenPlan.analysisLimit;
            (baseResponse as any).tokenGatedSocialShareLimit = tokenPlan.socialShareLimit;
            if (!subscription || tokenPlan.analysisLimit > (subscription.analysisLimit || 0)) {
              (baseResponse as any).planName = `${equivalentPlan} (VEDD ${membershipTier.charAt(0).toUpperCase() + membershipTier.slice(1)})`;
              (baseResponse as any).analysisLimit = tokenPlan.analysisLimit;
              (baseResponse as any).socialShareLimit = tokenPlan.socialShareLimit;
              (baseResponse as any).status = 'active';
            }
          }
        }
        (baseResponse as any).membershipTier = membershipTier;
        (baseResponse as any).isTokenGated = true;
      }
      
      res.json(baseResponse);
    } catch (error) {
      console.error("Error fetching user subscription:", error);
      res.status(500).json({ message: "Error fetching user subscription" });
    }
  });

  // Subscribe to a plan
  app.post("/api/subscription/subscribe", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { planId } = req.body;
      if (!planId) {
        return res.status(400).json({ message: "Plan ID is required" });
      }

      const userId = (req.user as Express.User).id;
      const result = await createSubscription(userId, planId);
      
      res.json(result);
    } catch (error) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ 
        message: "Error creating subscription", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Cancel subscription
  app.post("/api/subscription/cancel", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = (req.user as Express.User).id;
      const result = await cancelSubscription(userId);
      
      res.json(result);
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      res.status(500).json({ 
        message: "Error cancelling subscription", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Check if a user can perform an action based on their subscription limits
  app.post("/api/subscription/check-limits", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { actionType } = req.body;
      if (!actionType || !['analysis', 'social_share'].includes(actionType)) {
        return res.status(400).json({ message: "Valid action type (analysis or social_share) is required" });
      }

      const userId = (req.user as Express.User).id;
      const result = await checkUserSubscriptionLimits(userId, actionType);
      
      res.json(result);
    } catch (error) {
      console.error("Error checking subscription limits:", error);
      res.status(500).json({ 
        message: "Error checking subscription limits", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get Stripe checkout session for client
  app.post("/api/subscription/create-checkout-session", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { planId } = req.body;
      if (!planId) {
        return res.status(400).json({ message: "Plan ID is required" });
      }

      const userId = (req.user as Express.User).id;
      const result = await createSubscription(userId, planId);
      
      res.json(result);
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ 
        message: "Error creating checkout session", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Stripe webhook endpoint (for handling subscription events)
  app.post('/api/subscription/webhook', async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'] as string;
    
    // In a production environment, we would verify the webhook signature
    // let event;
    // try {
    //   event = stripe.webhooks.constructEvent(
    //     req.body,
    //     signature,
    //     process.env.STRIPE_WEBHOOK_SECRET
    //   );
    // } catch (err) {
    //   return res.status(400).send(`Webhook Error: ${err.message}`);
    // }

    const event = req.body;

    // Handle specific events
    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          // Update subscription in database
          console.log('Subscription created or updated:', event.data.object);
          break;
        case 'customer.subscription.deleted':
          // Cancel subscription in database
          console.log('Subscription cancelled:', event.data.object);
          break;
        case 'invoice.payment_succeeded':
          // Update payment status
          console.log('Payment succeeded:', event.data.object);
          break;
        case 'invoice.payment_failed':
          // Handle failed payment
          console.log('Payment failed:', event.data.object);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('Error handling webhook:', error);
      res.status(500).json({ message: 'Error handling webhook' });
    }
  });

  // ===== VEDD Token Payment Endpoints =====
  
  // Create VEDD payment session
  app.post('/api/vedd/create-session', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const { planName } = req.body;
      if (!planName) {
        return res.status(400).json({ message: 'Plan name is required' });
      }

      const userId = (req.user as Express.User).id;
      const { createPaymentSession } = await import('./veddPayment');
      const session = createPaymentSession(planName, userId);

      res.json({ session });
    } catch (error) {
      console.error('Error creating VEDD payment session:', error);
      res.status(500).json({ 
        message: 'Error creating payment session',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Verify VEDD payment
  app.post('/api/vedd/verify-payment', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const { sessionId, transactionSignature } = req.body;
      if (!sessionId || !transactionSignature) {
        return res.status(400).json({ message: 'Session ID and transaction signature are required' });
      }

      const userId = (req.user as Express.User).id;
      const { verifyVeddPayment, getPaymentSession } = await import('./veddPayment');
      
      const session = getPaymentSession(sessionId);
      if (!session) {
        return res.status(404).json({ verified: false, error: 'Payment session not found' });
      }

      if (session.userId !== userId) {
        return res.status(403).json({ verified: false, error: 'Unauthorized access to payment session' });
      }

      const result = await verifyVeddPayment(sessionId, transactionSignature);

      if (result.verified) {
        // Upgrade user's subscription based on plan
        const planMap: Record<string, number> = {
          'starter': 2,
          'premium': 3,
          'lifetime': 4,
        };
        const planId = planMap[session.planName];
        
        if (planId) {
          await storage.updateUserSubscription(userId, {
            planId,
            status: 'active',
            stripeSubscriptionId: `vedd_${sessionId}`,
            currentPeriodStart: new Date(),
            currentPeriodEnd: session.planName === 'lifetime' 
              ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) // 100 years for lifetime
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days for monthly
          });
        }
      }

      res.json(result);
    } catch (error) {
      console.error('Error verifying VEDD payment:', error);
      res.status(500).json({ 
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get VEDD token prices for plans
  app.get('/api/vedd/prices', async (_req: Request, res: Response) => {
    try {
      const { getVeddPrices, getReceiverWallet, getTokenMint } = await import('./veddPayment');
      res.json({
        prices: getVeddPrices(),
        receiverWallet: getReceiverWallet(),
        tokenMint: getTokenMint(),
      });
    } catch (error) {
      console.error('Error getting VEDD prices:', error);
      res.status(500).json({ message: 'Error getting VEDD prices' });
    }
  });

  // ===== Streak Tracking Endpoints =====
  
  // Get user streak data
  app.get('/api/streak', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const userId = (req.user as Express.User).id;
      const streak = await storage.getUserStreak(userId);
      
      if (!streak) {
        // Return default streak data for new users
        return res.json({
          currentStreak: 0,
          longestStreak: 0,
          lastActivityDate: null,
          totalChartsAnalyzed: 0,
          totalEAsCreated: 0,
          totalTrades: 0,
          tier: 'YG',
          tierProgress: 0,
          xpPoints: 0,
          weeklyChartsAnalyzed: 0,
          weeklyEAsCreated: 0,
        });
      }
      
      res.json(streak);
    } catch (error) {
      console.error('Error getting streak:', error);
      res.status(500).json({ message: 'Error getting streak data' });
    }
  });

  // Record activity (chart analysis, EA creation, or trade)
  app.post('/api/streak/activity', async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const { activityType } = req.body;
      if (!activityType || !['chart', 'ea', 'trade'].includes(activityType)) {
        return res.status(400).json({ message: 'Valid activity type is required (chart, ea, or trade)' });
      }

      const userId = (req.user as Express.User).id;
      const result = await storage.recordActivity(userId, activityType);
      
      res.json({
        currentStreak: result.streak.currentStreak,
        streakIncreased: result.streakIncreased,
        tierUp: result.tierUp,
        newTier: result.newTier,
        xpPoints: result.streak.xpPoints,
        tier: result.streak.tier,
      });
    } catch (error) {
      console.error('Error recording activity:', error);
      res.status(500).json({ message: 'Error recording activity' });
    }
  });

  // Trading Coach endpoints
  app.post('/api/trading-coach', tradingCoachHandler);
  
  // Trading Tips endpoint
  app.get('/api/trading-tips', tradingTipsHandler);

  // Gold Telegram Sentiment endpoint
  app.get('/api/gold-sentiment', async (req: Request, res: Response) => {
    try {
      if (isTelegramConfigured()) {
        const sentiment = await getGoldSentiment();
        res.json(sentiment);
      } else {
        const mockSentiment = getMockGoldSentiment();
        res.json({ ...mockSentiment, isDemo: true });
      }
    } catch (error) {
      console.error('Error fetching gold sentiment:', error);
      res.status(500).json({ message: 'Error fetching gold sentiment' });
    }
  });

  // Economic Calendar endpoint
  app.get('/api/economic-calendar', async (req: Request, res: Response) => {
    try {
      const daysAhead = parseInt(req.query.days as string) || 7;
      const symbol = req.query.symbol as string || 'EURUSD';
      
      // Use the news service to get upcoming events
      const events = await newsService.getUpcomingEventsForPair(symbol, daysAhead);
      
      // Transform events into the format expected by the frontend
      const calendarEvents = events.map(event => ({
        id: event.id,
        title: event.event,
        date: new Date(event.datetime).toISOString().split('T')[0],
        time: event.timeFormatted + ' GMT',
        impact: event.impact,
        affectedPairs: getAffectedPairs(event.currency),
        forecast: event.forecast || undefined,
        previous: event.previous || undefined,
        description: event.potentialImpact,
        country: event.country,
        currency: event.currency
      }));
      
      res.json({ events: calendarEvents });
    } catch (error) {
      console.error('Error fetching economic calendar:', error);
      res.status(500).json({ message: 'Error fetching economic calendar' });
    }
  });

  // Market insights endpoints
  app.get('/api/market-insights', marketInsightsHandler);
  app.post('/api/market-insights/contextual', contextualInsightHandler);
  
  // Import strategy from GitHub
  app.post('/api/strategies/import', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    try {
      const { strategy, metadata } = req.body;
      
      if (!strategy || !metadata) {
        return res.status(400).json({ message: "Missing strategy or metadata" });
      }
      
      // You would integrate with your strategy storage system here
      // For now, we'll just return a successful response
      // In a full implementation, you would:
      // 1. Validate the strategy format
      // 2. Store it in the database using Drizzle ORM
      // 3. Associate it with the current user
      
      // This is a simplified implementation that returns the strategy with a generated ID
      return res.status(200).json({
        id: `imported-${Date.now()}`, // Placeholder ID
        ...metadata,
        userId: req.user.id,
        createdAt: new Date().toISOString(),
        source: metadata.source,
        isImported: true,
        strategyData: strategy
      });
    } catch (error) {
      console.error("Error importing strategy:", error);
      return res.status(500).json({ message: "Error importing strategy" });
    }
  });

  // Price Alerts API endpoints
  app.get('/api/alerts', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const userId = (req.user as Express.User).id;
      const alerts = await storage.getUserPriceAlerts(userId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ message: "Error fetching alerts" });
    }
  });

  app.post('/api/alerts', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const userId = (req.user as Express.User).id;
      const alertData = {
        ...req.body,
        userId,
        isActive: true,
        isTriggered: false,
        notificationSent: false
      };

      const alert = await storage.createPriceAlert(alertData);
      res.json(alert);
    } catch (error) {
      console.error("Error creating alert:", error);
      res.status(500).json({ message: "Error creating alert" });
    }
  });

  app.patch('/api/alerts/:id/toggle', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const alertId = parseInt(req.params.id);
      const { isActive } = req.body;
      
      const updatedAlert = await storage.updatePriceAlert(alertId, { isActive });
      res.json(updatedAlert);
    } catch (error) {
      console.error("Error updating alert:", error);
      res.status(500).json({ message: "Error updating alert" });
    }
  });

  app.delete('/api/alerts/:id', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const alertId = parseInt(req.params.id);
      await storage.deletePriceAlert(alertId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting alert:", error);
      res.status(500).json({ message: "Error deleting alert" });
    }
  });

  app.get('/api/analyses/recent', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const userId = (req.user as Express.User).id;
      const analyses = await storage.getChartAnalysesByUserId(userId);
      // Return only the 5 most recent analyses
      res.json(analyses.slice(0, 5));
    } catch (error) {
      console.error("Error fetching recent analyses:", error);
      res.status(500).json({ message: "Error fetching recent analyses" });
    }
  });

  // EA Live Refresh endpoint - Supports both session auth and API token auth
  app.post('/api/ea/refresh-analysis', async (req: Request, res: Response) => {
    try {
      let userId: number;
      
      // Check for API token in header first (for EA calls)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const apiToken = await storage.getMt5ApiTokenByToken(token);
        
        if (!apiToken || !apiToken.isActive) {
          return res.status(401).json({ 
            success: false,
            message: "Invalid or inactive API token" 
          });
        }
        
        userId = apiToken.userId;
        
        // Update last used timestamp (increment signal count)
        await storage.incrementMt5TokenSignalCount(apiToken.id);
      } else if (req.isAuthenticated()) {
        // Fall back to session authentication (for web UI)
        userId = (req.user as Express.User).id;
      } else {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required. Use API token or log in." 
        });
      }
      const { symbol, timeframe, priceData, originalDirection } = req.body;

      // Validation
      if (!symbol || !timeframe || !priceData) {
        return res.status(400).json({ 
          success: false,
          message: "Missing required parameters (symbol, timeframe, priceData)" 
        });
      }

      // SECURITY: Rate limiting - check last refresh time for this user
      // Note: In production, use Redis or database for rate limiting
      const now = Date.now();
      const userRefreshKey = `ea_refresh_${userId}`;
      const globalStore = global as any;
      const lastRefresh = globalStore[userRefreshKey] || 0;
      const minIntervalMs = 60 * 60 * 1000; // 1 hour minimum between refreshes
      
      if (now - lastRefresh < minIntervalMs) {
        const waitMinutes = Math.ceil((minIntervalMs - (now - lastRefresh)) / 60000);
        return res.status(429).json({ 
          success: false,
          message: `Rate limit exceeded. Please wait ${waitMinutes} minutes before next refresh.`
        });
      }

      // Update last refresh time
      globalStore[userRefreshKey] = now;

      // Extract OHLC data from priceData array
      const { currentPrice, high, low, open } = priceData;
      
      console.log(`EA Refresh Request: ${symbol} ${timeframe}, Price: ${currentPrice}`);

      // Fetch news sentiment and economic calendar (non-blocking, with fallbacks)
      let newsSentiment: any = null;
      let upcomingEvents: any[] = [];
      let newsContext = "";
      let highImpactWarning = "";
      
      try {
        // Initialize news service if needed
        if (!newsService.isInitialized()) {
          newsService.initialize();
        }
        
        // Fetch news sentiment (5 days back for relevance)
        const newsItems = await newsService.fetchCompanyNews(symbol, 5);
        if (newsItems.length > 0) {
          newsSentiment = await newsService.analyzeNewsSentiment(newsItems, symbol);
        }
        
        // Fetch upcoming economic events (next 2 days)
        upcomingEvents = await newsService.fetchEconomicCalendar(2);
        
        // Filter for high-impact events in next 2 hours
        const now = new Date();
        const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
        const imminentHighImpact = upcomingEvents.filter(event => {
          const eventTime = new Date(event.datetime || event.time);
          return eventTime >= now && eventTime <= twoHoursFromNow && event.impact === 'high';
        });
        
        // Build news context for AI
        if (newsSentiment) {
          newsContext = `
News Sentiment Analysis:
- Overall Score: ${newsSentiment.overallScore}/100 (${newsSentiment.overallLabel})
- Bullish Headlines: ${newsSentiment.bullishCount || 0}
- Bearish Headlines: ${newsSentiment.bearishCount || 0}
- Trading Implication: ${newsSentiment.tradingImplication || 'Neutral'}`;
        }
        
        if (imminentHighImpact.length > 0) {
          const eventsList = imminentHighImpact.map(e => `${e.event} at ${e.time}`).join(', ');
          highImpactWarning = `HIGH IMPACT NEWS ALERT: ${eventsList}. Consider waiting or reducing position size.`;
          newsContext += `\n\nUPCOMING HIGH-IMPACT EVENTS (next 2 hours): ${eventsList}`;
        }
        
        if (upcomingEvents.length > 0 && imminentHighImpact.length === 0) {
          const nextEvent = upcomingEvents[0];
          newsContext += `\n\nNext Economic Event: ${nextEvent.event} (${nextEvent.impact} impact) at ${nextEvent.time}`;
        }
      } catch (newsError) {
        console.log('News fetch error (non-fatal):', newsError);
        // Continue without news data
      }

      // Call OpenAI for lightweight text-based analysis (no image needed)
      const openai = new (await import('openai')).default({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      });

      const analysisPrompt = `Analyze the current market conditions for ${symbol} on ${timeframe} timeframe.

Current Price Data:
- Open: ${open}
- High: ${high}
- Low: ${low}
- Current: ${currentPrice}
- Original AI Direction: ${originalDirection || 'Not specified'}
${newsContext}

Provide a brief analysis focusing on:
1. Current trend direction (BUY/SELL/NEUTRAL)
2. Confidence level (0-100%) - REDUCE confidence by 10-20% if high-impact news is imminent
3. Any detected patterns or warnings
4. Whether the original direction is still valid
5. If news sentiment contradicts price action, note the conflict

Return ONLY a JSON object with this structure:
{
  "direction": "BUY|SELL|NEUTRAL",
  "confidence": 75,
  "patterns": ["Pattern1", "Pattern2"],
  "directionChanged": true/false,
  "warning": "Optional warning message",
  "recommendation": "Brief trading recommendation",
  "newsAlignment": "aligned|conflicting|neutral",
  "newsImpact": "Description of how news affects this trade"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert forex trading analyst. Provide concise, actionable analysis in strict JSON format."
          },
          {
            role: "user",
            content: analysisPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const analysisText = response.choices[0]?.message?.content || '{}';
      let analysis;
      
      try {
        // Extract JSON from markdown code blocks if present
        const jsonMatch = analysisText.match(/```json\n?([\s\S]*?)\n?```/) || 
                         analysisText.match(/```\n?([\s\S]*?)\n?```/);
        const jsonText = jsonMatch ? jsonMatch[1] : analysisText;
        analysis = JSON.parse(jsonText);
      } catch (parseError) {
        console.error("Error parsing OpenAI response:", parseError);
        analysis = {
          direction: "NEUTRAL",
          confidence: 0,
          patterns: [],
          directionChanged: false,
          warning: "Could not parse AI response",
          recommendation: "Use technical indicators only"
        };
      }

      // Combine AI warning with high-impact news warning (filter empty strings)
      const warnings = [analysis.warning, highImpactWarning].filter(w => w && w.trim().length > 0);
      const combinedWarning = warnings.join(' | ');
      
      // Return the fresh analysis with news context
      // Use mt5-prefixed flat fields for EA compatibility
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        symbol,
        timeframe,
        analysis: {
          direction: analysis.direction || "NEUTRAL",
          confidence: analysis.confidence || 0,
          patterns: analysis.patterns || [],
          directionChanged: analysis.directionChanged || false,
          warning: combinedWarning || "",
          recommendation: analysis.recommendation || "",
          newsAlignment: analysis.newsAlignment || "neutral",
          newsImpact: analysis.newsImpact || ""
        },
        // MT5 EA-friendly flat fields for parsing
        mt5Signal: analysis.direction || "NEUTRAL",
        mt5Confidence: analysis.confidence || 0,
        mt5Trend: analysis.patterns?.[0] || "",
        mt5Patterns: (analysis.patterns || []).join(", "),
        mt5NewsSentiment: newsSentiment?.overallLabel || "",
        mt5NewsScore: newsSentiment?.overallScore || 0,
        mt5NewsAlignment: analysis.newsAlignment || "neutral",
        mt5NewsImpact: analysis.newsImpact || "",
        mt5HighImpactAlert: highImpactWarning || "",
        // Nested data for web UI
        news: newsSentiment ? {
          sentiment: newsSentiment.overallLabel,
          score: newsSentiment.overallScore,
          tradingImplication: newsSentiment.tradingImplication
        } : null,
        upcomingEvents: upcomingEvents.slice(0, 3).map(e => ({
          event: e.event,
          time: e.time,
          impact: e.impact,
          country: e.country
        })),
        highImpactAlert: highImpactWarning || null
      });

      console.log(`EA Refresh Complete: ${symbol} - ${analysis.direction} (${analysis.confidence}%) | News: ${newsSentiment?.overallLabel || 'N/A'}`);

    } catch (error) {
      console.error("EA refresh analysis error:", error);
      res.status(500).json({ 
        success: false,
        message: "Error performing refresh analysis",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // EA Marketplace API Routes
  app.post("/api/save-ea", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const { 
        name, description, platformType, eaCode, symbol, strategyType, isShared, price,
        direction, confidence, entryPoint, stopLoss, takeProfit, chartAnalysisData, multiTimeframeGroupId
      } = req.body;
      
      const userId = (req.user as User).id;
      const ea = await storage.savEA({
        userId,
        name,
        description,
        platformType,
        eaCode,
        symbol,
        strategyType,
        isShared: isShared || false,
        price: price ? Math.round(price * 100) : null,
        direction: direction || null,
        confidence: confidence || null,
        entryPoint: entryPoint || null,
        stopLoss: stopLoss || null,
        takeProfit: takeProfit || null,
        chartAnalysisData: chartAnalysisData || null,
        multiTimeframeGroupId: multiTimeframeGroupId || null
      });
      
      // Track activity for streak
      try {
        await storage.recordActivity(userId, 'ea');
      } catch (streakError) {
        console.error('Error recording streak activity:', streakError);
      }
      
      res.json({ success: true, ea });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save EA" });
    }
  });

  app.get("/api/my-eas", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const eas = await storage.getUserSavedEAs((req.user as User).id);
      res.json(eas);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch EAs" });
    }
  });

  app.get("/api/my-eas/:id", async (req: Request, res: Response) => {
    try {
      const ea = await storage.getSavedEA(parseInt(req.params.id));
      if (!ea) return res.status(404).json({ error: "EA not found" });
      if (req.user && ea.userId !== (req.user as User).id) return res.status(403).json({ error: "Forbidden" });
      
      res.json(ea);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch EA" });
    }
  });

  app.patch("/api/my-eas/:id", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const ea = await storage.getSavedEA(parseInt(req.params.id));
      if (!ea) return res.status(404).json({ error: "EA not found" });
      if (ea.userId !== (req.user as User).id) return res.status(403).json({ error: "Forbidden" });
      
      const updated = await storage.updateSavedEA(parseInt(req.params.id), req.body);
      res.json({ success: true, ea: updated });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update EA" });
    }
  });

  app.delete("/api/my-eas/:id", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const ea = await storage.getSavedEA(parseInt(req.params.id));
      if (!ea) return res.status(404).json({ error: "EA not found" });
      if (ea.userId !== (req.user as User).id) return res.status(403).json({ error: "Forbidden" });
      
      await storage.deleteSavedEA(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete EA" });
    }
  });

  app.post("/api/share-ea/:id", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const ea = await storage.getSavedEA(parseInt(req.params.id));
      if (!ea) return res.status(404).json({ error: "EA not found" });
      if (ea.userId !== (req.user as User).id) return res.status(403).json({ error: "Forbidden" });
      
      const { price } = req.body;
      const priceInCents = Math.round(price * 100);
      const shared = await storage.shareEA(parseInt(req.params.id), priceInCents);
      res.json({ success: true, ea: shared });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to share EA" });
    }
  });

  app.post("/api/unshare-ea/:id", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const ea = await storage.getSavedEA(parseInt(req.params.id));
      if (!ea) return res.status(404).json({ error: "EA not found" });
      if (ea.userId !== (req.user as User).id) return res.status(403).json({ error: "Forbidden" });
      
      const unshared = await storage.unshareEA(parseInt(req.params.id));
      res.json({ success: true, ea: unshared });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to unshare EA" });
    }
  });

  app.get("/api/ea-marketplace", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const eas = await storage.getSharedEAs(limit);
      
      const enriched = await Promise.all(
        eas.map(async (ea) => {
          const creator = await storage.getUser(ea.userId);
          const subscribers = await storage.getCreatorSubscribers(ea.userId);
          return {
            ...ea,
            creator: creator ? { id: creator.id, username: creator.username, fullName: creator.fullName } : null,
            subscriberCount: subscribers.length
          };
        })
      );
      
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch marketplace" });
    }
  });

  app.post("/api/subscribe-to-ea/:eaId", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const ea = await storage.getSavedEA(parseInt(req.params.eaId));
      if (!ea) return res.status(404).json({ error: "EA not found" });
      if (!ea.isShared) return res.status(400).json({ error: "EA not available for subscription" });
      
      const existing = await storage.getEASubscriptionByEAAndUser(parseInt(req.params.eaId), (req.user as User).id);
      if (existing) return res.status(400).json({ error: "Already subscribed to this EA" });
      
      const subscription = await storage.subscribeToEA({
        eaId: parseInt(req.params.eaId),
        creatorId: ea.userId,
        subscriberId: (req.user as User).id,
        status: 'active'
      });
      
      await storage.updateSavedEA(parseInt(req.params.eaId), {
        shareCount: (ea.shareCount || 0) + 1
      });
      
      res.json({ success: true, subscription });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to subscribe" });
    }
  });

  app.get("/api/my-subscriptions", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const subscriptions = await storage.getUserSubscribedEAs((req.user as User).id);
      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch subscriptions" });
    }
  });

  app.get("/api/creator-dashboard", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const userId = (req.user as User).id;
      const eas = await storage.getUserSavedEAs(userId);
      const sharedEAs = eas.filter(ea => ea.isShared);
      
      let totalSubscribers = 0;
      let totalEarnings = 0;
      
      for (const ea of sharedEAs) {
        const subscribers = await storage.getCreatorSubscribers(userId);
        totalSubscribers += subscribers.length;
        if (ea.price) totalEarnings += (ea.price * subscribers.length) / 100;
      }
      
      res.json({
        totalEAs: eas.length,
        sharedEAs: sharedEAs.length,
        totalSubscribers,
        totalEarnings
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch dashboard" });
    }
  });

  // Market Data API endpoints
  app.get("/api/market-data/status", async (req: Request, res: Response) => {
    try {
      const { marketDataService } = await import('./market-data');
      res.json({
        initialized: marketDataService.isInitialized(),
        message: marketDataService.isInitialized() 
          ? 'Market data service is ready' 
          : 'No market data API key configured. Add TWELVE_DATA_API_KEY to use live market data.'
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get status" });
    }
  });

  app.post("/api/market-data/fetch", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const { symbol, timeframe, assetType } = req.body;
      if (!symbol || !timeframe) {
        return res.status(400).json({ error: "Symbol and timeframe are required" });
      }
      
      const { marketDataService } = await import('./market-data');
      if (!marketDataService.isInitialized()) {
        return res.status(503).json({ 
          error: "Market data service not initialized. Please add TWELVE_DATA_API_KEY to secrets." 
        });
      }
      
      const detectedAssetType = assetType || marketDataService.detectAssetType(symbol);
      
      const result = await marketDataService.fetchMarketData({
        symbol,
        timeframe,
        assetType: detectedAssetType,
        limit: 50
      });
      
      await storage.createMarketDataSnapshot({
        symbol,
        assetType: detectedAssetType,
        timeframe,
        provider: result.provider,
        data: result.bars,
        hash: result.hash
      });
      
      res.json({
        success: true,
        symbol,
        timeframe,
        assetType: detectedAssetType,
        provider: result.provider,
        barsCount: result.bars.length,
        fromCache: result.fromCache,
        hash: result.hash
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch market data" });
    }
  });

  // ATR-based stop loss suggestion endpoint
  app.post("/api/market-data/atr", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const { symbol, timeframe = '1d', assetType } = req.body;
      if (!symbol) {
        return res.status(400).json({ error: "Symbol is required" });
      }
      
      const { TwelveDataProvider } = await import('./market-data/providers/twelve-data');
      const apiKey = process.env.TWELVE_DATA_API_KEY;
      
      if (!apiKey) {
        return res.status(503).json({ 
          error: "Market data service not initialized. Please add TWELVE_DATA_API_KEY to secrets.",
          fallback: true
        });
      }
      
      const provider = new TwelveDataProvider(apiKey);
      // Simple asset type detection
      const inferAssetType = (sym: string): 'forex' | 'crypto' | 'stock' | 'index' => {
        const s = sym.toUpperCase();
        const cryptoBases = ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC', 'BNB'];
        if (cryptoBases.some(c => s.includes(c))) return 'crypto';
        const forexPairs = ['EUR', 'GBP', 'USD', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD'];
        const forexCount = forexPairs.filter(c => s.includes(c)).length;
        if (forexCount >= 2 || s.length === 6) return 'forex';
        return 'stock';
      };
      const detectedAssetType = assetType || inferAssetType(symbol);
      
      const atrData = await provider.fetchATR(symbol, detectedAssetType, timeframe);
      
      res.json({
        success: true,
        symbol,
        timeframe,
        assetType: detectedAssetType,
        ...atrData
      });
    } catch (error) {
      console.error('ATR fetch error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch ATR data",
        fallback: true
      });
    }
  });

  app.post("/api/eas/:id/refresh", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const eaId = parseInt(req.params.id);
      const ea = await storage.getSavedEA(eaId);
      if (!ea) return res.status(404).json({ error: "EA not found" });
      if (ea.userId !== (req.user as User).id) return res.status(403).json({ error: "Forbidden" });
      
      const { marketDataService, patternChangeDetector } = await import('./market-data');
      if (!marketDataService.isInitialized()) {
        return res.status(503).json({ 
          error: "Market data service not initialized. Please add TWELVE_DATA_API_KEY to secrets." 
        });
      }
      
      const job = await storage.createRefreshJob({
        eaId,
        status: 'processing',
        triggeredBy: 'manual'
      });
      
      try {
        const symbol = ea.symbol;
        const assetType = marketDataService.detectAssetType(symbol);
        const timeframe = '1h';
        
        const previousSnapshot = await storage.getLatestSnapshot(symbol, timeframe);
        const previousBars = previousSnapshot?.data as any[] || [];
        
        const result = await marketDataService.fetchMarketData({
          symbol,
          timeframe,
          assetType,
          limit: 50
        });
        
        let patternChange = null;
        let aiReanalysisTriggered = false;
        let reanalysisResult: any = null;
        
        if (previousBars.length > 0) {
          // Use EA's configured thresholds or defaults
          const thresholds = {
            volatility: ea.refreshVolatilityThreshold ?? 30,
            atr: ea.refreshAtrThreshold ?? 20,
            price: ea.refreshPriceThreshold ?? 2
          };
          patternChange = patternChangeDetector.compareSnapshots(previousBars, result.bars, thresholds);
          aiReanalysisTriggered = patternChange.hasSignificantChange;
        }
        
        await storage.createMarketDataSnapshot({
          symbol,
          assetType,
          timeframe,
          provider: result.provider,
          data: result.bars,
          hash: result.hash
        });
        
        // If significant change detected, run AI re-analysis
        if (aiReanalysisTriggered) {
          console.log(`Significant change detected for ${symbol} - triggering AI re-analysis...`);
          
          const previousDirection = ea.direction || 'NEUTRAL';
          const previousPatterns = ea.patterns || [];
          
          // Build market context from new data
          const latestBars = result.bars.slice(-10);
          const marketContext = latestBars.map((bar: any) => 
            `${bar.datetime}: O=${bar.open} H=${bar.high} L=${bar.low} C=${bar.close} V=${bar.volume || 0}`
          ).join('\n');
          
          const reanalysisPrompt = `You are analyzing the ${symbol} market for a trading EA.

PREVIOUS ANALYSIS:
- Direction: ${previousDirection}
- Patterns: ${Array.isArray(previousPatterns) ? previousPatterns.join(', ') : previousPatterns}
- Entry: ${ea.entryPoint || 'N/A'}
- Stop Loss: ${ea.stopLoss || 'N/A'}
- Take Profit: ${ea.takeProfit || 'N/A'}

CHANGE DETECTED: ${patternChange?.details || 'Market conditions changed'}

LATEST MARKET DATA (${timeframe}):
${marketContext}

Analyze if the market direction has changed. Respond with ONLY valid JSON:
{
  "newDirection": "BUY|SELL|NEUTRAL",
  "confidence": 0-100,
  "directionChanged": true|false,
  "newPatterns": ["pattern1", "pattern2"],
  "newEntryPrice": "price or N/A",
  "newStopLoss": "price or N/A", 
  "newTakeProfit": "price or N/A",
  "changeReason": "Brief explanation of what changed",
  "recommendation": "What the trader should do now"
}`;

          try {
            const OpenAI = (await import('openai')).default;
            const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            
            const aiResponse = await openaiClient.chat.completions.create({
              model: "gpt-4o",
              messages: [
                { role: "system", content: "You are an expert forex trading analyst. Provide analysis in strict JSON format only." },
                { role: "user", content: reanalysisPrompt }
              ],
              max_tokens: 500,
              temperature: 0.3
            });
            
            const content = aiResponse.choices[0]?.message?.content || "";
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
              reanalysisResult = JSON.parse(jsonMatch[0]);
              
              // Update EA with new analysis if direction changed
              if (reanalysisResult.directionChanged) {
                console.log(`Direction change confirmed: ${previousDirection} → ${reanalysisResult.newDirection}`);
                
                // Regenerate EA code with new direction and levels
                const { generateMT5EACode, generateTradingViewCode, generateTradeLockerCode } = await import('./ea-generators');
                
                // Use stored chartAnalysisData if available, otherwise construct from EA fields
                const storedAnalyses = ea.chartAnalysisData as any[] || [];
                const updatedTimeframeData = storedAnalyses.length > 0 
                  ? storedAnalyses.map((analysis: any, index: number) => ({
                      timeframe: analysis.timeframe || (index === 0 ? 'H1' : index === 1 ? 'H4' : 'D1'),
                      analysis: {
                        ...analysis,
                        // Override with new reanalysis values
                        direction: reanalysisResult.newDirection,
                        confidence: String(reanalysisResult.confidence),
                        trend: reanalysisResult.newDirection === 'BUY' ? 'Bullish' : 'Bearish',
                        entryPoint: reanalysisResult.newEntryPrice || analysis.entryPoint || ea.entryPoint,
                        stopLoss: reanalysisResult.newStopLoss || analysis.stopLoss || ea.stopLoss,
                        takeProfit: reanalysisResult.newTakeProfit || analysis.takeProfit || ea.takeProfit,
                        patterns: reanalysisResult.newPatterns || analysis.patterns || [],
                        atrStopLoss: { 
                          recommended: reanalysisResult.newStopLoss || ea.stopLoss, 
                          multiplier: 1.5 
                        }
                      }
                    }))
                  : [{
                      timeframe: 'H1',
                      analysis: {
                        direction: reanalysisResult.newDirection,
                        confidence: String(reanalysisResult.confidence),
                        trend: reanalysisResult.newDirection === 'BUY' ? 'Bullish' : 'Bearish',
                        entryPoint: reanalysisResult.newEntryPrice || ea.entryPoint,
                        stopLoss: reanalysisResult.newStopLoss || ea.stopLoss,
                        takeProfit: reanalysisResult.newTakeProfit || ea.takeProfit,
                        patterns: reanalysisResult.newPatterns || [],
                        indicators: [],
                        supportResistance: [],
                        atrStopLoss: { recommended: reanalysisResult.newStopLoss || ea.stopLoss, multiplier: 1.5 }
                      }
                    }];
                
                let regeneratedCode = '';
                const eaConfig = {
                  eaName: ea.name,
                  strategyType: ea.strategyType || 'day_trading',
                  chartDate: new Date().toISOString().split('T')[0],
                  validityDays: 30
                };
                
                try {
                  if (ea.platformType === 'MT5') {
                    regeneratedCode = generateMT5EACode(symbol, updatedTimeframeData, eaConfig);
                  } else if (ea.platformType === 'TradingView') {
                    regeneratedCode = generateTradingViewCode(symbol, updatedTimeframeData, eaConfig);
                  } else if (ea.platformType === 'TradeLocker') {
                    regeneratedCode = generateTradeLockerCode(symbol, updatedTimeframeData, eaConfig);
                  }
                  
                  console.log(`EA code regenerated for ${ea.name} (${ea.platformType})`);
                } catch (codeGenError) {
                  console.error('Failed to regenerate EA code:', codeGenError);
                }
                
                // Update EA with new signals and regenerated code
                const updatedPatterns = reanalysisResult.newPatterns || (storedAnalyses[0]?.patterns);
                await storage.updateSavedEA(eaId, {
                  direction: reanalysisResult.newDirection,
                  confidence: String(reanalysisResult.confidence),
                  entryPoint: reanalysisResult.newEntryPrice || ea.entryPoint,
                  stopLoss: reanalysisResult.newStopLoss || ea.stopLoss,
                  takeProfit: reanalysisResult.newTakeProfit || ea.takeProfit,
                  ...(updatedPatterns ? { chartAnalysisData: storedAnalyses.map((a: any) => ({ ...a, patterns: updatedPatterns })) } : {}),
                  ...(regeneratedCode ? { eaCode: regeneratedCode } : {})
                });
                
                // Trigger webhooks if user has direction change webhooks enabled
                const webhooks = await storage.getUserWebhooks((req.user as User).id);
                const directionChangeWebhooks = webhooks.filter((w) => {
                  const triggers = w.triggerOn as string[];
                  return w.enabled && triggers?.includes('direction_change');
                });
                
                for (const webhook of directionChangeWebhooks) {
                  try {
                    const payload = {
                      event: 'direction_change',
                      symbol,
                      previousDirection,
                      newDirection: reanalysisResult.newDirection,
                      confidence: reanalysisResult.confidence,
                      changeReason: reanalysisResult.changeReason,
                      recommendation: reanalysisResult.recommendation,
                      timestamp: new Date().toISOString()
                    };
                    
                    await fetch(webhook.url, {
                      method: 'POST',
                      headers: { 
                        'Content-Type': 'application/json',
                        ...(webhook.secretKey ? { 'X-Webhook-Secret': webhook.secretKey } : {})
                      },
                      body: JSON.stringify(payload)
                    });
                    
                    await storage.logWebhookCall({
                      webhookId: webhook.id,
                      userId: (req.user as User).id,
                      triggerType: 'direction_change',
                      status: 'success',
                      payload,
                      responseStatus: 200,
                      responseBody: 'Direction change notification sent'
                    });
                  } catch (webhookError) {
                    console.error(`Webhook ${webhook.id} failed:`, webhookError);
                    await storage.logWebhookCall({
                      webhookId: webhook.id,
                      userId: (req.user as User).id,
                      triggerType: 'direction_change',
                      status: 'failed',
                      payload,
                      errorMessage: webhookError instanceof Error ? webhookError.message : 'Unknown error'
                    });
                  }
                }
              }
            }
          } catch (aiError) {
            console.error("AI re-analysis failed:", aiError);
            reanalysisResult = { error: "AI analysis failed", details: String(aiError) };
          }
        }
        
        await storage.updateRefreshJob(job.id, {
          status: 'completed',
          changeSummary: reanalysisResult?.directionChanged 
            ? { 
                ...patternChange, 
                previousDirection: ea.direction,
                newDirection: reanalysisResult.newDirection,
                newEntryPrice: reanalysisResult.newEntryPrice,
                newStopLoss: reanalysisResult.newStopLoss,
                newTakeProfit: reanalysisResult.newTakeProfit,
                changeReason: reanalysisResult.changeReason,
                recommendation: reanalysisResult.recommendation,
                codeRegenerated: true
              } 
            : patternChange,
          newDirection: reanalysisResult?.newDirection || null,
          newConfidence: reanalysisResult?.confidence ? String(reanalysisResult.confidence) : null,
          completedAt: new Date()
        });
        
        // Determine if AI reanalysis succeeded
        const aiReanalysisSucceeded = aiReanalysisTriggered && reanalysisResult && !reanalysisResult.error;
        
        res.json({
          success: true,
          eaId,
          symbol,
          patternChange,
          aiReanalysisTriggered,
          aiReanalysisSucceeded,
          reanalysisResult: aiReanalysisSucceeded ? reanalysisResult : null,
          aiError: reanalysisResult?.error ? reanalysisResult : null,
          message: reanalysisResult?.error 
            ? 'Market change detected but AI re-analysis failed. Please try again.'
            : patternChange?.hasSignificantChange 
              ? reanalysisResult?.directionChanged 
                ? `Direction change detected: ${ea.direction} → ${reanalysisResult.newDirection}. ${reanalysisResult.changeReason}`
                : `Market change detected but direction unchanged: ${patternChange.details}` 
              : 'No significant pattern changes detected'
        });
      } catch (error) {
        await storage.updateRefreshJob(job.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
          completedAt: new Date()
        });
        throw error;
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to refresh EA" });
    }
  });

  app.get("/api/eas/:id/refresh-history", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const eaId = parseInt(req.params.id);
      const ea = await storage.getSavedEA(eaId);
      if (!ea) return res.status(404).json({ error: "EA not found" });
      if (ea.userId !== (req.user as User).id) return res.status(403).json({ error: "Forbidden" });
      
      const jobs = await storage.getRefreshJobsByEA(eaId);
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get refresh history" });
    }
  });

  app.post("/api/eas/:id/share-card", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const eaId = parseInt(req.params.id);
      const ea = await storage.getSavedEA(eaId);
      if (!ea) return res.status(404).json({ error: "EA not found" });
      if (ea.userId !== (req.user as User).id) return res.status(403).json({ error: "Forbidden" });
      
      const user = req.user as User;
      let { chartAnalyses, unifiedSignal } = req.body;
      
      let chartImagePath: string | undefined;
      
      if (!chartAnalyses || chartAnalyses.length === 0) {
        if (ea.chartAnalysisData && Array.isArray(ea.chartAnalysisData) && ea.chartAnalysisData.length > 0) {
          chartAnalyses = ea.chartAnalysisData;
          
          if (ea.direction && ea.confidence) {
            unifiedSignal = {
              direction: ea.direction,
              confidence: parseInt(ea.confidence) || 50,
              entryPrice: ea.entryPoint || 'N/A',
              stopLoss: ea.stopLoss || 'N/A',
              takeProfit: ea.takeProfit || 'N/A',
              riskReward: '1:2'
            };
          }
        } else {
          const userAnalyses = await storage.getChartAnalysesByUserId(user.id);
          const symbolAnalyses = userAnalyses
            .filter((a: any) => a.symbol?.toLowerCase() === ea.symbol.toLowerCase())
            .slice(0, 6);
          
          if (symbolAnalyses.length > 0 && symbolAnalyses[0].imageUrl) {
            chartImagePath = symbolAnalyses[0].imageUrl;
          }
          
          chartAnalyses = symbolAnalyses.map((a: any) => ({
            timeframe: a.timeframe || '1H',
            direction: a.direction,
            confidence: a.confidence,
            patterns: Array.isArray(a.patterns) ? a.patterns.map((p: any) => p.name || p) : [],
            entryPoint: a.entryPoint,
            stopLoss: a.stopLoss,
            takeProfit: a.takeProfit,
            trend: a.trend,
            currentPrice: a.price,
            riskRewardRatio: a.riskRewardRatio,
            potentialPips: a.potentialPips,
            volatilityScore: 50,
            recommendation: a.recommendation,
            supportResistance: Array.isArray(a.supportResistance) ? a.supportResistance.slice(0, 4) : [],
            chartImagePath: a.imageUrl
          }));

          if (chartAnalyses.length > 0) {
            const buyCount = chartAnalyses.filter((a: any) => 
              a.direction.toUpperCase() === 'BUY' || a.direction.toUpperCase() === 'BULLISH'
            ).length;
            const sellCount = chartAnalyses.filter((a: any) => 
              a.direction.toUpperCase() === 'SELL' || a.direction.toUpperCase() === 'BEARISH'
            ).length;
            const avgConfidence = Math.round(
              chartAnalyses.reduce((sum: number, a: any) => sum + parseInt(a.confidence) || 0, 0) / chartAnalyses.length
            );
            
            unifiedSignal = {
              direction: buyCount > sellCount ? 'BUY' : sellCount > buyCount ? 'SELL' : 'NEUTRAL',
              confidence: avgConfidence,
              entryPrice: chartAnalyses[0]?.entryPoint || 'N/A',
              stopLoss: chartAnalyses[0]?.stopLoss || 'N/A',
              takeProfit: chartAnalyses[0]?.takeProfit || 'N/A',
              riskReward: chartAnalyses[0]?.riskRewardRatio || '1:2'
            };
          }
        }
      }
      
      const { generateShareCard } = await import('./share-card-service');
      const { getDailyScripture } = await import('./scripture-helper');
      
      let newsSentiment = undefined;
      try {
        const news = await newsService.fetchCompanyNews(ea.symbol, 3);
        if (news.length > 0) {
          const sentiment = await newsService.analyzeNewsSentiment(news, ea.symbol);
          newsSentiment = {
            overallScore: sentiment.overallScore,
            overallLabel: sentiment.overallLabel,
            bullishCount: sentiment.bullishCount,
            bearishCount: sentiment.bearishCount,
            neutralCount: sentiment.neutralCount,
            totalArticles: sentiment.totalArticles,
            tradingImplication: sentiment.tradingImplication
          };
        }
      } catch (newsError) {
        console.log('Could not fetch news sentiment for share card:', newsError);
      }
      
      const shareCardBuffer = await generateShareCard({
        eaName: ea.name,
        symbol: ea.symbol,
        platformType: ea.platformType,
        chartAnalyses: chartAnalyses || [],
        unifiedSignal: unifiedSignal || null,
        creatorName: user.username,
        newsSentiment,
        chartImagePath
      });
      
      const shareId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
      const shareCardFileName = `share-card-${shareId}.png`;
      const shareCardPath = path.join(process.cwd(), 'uploads', 'share-cards');
      
      if (!fs.existsSync(shareCardPath)) {
        fs.mkdirSync(shareCardPath, { recursive: true });
      }
      
      const fullPath = path.join(shareCardPath, shareCardFileName);
      fs.writeFileSync(fullPath, shareCardBuffer);
      
      const shareCardUrl = `/uploads/share-cards/${shareCardFileName}`;
      const shareUrl = `share-${shareId}`;
      
      const devotion = getDailyScripture();
      const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
      
      const shareAsset = await storage.createEAShareAsset({
        eaId,
        userId: user.id,
        shareCardUrl,
        chartAnalyses: chartAnalyses || [],
        unifiedSignal: unifiedSignal || null,
        devotionId: dayOfYear % 15,
        devotionVerse: devotion.verse,
        devotionReference: devotion.reference,
        devotionWisdom: devotion.tradingWisdom,
        shareUrl
      });
      
      res.json({
        success: true,
        shareAsset,
        shareCardUrl,
        shareUrl: `/share/${shareUrl}`,
        socialShareUrls: {
          twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out my ${ea.symbol} trading analysis from VEDD AI!`)}&url=${encodeURIComponent(`${req.protocol}://${req.get('host')}/share/${shareUrl}`)}`,
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${req.protocol}://${req.get('host')}/share/${shareUrl}`)}`,
          linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${req.protocol}://${req.get('host')}/share/${shareUrl}`)}`,
          whatsapp: `https://wa.me/?text=${encodeURIComponent(`Check out my ${ea.symbol} trading analysis from VEDD AI! ${req.protocol}://${req.get('host')}/share/${shareUrl}`)}`
        }
      });
    } catch (error) {
      console.error('Share card generation error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate share card" });
    }
  });

  app.get("/api/eas/:id/share-card", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      
      const eaId = parseInt(req.params.id);
      const shareAsset = await storage.getEAShareAsset(eaId);
      
      if (!shareAsset) {
        return res.status(404).json({ error: "Share card not found" });
      }
      
      res.json(shareAsset);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get share card" });
    }
  });

  app.get("/api/share/:shareUrl", async (req: Request, res: Response) => {
    try {
      const { shareUrl } = req.params;
      const shareAsset = await storage.getEAShareAssetByShareUrl(shareUrl);
      
      if (!shareAsset) {
        return res.status(404).json({ error: "Share not found" });
      }
      
      await storage.incrementShareAssetViewCount(shareAsset.id);
      
      const ea = await storage.getSavedEA(shareAsset.eaId);
      const user = ea ? await storage.getUser(ea.userId) : null;
      
      res.json({
        shareAsset,
        ea: ea ? { name: ea.name, symbol: ea.symbol, platformType: ea.platformType } : null,
        creatorName: user?.username || 'Anonymous'
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get shared analysis" });
    }
  });

  app.post("/api/share/:shareUrl/track", async (req: Request, res: Response) => {
    try {
      const { shareUrl } = req.params;
      const { platform } = req.body;
      
      const shareAsset = await storage.getEAShareAssetByShareUrl(shareUrl);
      if (!shareAsset) {
        return res.status(404).json({ error: "Share not found" });
      }
      
      await storage.incrementShareAssetShareCount(shareAsset.id);
      res.json({ success: true, platform });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to track share" });
    }
  });

  // News API endpoints
  app.get("/api/news/symbol/:symbol", async (req: Request, res: Response) => {
    try {
      const { symbol } = req.params;
      const daysBack = parseInt(req.query.days as string) || 7;
      
      const news = await newsService.fetchCompanyNews(symbol, daysBack);
      const sentiment = await newsService.analyzeNewsSentiment(news, symbol);
      
      res.json({ news, sentiment });
    } catch (error) {
      console.error('Error fetching news:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch news" });
    }
  });

  // Pair-specific news for Forex - analyzes BOTH currencies
  app.get("/api/news/pair/:symbol", async (req: Request, res: Response) => {
    try {
      const { symbol } = req.params;
      const daysBack = parseInt(req.query.days as string) || 7;
      
      const { baseNews, quoteNews, combined } = await newsService.fetchPairSpecificNews(symbol, daysBack);
      const sentiment = await newsService.analyzePairSentiment(symbol, daysBack);
      
      const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z]/g, '');
      const baseCurrency = cleanSymbol.slice(0, 3);
      const quoteCurrency = cleanSymbol.slice(3, 6);
      
      res.json({ 
        news: combined,
        baseNews,
        quoteNews,
        baseCurrency,
        quoteCurrency,
        sentiment,
        pairAnalysis: {
          baseImpact: sentiment.baseImpact,
          quoteImpact: sentiment.quoteImpact,
          pairDirection: sentiment.pairDirection
        }
      });
    } catch (error) {
      console.error('Error fetching pair news:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch pair news" });
    }
  });

  app.get("/api/news/market", async (req: Request, res: Response) => {
    try {
      const category = (req.query.category as string) || 'general';
      
      const news = await newsService.fetchMarketNews(category);
      const sentiment = await newsService.analyzeNewsSentiment(news, 'market');
      
      res.json({ news, sentiment });
    } catch (error) {
      console.error('Error fetching market news:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch market news" });
    }
  });

  app.post("/api/news/analyze-sentiment", async (req: Request, res: Response) => {
    try {
      const { symbol } = req.body;
      
      if (!symbol) {
        return res.status(400).json({ error: "Symbol is required" });
      }
      
      // Use pair-specific analysis for Forex pairs
      const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z]/g, '');
      const isForexPair = cleanSymbol.length === 6;
      
      if (isForexPair) {
        const sentiment = await newsService.analyzePairSentiment(symbol, 3);
        const baseCurrency = cleanSymbol.slice(0, 3);
        const quoteCurrency = cleanSymbol.slice(3, 6);
        
        res.json({
          symbol,
          baseCurrency,
          quoteCurrency,
          sentiment,
          pairAnalysis: {
            baseImpact: sentiment.baseImpact,
            quoteImpact: sentiment.quoteImpact,
            pairDirection: sentiment.pairDirection
          },
          tradingSignal: {
            direction: sentiment.overallLabel === 'bullish' ? 'BUY' : 
                       sentiment.overallLabel === 'bearish' ? 'SELL' : 'NEUTRAL',
            confidence: Math.abs(sentiment.overallScore),
            reason: sentiment.pairDirection
          }
        });
      } else {
        const news = await newsService.fetchCompanyNews(symbol, 3);
        const sentiment = await newsService.analyzeNewsSentiment(news, symbol);
        
        res.json({
          symbol,
          sentiment,
          tradingSignal: {
            direction: sentiment.overallLabel === 'bullish' ? 'BUY' : 
                       sentiment.overallLabel === 'bearish' ? 'SELL' : 'NEUTRAL',
            confidence: Math.abs(sentiment.overallScore),
            reason: sentiment.tradingImplication
          }
        });
      }
    } catch (error) {
      console.error('Error analyzing news sentiment:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to analyze sentiment" });
    }
  });

  // Trading timing analysis - compares news with chart patterns
  app.post("/api/news/trading-timing", async (req: Request, res: Response) => {
    try {
      const { symbol, chartDirection, chartConfidence } = req.body;
      
      if (!symbol) {
        return res.status(400).json({ error: "Symbol is required" });
      }
      
      const direction = (chartDirection || 'NEUTRAL').toUpperCase() as 'BUY' | 'SELL' | 'NEUTRAL';
      const confidence = typeof chartConfidence === 'number' ? chartConfidence : 50;
      
      const timingAnalysis = await newsService.analyzeTradingTiming(symbol, direction, confidence);
      
      res.json({
        symbol,
        chartDirection: direction,
        chartConfidence: confidence,
        ...timingAnalysis
      });
    } catch (error) {
      console.error('Error analyzing trading timing:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to analyze trading timing" });
    }
  });

  // Get news with individual article sentiments
  app.get("/api/news/analyzed/:symbol", async (req: Request, res: Response) => {
    try {
      const { symbol } = req.params;
      const daysBack = parseInt(req.query.days as string) || 7;
      
      const { combined } = await newsService.fetchPairSpecificNews(symbol, daysBack);
      const analyzedNews = await newsService.analyzeIndividualArticles(combined, symbol);
      
      const bullishNews = analyzedNews.filter(n => n.sentiment.label === 'bullish');
      const bearishNews = analyzedNews.filter(n => n.sentiment.label === 'bearish');
      const neutralNews = analyzedNews.filter(n => n.sentiment.label === 'neutral');
      
      res.json({
        symbol,
        totalArticles: analyzedNews.length,
        bullishCount: bullishNews.length,
        bearishCount: bearishNews.length,
        neutralCount: neutralNews.length,
        articles: analyzedNews,
        bullishNews,
        bearishNews,
        neutralNews
      });
    } catch (error) {
      console.error('Error fetching analyzed news:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch analyzed news" });
    }
  });

  // News alerts endpoint for MT5 chart data page (polling)
  app.get("/api/news/alerts/:symbol", async (req: Request, res: Response) => {
    try {
      const { symbol } = req.params;
      if (!newsService.isInitialized()) {
        newsService.initialize();
      }
      
      const [pairSentiment, upcomingEvents] = await Promise.all([
        newsService.analyzePairSentiment(symbol, 3),
        newsService.getUpcomingEventsForPair(symbol, 3)
      ]);
      
      const now = Date.now();
      const imminentEvents = upcomingEvents.filter((e: any) => {
        const msUntil = e.datetime - now;
        return msUntil > 0 && msUntil <= 3600000;
      });
      const todayHighImpact = upcomingEvents.filter((e: any) => e.daysUntil === 0 && e.impact === 'high');
      
      res.json({
        sentiment: {
          label: pairSentiment.overallLabel,
          score: pairSentiment.overallScore,
          bullishCount: pairSentiment.bullishCount,
          bearishCount: pairSentiment.bearishCount,
          tradingImplication: pairSentiment.tradingImplication,
          pairDirection: (pairSentiment as any).pairDirection || null,
        },
        topHeadlines: (pairSentiment.topHeadlines || []).slice(0, 5),
        upcomingEvents: upcomingEvents.slice(0, 8),
        imminentEvents,
        todayHighImpact,
        hasImminentNews: imminentEvents.length > 0,
        hasTodayHighImpact: todayHighImpact.length > 0,
      });
    } catch (error) {
      console.error('Error fetching news alerts:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch news alerts" });
    }
  });

  // ========== What If Scenario Analysis API ==========
  
  // Analyze a "What If" scenario using AI
  app.post("/api/scenario-analysis", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = (req.user as User).id;
      const { 
        symbol, 
        currentPrice, 
        scenarioType, 
        scenarioParams,
        chartAnalysisId 
      } = req.body;
      
      if (!symbol || !currentPrice || !scenarioType || !scenarioParams) {
        return res.status(400).json({ error: "Missing required fields: symbol, currentPrice, scenarioType, scenarioParams" });
      }
      
      const validScenarioTypes = ['price_target', 'stop_loss', 'news_impact', 'timeframe', 'market_condition', 'custom'];
      if (!validScenarioTypes.includes(scenarioType)) {
        return res.status(400).json({ error: `Invalid scenarioType. Must be one of: ${validScenarioTypes.join(', ')}` });
      }
      
      // Import OpenAI
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      // Build the AI prompt based on scenario type
      let scenarioPrompt = '';
      
      switch (scenarioType) {
        case 'price_target':
          scenarioPrompt = `Analyze a "What If" scenario for ${symbol} trading at ${currentPrice}.
            The trader is considering: Entry at ${scenarioParams.entryPrice || currentPrice}, 
            Stop Loss at ${scenarioParams.stopLoss || 'not specified'}, 
            Take Profit at ${scenarioParams.takeProfit || 'not specified'}.
            Position size: ${scenarioParams.positionSize || 'standard lot'}.
            Analyze the probability of each outcome and provide risk assessment.`;
          break;
          
        case 'stop_loss':
          scenarioPrompt = `Analyze stop loss placement for ${symbol} at ${currentPrice}.
            Proposed stop loss levels to compare: ${JSON.stringify(scenarioParams.stopLossLevels || [])}.
            Current trend: ${scenarioParams.trend || 'unknown'}.
            Volatility context: ${scenarioParams.volatility || 'normal'}.
            Evaluate each stop loss level for probability of being hit vs optimal protection.`;
          break;
          
        case 'news_impact':
          scenarioPrompt = `Analyze potential news impact scenarios for ${symbol} at ${currentPrice}.
            News type: ${scenarioParams.newsType || 'economic data'}.
            Expected outcome scenarios: bullish surprise, as expected, bearish surprise.
            Historical volatility context: ${scenarioParams.historicalVolatility || 'normal'}.
            Analyze each outcome probability and expected price movement.`;
          break;
          
        case 'timeframe':
          scenarioPrompt = `Analyze different timeframe outcomes for ${symbol} at ${currentPrice}.
            Short-term (1-4 hours): ${scenarioParams.shortTermBias || 'analyze'}.
            Medium-term (1-5 days): ${scenarioParams.mediumTermBias || 'analyze'}.
            Long-term (1-4 weeks): ${scenarioParams.longTermBias || 'analyze'}.
            Current position type: ${scenarioParams.positionType || 'swing trade'}.
            Analyze probability of success in each timeframe.`;
          break;
          
        case 'market_condition':
          scenarioPrompt = `Analyze market condition scenarios for ${symbol} at ${currentPrice}.
            Current identified patterns: ${JSON.stringify(scenarioParams.patterns || [])}.
            If market becomes: Trending strongly ${scenarioParams.trendDirection || 'bullish'}.
            If market becomes: Ranging/Consolidating.
            If market becomes: Highly volatile.
            If market reverses: ${scenarioParams.reversalScenario || 'sudden reversal'}.
            Analyze each condition's impact on the trade.`;
          break;
          
        case 'custom':
          scenarioPrompt = `Analyze a custom "What If" scenario for ${symbol} at ${currentPrice}.
            Scenario description: ${scenarioParams.description || 'Custom analysis requested'}.
            Key variables: ${JSON.stringify(scenarioParams.variables || {})}.
            Trader's hypothesis: ${scenarioParams.hypothesis || 'not specified'}.
            Provide comprehensive analysis of outcomes and probabilities.`;
          break;
      }
      
      // Call OpenAI for analysis
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert trading analyst specializing in scenario analysis. 
            Analyze trading scenarios and provide probability assessments for different outcomes.
            Always respond with valid JSON containing:
            {
              "outcomes": [
                { "scenario": "description", "probability": 0-100, "priceTarget": "price", "reasoning": "explanation" }
              ],
              "recommendation": "overall recommendation",
              "riskAssessment": "low/medium/high with explanation",
              "profitPotential": "description of profit potential",
              "bestCase": { "scenario": "description", "probability": number, "potentialGain": "amount/percentage" },
              "worstCase": { "scenario": "description", "probability": number, "potentialLoss": "amount/percentage" },
              "mostLikely": { "scenario": "description", "probability": number, "expectedOutcome": "description" }
            }
            Be realistic and data-driven. Never guarantee outcomes.`
          },
          {
            role: "user",
            content: scenarioPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 1500
      });
      
      const analysisResult = JSON.parse(completion.choices[0].message.content || '{}');
      
      // Store the scenario analysis
      const scenarioAnalysis = await storage.createScenarioAnalysis({
        userId,
        chartAnalysisId: chartAnalysisId || null,
        symbol,
        currentPrice,
        scenarioType,
        scenarioParams,
        outcomes: analysisResult.outcomes || [],
        recommendation: analysisResult.recommendation,
        riskAssessment: analysisResult.riskAssessment,
        profitPotential: analysisResult.profitPotential,
        bestCase: analysisResult.bestCase,
        worstCase: analysisResult.worstCase,
        mostLikely: analysisResult.mostLikely
      });
      
      res.json({
        success: true,
        id: scenarioAnalysis.id,
        ...analysisResult
      });
      
    } catch (error) {
      console.error('Scenario analysis error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to analyze scenario" });
    }
  });
  
  // Get user's scenario analyses
  app.get("/api/scenario-analysis", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = (req.user as User).id;
      const scenarios = await storage.getUserScenarioAnalyses(userId);
      
      res.json(scenarios);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch scenarios" });
    }
  });
  
  // Get specific scenario analysis
  app.get("/api/scenario-analysis/:id", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const scenario = await storage.getScenarioAnalysis(parseInt(req.params.id));
      
      if (!scenario) {
        return res.status(404).json({ error: "Scenario not found" });
      }
      
      if (scenario.userId !== (req.user as User).id) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(scenario);
    } catch (error) {
      console.error('Error fetching scenario:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch scenario" });
    }
  });
  
  // Get scenarios for a specific chart analysis
  app.get("/api/chart-analysis/:id/scenarios", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const scenarios = await storage.getScenariosByChartAnalysis(parseInt(req.params.id));
      
      res.json(scenarios);
    } catch (error) {
      console.error('Error fetching chart scenarios:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch scenarios" });
    }
  });

  // ============= WEBHOOK SIGNAL SYSTEM =============
  
  // Get all user webhooks
  app.get("/api/webhooks", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = (req.user as User).id;
      const webhooks = await storage.getUserWebhooks(userId);
      
      res.json(webhooks);
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch webhooks" });
    }
  });
  
  // Create a new webhook
  app.post("/api/webhooks", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = (req.user as User).id;
      const validatedData = insertWebhookConfigSchema.parse({
        ...req.body,
        userId
      });
      
      const webhook = await storage.createWebhook(validatedData);
      
      res.status(201).json(webhook);
    } catch (error) {
      console.error('Error creating webhook:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create webhook" });
    }
  });
  
  // Update a webhook
  app.patch("/api/webhooks/:id", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const webhookId = parseInt(req.params.id);
      const userId = (req.user as User).id;
      
      const existing = await storage.getWebhook(webhookId);
      if (!existing) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const updated = await storage.updateWebhook(webhookId, req.body);
      
      res.json(updated);
    } catch (error) {
      console.error('Error updating webhook:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update webhook" });
    }
  });
  
  // Delete a webhook
  app.delete("/api/webhooks/:id", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const webhookId = parseInt(req.params.id);
      const userId = (req.user as User).id;
      
      const existing = await storage.getWebhook(webhookId);
      if (!existing) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.deleteWebhook(webhookId);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting webhook:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete webhook" });
    }
  });
  
  // Get webhook logs
  app.get("/api/webhooks/:id/logs", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const webhookId = parseInt(req.params.id);
      const userId = (req.user as User).id;
      
      const existing = await storage.getWebhook(webhookId);
      if (!existing) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      if (existing.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const logs = await storage.getWebhookLogs(webhookId);
      
      res.json(logs);
    } catch (error) {
      console.error('Error fetching webhook logs:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch logs" });
    }
  });
  
  // Test webhook - send a test signal
  app.post("/api/webhooks/:id/test", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const webhookId = parseInt(req.params.id);
      const userId = (req.user as User).id;
      
      const webhook = await storage.getWebhook(webhookId);
      if (!webhook) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      if (webhook.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Send test payload
      const testPayload = {
        type: 'test',
        source: 'VEDD AI',
        timestamp: new Date().toISOString(),
        signal: {
          symbol: 'EUR/USD',
          direction: 'BUY',
          confidence: 'HIGH',
          entryPrice: '1.0850',
          stopLoss: '1.0820',
          takeProfit: '1.0900',
          message: 'This is a test signal from VEDD AI'
        }
      };
      
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        
        if (webhook.headers) {
          Object.assign(headers, webhook.headers);
        }
        
        if (webhook.secretKey) {
          headers['X-Webhook-Secret'] = webhook.secretKey;
        }
        
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(testPayload),
        });
        
        const responseText = await response.text();
        
        // Log the webhook call
        await storage.logWebhookCall({
          webhookId,
          userId,
          triggerType: 'test',
          payload: testPayload,
          responseStatus: response.status,
          responseBody: responseText.substring(0, 1000),
          status: response.ok ? 'success' : 'failed',
          errorMessage: response.ok ? null : `HTTP ${response.status}`
        });
        
        // Update webhook status
        await storage.updateWebhook(webhookId, {
          lastTriggeredAt: new Date(),
          lastStatus: response.ok ? 'success' : 'failed',
          failureCount: response.ok ? 0 : (webhook.failureCount + 1)
        });
        
        res.json({
          success: response.ok,
          status: response.status,
          message: response.ok ? 'Test signal sent successfully' : 'Webhook returned an error',
          response: responseText.substring(0, 500)
        });
      } catch (fetchError) {
        // Log the failed call
        await storage.logWebhookCall({
          webhookId,
          userId,
          triggerType: 'test',
          payload: testPayload,
          responseStatus: null,
          responseBody: null,
          status: 'failed',
          errorMessage: fetchError instanceof Error ? fetchError.message : 'Connection failed'
        });
        
        await storage.updateWebhook(webhookId, {
          lastTriggeredAt: new Date(),
          lastStatus: 'failed',
          failureCount: webhook.failureCount + 1
        });
        
        res.json({
          success: false,
          status: 0,
          message: 'Failed to connect to webhook endpoint',
          error: fetchError instanceof Error ? fetchError.message : 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Error testing webhook:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to test webhook" });
    }
  });
  
  // Manual trigger - send a trading signal to all active webhooks
  app.post("/api/webhooks/send-signal", async (req: Request, res: Response) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const userId = (req.user as User).id;
      const { signal, triggerType = 'manual' } = req.body;
      
      if (!signal) {
        return res.status(400).json({ error: "Signal data is required" });
      }
      
      // Get active webhooks for this trigger type
      const webhooks = await storage.getActiveWebhooksByTrigger(userId, triggerType);
      
      if (webhooks.length === 0) {
        return res.json({ 
          success: true, 
          message: 'No active webhooks configured for this trigger type',
          sent: 0 
        });
      }
      
      const results = await Promise.all(webhooks.map(async (webhook) => {
        const payload = {
          type: triggerType,
          source: 'VEDD AI',
          timestamp: new Date().toISOString(),
          signal
        };
        
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          
          if (webhook.headers) {
            Object.assign(headers, webhook.headers);
          }
          
          if (webhook.secretKey) {
            headers['X-Webhook-Secret'] = webhook.secretKey;
          }
          
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
          });
          
          const responseText = await response.text();
          
          await storage.logWebhookCall({
            webhookId: webhook.id,
            userId,
            triggerType,
            payload,
            responseStatus: response.status,
            responseBody: responseText.substring(0, 1000),
            status: response.ok ? 'success' : 'failed',
            errorMessage: response.ok ? null : `HTTP ${response.status}`
          });
          
          await storage.updateWebhook(webhook.id, {
            lastTriggeredAt: new Date(),
            lastStatus: response.ok ? 'success' : 'failed',
            failureCount: response.ok ? 0 : (webhook.failureCount + 1)
          });
          
          return { webhookId: webhook.id, name: webhook.name, success: response.ok };
        } catch (err) {
          await storage.logWebhookCall({
            webhookId: webhook.id,
            userId,
            triggerType,
            payload,
            responseStatus: null,
            responseBody: null,
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'Connection failed'
          });
          
          await storage.updateWebhook(webhook.id, {
            lastTriggeredAt: new Date(),
            lastStatus: 'failed',
            failureCount: webhook.failureCount + 1
          });
          
          return { webhookId: webhook.id, name: webhook.name, success: false };
        }
      }));
      
      const successCount = results.filter(r => r.success).length;
      
      res.json({
        success: true,
        message: `Signal sent to ${successCount}/${results.length} webhooks`,
        sent: successCount,
        total: results.length,
        results
      });
    } catch (error) {
      console.error('Error sending signal:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to send signal" });
    }
  });

  // MT5 API Token management endpoints
  app.get("/api/mt5-tokens", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const tokens = await storage.getUserMt5ApiTokens(userId);
    // Don't expose the actual token in list view
    const safeTokens = tokens.map(t => ({
      ...t,
      token: t.token.substring(0, 8) + '...' + t.token.substring(t.token.length - 4)
    }));
    res.json(safeTokens);
  });

  app.post("/api/mt5-tokens", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Token name is required" });
    }
    const token = await storage.createMt5ApiToken(userId, name);
    // Return full token on creation (only time user sees it)
    res.json(token);
  });

  app.delete("/api/mt5-tokens/:id", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const tokenId = parseInt(req.params.id);
    const token = await storage.getMt5ApiToken(tokenId);
    if (!token || token.userId !== userId) {
      return res.status(404).json({ error: "Token not found" });
    }
    await storage.deleteMt5ApiToken(tokenId);
    res.json({ success: true });
  });

  app.patch("/api/mt5-tokens/:id", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const tokenId = parseInt(req.params.id);
    const token = await storage.getMt5ApiToken(tokenId);
    if (!token || token.userId !== userId) {
      return res.status(404).json({ error: "Token not found" });
    }
    const { isActive, name } = req.body;
    const updated = await storage.updateMt5ApiToken(tokenId, { isActive, name });
    res.json(updated);
  });

  app.get("/api/mt5-signals", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const signals = await storage.getMt5SignalLogs(userId, 100);
    res.json(signals);
  });

  // MT5 EA Signal Receiver - receives signals from MT5 EA and relays to webhooks
  app.post("/api/mt5-signal", async (req: Request, res: Response) => {
    try {
      // Accept API key from multiple header formats for compatibility
      const apiKey = (req.headers['x-api-key'] || req.headers['x-vedd-api-key'] || req.headers['authorization']?.replace('Bearer ', '')) as string;
      if (!apiKey) {
        return res.status(401).json({ error: "API key required. Set X-API-Key header in your EA settings." });
      }
      
      const token = await storage.getMt5ApiTokenByToken(apiKey);
      if (!token) {
        return res.status(401).json({ error: "Invalid API key" });
      }
      if (!token.isActive) {
        return res.status(403).json({ error: "API key is disabled" });
      }
      
      const { action, symbol, direction, volume, entryPrice, stopLoss, takeProfit, ticket, magic, comment, openTime, platform } = req.body;
      
      // Validate with detailed error messages
      if (!action || !symbol || !direction) {
        const missing = [];
        if (!action) missing.push('action');
        if (!symbol) missing.push('symbol');
        if (!direction) missing.push('direction');
        return res.status(400).json({ 
          error: `Missing required fields: ${missing.join(', ')}`,
          received: { action, symbol, direction },
          fix: "Ensure your EA sends action (OPEN/CLOSE), symbol (e.g., EURUSD), and direction (BUY/SELL)"
        });
      }
      
      // Log the incoming signal
      const signalLog = await storage.createMt5SignalLog({
        tokenId: token.id,
        userId: token.userId,
        action,
        symbol,
        direction,
        volume: volume || 0.01,
        entryPrice: entryPrice || 0,
        stopLoss: stopLoss || null,
        takeProfit: takeProfit || null,
        ticket: ticket?.toString() || null,
        relayedToWebhooks: false
      });
      
      // Increment signal count for the token
      await storage.incrementMt5TokenSignalCount(token.id);
      
      // Trigger webhooks for this signal
      const webhooks = await storage.getActiveWebhooksByTrigger(token.userId, 'mt5_signal');
      
      if (webhooks.length > 0) {
        const payload = {
          source: 'mt5_ea',
          type: 'trade_signal',
          timestamp: new Date().toISOString(),
          signal: {
            action,
            symbol,
            direction,
            volume,
            entryPrice,
            stopLoss,
            takeProfit,
            ticket,
            magic,
            comment,
            openTime,
            platform: platform || 'MT5'
          }
        };
        
        // Fire webhooks asynchronously
        triggerWebhooks(token.userId, 'mt5_signal', payload.signal)
          .then(() => storage.createMt5SignalLog({ 
            ...signalLog, 
            relayedToWebhooks: true 
          }))
          .catch(err => console.error('Error relaying MT5 signal to webhooks:', err));
      }
      
      // Execute on TradeLocker if auto-execute is enabled
      let tradelockerResult = null;
      const tlConnection = await storage.getUserTradelockerConnection(token.userId);
      console.log('[TradeLocker] Checking connection for user:', token.userId);
      console.log('[TradeLocker] Connection found:', tlConnection ? 'yes' : 'no');
      if (tlConnection) {
        console.log('[TradeLocker] Connection status - isActive:', tlConnection.isActive, 'autoExecute:', tlConnection.autoExecute);
      }
      if (tlConnection && tlConnection.isActive && tlConnection.autoExecute) {
        console.log('[TradeLocker] Executing signal on TradeLocker:', { action, symbol, direction, volume });
        try {
          tradelockerResult = await executeMT5SignalOnTradeLocker(tlConnection, {
            action,
            symbol,
            direction,
            volume: volume || 0.01,
            entryPrice,
            stopLoss,
            takeProfit,
          });
          
          // Log the trade attempt
          await storage.createTradelockerTradeLog({
            connectionId: tlConnection.id,
            userId: token.userId,
            sourceSignalId: signalLog.id,
            action,
            symbol,
            direction,
            volume: volume || 0.01,
            entryPrice,
            stopLoss,
            takeProfit,
            tradelockerOrderId: tradelockerResult.orderId || null,
            status: tradelockerResult.success ? 'executed' : 'failed',
            errorMessage: tradelockerResult.error || null,
          });
          
          // Update connection trade count if successful
          if (tradelockerResult.success) {
            await storage.updateTradelockerConnection(tlConnection.id, {
              tradeCount: tlConnection.tradeCount + 1,
              lastConnectedAt: new Date(),
              lastError: null,
            });
          } else {
            await storage.updateTradelockerConnection(tlConnection.id, {
              lastError: tradelockerResult.error,
            });
          }
        } catch (err) {
          console.error('Error executing on TradeLocker:', err);
          tradelockerResult = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
      }
      
      res.json({ 
        success: true, 
        message: "Signal received and queued for relay",
        signalId: signalLog.id,
        webhooksTriggered: webhooks.length,
        tradelocker: tradelockerResult ? {
          executed: tradelockerResult.success,
          orderId: tradelockerResult.orderId,
          error: tradelockerResult.error,
        } : null,
      });
    } catch (error) {
      console.error('Error processing MT5 signal:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to process signal" });
    }
  });

  // MT5 Chart Data Receiver - receives live chart data from MT5 EA for AI refresh
  app.post("/api/mt5/chart-data", async (req: Request, res: Response) => {
    try {
      // Accept API key from multiple header formats for compatibility
      const apiKey = (req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-api-key'] || req.headers['x-vedd-api-key']) as string;
      if (!apiKey) {
        return res.status(401).json({ error: "API key required. Set Authorization: Bearer YOUR_TOKEN header in your EA settings." });
      }
      
      const token = await storage.getMt5ApiTokenByToken(apiKey);
      if (!token) {
        return res.status(401).json({ error: "Invalid API key" });
      }
      if (!token.isActive) {
        return res.status(403).json({ error: "API key is disabled" });
      }

      // Check EA kill switch - user can disable EA remotely from the app
      (global as any).mt5EaEnabled = (global as any).mt5EaEnabled || {};
      const eaIsEnabled = (global as any).mt5EaEnabled[token.userId] !== false; // default: enabled
      if (!eaIsEnabled) {
        return res.status(403).json({ 
          error: "EA is disabled remotely from VEDD AI dashboard. Enable it from the app to resume trading.",
          eaDisabled: true
        });
      }
      
      const { symbol, timeframe, broker, timestamp, candles, indicators, account, eaSettings } = req.body;
      
      // Validate required fields with detailed error messages for debugging
      if (!symbol || typeof symbol !== 'string') {
        return res.status(400).json({ 
          error: "Invalid or missing symbol",
          details: `Received: ${JSON.stringify(symbol)}. Expected: string like 'EURUSD' or 'XAUUSD'`,
          fix: "Make sure your EA is sending the Symbol() value correctly"
        });
      }
      if (symbol.length > 50) {
        return res.status(400).json({ 
          error: "Symbol too long",
          details: `Symbol length: ${symbol.length}. Maximum: 50`,
          received: symbol.substring(0, 50) + '...'
        });
      }
      if (!timeframe || typeof timeframe !== 'string') {
        return res.status(400).json({ 
          error: "Invalid or missing timeframe",
          details: `Received: ${JSON.stringify(timeframe)}. Expected: string like 'H1', 'M15', 'D1'`,
          fix: "Make sure your EA is sending the Period() value correctly"
        });
      }
      if (timeframe.length > 20) {
        return res.status(400).json({ 
          error: "Timeframe too long",
          details: `Timeframe length: ${timeframe.length}. Maximum: 20`
        });
      }
      if (!candles || !Array.isArray(candles)) {
        return res.status(400).json({ 
          error: "Candles must be an array",
          details: `Received type: ${typeof candles}. Expected: array of OHLC data`,
          fix: "Make sure your EA is building the candles array correctly with CopyRates()"
        });
      }
      if (candles.length === 0) {
        return res.status(400).json({ 
          error: "Candles array is empty",
          details: "At least 1 candle is required for analysis",
          fix: "Check that CopyRates() is returning data. New broker accounts may need chart history loaded first."
        });
      }
      if (candles.length > 500) {
        return res.status(400).json({ 
          error: "Too many candles",
          details: `Received: ${candles.length}. Maximum: 500`,
          fix: "Limit candle history to 100-200 for best performance"
        });
      }
      
      // Validate candle structure (check first candle) - be flexible about field names
      const firstCandle = candles[0];
      if (typeof firstCandle !== 'object' || firstCandle === null) {
        return res.status(400).json({ 
          error: "Invalid candle format",
          details: "First candle must be an object with OHLC data",
          received: JSON.stringify(firstCandle)
        });
      }
      
      // Sanitize symbol - allow more characters for different broker formats
      // Accept: EURUSD, XAUUSD.raw, GOLD.c, BTC/USD, EURUSD.i, EURUSD#, etc.
      const sanitizedSymbol = symbol.replace(/[^A-Za-z0-9/_.-]/g, '').toUpperCase();
      const sanitizedTimeframe = timeframe.replace(/[^A-Za-z0-9_]/g, '').toUpperCase();
      
      // Store the chart data for later use in AI refresh
      const chartDataKey = `mt5_chart_${token.userId}_${sanitizedSymbol}_${sanitizedTimeframe}`;
      const chartData = {
        symbol,
        timeframe,
        broker: broker || 'Unknown',
        receivedAt: new Date().toISOString(),
        candleCount: candles.length,
        candles: candles.slice(0, 100), // Store last 100 candles max
        indicators: indicators || null,
        latestPrice: candles[0]?.c || null,
      };
      
      // Store in a simple in-memory cache (you could extend this to database storage)
      (global as any).mt5ChartDataCache = (global as any).mt5ChartDataCache || {};
      (global as any).mt5ChartDataCache[chartDataKey] = chartData;
      
      // Track connection status per user for UI display (track ALL connected pairs)
      (global as any).mt5ConnectionStatus = (global as any).mt5ConnectionStatus || {};
      (global as any).mt5ConnectedPairs = (global as any).mt5ConnectedPairs || {};
      
      // Single status (backwards compatible)
      (global as any).mt5ConnectionStatus[token.userId] = {
        connected: true,
        lastSeen: new Date().toISOString(),
        symbol: sanitizedSymbol,
        timeframe: sanitizedTimeframe,
        broker: broker || 'Unknown',
        candleCount: candles.length,
      };
      
      // Store account data if provided — keyed per broker account to support multi-broker
      if (account && typeof account === 'object') {
        (global as any).mt5AccountData = (global as any).mt5AccountData || {};
        if (!(global as any).mt5AccountData[token.userId]) {
          (global as any).mt5AccountData[token.userId] = {};
        }
        const brokerKey = `${account.accountNumber || 'unknown'}_${(broker || 'Unknown').replace(/[^A-Za-z0-9]/g, '')}`;
        (global as any).mt5AccountData[token.userId][brokerKey] = {
          ...account,
          lastUpdated: new Date().toISOString(),
          broker: broker || 'Unknown',
        };
      }
      
      // Store open positions for reversal detection and trade sync
      const { openPositions } = req.body;
      if (openPositions && Array.isArray(openPositions)) {
        (global as any).mt5OpenPositions = (global as any).mt5OpenPositions || {};
        (global as any).mt5OpenPositions[token.userId] = {
          positions: openPositions,
          lastUpdated: new Date().toISOString(),
          broker: broker || 'Unknown',
        };
        
        // Auto-sync positions to AI trade results for reversal detection
        for (const pos of openPositions) {
          if (pos.symbol && pos.direction && pos.ticket) {
            const ticketStr = pos.ticket.toString();
            // Check if this trade already exists by ticket
            const existingTrade = await storage.getAiTradeResultByTicket(token.userId, ticketStr);
            
            if (!existingTrade) {
              // Create new pending trade record for reversal detection
              await storage.createAiTradeResult({
                userId: token.userId,
                symbol: pos.symbol.toUpperCase(),
                direction: pos.direction,
                entryPrice: pos.openPrice || 0,
                stopLoss: pos.sl > 0 ? pos.sl : null,
                takeProfit: pos.tp > 0 ? pos.tp : null,
                aiConfidence: 0,
                result: 'PENDING',
                source: 'mt5_copier',
                mt5Ticket: ticketStr,
                notes: `Synced from MT5 EA`,
              });
            } else {
              // Update profit/loss on existing trade (don't overwrite notes or ticket)
              await storage.updateAiTradeResult(existingTrade.id, token.userId, {
                profitLoss: pos.profit || 0,
                stopLoss: pos.sl > 0 ? pos.sl : existingTrade.stopLoss,
                takeProfit: pos.tp > 0 ? pos.tp : existingTrade.takeProfit,
              });
            }
          }
        }
      }
      
      // Process closed trades for history learning
      const { closedTrades } = req.body;
      if (closedTrades && Array.isArray(closedTrades) && closedTrades.length > 0) {
        (global as any).mt5ClosedTrades = (global as any).mt5ClosedTrades || {};
        (global as any).mt5ClosedTrades[token.userId] = {
          trades: closedTrades,
          lastUpdated: new Date().toISOString(),
        };
        
        // Update AI trade results with WIN/LOSS based on closed trades
        for (const closedTrade of closedTrades) {
          if (closedTrade.ticket) {
            const existingResult = await storage.getAiTradeResultByTicket(token.userId, closedTrade.ticket.toString());
            // Update trades that are PENDING or have no result yet
            if (existingResult && (!existingResult.result || existingResult.result === 'PENDING')) {
              const result = closedTrade.profit > 0 ? 'WIN' : (closedTrade.profit < 0 ? 'LOSS' : 'BREAKEVEN');
              await storage.updateAiTradeResult(existingResult.id, token.userId, {
                result,
                exitPrice: closedTrade.closePrice || 0,
                profitLoss: closedTrade.profit || 0,
                closedAt: new Date(),
              });
            }
          }
        }
        
        // Analyze patterns for learning recommendations per symbol
        const symbolStats: Record<string, { 
          wins: number; losses: number; 
          hourlyTrades: Record<number, { wins: number; losses: number }>; 
          dailyTrades: Record<number, { wins: number; losses: number }>; 
          avgWinPL: number; avgLossPL: number; 
          buyWins: number; buyLosses: number; sellWins: number; sellLosses: number 
        }> = {};
        
        for (const trade of closedTrades) {
          const sym = (trade.symbol || '').toUpperCase();
          if (!sym) continue;
          
          if (!symbolStats[sym]) {
            symbolStats[sym] = {
              wins: 0, losses: 0, 
              hourlyTrades: {}, dailyTrades: {},
              avgWinPL: 0, avgLossPL: 0, buyWins: 0, buyLosses: 0, sellWins: 0, sellLosses: 0
            };
          }
          
          const stats = symbolStats[sym];
          const isWin = trade.profit > 0;
          const isLoss = trade.profit < 0;
          const isBuy = trade.direction === 'BUY';
          const hour = trade.closeHour || 0;
          const day = trade.closeDay || 0;
          
          // Initialize hourly/daily tracking
          if (!stats.hourlyTrades[hour]) stats.hourlyTrades[hour] = { wins: 0, losses: 0 };
          if (!stats.dailyTrades[day]) stats.dailyTrades[day] = { wins: 0, losses: 0 };
          
          if (isWin) {
            stats.wins++;
            stats.avgWinPL += trade.profit;
            if (isBuy) stats.buyWins++; else stats.sellWins++;
            stats.hourlyTrades[hour].wins++;
            stats.dailyTrades[day].wins++;
          } else if (isLoss) {
            stats.losses++;
            stats.avgLossPL += trade.profit;
            if (isBuy) stats.buyLosses++; else stats.sellLosses++;
            stats.hourlyTrades[hour].losses++;
            stats.dailyTrades[day].losses++;
          }
        }
        
        // Generate EA settings recommendations per symbol
        const recommendations: Record<string, any> = {};
        for (const [sym, stats] of Object.entries(symbolStats)) {
          const totalTrades = stats.wins + stats.losses;
          if (totalTrades < 3) continue; // Need minimum trades
          
          const winRate = stats.wins / totalTrades;
          const avgWin = stats.wins > 0 ? stats.avgWinPL / stats.wins : 0;
          const avgLoss = stats.losses > 0 ? Math.abs(stats.avgLossPL / stats.losses) : 0;
          
          // Direction bias: if BUY losses >> BUY wins, suggest SELL only
          const buyWinRate = stats.buyWins / Math.max(1, stats.buyWins + stats.buyLosses);
          const sellWinRate = stats.sellWins / Math.max(1, stats.sellWins + stats.sellLosses);
          let directionBias = 0; // Both
          if (buyWinRate < 0.35 && sellWinRate > 0.5) directionBias = 2; // SELL only
          else if (sellWinRate < 0.35 && buyWinRate > 0.5) directionBias = 1; // BUY only
          
          // Find worst hours using loss RATE (losses / total), min 3 trades to qualify
          const avoidHours: number[] = [];
          for (const [hour, hourData] of Object.entries(stats.hourlyTrades)) {
            const hData = hourData as { wins: number; losses: number };
            const hTotal = hData.wins + hData.losses;
            if (hTotal >= 3) {
              const lossRate = hData.losses / hTotal;
              if (lossRate > 0.65) avoidHours.push(parseInt(hour)); // >65% loss rate
            }
          }
          
          // Find worst days using loss RATE, min 3 trades to qualify
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const avoidDays: string[] = [];
          for (const [day, dayData] of Object.entries(stats.dailyTrades)) {
            const dData = dayData as { wins: number; losses: number };
            const dTotal = dData.wins + dData.losses;
            if (dTotal >= 3) {
              const lossRate = dData.losses / dTotal;
              if (lossRate > 0.65) avoidDays.push(dayNames[parseInt(day)] || ''); // >65% loss rate
            }
          }
          
          recommendations[sym] = {
            symbol: sym,
            totalTrades,
            winRate: Math.round(winRate * 100),
            avgWinPL: Math.round(avgWin * 100) / 100,
            avgLossPL: Math.round(avgLoss * 100) / 100,
            directionBias,
            directionBiasLabel: directionBias === 0 ? 'Both' : (directionBias === 1 ? 'BUY Only' : 'SELL Only'),
            avoidHours,
            avoidDays,
            suggestedSettings: {
              DIRECTION_BIAS: directionBias,
              ...Object.fromEntries(avoidHours.map(h => [`AVOID_HOUR_${h}`, true])),
              AVOID_MONDAY: avoidDays.includes('Monday'),
              AVOID_TUESDAY: avoidDays.includes('Tuesday'),
              AVOID_WEDNESDAY: avoidDays.includes('Wednesday'),
              AVOID_THURSDAY: avoidDays.includes('Thursday'),
              AVOID_FRIDAY: avoidDays.includes('Friday'),
            }
          };
        }
        
        // Store learning recommendations per user
        (global as any).mt5LearningRecommendations = (global as any).mt5LearningRecommendations || {};
        (global as any).mt5LearningRecommendations[token.userId] = {
          recommendations,
          analyzedTrades: closedTrades.length,
          lastUpdated: new Date().toISOString(),
        };
      }
      
      // Track ALL connected pairs per user
      if (!(global as any).mt5ConnectedPairs[token.userId]) {
        (global as any).mt5ConnectedPairs[token.userId] = {};
      }
      const pairKey = `${sanitizedSymbol}_${sanitizedTimeframe}`;
      
      // Calculate hourly breakout levels from candle data
      // Find high/low for recent hourly period (last few candles depending on timeframe)
      let hourlyHigh = candles[0]?.h || 0;
      let hourlyLow = candles[0]?.l || Infinity;
      let hourlyVolume = 0;
      let avgVolume = 0;
      
      // Calculate candles per hour based on timeframe
      const tfMinutes: Record<string, number> = {
        'M1': 1, 'M5': 5, 'M15': 15, 'M30': 30, 'H1': 60, 'H4': 240, 'D1': 1440
      };
      const minutes = tfMinutes[sanitizedTimeframe] || 60;
      const candlesPerHour = Math.max(1, Math.floor(60 / minutes));
      
      // Get hourly high/low/volume from recent candles
      const hourlyCandles = candles.slice(0, Math.min(candlesPerHour, candles.length));
      for (const candle of hourlyCandles) {
        if (candle.h > hourlyHigh) hourlyHigh = candle.h;
        if (candle.l < hourlyLow) hourlyLow = candle.l;
        hourlyVolume += (candle.v || 0);
      }
      
      // Calculate average volume from all candles
      const totalVolume = candles.reduce((sum: number, c: any) => sum + (c.v || 0), 0);
      avgVolume = candles.length > 0 ? totalVolume / candles.length : 0;
      
      // Determine if current volume is high relative to average
      const volumeRatio = avgVolume > 0 ? hourlyVolume / (avgVolume * candlesPerHour) : 1;
      const isHighVolume = volumeRatio > 1.5;
      
      (global as any).mt5ConnectedPairs[token.userId][pairKey] = {
        symbol: sanitizedSymbol,
        timeframe: sanitizedTimeframe,
        broker: broker || 'Unknown',
        lastSeen: new Date().toISOString(),
        candleCount: candles.length,
        latestPrice: candles[0]?.c || null,
        latestHigh: candles[0]?.h || null,
        latestLow: candles[0]?.l || null,
        hourlyHigh: hourlyHigh !== 0 ? hourlyHigh : null,
        hourlyLow: hourlyLow !== Infinity ? hourlyLow : null,
        hourlyVolume: hourlyVolume,
        avgVolume: avgVolume,
        volumeRatio: volumeRatio,
        isHighVolume: isHighVolume,
      };
      
      (global as any).mt5BreakoutCache = (global as any).mt5BreakoutCache || {};
      if (!(global as any).mt5BreakoutCache[token.userId]) {
        (global as any).mt5BreakoutCache[token.userId] = {};
      }
      
      // Increment signal count for the token (tracking usage)
      await storage.incrementMt5TokenSignalCount(token.id);
      
      // Check if this data should trigger an EA refresh
      let refreshTriggered = false;
      const userEAs = await storage.getUserSavedEAs(token.userId);
      // First try to find EA with liveRefreshEnabled, then fall back to any EA for the symbol
      const matchingEA = userEAs.find(ea => 
        ea.symbol.toUpperCase().replace('/', '') === symbol.toUpperCase().replace('/', '') &&
        ea.liveRefreshEnabled
      ) || userEAs.find(ea => 
        ea.symbol.toUpperCase().replace('/', '') === symbol.toUpperCase().replace('/', '')
      );
      
      // Build comprehensive AI analysis from the indicators
      let analysis: any = {
        symbol: sanitizedSymbol,
        timeframe: sanitizedTimeframe,
        analyzedAt: new Date().toISOString(),
        signal: 'NEUTRAL',
        confidence: 50,
        trend: 'SIDEWAYS',
        patterns: [] as string[],
        indicators: {} as any,
        tradePlan: null as any,
        alerts: [] as string[],
      };
      
      let advanced: any = {};
      
      if (indicators && typeof indicators === 'object') {
        try {
          const rsi = typeof indicators.rsi === 'number' ? indicators.rsi : null;
          const macdMain = indicators.macd?.main;
          const macdSignal = indicators.macd?.signal;
          const macdHist = indicators.macd?.histogram;
          const ema20 = indicators.ema20;
          const ema50 = indicators.ema50;
          const sma200 = indicators.sma200;
          const bbUpper = indicators.bollingerBands?.upper;
          const bbMiddle = indicators.bollingerBands?.middle;
          const bbLower = indicators.bollingerBands?.lower;
          let atr = indicators.atr;
          const currentPrice = indicators.price?.bid || candles[0]?.c;
          
          // Fallback ATR calculation if not provided by EA
          if (!atr && candles.length >= 14) {
            let atrSum = 0;
            for (let i = 0; i < 14 && i < candles.length - 1; i++) {
              const high = candles[i]?.h || 0;
              const low = candles[i]?.l || 0;
              const prevClose = candles[i + 1]?.c || 0;
              const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
              );
              atrSum += tr;
            }
            atr = atrSum / 14;
            console.log('[MT5 Chart Data] Calculated fallback ATR:', atr);
          }
          
          // RSI Analysis
          let rsiSignal = 'NEUTRAL';
          let rsiStatus = '';
          if (rsi !== null) {
            if (rsi > 70) {
              rsiSignal = 'SELL';
              rsiStatus = 'OVERBOUGHT';
              analysis.patterns.push('RSI Overbought (>70)');
              analysis.alerts.push('RSI indicates overbought conditions');
            } else if (rsi < 30) {
              rsiSignal = 'BUY';
              rsiStatus = 'OVERSOLD';
              analysis.patterns.push('RSI Oversold (<30)');
              analysis.alerts.push('RSI indicates oversold conditions');
            } else if (rsi > 50) {
              rsiStatus = 'BULLISH';
            } else {
              rsiStatus = 'BEARISH';
            }
            analysis.indicators.rsi = { value: rsi, status: rsiStatus, signal: rsiSignal };
          }
          
          // MACD Analysis
          let macdSignalDir = 'NEUTRAL';
          let macdStatus = '';
          if (macdHist !== undefined && macdHist !== null) {
            if (macdHist > 0) {
              macdSignalDir = 'BUY';
              macdStatus = 'BULLISH';
              if (macdMain > macdSignal) {
                analysis.patterns.push('MACD Bullish Crossover');
              }
            } else {
              macdSignalDir = 'SELL';
              macdStatus = 'BEARISH';
              if (macdMain < macdSignal) {
                analysis.patterns.push('MACD Bearish Crossover');
              }
            }
            analysis.indicators.macd = { 
              main: macdMain, 
              signal: macdSignal, 
              histogram: macdHist, 
              status: macdStatus,
              signalDir: macdSignalDir 
            };
          }
          
          // Moving Average Analysis
          let maSignal = 'NEUTRAL';
          let maTrend = 'SIDEWAYS';
          if (currentPrice && ema20 && ema50 && sma200) {
            if (currentPrice > ema20 && ema20 > ema50 && ema50 > sma200) {
              maSignal = 'BUY';
              maTrend = 'STRONG UPTREND';
              analysis.patterns.push('Price above all MAs - Strong Uptrend');
            } else if (currentPrice < ema20 && ema20 < ema50 && ema50 < sma200) {
              maSignal = 'SELL';
              maTrend = 'STRONG DOWNTREND';
              analysis.patterns.push('Price below all MAs - Strong Downtrend');
            } else if (currentPrice > sma200) {
              maTrend = 'UPTREND';
              if (currentPrice > ema20) {
                maSignal = 'BUY';
              }
            } else {
              maTrend = 'DOWNTREND';
              if (currentPrice < ema20) {
                maSignal = 'SELL';
              }
            }
            analysis.indicators.movingAverages = {
              ema20, ema50, sma200,
              priceAboveEMA20: currentPrice > ema20,
              priceAboveSMA200: currentPrice > sma200,
              trend: maTrend,
              signal: maSignal
            };
          }
          
          // Bollinger Bands Analysis
          let bbSignal = 'NEUTRAL';
          let bbStatus = '';
          if (currentPrice && bbUpper && bbMiddle && bbLower) {
            if (currentPrice >= bbUpper) {
              bbSignal = 'SELL';
              bbStatus = 'AT UPPER BAND';
              analysis.patterns.push('Price at Upper Bollinger Band');
              analysis.alerts.push('Price touching upper BB - potential reversal');
            } else if (currentPrice <= bbLower) {
              bbSignal = 'BUY';
              bbStatus = 'AT LOWER BAND';
              analysis.patterns.push('Price at Lower Bollinger Band');
              analysis.alerts.push('Price touching lower BB - potential reversal');
            } else {
              bbStatus = 'WITHIN BANDS';
            }
            analysis.indicators.bollingerBands = {
              upper: bbUpper, middle: bbMiddle, lower: bbLower,
              status: bbStatus, signal: bbSignal
            };
          }
          
          // ATR for volatility
          if (atr) {
            const volatility = atr > (currentPrice * 0.02) ? 'HIGH' : atr > (currentPrice * 0.01) ? 'MEDIUM' : 'LOW';
            analysis.indicators.atr = { value: atr, volatility };
          }
          
          // Advanced indicators (ADX, Stochastic, VWAP, OBV, Pivot Points, Fibonacci, S/R, Candle Patterns, Session Context)
          const { computeAllAdvancedIndicators } = await import('./indicators');
          advanced = computeAllAdvancedIndicators(candles, atr || 0, sanitizedSymbol, sanitizedTimeframe);
          
          if (advanced.adx) {
            analysis.indicators.adx = advanced.adx;
            if (advanced.adx.trend === 'WEAK') {
              analysis.patterns.push('ADX Weak Trend (' + advanced.adx.value.toFixed(1) + ') - Ranging Market');
            } else if (advanced.adx.trend === 'VERY STRONG') {
              analysis.patterns.push('ADX Very Strong Trend (' + advanced.adx.value.toFixed(1) + ')');
            }
          }
          if (advanced.stochastic) {
            analysis.indicators.stochastic = advanced.stochastic;
            if (advanced.stochastic.status === 'OVERBOUGHT') analysis.patterns.push('Stochastic Overbought (' + advanced.stochastic.k.toFixed(1) + ')');
            if (advanced.stochastic.status === 'OVERSOLD') analysis.patterns.push('Stochastic Oversold (' + advanced.stochastic.k.toFixed(1) + ')');
          }
          if (advanced.vwap) analysis.indicators.vwap = advanced.vwap;
          if (advanced.obv) {
            analysis.indicators.obv = advanced.obv;
            if (advanced.obv.divergence === 'BULLISH') analysis.patterns.push('OBV Bullish Divergence');
            if (advanced.obv.divergence === 'BEARISH') analysis.patterns.push('OBV Bearish Divergence');
          }
          if (advanced.pivotPoints) analysis.indicators.pivotPoints = advanced.pivotPoints;
          if (advanced.fibonacci) analysis.indicators.fibonacci = advanced.fibonacci;
          if (advanced.supportResistance) analysis.indicators.supportResistance = advanced.supportResistance;
          if (advanced.candlePatterns && advanced.candlePatterns.length > 0) {
            analysis.indicators.candlePatterns = advanced.candlePatterns;
            for (const p of advanced.candlePatterns) analysis.patterns.push('Candle: ' + p);
          }
          if (advanced.swingPoints) analysis.indicators.swingPoints = advanced.swingPoints;
          if (advanced.sessionContext) analysis.indicators.sessionContext = advanced.sessionContext;
          if (advanced.volatilityContext) analysis.indicators.volatilityContext = advanced.volatilityContext;
          if (advanced.volumeProfile) analysis.indicators.volumeProfile = advanced.volumeProfile;
          
          // Add open positions context for this symbol
          const userOpenPositions = (global as any).mt5OpenPositions?.[token.userId]?.positions || [];
          const symbolPositions = userOpenPositions.filter((p: any) => 
            (p.symbol || '').toUpperCase().replace('/', '') === sanitizedSymbol
          );
          if (symbolPositions.length > 0) {
            analysis.indicators.openPositionContext = {
              count: symbolPositions.length,
              directions: symbolPositions.map((p: any) => p.direction),
              totalLots: symbolPositions.reduce((s: number, p: any) => s + (p.lots || 0), 0),
              avgEntryPrice: symbolPositions.reduce((s: number, p: any) => s + (p.openPrice || 0), 0) / symbolPositions.length,
              unrealizedPnL: symbolPositions.reduce((s: number, p: any) => s + (p.profit || 0), 0),
            };
            analysis.alerts.push(`${symbolPositions.length} open position(s) on ${sanitizedSymbol}`);
          }
          
          // Add recent trade history context
          const closedTradeData = (global as any).mt5ClosedTrades?.[token.userId]?.trades || [];
          const symbolClosedTrades = closedTradeData.filter((t: any) => 
            (t.symbol || '').toUpperCase().replace('/', '') === sanitizedSymbol
          );
          if (symbolClosedTrades.length > 0) {
            const wins = symbolClosedTrades.filter((t: any) => t.profit > 0).length;
            const losses = symbolClosedTrades.filter((t: any) => t.profit < 0).length;
            analysis.indicators.recentTradeHistory = {
              totalTrades: symbolClosedTrades.length,
              wins,
              losses,
              winRate: symbolClosedTrades.length > 0 ? Math.round((wins / symbolClosedTrades.length) * 100) : 0,
              netPnL: symbolClosedTrades.reduce((s: number, t: any) => s + (t.profit || 0), 0),
            };
          }
          
          // Calculate overall signal (weighted consensus)
          let buyVotes = 0, sellVotes = 0;
          if (rsiSignal === 'BUY') buyVotes += 1.5;
          if (rsiSignal === 'SELL') sellVotes += 1.5;
          if (macdSignalDir === 'BUY') buyVotes += 2;
          if (macdSignalDir === 'SELL') sellVotes += 2;
          if (maSignal === 'BUY') buyVotes += 2;
          if (maSignal === 'SELL') sellVotes += 2;
          if (bbSignal === 'BUY') buyVotes += 1;
          if (bbSignal === 'SELL') sellVotes += 1;
          
          // Advanced indicator votes
          if (advanced.adx?.signal === 'BUY') buyVotes += 1;
          if (advanced.adx?.signal === 'SELL') sellVotes += 1;
          if (advanced.stochastic?.signal === 'BUY') buyVotes += 1.5;
          if (advanced.stochastic?.signal === 'SELL') sellVotes += 1.5;
          if (advanced.vwap?.signal === 'BUY') buyVotes += 0.5;
          if (advanced.vwap?.signal === 'SELL') sellVotes += 0.5;
          if (advanced.obv?.divergence === 'BULLISH') buyVotes += 1;
          if (advanced.obv?.divergence === 'BEARISH') sellVotes += 1;
          
          // Candle pattern votes
          const bullishPatterns = (advanced.candlePatterns || []).filter(p => 
            p.includes('Bullish') || p.includes('Hammer') || p.includes('Morning Star')
          );
          const bearishPatterns = (advanced.candlePatterns || []).filter(p => 
            p.includes('Bearish') || p.includes('Shooting Star') || p.includes('Evening Star')
          );
          if (bullishPatterns.length > 0) buyVotes += Math.min(bullishPatterns.length, 2);
          if (bearishPatterns.length > 0) sellVotes += Math.min(bearishPatterns.length, 2);
          
          // Session context penalty for low-liquidity sessions
          if (advanced.sessionContext && !advanced.sessionContext.isSessionOpen) {
            analysis.alerts.push('Market session closed or weekend - reduced liquidity');
          }
          
          // Market Open Breakout Detection (from EA's timeframe)
          if (advanced.breakoutDetection) {
            analysis.indicators.breakoutDetection = advanced.breakoutDetection;
            if (advanced.breakoutDetection.isBreakoutWindow) {
              analysis.patterns.push(`Breakout Window: ${advanced.breakoutDetection.session} Open (${advanced.breakoutDetection.minutesSinceOpen}min)`);
              if (advanced.breakoutDetection.breakoutDetected) {
                analysis.patterns.push(`${advanced.breakoutDetection.breakoutStrength} ${advanced.breakoutDetection.breakoutDirection} Breakout`);
                if (advanced.breakoutDetection.volumeConfirmed) {
                  analysis.patterns.push('Breakout Volume Confirmed');
                }
                analysis.alerts.push(`BREAKOUT: ${advanced.breakoutDetection.breakoutDirection} breakout at ${advanced.breakoutDetection.session} open - ${advanced.breakoutDetection.priceVsRange}`);
              } else if (advanced.breakoutDetection.approachingBreakout) {
                analysis.patterns.push(`Approaching ${advanced.breakoutDetection.approachingDirection} Breakout`);
                analysis.alerts.push(`APPROACHING BREAKOUT: Price near ${advanced.breakoutDetection.approachingDirection} edge at ${advanced.breakoutDetection.session} open - ${advanced.breakoutDetection.priceVsRange}`);
              }
            }
            (global as any).mt5BreakoutCache[token.userId][pairKey] = {
              symbol: sanitizedSymbol,
              timeframe: sanitizedTimeframe,
              updatedAt: new Date().toISOString(),
              ...advanced.breakoutDetection,
            };
          }

          // Independent M15 Breakout Monitor: merge separate breakout data if available
          try {
            const { getIndependentBreakoutForSymbol } = await import('./services/breakout-monitor');
            const independentBreakout = getIndependentBreakoutForSymbol(token.userId, sanitizedSymbol);
            if (independentBreakout && independentBreakout.isBreakoutWindow) {
              analysis.indicators.independentBreakout = independentBreakout;
              const eaDetected = advanced.breakoutDetection?.breakoutDetected || false;
              if (independentBreakout.breakoutDetected && !eaDetected) {
                analysis.patterns.push(`M15 Independent: ${independentBreakout.breakoutStrength} ${independentBreakout.breakoutDirection} Breakout`);
                if (independentBreakout.volumeConfirmed) {
                  analysis.patterns.push('M15 Breakout Volume Confirmed');
                }
                analysis.alerts.push(`M15 BREAKOUT: ${independentBreakout.breakoutDirection} breakout at ${independentBreakout.session} open (independent monitor) - ${independentBreakout.priceVsRange}`);
              } else if (independentBreakout.approachingBreakout && !eaDetected) {
                analysis.patterns.push(`M15 Independent: Approaching ${independentBreakout.approachingDirection} Breakout`);
                analysis.alerts.push(`M15 APPROACHING: ${independentBreakout.approachingDirection} breakout developing at ${independentBreakout.session} open (independent monitor)`);
              }
            }
          } catch (err) {
          }
          
          // Weak trend penalty (ADX < 20 reduces confidence in directional signals)
          const adxPenalty = advanced.adx && advanced.adx.value < 20 ? 0.8 : 1;
          
          // Multi-timeframe alignment bonus (if multi-timeframe data is provided)
          const { multiTimeframe, multiTimeframeEnabled } = req.body;
          let mtfBullish = 0, mtfBearish = 0, mtfCount = 0;
          
          if (multiTimeframeEnabled && multiTimeframe && typeof multiTimeframe === 'object') {
            const timeframes = ['M5', 'M15', 'H1', 'H4', 'D1', 'W1'];
            for (const tf of timeframes) {
              if (multiTimeframe[tf]) {
                mtfCount++;
                const tfData = multiTimeframe[tf];
                const tfTrend = tfData.trend || '';
                
                if (tfTrend === 'BULLISH' || tfTrend === 'ABOVE_SMA200') {
                  mtfBullish++;
                } else if (tfTrend === 'BEARISH' || tfTrend === 'BELOW_SMA200') {
                  mtfBearish++;
                }
                
                // Add timeframe RSI extreme conditions
                const tfRsi = tfData.indicators?.rsi;
                if (tfRsi && tfRsi < 30) mtfBullish += 0.5;
                if (tfRsi && tfRsi > 70) mtfBearish += 0.5;
              }
            }
            
            // Apply multi-timeframe alignment bonus
            if (mtfCount > 0) {
              if (mtfBullish > mtfBearish) {
                buyVotes += mtfBullish * 0.75;  // Up to 3 extra votes if all aligned
                analysis.patterns.push(`MTF Aligned: ${mtfBullish}/${mtfCount} bullish`);
              } else if (mtfBearish > mtfBullish) {
                sellVotes += mtfBearish * 0.75;
                analysis.patterns.push(`MTF Aligned: ${mtfBearish}/${mtfCount} bearish`);
              }
            }
          }
          
          // Market Open Breakout votes (strong signal during session opens)
          const perPairSettings = (global as any).mt5BreakoutSettings?.[token.userId] || {};
          const pairBreakoutKey = sanitizedSymbol.toUpperCase().replace('/', '');
          const perPairEnabled = perPairSettings[pairBreakoutKey];
          const globalBreakoutEnabled = (global as any).mt5BreakoutGlobal?.[token.userId] !== false;
          const breakoutEnabled = globalBreakoutEnabled && perPairEnabled !== false && eaSettings?.breakoutStrategy !== false;
          if (breakoutEnabled && advanced.breakoutDetection?.isBreakoutWindow) {
            if (advanced.breakoutDetection.breakoutDetected) {
              const breakoutWeight = advanced.breakoutDetection.breakoutStrength === 'STRONG' ? 3 : 
                                     advanced.breakoutDetection.breakoutStrength === 'MODERATE' ? 2 : 1;
              const volumeBonus = advanced.breakoutDetection.volumeConfirmed ? 1 : 0;
              if (advanced.breakoutDetection.signal === 'BUY') buyVotes += breakoutWeight + volumeBonus;
              if (advanced.breakoutDetection.signal === 'SELL') sellVotes += breakoutWeight + volumeBonus;
            } else if (advanced.breakoutDetection.approachingBreakout) {
              if (advanced.breakoutDetection.approachingDirection === 'BULLISH') buyVotes += 1;
              if (advanced.breakoutDetection.approachingDirection === 'BEARISH') sellVotes += 1;
            }
          }
          
          // Independent M15 breakout votes (when EA timeframe missed the breakout)
          if (breakoutEnabled) {
            try {
              const { getIndependentBreakoutForSymbol } = await import('./services/breakout-monitor');
              const indBreakout = getIndependentBreakoutForSymbol(token.userId, sanitizedSymbol);
              const eaAlreadyCaught = advanced.breakoutDetection?.breakoutDetected || false;
              if (indBreakout && indBreakout.isBreakoutWindow && !eaAlreadyCaught) {
                if (indBreakout.breakoutDetected) {
                  const indWeight = indBreakout.breakoutStrength === 'STRONG' ? 3 : 
                                    indBreakout.breakoutStrength === 'MODERATE' ? 2 : 1;
                  const indVolBonus = indBreakout.volumeConfirmed ? 1 : 0;
                  if (indBreakout.signal === 'BUY') buyVotes += indWeight + indVolBonus;
                  if (indBreakout.signal === 'SELL') sellVotes += indWeight + indVolBonus;
                } else if (indBreakout.approachingBreakout) {
                  if (indBreakout.approachingDirection === 'BULLISH') buyVotes += 1;
                  if (indBreakout.approachingDirection === 'BEARISH') sellVotes += 1;
                }
              }
            } catch (err) {}
          }

          let baseVotes = 6.5; // Core: RSI 1.5 + MACD 2 + MA 2 + BB 1
          if (advanced.adx) baseVotes += 1;
          if (advanced.stochastic) baseVotes += 1.5;
          if (advanced.vwap) baseVotes += 0.5;
          if (advanced.obv?.divergence && advanced.obv.divergence !== 'NONE') baseVotes += 1;
          if (bullishPatterns.length > 0 || bearishPatterns.length > 0) baseVotes += Math.min(Math.max(bullishPatterns.length, bearishPatterns.length), 2);
          if (breakoutEnabled && (advanced.breakoutDetection?.breakoutDetected || analysis.indicators?.independentBreakout?.breakoutDetected)) baseVotes += 4;
          const totalVotes = multiTimeframeEnabled && mtfCount > 0 ? baseVotes + (mtfCount * 0.75) : baseVotes;
          if (buyVotes > sellVotes && buyVotes >= 3) {
            analysis.signal = 'BUY';
            analysis.confidence = Math.min(95, Math.round((buyVotes / totalVotes) * 100 * adxPenalty));
          } else if (sellVotes > buyVotes && sellVotes >= 3) {
            analysis.signal = 'SELL';
            analysis.confidence = Math.min(95, Math.round((sellVotes / totalVotes) * 100 * adxPenalty));
          } else {
            analysis.signal = 'NEUTRAL';
            analysis.confidence = 50;
          }
          
          // Boost confidence if multi-timeframe data confirms the signal
          if (multiTimeframeEnabled && mtfCount >= 2) {
            if ((analysis.signal === 'BUY' && mtfBullish >= mtfCount * 0.6) ||
                (analysis.signal === 'SELL' && mtfBearish >= mtfCount * 0.6)) {
              analysis.confidence = Math.min(95, analysis.confidence + 10);
              analysis.patterns.push('Multi-TF Confirmation (+10% conf)');
            }
          }
          
          analysis.trend = maTrend;
          
          // Generate trade plan if we have a signal (S/R-enhanced)
          if (analysis.signal !== 'NEUTRAL' && currentPrice && atr) {
            const stopDistance = atr * 1.5;
            const targetDistance = atr * 2.5;
            
            const sr = advanced.supportResistance;
            const pp = advanced.pivotPoints;
            
            if (analysis.signal === 'BUY') {
              let sl = currentPrice - stopDistance;
              let tp = currentPrice + targetDistance;
              if (sr?.nearestSupport && sr.nearestSupport > sl && sr.nearestSupport < currentPrice) {
                sl = sr.nearestSupport - atr * 0.3;
              }
              if (sr?.nearestResistance && sr.nearestResistance > currentPrice) {
                tp = Math.max(tp, sr.nearestResistance);
              } else if (pp?.r1 && pp.r1 > currentPrice) {
                tp = Math.max(tp, pp.r1);
              }
              const actualStop = Math.abs(currentPrice - sl);
              const actualTarget = Math.abs(tp - currentPrice);
              analysis.tradePlan = {
                direction: 'BUY',
                entry: currentPrice,
                stopLoss: sl,
                takeProfit: tp,
                riskReward: (actualTarget / actualStop).toFixed(2)
              };
            } else {
              let sl = currentPrice + stopDistance;
              let tp = currentPrice - targetDistance;
              if (sr?.nearestResistance && sr.nearestResistance > currentPrice && sr.nearestResistance < sl) {
                sl = sr.nearestResistance + atr * 0.3;
              }
              if (sr?.nearestSupport && sr.nearestSupport < currentPrice) {
                tp = Math.min(tp, sr.nearestSupport);
              } else if (pp?.s1 && pp.s1 < currentPrice) {
                tp = Math.min(tp, pp.s1);
              }
              const actualStop = Math.abs(sl - currentPrice);
              const actualTarget = Math.abs(currentPrice - tp);
              analysis.tradePlan = {
                direction: 'SELL',
                entry: currentPrice,
                stopLoss: sl,
                takeProfit: tp,
                riskReward: (actualTarget / actualStop).toFixed(2)
              };
            }
            console.log('[MT5 Chart Data] Trade plan generated:', {
              signal: analysis.signal,
              confidence: analysis.confidence,
              entry: analysis.tradePlan.entry,
              stopLoss: analysis.tradePlan.stopLoss,
              takeProfit: analysis.tradePlan.takeProfit
            });
          } else if (analysis.signal !== 'NEUTRAL') {
            console.log('[MT5 Chart Data] No trade plan - missing data:', {
              signal: analysis.signal,
              hasCurrentPrice: !!currentPrice,
              hasAtr: !!atr
            });
          }
          
          // === SL / TP / TRAILING CONFIDENCE SCORING ===
          // Separate confidence scores for each trade level based on multiple factors
          if (analysis.tradePlan && currentPrice && atr && atr > 0) {
            const stopDistance = Math.abs(analysis.tradePlan.entry - analysis.tradePlan.stopLoss);
            const targetDistance = Math.abs(analysis.tradePlan.takeProfit - analysis.tradePlan.entry);
            
            // Guard against zero/near-zero distances that would produce extreme ratios
            if (stopDistance <= 0 || targetDistance <= 0) {
              // Skip confidence scoring - can't evaluate with invalid levels
            } else {
            
            // --- SL CONFIDENCE ---
            let slScore = 50; // Base score
            const slFactors: string[] = [];
            
            // Factor 1: ATR Distance - Is SL at a reasonable ATR-based distance? (1.0-2.0 ATR = ideal)
            const slAtrRatio = stopDistance / atr;
            if (slAtrRatio >= 1.0 && slAtrRatio <= 2.0) {
              slScore += 15;
              slFactors.push(`ATR distance optimal (${slAtrRatio.toFixed(1)}x ATR)`);
            } else if (slAtrRatio >= 0.5 && slAtrRatio <= 3.0) {
              slScore += 8;
              slFactors.push(`ATR distance acceptable (${slAtrRatio.toFixed(1)}x ATR)`);
            } else {
              slScore -= 10;
              slFactors.push(`ATR distance risky (${slAtrRatio.toFixed(1)}x ATR - ${slAtrRatio < 0.5 ? 'too tight' : 'too wide'})`);
            }
            
            // Factor 2: Bollinger Band support at SL zone
            if (bbUpper && bbLower && bbMiddle) {
              const bbWidth = bbUpper - bbLower;
              if (analysis.signal === 'BUY') {
                const slDistFromLower = Math.abs(analysis.tradePlan.stopLoss - bbLower);
                if (slDistFromLower <= bbWidth * 0.15) {
                  slScore += 12;
                  slFactors.push('SL near lower BB support');
                }
              } else {
                const slDistFromUpper = Math.abs(analysis.tradePlan.stopLoss - bbUpper);
                if (slDistFromUpper <= bbWidth * 0.15) {
                  slScore += 12;
                  slFactors.push('SL near upper BB resistance');
                }
              }
            }
            
            // Factor 3: Volume strength (high volume = stronger levels)
            if (volumeRatio > 1.5) {
              slScore += 10;
              slFactors.push(`High volume confirms level (${volumeRatio.toFixed(1)}x avg)`);
            } else if (volumeRatio > 1.0) {
              slScore += 5;
              slFactors.push(`Moderate volume (${volumeRatio.toFixed(1)}x avg)`);
            } else if (volumeRatio < 0.5) {
              slScore -= 8;
              slFactors.push(`Low volume - weak level (${volumeRatio.toFixed(1)}x avg)`);
            }
            
            // Factor 4: RSI alignment (not extreme = SL more likely to hold)
            if (rsi !== null) {
              if (analysis.signal === 'BUY' && rsi > 35 && rsi < 65) {
                slScore += 8;
                slFactors.push('RSI neutral zone - room for movement');
              } else if (analysis.signal === 'SELL' && rsi > 35 && rsi < 65) {
                slScore += 8;
                slFactors.push('RSI neutral zone - room for movement');
              } else if ((analysis.signal === 'BUY' && rsi < 25) || (analysis.signal === 'SELL' && rsi > 75)) {
                slScore += 5;
                slFactors.push('RSI extreme - reversal likely near SL');
              }
            }
            
            // Factor 5: Multi-timeframe alignment
            if (multiTimeframeEnabled && mtfCount >= 2) {
              const aligned = analysis.signal === 'BUY' ? mtfBullish : mtfBearish;
              const alignPct = aligned / mtfCount;
              if (alignPct >= 0.7) {
                slScore += 12;
                slFactors.push(`Strong MTF alignment (${Math.round(alignPct * 100)}% agree)`);
              } else if (alignPct >= 0.5) {
                slScore += 6;
                slFactors.push(`Moderate MTF alignment (${Math.round(alignPct * 100)}% agree)`);
              } else {
                slScore -= 5;
                slFactors.push(`Weak MTF alignment (${Math.round(alignPct * 100)}% agree) - SL at risk`);
              }
            }
            
            // Factor 6: Moving average support near SL
            if (ema20 && ema50 && sma200) {
              const maLevels = [ema20, ema50, sma200];
              const slPrice = analysis.tradePlan.stopLoss;
              const nearbyMA = maLevels.find(ma => Math.abs(ma - slPrice) / currentPrice < 0.005);
              if (nearbyMA) {
                slScore += 10;
                slFactors.push('MA support/resistance near SL zone');
              }
            }
            
            // --- TP CONFIDENCE ---
            let tpScore = 50; // Base score
            const tpFactors: string[] = [];
            
            // Factor 1: Risk/Reward ratio quality
            const rr = targetDistance / stopDistance;
            if (rr >= 2.5) {
              tpScore += 10;
              tpFactors.push(`Excellent R:R (${rr.toFixed(1)}:1)`);
            } else if (rr >= 1.5) {
              tpScore += 15;
              tpFactors.push(`Good R:R (${rr.toFixed(1)}:1) - realistic target`);
            } else if (rr >= 1.0) {
              tpScore += 5;
              tpFactors.push(`Modest R:R (${rr.toFixed(1)}:1)`);
            } else {
              tpScore -= 10;
              tpFactors.push(`Poor R:R (${rr.toFixed(1)}:1) - unfavorable`);
            }
            
            // Factor 2: Momentum strength toward TP
            if (macdHist !== undefined && macdHist !== null) {
              const momentumDir = macdHist > 0 ? 'BUY' : 'SELL';
              if (momentumDir === analysis.signal) {
                const histStrength = Math.abs(macdHist);
                if (histStrength > 0) {
                  tpScore += 12;
                  tpFactors.push('MACD momentum supports move to TP');
                }
              } else {
                tpScore -= 8;
                tpFactors.push('MACD momentum opposes TP direction');
              }
            }
            
            // Factor 3: Bollinger Band obstacle check at TP
            if (bbUpper && bbLower && bbMiddle) {
              if (analysis.signal === 'BUY') {
                if (analysis.tradePlan.takeProfit > bbUpper) {
                  tpScore -= 8;
                  tpFactors.push('TP beyond upper BB - may face resistance');
                } else {
                  tpScore += 8;
                  tpFactors.push('TP within BB range - achievable');
                }
              } else {
                if (analysis.tradePlan.takeProfit < bbLower) {
                  tpScore -= 8;
                  tpFactors.push('TP beyond lower BB - may find support');
                } else {
                  tpScore += 8;
                  tpFactors.push('TP within BB range - achievable');
                }
              }
            }
            
            // Factor 4: Volume supporting TP move
            if (volumeRatio > 1.5) {
              tpScore += 10;
              tpFactors.push('High volume supports momentum to TP');
            } else if (volumeRatio < 0.5) {
              tpScore -= 8;
              tpFactors.push('Low volume - may lack fuel to reach TP');
            }
            
            // Factor 5: Moving average alignment toward TP
            if (maTrend === 'STRONG UPTREND' && analysis.signal === 'BUY') {
              tpScore += 12;
              tpFactors.push('Strong uptrend supports TP target');
            } else if (maTrend === 'STRONG DOWNTREND' && analysis.signal === 'SELL') {
              tpScore += 12;
              tpFactors.push('Strong downtrend supports TP target');
            } else if (maTrend === 'UPTREND' && analysis.signal === 'BUY') {
              tpScore += 6;
              tpFactors.push('Uptrend supports direction');
            } else if (maTrend === 'DOWNTREND' && analysis.signal === 'SELL') {
              tpScore += 6;
              tpFactors.push('Downtrend supports direction');
            } else if (maTrend === 'SIDEWAYS') {
              tpScore -= 5;
              tpFactors.push('Sideways trend - TP may take longer');
            }
            
            // Factor 6: MTF alignment toward TP
            if (multiTimeframeEnabled && mtfCount >= 2) {
              const aligned = analysis.signal === 'BUY' ? mtfBullish : mtfBearish;
              const alignPct = aligned / mtfCount;
              if (alignPct >= 0.7) {
                tpScore += 10;
                tpFactors.push(`MTF momentum toward TP (${Math.round(alignPct * 100)}%)`);
              } else if (alignPct < 0.4) {
                tpScore -= 5;
                tpFactors.push(`MTF divergence - TP at risk (${Math.round(alignPct * 100)}%)`);
              }
            }
            
            // --- TRAILING STOP CONFIDENCE ---
            let trailScore = 50; // Base score
            const trailFactors: string[] = [];
            let trailRecommendation = 'STANDARD'; // TIGHT, STANDARD, WIDE, AGGRESSIVE
            
            // Factor 1: Trend strength determines trail approach
            if (maTrend === 'STRONG UPTREND' || maTrend === 'STRONG DOWNTREND') {
              trailScore += 15;
              trailRecommendation = 'WIDE';
              trailFactors.push('Strong trend - use wide trail to let profits run');
            } else if (maTrend === 'UPTREND' || maTrend === 'DOWNTREND') {
              trailScore += 10;
              trailRecommendation = 'STANDARD';
              trailFactors.push('Moderate trend - standard trailing recommended');
            } else {
              trailScore -= 5;
              trailRecommendation = 'TIGHT';
              trailFactors.push('Sideways - tight trail to protect gains');
            }
            
            // Factor 2: Volatility determines trail distance
            const volatility = analysis.indicators?.atr?.volatility;
            if (volatility === 'HIGH') {
              trailScore += 8;
              trailFactors.push('High volatility - ATR-based trail (Mode 2) recommended');
              if (trailRecommendation !== 'TIGHT') trailRecommendation = 'WIDE';
            } else if (volatility === 'LOW') {
              trailScore += 5;
              trailFactors.push('Low volatility - fixed trail sufficient');
              trailRecommendation = 'TIGHT';
            } else {
              trailScore += 3;
              trailFactors.push('Moderate volatility');
            }
            
            // Factor 3: RSI momentum for trail timing
            if (rsi !== null) {
              if (analysis.signal === 'BUY' && rsi >= 60 && rsi <= 75) {
                trailScore += 10;
                trailFactors.push('RSI bullish momentum supports trailing');
              } else if (analysis.signal === 'SELL' && rsi >= 25 && rsi <= 40) {
                trailScore += 10;
                trailFactors.push('RSI bearish momentum supports trailing');
              } else if (analysis.signal === 'BUY' && rsi > 75) {
                trailScore -= 5;
                trailRecommendation = 'AGGRESSIVE';
                trailFactors.push('RSI overbought - tighten trail, exit pressure likely');
              } else if (analysis.signal === 'SELL' && rsi < 25) {
                trailScore -= 5;
                trailRecommendation = 'AGGRESSIVE';
                trailFactors.push('RSI oversold - tighten trail, bounce likely');
              }
            }
            
            // Factor 4: Volume confirms trail confidence
            if (volumeRatio > 1.3) {
              trailScore += 8;
              trailFactors.push('Volume supports price continuation');
            } else if (volumeRatio < 0.6) {
              trailScore -= 8;
              trailRecommendation = 'TIGHT';
              trailFactors.push('Volume fading - tighten trail');
            }
            
            // Factor 5: MACD histogram for trail momentum
            if (macdHist !== undefined && macdHist !== null) {
              const prevHist = indicators.macd?.prevHistogram;
              if (prevHist !== undefined) {
                const histGrowing = Math.abs(macdHist) > Math.abs(prevHist);
                if (histGrowing && ((macdHist > 0 && analysis.signal === 'BUY') || (macdHist < 0 && analysis.signal === 'SELL'))) {
                  trailScore += 10;
                  trailFactors.push('MACD expanding - momentum growing, widen trail');
                  if (trailRecommendation === 'TIGHT') trailRecommendation = 'STANDARD';
                } else if (!histGrowing) {
                  trailScore -= 5;
                  trailFactors.push('MACD contracting - momentum fading');
                  if (trailRecommendation === 'WIDE') trailRecommendation = 'STANDARD';
                }
              }
            }
            
            // Factor 6: MTF alignment for trail hold
            if (multiTimeframeEnabled && mtfCount >= 2) {
              const aligned = analysis.signal === 'BUY' ? mtfBullish : mtfBearish;
              const alignPct = aligned / mtfCount;
              if (alignPct >= 0.7) {
                trailScore += 10;
                trailFactors.push(`MTF supports hold (${Math.round(alignPct * 100)}%) - trail wider`);
              } else if (alignPct < 0.4) {
                trailScore -= 8;
                trailRecommendation = 'TIGHT';
                trailFactors.push(`MTF diverging (${Math.round(alignPct * 100)}%) - trail tight`);
              }
            }
            
            // Suggested trail ATR multiplier based on recommendation
            const trailAtrMultiplier = {
              'TIGHT': 1.0,
              'STANDARD': 1.5,
              'WIDE': 2.0,
              'AGGRESSIVE': 0.8,
            }[trailRecommendation] || 1.5;
            
            // Clamp all scores to 10-95
            slScore = Math.max(10, Math.min(95, slScore));
            tpScore = Math.max(10, Math.min(95, tpScore));
            trailScore = Math.max(10, Math.min(95, trailScore));
            
            // Attach to analysis
            analysis.slConfidence = {
              score: slScore,
              factors: slFactors,
              summary: slScore >= 75 ? 'Strong SL placement' : slScore >= 55 ? 'Acceptable SL zone' : 'Weak SL - consider adjusting'
            };
            analysis.tpConfidence = {
              score: tpScore,
              factors: tpFactors,
              summary: tpScore >= 75 ? 'TP highly achievable' : tpScore >= 55 ? 'TP realistic but monitor' : 'TP aggressive - partial close recommended'
            };
            analysis.trailConfidence = {
              score: trailScore,
              factors: trailFactors,
              recommendation: trailRecommendation,
              suggestedATRMultiplier: trailAtrMultiplier,
              summary: trailScore >= 75 ? 'Strong trail conditions' : trailScore >= 55 ? 'Standard trail appropriate' : 'Trail with caution'
            };
          } // end else (valid distances)
          } // end if (tradePlan && atr)
          
          // Detect pattern changes for EA refresh
          if (matchingEA && matchingEA.direction) {
            const prevDirection = matchingEA.direction;
            if (analysis.signal !== 'NEUTRAL' && analysis.signal !== prevDirection && prevDirection !== 'NEUTRAL') {
              console.log(`[MT5 Chart Data] Pattern change detected for EA ${matchingEA.id}: Signal changed from ${prevDirection} to ${analysis.signal}`);
              refreshTriggered = true;
            }
          }
        } catch (indicatorError) {
          console.error('[MT5 Chart Data] Error processing indicators:', indicatorError);
          analysis.alerts.push('Error processing some indicators');
        }
      }
      
      // Create flat summary for easy MT5 parsing (top-level, no nested objects)
      const patternsStr = analysis.patterns.slice(0, 3).join(' | ');
      const alertsStr = analysis.alerts.slice(0, 2).join(' | ');
      
      // AUTO-EXECUTE ON TRADELOCKER: Execute trade if signal is strong and autoExecute is enabled
      let tradelockerResult: { success: boolean; orderId?: string; error?: string } | null = null;
      let aiConfirmation: any = null;
      // Use MT5 EA's MIN_CONFIDENCE setting if provided, then fall back to saved EA's minConfidence, default to 65%
      const mt5MinConfidence = eaSettings?.minConfidence;
      const MIN_CONFIDENCE_FOR_AUTO_TRADE = mt5MinConfidence ?? matchingEA?.minConfidence ?? 65;
      
      console.log(`[KNOWLEDGE] ${sanitizedSymbol} Analysis: Confidence=${analysis.confidence}% | Required=${MIN_CONFIDENCE_FOR_AUTO_TRADE}% | Source=${mt5MinConfidence ? 'MT5 EA' : (matchingEA?.name || 'default')} | Session=${eaSettings?.sessionName || 'N/A'}`);
      
      // Fetch news context for the pair (used in AI confirmation and response)
      let newsContextForAI: { sentiment?: any; upcomingEvents?: any[]; topHeadlines?: string[] } | undefined;
      let newsAlerts: any = null;
      try {
        const { newsService } = await import('./news-service');
        if (!newsService.isInitialized()) {
          newsService.initialize();
        }
        const [pairSentiment, upcomingEvents] = await Promise.all([
          newsService.analyzePairSentiment(sanitizedSymbol, 3),
          newsService.getUpcomingEventsForPair(sanitizedSymbol, 3)
        ]);
        const topHeadlines = pairSentiment.topHeadlines || [];
        newsContextForAI = { sentiment: pairSentiment, upcomingEvents, topHeadlines };
        
        const now = Date.now();
        const imminentEvents = upcomingEvents.filter((e: any) => {
          const msUntil = e.datetime - now;
          return msUntil > 0 && msUntil <= 3600000;
        });
        const todayHighImpact = upcomingEvents.filter((e: any) => e.daysUntil === 0 && e.impact === 'high');
        
        newsAlerts = {
          sentiment: {
            label: pairSentiment.overallLabel,
            score: pairSentiment.overallScore,
            bullishCount: pairSentiment.bullishCount,
            bearishCount: pairSentiment.bearishCount,
            tradingImplication: pairSentiment.tradingImplication,
            pairDirection: (pairSentiment as any).pairDirection || null,
          },
          topHeadlines: topHeadlines.slice(0, 5),
          upcomingEvents: upcomingEvents.slice(0, 8),
          imminentEvents: imminentEvents,
          todayHighImpact: todayHighImpact,
          hasImminentNews: imminentEvents.length > 0,
          hasTodayHighImpact: todayHighImpact.length > 0,
        };
        
        if (imminentEvents.length > 0) {
          const eventNames = imminentEvents.map((e: any) => e.event).join(', ');
          analysis.alerts.push(`NEWS ALERT: ${eventNames} releasing within 1 hour - expect high volatility`);
        }
        if (pairSentiment.overallLabel === 'bearish' && analysis.signal === 'BUY') {
          analysis.alerts.push(`NEWS WARNING: Bearish news sentiment conflicts with BUY signal`);
        } else if (pairSentiment.overallLabel === 'bullish' && analysis.signal === 'SELL') {
          analysis.alerts.push(`NEWS WARNING: Bullish news sentiment conflicts with SELL signal`);
        }
        
        console.log(`[News Context] ${sanitizedSymbol}: Sentiment=${pairSentiment.overallLabel} (${pairSentiment.overallScore}), Upcoming=${upcomingEvents.length} events, Imminent=${imminentEvents.length}`);
      } catch (newsErr) {
        console.log(`[News Context] Error fetching news for ${sanitizedSymbol}:`, newsErr instanceof Error ? newsErr.message : 'Unknown');
      }
      
      // VEDD SS AI Plan Integration: Check if live mode is active and adjust trading based on plan
      let veddSSAIActive = false;
      let veddSSAIMatch: any = null;
      try {
        (global as any).mt5VeddSSAILive = (global as any).mt5VeddSSAILive || {};
        const isVeddLive = (global as any).mt5VeddSSAILive[token.userId] === true;
        const veddStrategy = (global as any).mt5WeeklyStrategies?.[token.userId];
        
        if (isVeddLive && veddStrategy?.plan?.weeklyPlan) {
          veddSSAIActive = true;
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const todayName = dayNames[new Date().getUTCDay()];
          const todayPlan = veddStrategy.plan.weeklyPlan[todayName];
          
          if (todayPlan?.pairs) {
            const normalizedSymbol = sanitizedSymbol.toUpperCase().replace('/', '');
            const matchingPairPlan = todayPlan.pairs.find((p: any) => 
              (p.symbol || '').toUpperCase().replace('/', '') === normalizedSymbol
            );
            
            if (matchingPairPlan) {
              veddSSAIMatch = matchingPairPlan;
              const planDirection = matchingPairPlan.direction;
              const planConfidence = matchingPairPlan.confidence || 70;
              const planLotSize = matchingPairPlan.lotSize;
              
              // If EA signal aligns with VEDD SS AI plan, boost confidence
              if (planDirection === 'BOTH' || planDirection === analysis.signal) {
                const boostAmount = Math.min(15, Math.round(planConfidence * 0.15));
                const boostedConfidence = Math.min(98, analysis.confidence + boostAmount);
                console.log(`[VEDD SS AI] Plan MATCH on ${sanitizedSymbol}: ${analysis.signal} aligns with plan (${planDirection}). Confidence ${analysis.confidence}% → ${boostedConfidence}% (+${boostAmount})`);
                analysis.confidence = boostedConfidence;
                analysis.alerts.push(`VEDD SS AI: Trade matches your weekly plan (${planDirection} ${normalizedSymbol} - ${matchingPairPlan.session}). Confidence boosted +${boostAmount}%`);
              } else if (planDirection && planDirection !== analysis.signal && analysis.signal !== 'NEUTRAL') {
                // Signal conflicts with plan direction - add warning but don't block
                console.log(`[VEDD SS AI] Plan CONFLICT on ${sanitizedSymbol}: EA says ${analysis.signal}, Plan says ${planDirection}`);
                analysis.alerts.push(`VEDD SS AI WARNING: Plan recommends ${planDirection} but EA detected ${analysis.signal}. Proceeding with caution.`);
              }

              // Apply plan's lot size if specified and larger than default
              if (planLotSize && planLotSize > 0) {
                (global as any).veddSSAILotOverride = (global as any).veddSSAILotOverride || {};
                (global as any).veddSSAILotOverride[`${token.userId}_${normalizedSymbol}`] = planLotSize;
              }
            } else {
              // Pair not in today's plan
              console.log(`[VEDD SS AI] ${sanitizedSymbol} not in today's plan (${todayName}). Plan has: ${todayPlan.pairs.map((p: any) => p.symbol).join(', ')}`);
            }
          }
        }
      } catch (veddErr) {
        console.error('[VEDD SS AI] Error checking plan:', veddErr);
      }

      // AI Vision Confirmation: Get second opinion from AI before trading (if enabled)
      // ADVISORY MODE: AI provides its confidence and reasoning but does NOT block trades.
      // The EA signal, confidence, and trade plan remain intact regardless of AI decision.
      // Both EA confidence and AI confidence are returned as separate fields.
      const preConfirmSignal = analysis.signal;
      const preConfirmConfidence = analysis.confidence;
      const preConfirmEntry = analysis.tradePlan?.entry;
      const preConfirmSL = analysis.tradePlan?.stopLoss;
      const preConfirmTP = analysis.tradePlan?.takeProfit;
      const logExtraContext = {
        newsSentiment: newsAlerts?.sentiment?.label || undefined,
        newsScore: typeof newsAlerts?.sentiment?.score === 'number' ? newsAlerts.sentiment.score : undefined,
        newsHeadlines: newsAlerts?.topHeadlines?.slice(0, 3) || newsContextForAI?.topHeadlines?.slice(0, 3) || undefined,
        upcomingEvents: newsAlerts?.upcomingEvents?.slice(0, 3)?.map((e: any) => ({
          event: e.title || e.event || 'Unknown',
          impact: e.impact || 'unknown',
          time: e.time || e.date || '',
        })) || undefined,
        newsConflict: analysis.alerts?.some((a: string) => a.includes('NEWS WARNING') || a.includes('NEWS CONFLICT')) || false,
        veddSSAIActive,
        veddSSAIPlanMatch: veddSSAIMatch ? {
          direction: veddSSAIMatch.direction,
          session: veddSSAIMatch.session,
          confidence: veddSSAIMatch.confidence,
          lotSize: veddSSAIMatch.lotSize,
          entryCondition: veddSSAIMatch.entryCondition,
        } : null,
        breakoutActive: advanced.breakoutDetection?.isBreakoutWindow || false,
        breakoutDetected: advanced.breakoutDetection?.breakoutDetected || false,
        breakoutDirection: advanced.breakoutDetection?.breakoutDirection || undefined,
        breakoutStrength: advanced.breakoutDetection?.breakoutStrength || undefined,
      };
      if (analysis.signal !== 'NEUTRAL' && 
          analysis.confidence >= MIN_CONFIDENCE_FOR_AUTO_TRADE && 
          analysis.tradePlan) {
        try {
          const { isAiVisionConfirmationEnabled, getAiVisionConfirmation, addAiConfirmationLog, getUserModelPreference, AVAILABLE_VISION_MODELS } = await import('./openai');
          if (isAiVisionConfirmationEnabled(token.userId)) {
            console.log(`[AI Vision Confirmation] Enabled for user ${token.userId} - requesting AI second opinion on ${sanitizedSymbol}`);
            const selectedModelId = getUserModelPreference(token.userId);
            const modelInfo = AVAILABLE_VISION_MODELS.find((m: any) => m.id === selectedModelId);

            aiConfirmation = await getAiVisionConfirmation(
              candles,
              analysis.indicators,
              analysis.signal,
              analysis.confidence,
              analysis.tradePlan,
              sanitizedSymbol,
              sanitizedTimeframe,
              token.userId,
              newsContextForAI
            );
            
            // Confidence gate: AI can override low EA confidence if AI is confident enough
            // - Both pass (EA >= 80% AND AI >= threshold) → APPROVED
            // - AI passes but EA doesn't (AI >= threshold) → AI OVERRIDE (trade allowed)
            // - AI fails (regardless of EA) → BLOCKED
            const { getAiMinConfidence } = await import('./openai');
            const AI_MIN_CONFIDENCE = getAiMinConfidence(token.userId);
            const EA_MIN_CONFIDENCE_FOR_AI_GATE = 80;
            const aiPasses = aiConfirmation.aiConfidence >= AI_MIN_CONFIDENCE;
            const eaPasses = preConfirmConfidence >= EA_MIN_CONFIDENCE_FOR_AI_GATE;
            const tradeAllowed = aiPasses; // AI confidence is the deciding factor

            if (!tradeAllowed) {
              const reason = !eaPasses
                ? `Both below threshold (AI: ${aiConfirmation.aiConfidence}% < ${AI_MIN_CONFIDENCE}%, EA: ${preConfirmConfidence}% < ${EA_MIN_CONFIDENCE_FOR_AI_GATE}%)`
                : `AI confidence too low (AI: ${aiConfirmation.aiConfidence}% < ${AI_MIN_CONFIDENCE}%, EA: ${preConfirmConfidence}%)`;
              console.log(`[AI Vision Confirmation] BLOCKED trade on ${sanitizedSymbol} - ${reason}: ${aiConfirmation.reasoning}`);
              analysis.alerts.push(`TRADE BLOCKED: ${reason} - ${aiConfirmation.reasoning}`);
              aiConfirmation.confirmed = false;
              analysis.tradePlan = null;
              analysis.signal = 'NEUTRAL';
              addAiConfirmationLog(token.userId, {
                timestamp: new Date().toISOString(),
                symbol: sanitizedSymbol, timeframe: sanitizedTimeframe,
                proposedSignal: preConfirmSignal, proposedConfidence: preConfirmConfidence,
                proposedEntry: preConfirmEntry, proposedSL: preConfirmSL, proposedTP: preConfirmTP,
                aiDecision: 'REJECTED', aiDirection: aiConfirmation.aiDirection,
                aiConfidence: aiConfirmation.aiConfidence, reasoning: `${reason} | ${aiConfirmation.reasoning}`,
                modelUsed: modelInfo?.name || selectedModelId,
                ...logExtraContext,
              });
            } else {
              const isAiOverride = aiPasses && !eaPasses;
              const approvalLabel = isAiOverride ? 'AI OVERRIDE' : 'APPROVED';
              console.log(`[AI Vision Confirmation] ${approvalLabel} trade on ${sanitizedSymbol} (EA: ${preConfirmConfidence}% | AI: ${aiConfirmation.aiConfidence}%)${isAiOverride ? ' - AI confidence overriding low EA' : ''}: ${aiConfirmation.reasoning}`);
              analysis.alerts.push(`TRADE ${approvalLabel} (EA: ${preConfirmConfidence}% | AI: ${aiConfirmation.aiConfidence}%)${isAiOverride ? ' [AI overrode low EA]' : ''} - ${aiConfirmation.reasoning}`);
              aiConfirmation.confirmed = true;
              const currentPrice = indicators?.price?.bid || candles[0]?.c || 0;
              const maxDeviation = currentPrice * 0.05;
              let hasAdjustments = false;
              if (typeof aiConfirmation.adjustedStopLoss === 'number' && !isNaN(aiConfirmation.adjustedStopLoss) && aiConfirmation.adjustedStopLoss > 0 &&
                  Math.abs(aiConfirmation.adjustedStopLoss - currentPrice) < maxDeviation) {
                analysis.tradePlan.stopLoss = aiConfirmation.adjustedStopLoss;
                hasAdjustments = true;
              }
              if (typeof aiConfirmation.adjustedTakeProfit === 'number' && !isNaN(aiConfirmation.adjustedTakeProfit) && aiConfirmation.adjustedTakeProfit > 0 &&
                  Math.abs(aiConfirmation.adjustedTakeProfit - currentPrice) < maxDeviation) {
                analysis.tradePlan.takeProfit = aiConfirmation.adjustedTakeProfit;
                hasAdjustments = true;
              }
              if (typeof aiConfirmation.adjustedEntry === 'number' && !isNaN(aiConfirmation.adjustedEntry) && aiConfirmation.adjustedEntry > 0 &&
                  Math.abs(aiConfirmation.adjustedEntry - currentPrice) < maxDeviation) {
                analysis.tradePlan.entry = aiConfirmation.adjustedEntry;
                hasAdjustments = true;
              }
              addAiConfirmationLog(token.userId, {
                timestamp: new Date().toISOString(),
                symbol: sanitizedSymbol, timeframe: sanitizedTimeframe,
                proposedSignal: preConfirmSignal, proposedConfidence: preConfirmConfidence,
                proposedEntry: preConfirmEntry, proposedSL: preConfirmSL, proposedTP: preConfirmTP,
                aiDecision: isAiOverride ? 'AI_OVERRIDE' : (hasAdjustments ? 'ADJUSTED' : 'APPROVED'),
                aiDirection: aiConfirmation.aiDirection,
                aiConfidence: aiConfirmation.aiConfidence, reasoning: aiConfirmation.reasoning,
                adjustedEntry: aiConfirmation.adjustedEntry, adjustedSL: aiConfirmation.adjustedStopLoss,
                adjustedTP: aiConfirmation.adjustedTakeProfit,
                modelUsed: modelInfo?.name || selectedModelId,
                ...logExtraContext,
              });
            }
          }
        } catch (confirmError) {
          console.error('[AI Vision Confirmation] Error:', confirmError);
          analysis.alerts.push('AI Second Opinion unavailable - proceeding with EA analysis only');
          const { addAiConfirmationLog, getUserModelPreference, AVAILABLE_VISION_MODELS } = await import('./openai');
          const errModelId = getUserModelPreference(token.userId);
          const errModelInfo = AVAILABLE_VISION_MODELS.find((m: any) => m.id === errModelId);
          addAiConfirmationLog(token.userId, {
            timestamp: new Date().toISOString(),
            symbol: sanitizedSymbol, timeframe: sanitizedTimeframe,
            proposedSignal: preConfirmSignal, proposedConfidence: preConfirmConfidence,
            proposedEntry: preConfirmEntry, proposedSL: preConfirmSL, proposedTP: preConfirmTP,
            aiDecision: 'ERROR', aiDirection: 'NEUTRAL', aiConfidence: 0,
            reasoning: `AI confirmation error: ${confirmError instanceof Error ? confirmError.message : 'Unknown error'} - trade proceeding with EA analysis`,
            modelUsed: errModelInfo?.name || errModelId,
            ...logExtraContext,
          });
          aiConfirmation = {
            confirmed: false,
            aiDirection: 'NEUTRAL',
            aiConfidence: 0,
            reasoning: 'AI unavailable - using EA analysis only',
          };
        }
      }
      
      if (analysis.signal !== 'NEUTRAL' && 
          analysis.confidence >= MIN_CONFIDENCE_FOR_AUTO_TRADE && 
          analysis.tradePlan) {
        
        const tlConnection = await storage.getUserTradelockerConnection(token.userId);
        console.log(`[KNOWLEDGE] Signal MANIFESTED for ${sanitizedSymbol}:`, { 
          signal: analysis.signal, 
          confidence: analysis.confidence,
          hasTradeLocker: !!tlConnection,
          autoExecute: tlConnection?.autoExecute
        });
        
        if (tlConnection && tlConnection.isActive && tlConnection.autoExecute) {
          // Check for duplicate/recent trades on same symbol to avoid over-trading
          const recentTradeKey = `last_trade_${token.userId}_${sanitizedSymbol}`;
          (global as any).recentTrades = (global as any).recentTrades || {};
          const lastTradeTime = (global as any).recentTrades[recentTradeKey];
          const now = Date.now();
          // Use EA setting for cooldown, default to 5 minutes
          const cooldownMinutes = matchingEA?.tradeCooldownMinutes ?? 5;
          const TRADE_COOLDOWN_MS = cooldownMinutes * 60 * 1000;
          
          if (!lastTradeTime || (now - lastTradeTime) > TRADE_COOLDOWN_MS) {
            // SET COOLDOWN FIRST to prevent race conditions from concurrent requests
            (global as any).recentTrades[recentTradeKey] = now;
            
            // Check for existing open positions on this symbol to prevent duplicate entries
            const recentTrades = await storage.getTradelockerTradeLogs(token.userId, 10);
            const hasOpenPosition = recentTrades.some(t => 
              t.symbol?.toUpperCase() === sanitizedSymbol.toUpperCase() && 
              t.action === 'OPEN' && 
              t.status === 'executed' &&
              // Only consider trades from last 24 hours as potentially open
              t.createdAt && (now - new Date(t.createdAt).getTime()) < 24 * 60 * 60 * 1000
            );
            
            if (hasOpenPosition) {
              console.log(`[MT5 Chart Data AutoTrade] Skipping trade - existing open position on ${sanitizedSymbol}`);
            } else {
              // Use default volume of 0.01 or from matching EA settings
              const tradeVolume = matchingEA?.volume || 0.01;
              
              console.log('[MT5 Chart Data AutoTrade] Executing trade on TradeLocker:', {
                action: 'OPEN',
                symbol: sanitizedSymbol,
                direction: analysis.signal,
                volume: tradeVolume,
                entry: analysis.tradePlan.entry,
                stopLoss: analysis.tradePlan.stopLoss,
                takeProfit: analysis.tradePlan.takeProfit
              });
              
              try {
                tradelockerResult = await executeMT5SignalOnTradeLocker(tlConnection, {
                  action: 'OPEN',
                  symbol: sanitizedSymbol,
                  direction: analysis.signal,
                  volume: tradeVolume,
                  entryPrice: analysis.tradePlan.entry,
                  stopLoss: analysis.tradePlan.stopLoss,
                  takeProfit: analysis.tradePlan.takeProfit,
                });
                
                // Log the trade attempt
                await storage.createTradelockerTradeLog({
                  connectionId: tlConnection.id,
                  userId: token.userId,
                  sourceSignalId: null,
                  action: 'OPEN',
                  symbol: sanitizedSymbol,
                  direction: analysis.signal,
                  volume: tradeVolume,
                  entryPrice: analysis.tradePlan.entry,
                  stopLoss: analysis.tradePlan.stopLoss,
                  takeProfit: analysis.tradePlan.takeProfit,
                  tradelockerOrderId: tradelockerResult.orderId || null,
                  status: tradelockerResult.success ? 'executed' : 'failed',
                  errorMessage: tradelockerResult.error || null,
                });
                
                // Update connection stats
                if (tradelockerResult.success) {
                  await storage.updateTradelockerConnection(tlConnection.id, {
                    tradeCount: tlConnection.tradeCount + 1,
                    lastConnectedAt: new Date(),
                    lastError: null,
                  });
                  console.log(`[BUILD] BORN (9)! Trade MANIFESTED on TradeLocker! Order: ${tradelockerResult.orderId}. Word is BOND!`);
                } else {
                  await storage.updateTradelockerConnection(tlConnection.id, {
                    lastError: tradelockerResult.error,
                  });
                  console.log('[MT5 Chart Data AutoTrade] Trade failed:', tradelockerResult.error);
                }
              } catch (err) {
                console.error('[MT5 Chart Data AutoTrade] Error executing trade:', err);
                tradelockerResult = { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
              }
            }
          } else {
            const cooldownRemaining = Math.round((TRADE_COOLDOWN_MS - (now - lastTradeTime)) / 1000);
            console.log(`[MT5 Chart Data AutoTrade] Skipping trade - cooldown active (${cooldownRemaining}s remaining)`);
          }
        }
      }
      
      // Determine if MT5 EA should execute trade (with cooldown check)
      const mt5TradeKey = `mt5_trade_${token.userId}_${sanitizedSymbol}`;
      (global as any).mt5TradeCooldowns = (global as any).mt5TradeCooldowns || {};
      const lastMT5TradeTime = (global as any).mt5TradeCooldowns[mt5TradeKey];
      const nowForMT5 = Date.now();
      // Use EA setting for cooldown, default to 5 minutes
      const mt5CooldownMinutes = matchingEA?.tradeCooldownMinutes ?? 5;
      const MT5_TRADE_COOLDOWN_MS = mt5CooldownMinutes * 60 * 1000;
      
      const mt5CooldownActive = lastMT5TradeTime && (nowForMT5 - lastMT5TradeTime) < MT5_TRADE_COOLDOWN_MS;
      
      // Check max open trades setting
      const maxOpenTrades = matchingEA?.maxOpenTrades ?? 1;
      
      const shouldMT5Execute = !mt5CooldownActive && 
                                analysis.signal !== 'NEUTRAL' && 
                                analysis.confidence >= MIN_CONFIDENCE_FOR_AUTO_TRADE && 
                                analysis.tradePlan !== null;
      
      // Log with VEDD expert language style
      if (analysis.signal !== 'NEUTRAL') {
        if (analysis.confidence < MIN_CONFIDENCE_FOR_AUTO_TRADE) {
          console.log(`[UNDERSTANDING] No rush G - ${sanitizedSymbol} at ${analysis.confidence}% ain't ready. Need ${MIN_CONFIDENCE_FOR_AUTO_TRADE}% to BUILD.`);
        } else if (mt5CooldownActive) {
          const remainingSecs = Math.round((MT5_TRADE_COOLDOWN_MS - (nowForMT5 - lastMT5TradeTime)) / 1000);
          console.log(`[WISDOM] Peace ${sanitizedSymbol} - cooldown active. Wait ${remainingSecs}s for the EQUALITY (6) before you BUILD.`);
        } else if (!analysis.tradePlan) {
          console.log(`[KNOWLEDGE] ${sanitizedSymbol} signal detected but no trade plan MANIFESTED yet. Patience.`);
        } else if (shouldMT5Execute) {
          console.log(`[BUILD] BORN (9)! ${analysis.signal} ${sanitizedSymbol} at ${analysis.confidence}% - Word is BOND, cipher MANIFESTING!`);
        }
      }
      
      // Set cooldown if we're telling EA to execute
      if (shouldMT5Execute) {
        (global as any).mt5TradeCooldowns[mt5TradeKey] = nowForMT5;
      }
      
      // Calculate position sizing based on EA risk settings
      // Get risk settings from matching EA or use defaults
      const useRiskPercent = matchingEA?.useRiskPercent ?? true; // Default to risk-based
      const riskPercentSetting = matchingEA?.riskPercent ?? 0.25; // Default 0.25%
      const fixedVolumeSetting = matchingEA?.volume ?? 0.01; // Default fixed lot
      
      const accountData = (global as any).mt5AccountData?.[token.userId];
      const accountBalance = accountData?.balance || 10000; // Default to 10k if no account data
      const riskAmount = accountBalance * (riskPercentSetting / 100); // Dollar amount to risk
      
      console.log(`[CULTURE] ${matchingEA?.name || 'Default'} MATHEMATICS: Risk=${riskPercentSetting}% | Fixed=${fixedVolumeSetting} lots | Mode=${useRiskPercent ? 'Risk%' : 'Fixed'}`);
      
      // Calculate lot size based on settings
      let mt5Volume = fixedVolumeSetting; // Start with fixed lot size

      // Check for VEDD SS AI lot size override
      const veddLotKey = `${token.userId}_${sanitizedSymbol.toUpperCase().replace('/', '')}`;
      const veddLotOverride = (global as any).veddSSAILotOverride?.[veddLotKey];
      if (veddSSAIActive && veddLotOverride && veddLotOverride > 0) {
        mt5Volume = veddLotOverride;
        console.log(`[VEDD SS AI] Using plan lot size for ${sanitizedSymbol}: ${mt5Volume} lots`);
      }
      
      // Only calculate risk-based sizing if enabled and not overridden by VEDD SS AI
      if (!(veddSSAIActive && veddLotOverride > 0) && useRiskPercent && analysis.tradePlan && analysis.tradePlan.entry && analysis.tradePlan.stopLoss) {
        const entry = analysis.tradePlan.entry;
        const sl = analysis.tradePlan.stopLoss;
        const slDistance = Math.abs(entry - sl);
        
        // For forex pairs, pip value varies. Use approximation:
        // - For XXX/USD pairs: pip value ≈ $10 per standard lot
        // - For USD/XXX pairs: pip value ≈ $10 / price per standard lot
        // - For gold (XAUUSD): $100 per $1 move per standard lot
        const currentPrice = candles[0]?.c || entry;
        
        let pipValue = 10; // Default $10/pip for standard lot
        let slPips = slDistance;
        
        // Adjust for gold/metals
        if (sanitizedSymbol.includes('XAU') || sanitizedSymbol.includes('GOLD')) {
          // Gold: $100 per $1 move per standard lot
          pipValue = 100;
          slPips = slDistance; // Already in dollars
        } else if (sanitizedSymbol.includes('JPY')) {
          // JPY pairs: pip is 0.01, value adjusted
          slPips = slDistance * 100; // Convert to pips
          pipValue = 10;
        } else if (slDistance < 0.01) {
          // Forex pairs: pip is 0.0001, so SL of 0.0050 = 50 pips
          slPips = slDistance * 10000; // Convert to pips
          pipValue = 10;
        } else {
          // Already in pips or different calculation needed
          slPips = slDistance * 10000;
          pipValue = 10;
        }
        
        // Calculate lots: Risk Amount / (SL Pips * Pip Value)
        if (slPips > 0) {
          const calculatedLots = riskAmount / (slPips * pipValue);
          // Round to 2 decimal places and enforce min/max
          mt5Volume = Math.max(0.01, Math.min(10, Math.round(calculatedLots * 100) / 100));
        }
        
        console.log(`[POWER] Balance CIPHER: $${accountBalance.toFixed(2)} | Risk ${riskPercentSetting}% = $${riskAmount.toFixed(2)} at stake`);
        console.log(`[POWER] SL Distance: ${slDistance} | Pips: ${slPips.toFixed(1)} | Lots MANIFESTED: ${mt5Volume}`);
      } else if (useRiskPercent) {
        // Risk-based but no trade plan - use conservative estimate
        console.log(`[WISDOM] No trade plan yet - using fixed lots: ${fixedVolumeSetting}. Patience builds POWER.`);
        mt5Volume = fixedVolumeSetting;
      } else {
        // Fixed lot mode - use the configured fixed volume
        console.log(`[EQUALITY] Fixed lot mode active - ${fixedVolumeSetting} lots. Word is BOND.`);
        mt5Volume = fixedVolumeSetting;
      }
      
      // Calculate cooldown remaining for response
      const mt5CooldownRemaining = mt5CooldownActive 
        ? Math.round((MT5_TRADE_COOLDOWN_MS - (nowForMT5 - lastMT5TradeTime)) / 1000) 
        : 0;
      
      // Session recommendation based on live trade profit analysis
      let recommendedSession = 0; // 0 = no recommendation
      let sessionAnalysis: { session: string; profitByHour: Record<number, number>; bestHours: number[]; totalProfit: number } | null = null;
      
      const closedTradesCache = (global as any).mt5ClosedTrades || {};
      const userClosedTrades = closedTradesCache[token.userId]?.trades || [];
      
      if (userClosedTrades.length >= 5 && eaSettings?.tradingSession === 6) {
        // Analyze hourly profit for this symbol
        const hourlyProfit: Record<number, { total: number; count: number; wins: number }> = {};
        const symUpper = sanitizedSymbol.toUpperCase().replace('/', '');
        
        for (const t of userClosedTrades) {
          const tSym = (t.symbol || '').toUpperCase().replace('/', '');
          if (tSym !== symUpper) continue;
          const hour = t.openHour ?? t.closeHour ?? 0;
          if (!hourlyProfit[hour]) hourlyProfit[hour] = { total: 0, count: 0, wins: 0 };
          hourlyProfit[hour].total += (t.profit || 0);
          hourlyProfit[hour].count += 1;
          if ((t.profit || 0) > 0) hourlyProfit[hour].wins += 1;
        }
        
        // Define sessions with their UTC hour ranges
        const sessions = [
          { id: 1, name: 'London', start: 8, end: 17 },
          { id: 2, name: 'New York', start: 13, end: 22 },
          { id: 3, name: 'Tokyo', start: 0, end: 9 },
          { id: 4, name: 'Sydney', start: 22, end: 7 },
          { id: 5, name: 'LDN/NY Overlap', start: 13, end: 17 },
        ];
        
        // Calculate total profit per session
        let bestSessionProfit = -Infinity;
        let bestSessionId = 0;
        
        for (const sess of sessions) {
          let sessProfit = 0;
          let sessCount = 0;
          let sessWins = 0;
          
          for (const [hourStr, data] of Object.entries(hourlyProfit)) {
            const h = parseInt(hourStr);
            const inSession = sess.start <= sess.end 
              ? (h >= sess.start && h < sess.end)
              : (h >= sess.start || h < sess.end);
            if (inSession) {
              sessProfit += data.total;
              sessCount += data.count;
              sessWins += data.wins;
            }
          }
          
          // Need at least 3 trades in a session to recommend it
          if (sessCount >= 3 && sessProfit > bestSessionProfit) {
            bestSessionProfit = sessProfit;
            bestSessionId = sess.id;
          }
        }
        
        if (bestSessionId > 0) {
          recommendedSession = bestSessionId;
          const bestSess = sessions.find(s => s.id === bestSessionId);
          console.log(`[SESSION] Recommending ${bestSess?.name} for ${sanitizedSymbol} - Profit: $${bestSessionProfit.toFixed(2)} from live trades`);
          
          // Build analysis for response
          const profitByHour: Record<number, number> = {};
          const bestHours: number[] = [];
          for (const [h, data] of Object.entries(hourlyProfit)) {
            profitByHour[parseInt(h)] = data.total;
            if (data.total > 0 && data.wins / data.count >= 0.55) bestHours.push(parseInt(h));
          }
          sessionAnalysis = { session: bestSess?.name || '', profitByHour, bestHours, totalProfit: bestSessionProfit };
        }
      }
      
      res.json({ 
        success: true, 
        message: "Chart data received and analyzed",
        // MT5 TRADE EXECUTION COMMANDS - EA should check these to execute trades
        mt5ExecuteTrade: shouldMT5Execute, // TRUE = EA should open trade NOW
        mt5OrderType: analysis.signal === 'BUY' ? 0 : (analysis.signal === 'SELL' ? 1 : -1), // 0=BUY, 1=SELL, -1=NONE
        mt5Volume: mt5Volume, // Lot size for the trade
        mt5Direction: analysis.signal, // "BUY", "SELL", or "NEUTRAL"
        mt5CooldownActive: mt5CooldownActive, // TRUE = trade cooldown is active, don't trade
        mt5CooldownSeconds: mt5CooldownRemaining, // Seconds until cooldown expires
        // MT5-friendly flat summary (parse these fields in EA)
        mt5Signal: analysis.signal,
        mt5Confidence: preConfirmConfidence || analysis.confidence,
        mt5Trend: analysis.trend,
        mt5Patterns: patternsStr,
        mt5Alerts: alertsStr,
        mt5Entry: analysis.tradePlan?.entry || 0,
        mt5StopLoss: analysis.tradePlan?.stopLoss || 0,
        mt5TakeProfit: analysis.tradePlan?.takeProfit || 0,
        mt5RiskReward: analysis.tradePlan?.riskReward || "0",
        mt5HasTradePlan: analysis.tradePlan ? true : false,
        // Session recommendation for Auto mode
        mt5RecommendedSession: recommendedSession,
        mt5SessionAnalysis: sessionAnalysis,
        mt5ActiveSession: eaSettings?.sessionName || null,
        mt5RecommendedSessionName: recommendedSession > 0 
          ? ['', 'London', 'New York', 'Tokyo', 'Sydney', 'LDN/NY Overlap'][recommendedSession] || null 
          : null,
        // SL / TP / Trailing Confidence Scores (flat for MT5 parsing)
        mt5SLConfidence: analysis.slConfidence?.score || 0,
        mt5SLSummary: analysis.slConfidence?.summary || '',
        mt5SLFactors: analysis.slConfidence?.factors?.join(' | ') || '',
        mt5TPConfidence: analysis.tpConfidence?.score || 0,
        mt5TPSummary: analysis.tpConfidence?.summary || '',
        mt5TPFactors: analysis.tpConfidence?.factors?.join(' | ') || '',
        mt5TrailConfidence: analysis.trailConfidence?.score || 0,
        mt5TrailSummary: analysis.trailConfidence?.summary || '',
        mt5TrailRecommendation: analysis.trailConfidence?.recommendation || 'STANDARD',
        mt5TrailATRMultiplier: analysis.trailConfidence?.suggestedATRMultiplier || 1.5,
        mt5TrailFactors: analysis.trailConfidence?.factors?.join(' | ') || '',
        // Market Open Breakout Detection (flat for MT5 parsing)
        mt5BreakoutWindow: analysis.indicators?.breakoutDetection?.isBreakoutWindow || false,
        mt5BreakoutSession: analysis.indicators?.breakoutDetection?.session || 'NONE',
        mt5BreakoutDetected: analysis.indicators?.breakoutDetection?.breakoutDetected || false,
        mt5BreakoutDirection: analysis.indicators?.breakoutDetection?.breakoutDirection || 'NONE',
        mt5BreakoutStrength: analysis.indicators?.breakoutDetection?.breakoutStrength || 'NONE',
        mt5BreakoutSignal: analysis.indicators?.breakoutDetection?.signal || 'NEUTRAL',
        mt5BreakoutVolumeConfirmed: analysis.indicators?.breakoutDetection?.volumeConfirmed || false,
        mt5BreakoutRangeHigh: analysis.indicators?.breakoutDetection?.preSessionRange?.high || 0,
        mt5BreakoutRangeLow: analysis.indicators?.breakoutDetection?.preSessionRange?.low || 0,
        mt5BreakoutApproaching: analysis.indicators?.breakoutDetection?.approachingBreakout || false,
        mt5BreakoutApproachingDir: analysis.indicators?.breakoutDetection?.approachingDirection || 'NONE',
        mt5BreakoutRangePosition: analysis.indicators?.breakoutDetection?.rangePosition || 0,
        // Independent M15 Breakout Monitor (separate from EA timeframe)
        mt5IndBreakoutActive: !!analysis.indicators?.independentBreakout,
        mt5IndBreakoutDetected: analysis.indicators?.independentBreakout?.breakoutDetected || false,
        mt5IndBreakoutDirection: analysis.indicators?.independentBreakout?.breakoutDirection || 'NONE',
        mt5IndBreakoutStrength: analysis.indicators?.independentBreakout?.breakoutStrength || 'NONE',
        mt5IndBreakoutSignal: analysis.indicators?.independentBreakout?.signal || 'NEUTRAL',
        mt5IndBreakoutApproaching: analysis.indicators?.independentBreakout?.approachingBreakout || false,
        mt5IndBreakoutApproachingDir: analysis.indicators?.independentBreakout?.approachingDirection || 'NONE',
        // AI Second Opinion results (flat for MT5 parsing - separate from EA confidence)
        mt5AiEnabled: !!aiConfirmation,
        mt5AiDecision: aiConfirmation ? (aiConfirmation.confirmed ? 'APPROVED' : 'BLOCKED') : 'OFF',
        mt5AiConfidence: aiConfirmation?.aiConfidence || 0,
        mt5AiDirection: aiConfirmation?.aiDirection || 'NEUTRAL',
        mt5AiReasoning: aiConfirmation?.reasoning || '',
        mt5EaConfidence: preConfirmConfidence || analysis.confidence,
        // Full analysis for web clients
        analysis,
        candlesReceived: candles.length,
        refreshTriggered,
        matchingEA: matchingEA ? matchingEA.id : null,
        // Auto-trade result (if executed on TradeLocker)
        tradelocker: tradelockerResult ? {
          executed: tradelockerResult.success,
          orderId: tradelockerResult.orderId,
          error: tradelockerResult.error,
        } : null,
        // AI Vision Confirmation result (if enabled)
        aiConfirmation: aiConfirmation ? {
          confirmed: aiConfirmation.confirmed,
          aiDirection: aiConfirmation.aiDirection,
          aiConfidence: aiConfirmation.aiConfidence,
          reasoning: aiConfirmation.reasoning,
        } : null,
        // VEDD SS AI plan status
        mt5VeddSSAIActive: veddSSAIActive,
        mt5VeddSSAIPlanMatch: veddSSAIMatch ? {
          direction: veddSSAIMatch.direction,
          session: veddSSAIMatch.session,
          confidence: veddSSAIMatch.confidence,
          lotSize: veddSSAIMatch.lotSize,
          entryCondition: veddSSAIMatch.entryCondition,
        } : null,
        // News alerts and economic events context
        newsAlerts,
      });
    } catch (error) {
      console.error('Error processing MT5 chart data:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to process chart data" });
    }
  });

  // Get cached MT5 chart data for a symbol
  app.get("/api/mt5/chart-data/:symbol/:timeframe", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const { symbol, timeframe } = req.params;
    
    const chartDataKey = `mt5_chart_${userId}_${symbol}_${timeframe}`;
    const cache = (global as any).mt5ChartDataCache || {};
    const chartData = cache[chartDataKey];
    
    if (!chartData) {
      return res.status(404).json({ error: "No chart data found. Make sure your MT5 Chart Data EA is running." });
    }
    
    res.json(chartData);
  });

  // Get MT5 Chart Data EA connection status for the current user
  app.get("/api/mt5/connection-status", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    const statusCache = (global as any).mt5ConnectionStatus || {};
    const status = statusCache[userId];
    
    if (!status) {
      return res.json({ 
        connected: false, 
        message: "No MT5 Chart Data EA connection detected. Start the EA on your MT5 terminal." 
      });
    }
    
    // Check if connection is recent (within last 5 minutes = 300 seconds)
    const lastSeen = new Date(status.lastSeen);
    const now = new Date();
    const secondsAgo = Math.floor((now.getTime() - lastSeen.getTime()) / 1000);
    const isActive = secondsAgo < 300; // 5 minutes
    
    res.json({
      connected: isActive,
      lastSeen: status.lastSeen,
      secondsAgo,
      symbol: status.symbol,
      timeframe: status.timeframe,
      broker: status.broker,
      candleCount: status.candleCount,
      message: isActive 
        ? `Connected: ${status.symbol} ${status.timeframe} from ${status.broker}`
        : `Last seen ${Math.floor(secondsAgo / 60)} minutes ago`
    });
  });

  // Get MT5 account balance and breakdown data (supports multiple brokers)
  app.get("/api/mt5/account-data", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    const accountCache = (global as any).mt5AccountData || {};
    const userAccounts = accountCache[userId];
    
    if (!userAccounts) {
      return res.json({ 
        connected: false, 
        accounts: [],
        message: "No account data available. Make sure your MT5 Chart Data EA is running with the latest version." 
      });
    }

    // Support both old format (single object) and new format (keyed by broker)
    const now = new Date();
    const accounts: any[] = [];

    if (userAccounts.lastUpdated && typeof userAccounts.lastUpdated === 'string') {
      // Old single-account format — convert to multi-broker
      const secondsAgo = Math.floor((now.getTime() - new Date(userAccounts.lastUpdated).getTime()) / 1000);
      const isActive = secondsAgo < 300;
      accounts.push({
        connected: isActive,
        lastUpdated: userAccounts.lastUpdated,
        secondsAgo,
        broker: userAccounts.broker || 'Unknown',
        balance: userAccounts.balance || 0,
        equity: userAccounts.equity || 0,
        margin: userAccounts.margin || 0,
        freeMargin: userAccounts.freeMargin || 0,
        profit: userAccounts.profit || 0,
        credit: userAccounts.credit || 0,
        currency: userAccounts.currency || 'USD',
        accountNumber: userAccounts.accountNumber || 0,
        accountName: userAccounts.accountName || '',
        server: userAccounts.server || '',
        leverage: userAccounts.leverage || 0,
        marginLevel: userAccounts.marginLevel || 0,
        dailyPnL: userAccounts.dailyPnL || 0,
        dailyPnLPercent: userAccounts.dailyPnLPercent || 0,
        openPositions: userAccounts.openPositions || 0,
        pendingOrders: userAccounts.pendingOrders || 0,
        buyPositions: userAccounts.buyPositions || 0,
        sellPositions: userAccounts.sellPositions || 0,
        totalBuyLots: userAccounts.totalBuyLots || 0,
        totalSellLots: userAccounts.totalSellLots || 0,
        unrealizedProfit: userAccounts.unrealizedProfit || 0,
      });
    } else {
      // New multi-broker format
      for (const [key, acctData] of Object.entries(userAccounts)) {
        const accountData = acctData as any;
        if (!accountData.lastUpdated) continue;
        const lastUpdated = new Date(accountData.lastUpdated);
        const secondsAgo = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
        const isActive = secondsAgo < 300;
        if (secondsAgo > 3600) continue; // Skip accounts not seen in over 1 hour
        accounts.push({
          connected: isActive,
          lastUpdated: accountData.lastUpdated,
          secondsAgo,
          broker: accountData.broker || 'Unknown',
          balance: accountData.balance || 0,
          equity: accountData.equity || 0,
          margin: accountData.margin || 0,
          freeMargin: accountData.freeMargin || 0,
          profit: accountData.profit || 0,
          credit: accountData.credit || 0,
          currency: accountData.currency || 'USD',
          accountNumber: accountData.accountNumber || 0,
          accountName: accountData.accountName || '',
          server: accountData.server || '',
          leverage: accountData.leverage || 0,
          marginLevel: accountData.marginLevel || 0,
          dailyPnL: accountData.dailyPnL || 0,
          dailyPnLPercent: accountData.dailyPnLPercent || 0,
          openPositions: accountData.openPositions || 0,
          pendingOrders: accountData.pendingOrders || 0,
          buyPositions: accountData.buyPositions || 0,
          sellPositions: accountData.sellPositions || 0,
          totalBuyLots: accountData.totalBuyLots || 0,
          totalSellLots: accountData.totalSellLots || 0,
          unrealizedProfit: accountData.unrealizedProfit || 0,
        });
      }
    }

    // Sort: active accounts first, then by most recent
    accounts.sort((a, b) => {
      if (a.connected && !b.connected) return -1;
      if (!a.connected && b.connected) return 1;
      return a.secondsAgo - b.secondsAgo;
    });

    // Backwards compatible: also return top-level fields from the most active account
    const primary = accounts[0];
    const anyConnected = accounts.some(a => a.connected);
    res.json({
      connected: anyConnected,
      lastUpdated: primary?.lastUpdated,
      secondsAgo: primary?.secondsAgo,
      broker: primary?.broker,
      balance: primary?.balance || 0,
      equity: primary?.equity || 0,
      margin: primary?.margin || 0,
      freeMargin: primary?.freeMargin || 0,
      profit: primary?.profit || 0,
      credit: primary?.credit || 0,
      currency: primary?.currency || 'USD',
      accountNumber: primary?.accountNumber || 0,
      accountName: primary?.accountName || '',
      server: primary?.server || '',
      leverage: primary?.leverage || 0,
      marginLevel: primary?.marginLevel || 0,
      dailyPnL: primary?.dailyPnL || 0,
      dailyPnLPercent: primary?.dailyPnLPercent || 0,
      openPositions: primary?.openPositions || 0,
      pendingOrders: primary?.pendingOrders || 0,
      buyPositions: primary?.buyPositions || 0,
      sellPositions: primary?.sellPositions || 0,
      totalBuyLots: primary?.totalBuyLots || 0,
      totalSellLots: primary?.totalSellLots || 0,
      unrealizedProfit: primary?.unrealizedProfit || 0,
      accounts,
      totalAccounts: accounts.length,
    });
  });

  // Get ALL connected MT5 pairs for the current user
  app.get("/api/mt5/connected-pairs", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    const pairsCache = (global as any).mt5ConnectedPairs || {};
    const userPairs = pairsCache[userId] || {};
    
    const now = new Date();
    const activePairs: any[] = [];
    const stalePairs: any[] = [];
    
    // Process each pair and check if it's active
    for (const [key, pair] of Object.entries(userPairs)) {
      const pairData = pair as any;
      const lastSeen = new Date(pairData.lastSeen);
      const secondsAgo = Math.floor((now.getTime() - lastSeen.getTime()) / 1000);
      const isActive = secondsAgo < 300; // 5 minutes
      
      const pairInfo = {
        ...pairData,
        secondsAgo,
        isActive,
        status: isActive ? 'LIVE' : (secondsAgo < 900 ? 'STALE' : 'OFFLINE'),
      };
      
      if (isActive) {
        activePairs.push(pairInfo);
      } else if (secondsAgo < 3600) { // Keep stale pairs for up to 1 hour
        stalePairs.push(pairInfo);
      }
    }
    
    // Sort by last seen (most recent first)
    activePairs.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
    stalePairs.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
    
    res.json({
      activePairs,
      stalePairs,
      totalActive: activePairs.length,
      totalStale: stalePairs.length,
    });
  });

  app.get("/api/mt5/breakout-status", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;

    const now = new Date();
    const hourUTC = now.getUTCHours();
    const minuteUTC = now.getUTCMinutes();
    const dayOfWeek = now.getUTCDay();
    const totalMinutes = hourUTC * 60 + minuteUTC;

    const sessions = [
      { name: 'LONDON', openHour: 7, preSessionStart: '00:00', preSessionEnd: '07:00', preHours: 7, windowMinutes: 90 },
      { name: 'NEW_YORK', openHour: 13, preSessionStart: '07:00', preSessionEnd: '13:00', preHours: 6, windowMinutes: 90 },
      { name: 'TOKYO', openHour: 0, preSessionStart: '21:00', preSessionEnd: '00:00', preHours: 3, windowMinutes: 60 },
    ];

    let currentWindow: any = null;
    let nextSession: any = null;

    if (dayOfWeek > 0 && dayOfWeek < 6) {
      for (const sess of sessions) {
        const openMinutes = sess.openHour * 60;
        let diff = totalMinutes - openMinutes;
        if (diff < 0) diff += 1440;
        if (diff >= 0 && diff <= sess.windowMinutes) {
          currentWindow = {
            session: sess.name,
            minutesSinceOpen: diff,
            minutesRemaining: sess.windowMinutes - diff,
            openTime: `${String(sess.openHour).padStart(2, '0')}:00 UTC`,
            preSessionRange: `${sess.preSessionStart} – ${sess.preSessionEnd} UTC`,
            preSessionHours: sess.preHours,
          };
          break;
        }
      }

      if (!currentWindow) {
        let minWait = Infinity;
        for (const sess of sessions) {
          const openMinutes = sess.openHour * 60;
          let wait = openMinutes - totalMinutes;
          if (wait <= 0) wait += 1440;
          if (wait < minWait) {
            minWait = wait;
            nextSession = {
              session: sess.name,
              minutesUntilOpen: wait,
              openTime: `${String(sess.openHour).padStart(2, '0')}:00 UTC`,
              preSessionRange: `${sess.preSessionStart} – ${sess.preSessionEnd} UTC`,
              preSessionHours: sess.preHours,
            };
          }
        }
      }
    }

    const breakoutCache = (global as any).mt5BreakoutCache || {};
    const userBreakouts = breakoutCache[userId] || {};
    const perPairSettings = (global as any).mt5BreakoutSettings?.[userId] || {};
    const pairStatuses: any[] = [];

    // Get independent M15 monitor data
    let independentMonitor: any = null;
    try {
      const { getIndependentBreakoutStatus } = await import('./services/breakout-monitor');
      independentMonitor = getIndependentBreakoutStatus(userId);
    } catch (err) {}

    const pairsCache = (global as any).mt5ConnectedPairs || {};
    const userPairs = pairsCache[userId] || {};
    const allPairSymbols = new Set<string>();
    for (const [key, pair] of Object.entries(userPairs)) {
      const p = pair as any;
      const ageS = Math.floor((now.getTime() - new Date(p.lastSeen).getTime()) / 1000);
      if (ageS < 600) allPairSymbols.add(p.symbol.toUpperCase().replace('/', ''));
    }

    for (const [key, data] of Object.entries(userBreakouts)) {
      const bd = data as any;
      const ageSeconds = Math.floor((now.getTime() - new Date(bd.updatedAt).getTime()) / 1000);
      const pairKey = bd.symbol.toUpperCase().replace('/', '');
      const enabled = perPairSettings[pairKey] !== false;

      // Check if independent M15 monitor has a breakout for this pair
      const indResult = independentMonitor?.results?.[pairKey];
      const hasIndBreakout = indResult?.breakoutDetected && !bd.breakoutDetected;

      if (ageSeconds < 600) {
        pairStatuses.push({
          symbol: bd.symbol,
          timeframe: bd.timeframe,
          updatedAt: bd.updatedAt,
          ageSeconds,
          isBreakoutWindow: bd.isBreakoutWindow,
          session: bd.session,
          minutesSinceOpen: bd.minutesSinceOpen,
          breakoutDetected: enabled ? (bd.breakoutDetected || hasIndBreakout) : false,
          breakoutDirection: enabled ? (hasIndBreakout ? indResult.breakoutDirection : bd.breakoutDirection) : 'NONE',
          breakoutStrength: enabled ? (hasIndBreakout ? indResult.breakoutStrength : bd.breakoutStrength) : 'NONE',
          priceVsRange: enabled ? (hasIndBreakout ? `${indResult.priceVsRange} (M15)` : bd.priceVsRange) : 'Breakout detection disabled',
          breakoutDistance: enabled ? (hasIndBreakout ? indResult.breakoutDistance : bd.breakoutDistance) : 0,
          volumeConfirmed: enabled ? (bd.volumeConfirmed || (hasIndBreakout && indResult.volumeConfirmed)) : false,
          signal: enabled ? (hasIndBreakout ? indResult.signal : bd.signal) : 'NEUTRAL',
          preSessionRange: hasIndBreakout ? indResult.preSessionRange : bd.preSessionRange,
          breakoutEnabled: enabled,
          source: hasIndBreakout ? 'independent_m15' : 'ea_timeframe',
          approachingBreakout: bd.approachingBreakout || indResult?.approachingBreakout || false,
          approachingDirection: bd.approachingDirection || indResult?.approachingDirection || 'NONE',
        });
        allPairSymbols.delete(pairKey);
      }
    }

    for (const sym of allPairSymbols) {
      const enabled = perPairSettings[sym] !== false;
      const indResult = independentMonitor?.results?.[sym];
      const hasIndData = indResult && indResult.isBreakoutWindow;

      pairStatuses.push({
        symbol: sym,
        timeframe: hasIndData ? 'M15' : 'N/A',
        updatedAt: hasIndData ? indResult.detectedAt : null,
        ageSeconds: hasIndData ? Math.floor((now.getTime() - new Date(indResult.detectedAt).getTime()) / 1000) : null,
        isBreakoutWindow: hasIndData ? indResult.isBreakoutWindow : false,
        session: hasIndData ? indResult.session : 'NONE',
        breakoutDetected: enabled && hasIndData ? indResult.breakoutDetected : false,
        breakoutDirection: enabled && hasIndData ? indResult.breakoutDirection : 'NONE',
        breakoutStrength: enabled && hasIndData ? indResult.breakoutStrength : 'NONE',
        priceVsRange: !enabled ? 'Breakout detection disabled' : (hasIndData ? `${indResult.priceVsRange} (M15)` : 'Awaiting data'),
        breakoutDistance: enabled && hasIndData ? indResult.breakoutDistance : 0,
        volumeConfirmed: enabled && hasIndData ? indResult.volumeConfirmed : false,
        signal: enabled && hasIndData ? indResult.signal : 'NEUTRAL',
        preSessionRange: hasIndData ? indResult.preSessionRange : { high: 0, low: 0, range: 0 },
        breakoutEnabled: enabled,
        source: hasIndData ? 'independent_m15' : 'none',
        approachingBreakout: hasIndData ? indResult.approachingBreakout || false : false,
        approachingDirection: hasIndData ? indResult.approachingDirection || 'NONE' : 'NONE',
      });
    }

    res.json({
      serverTime: now.toISOString(),
      serverTimeUTC: `${String(hourUTC).padStart(2, '0')}:${String(minuteUTC).padStart(2, '0')} UTC`,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      currentWindow,
      nextSession,
      pairStatuses,
      independentMonitor: independentMonitor ? {
        active: independentMonitor.monitorActive,
        lastPollTime: independentMonitor.lastPollTime,
        pollCount: independentMonitor.pollCount,
        pairsMonitored: Object.keys(independentMonitor.results).length,
        errors: independentMonitor.errors,
      } : null,
    });
  });

  // EA Kill Switch - enable/disable EA remotely from the app
  app.get("/api/mt5/ea-enabled", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    (global as any).mt5EaEnabled = (global as any).mt5EaEnabled || {};
    const enabled = (global as any).mt5EaEnabled[userId] !== false;
    res.json({ enabled });
  });

  app.post("/api/mt5/ea-enabled", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: "enabled (boolean) required" });
    }
    (global as any).mt5EaEnabled = (global as any).mt5EaEnabled || {};
    (global as any).mt5EaEnabled[userId] = enabled;
    console.log(`[EA Kill Switch] User ${userId} ${enabled ? 'ENABLED' : 'DISABLED'} EA remotely`);
    res.json({ enabled });
  });

  app.get("/api/mt5/breakout-settings", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const settings = (global as any).mt5BreakoutSettings?.[userId] || {};
    const globalEnabled = (global as any).mt5BreakoutGlobal?.[userId] !== false;
    res.json({ settings, globalEnabled });
  });

  app.post("/api/mt5/breakout-settings", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const { symbol, enabled } = req.body;
    if (!symbol || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: "symbol and enabled (boolean) required" });
    }
    (global as any).mt5BreakoutSettings = (global as any).mt5BreakoutSettings || {};
    if (!(global as any).mt5BreakoutSettings[userId]) {
      (global as any).mt5BreakoutSettings[userId] = {};
    }
    (global as any).mt5BreakoutSettings[userId][symbol.toUpperCase().replace('/', '')] = enabled;
    res.json({ symbol, enabled, settings: (global as any).mt5BreakoutSettings[userId] });
  });

  app.get("/api/mt5/breakout-global", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const enabled = (global as any).mt5BreakoutGlobal?.[userId] !== false;
    res.json({ enabled });
  });

  app.post("/api/mt5/breakout-global", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: "enabled (boolean) required" });
    }
    (global as any).mt5BreakoutGlobal = (global as any).mt5BreakoutGlobal || {};
    (global as any).mt5BreakoutGlobal[userId] = enabled;
    console.log(`[BREAKOUT] Global breakout strategy ${enabled ? 'ENABLED' : 'DISABLED'} for user ${userId}`);
    res.json({ enabled, message: enabled ? 'Breakout strategy activated' : 'Breakout strategy deactivated' });
  });

  // Get Trade History Learning recommendations for EA settings per symbol
  app.get("/api/mt5/learning-recommendations", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    const learningCache = (global as any).mt5LearningRecommendations || {};
    const learningData = learningCache[userId];
    
    if (!learningData) {
      return res.json({ 
        hasData: false, 
        message: "No trade history learning data available. The EA needs to sync closed trades to analyze patterns.",
        recommendations: {}
      });
    }
    
    const closedTradesCache = (global as any).mt5ClosedTrades || {};
    const closedTrades = closedTradesCache[userId]?.trades || [];
    
    res.json({
      hasData: true,
      analyzedTrades: learningData.analyzedTrades,
      lastUpdated: learningData.lastUpdated,
      recommendations: learningData.recommendations,
      closedTradesCount: closedTrades.length,
    });
  });

  // Weekly Profit Strategy - AI-powered weekly trading plan
  (global as any).mt5WeeklyStrategies = (global as any).mt5WeeklyStrategies || {};

  app.get("/api/weekly-strategy", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    const userId = (req.user as User).id;
    const strategy = (global as any).mt5WeeklyStrategies[userId];
    if (!strategy) return res.json({ hasStrategy: false });
    res.json({ hasStrategy: true, ...strategy });
  });

  app.post("/api/weekly-strategy/generate", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    const userId = (req.user as User).id;
    const { profitTarget, pairs, accountBalance, riskLevel, lotSize } = req.body;

    if (!profitTarget || !pairs || !Array.isArray(pairs) || pairs.length === 0 || !accountBalance) {
      return res.status(400).json({ error: "profitTarget, pairs (array), and accountBalance are required" });
    }

    try {
      // Gather existing trade history data
      const closedTradesCache = (global as any).mt5ClosedTrades || {};
      const closedTrades = closedTradesCache[userId]?.trades || [];
      const learningData = (global as any).mt5LearningRecommendations?.[userId];
      const accountDataCache = (global as any).mt5AccountData?.[userId];
      const connectedPairs = (global as any).mt5ConnectedPairs?.[userId] || {};

      // Get current EA settings dynamically
      const { isAiVisionConfirmationEnabled: isAiEnabled, getAiMinConfidence: getMinConf, getUserModelPreference: getModelPref, getOpenAIInstanceForUser: getAiInstance } = await import('./openai');
      const aiEnabled = isAiEnabled(userId);
      const aiMinConf = getMinConf(userId);
      const eaEnabled = (global as any).mt5EaEnabled?.[userId] !== false;
      const aiOverrideActive = aiEnabled; // AI override is active when AI confirmation is enabled
      const breakoutSettings = (global as any).mt5BreakoutSettings?.[userId] || {};

      // Build per-pair historical stats
      const pairStats: Record<string, any> = {};
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const sessionWindows = [
        { name: 'Asian', startHour: 0, endHour: 7 },
        { name: 'London', startHour: 7, endHour: 13 },
        { name: 'New York', startHour: 13, endHour: 20 },
        { name: 'Late NY', startHour: 20, endHour: 24 },
      ];

      for (const pair of pairs) {
        const pairUpper = pair.toUpperCase().replace('/', '');
        const trades = closedTrades.filter((t: any) => (t.symbol || '').toUpperCase().replace('/', '') === pairUpper);
        const wins = trades.filter((t: any) => t.profit > 0);
        const losses = trades.filter((t: any) => t.profit < 0);
        const totalTrades = wins.length + losses.length;
        const winRate = totalTrades > 0 ? Math.round((wins.length / totalTrades) * 100) : 50;
        const avgWin = wins.length > 0 ? wins.reduce((s: number, t: any) => s + t.profit, 0) / wins.length : 0;
        const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s: number, t: any) => s + t.profit, 0) / losses.length) : 0;

        // Daily performance
        const dailyPerf: Record<string, { wins: number; losses: number; winRate: number }> = {};
        for (let d = 0; d < 7; d++) {
          const dayTrades = trades.filter((t: any) => t.closeDay === d);
          const dWins = dayTrades.filter((t: any) => t.profit > 0).length;
          const dLosses = dayTrades.filter((t: any) => t.profit < 0).length;
          const dTotal = dWins + dLosses;
          dailyPerf[dayNames[d]] = { wins: dWins, losses: dLosses, winRate: dTotal > 0 ? Math.round((dWins / dTotal) * 100) : 0 };
        }

        // Session performance
        const sessionPerf: Record<string, { wins: number; losses: number; winRate: number }> = {};
        for (const session of sessionWindows) {
          const sTrades = trades.filter((t: any) => {
            const h = t.closeHour || 0;
            return h >= session.startHour && h < session.endHour;
          });
          const sWins = sTrades.filter((t: any) => t.profit > 0).length;
          const sLosses = sTrades.filter((t: any) => t.profit < 0).length;
          const sTotal = sWins + sLosses;
          sessionPerf[session.name] = { wins: sWins, losses: sLosses, winRate: sTotal > 0 ? Math.round((sWins / sTotal) * 100) : 0 };
        }

        // Direction stats
        const buyTrades = trades.filter((t: any) => t.direction === 'BUY');
        const sellTrades = trades.filter((t: any) => t.direction === 'SELL');
        const buyWinRate = buyTrades.length > 0 ? Math.round(buyTrades.filter((t: any) => t.profit > 0).length / buyTrades.length * 100) : 50;
        const sellWinRate = sellTrades.length > 0 ? Math.round(sellTrades.filter((t: any) => t.profit > 0).length / sellTrades.length * 100) : 50;

        // Get latest connected pair data for current conditions
        const pairData = Object.values(connectedPairs).find((p: any) => 
          (p.symbol || '').toUpperCase().replace('/', '') === pairUpper
        ) as any;

        pairStats[pairUpper] = {
          totalTrades, winRate, avgWin: Math.round(avgWin * 100) / 100, avgLoss: Math.round(avgLoss * 100) / 100,
          dailyPerf, sessionPerf, buyWinRate, sellWinRate,
          currentSpread: pairData?.spread || 'unknown',
          lastSignal: pairData?.signal || 'none',
          lastConfidence: pairData?.confidence || 0,
        };
      }

      // Build AI prompt - full AI control, no EA restraints
      const growthMultiplier = ((accountBalance + profitTarget) / accountBalance).toFixed(1);
      const prompt = `You are an elite AI trading strategist with FULL CONTROL over all trading decisions. No EA restraints - you are the primary decision-maker.

ACCOUNT GROWTH CHALLENGE:
- Starting Balance: $${accountBalance}
- Weekly Profit Target: $${profitTarget}
- Goal Balance: $${accountBalance + profitTarget} (${growthMultiplier}x growth)
- Preferred Lot Size: ${lotSize || 'AI decides optimal sizing'}
- Selected Pairs: ${pairs.join(', ')}

AI CONTROL STATUS: FULL CONTROL
- You have complete authority over trade entries, exits, lot sizing, and risk
- No EA score gates or minimum thresholds restrict you
- AI Override: ALWAYS ON - your decision is final
- Trailing Stop: You decide (TIGHT/STANDARD/WIDE/AGGRESSIVE/OFF)
- Breakout Detection: ${Object.keys(breakoutSettings).length > 0 ? 'Active for ' + Object.keys(breakoutSettings).filter(k => breakoutSettings[k]).join(', ') : 'Available'}

TRADER'S HISTORICAL PERFORMANCE DATA:
${JSON.stringify(pairStats, null, 2)}

STRATEGY REQUIREMENTS:
1. Create an AGGRESSIVE but CALCULATED growth plan to hit $${profitTarget} profit
2. For small accounts ($50-$500), recommend appropriate micro/mini lot sizes
3. Use COMPOUND GROWTH: reinvest profits each day to accelerate returns
4. Identify the BEST high-probability setups per pair per day
5. Factor in session volatility (London open, NY open, overlap sessions)
6. Include specific entry conditions, lot sizes, and pip targets
7. Recommend how many trades per day and when to STOP trading (daily loss limit)
8. If the target requires over 100% account growth in a week, acknowledge the high risk but still provide the plan
9. Use historical win rates and direction biases to maximize edge
10. Include a compound growth projection showing daily balance growth

Respond with ONLY valid JSON:
{
  "feasibility": "ACHIEVABLE" | "AGGRESSIVE" | "EXTREME",
  "feasibilityReason": "Honest assessment with specific reasoning",
  "suggestedTarget": number,
  "growthStrategy": "Description of the compound growth approach",
  "weeklyPlan": {
    "Monday": { "pairs": [{"symbol": "EURUSD", "direction": "BUY or SELL or BOTH", "confidence": 0-100, "session": "London/New York/Asian/Overlap", "reason": "specific reason based on data", "estimatedPips": number, "lotSize": number, "maxTrades": number, "entryCondition": "specific condition to enter"}], "dailyTarget": number, "projectedBalance": number },
    "Tuesday": { ... },
    "Wednesday": { ... },
    "Thursday": { ... },
    "Friday": { ... }
  },
  "pairRankings": [{"symbol": "EURUSD", "overallScore": 0-100, "bestDay": "Tuesday", "bestSession": "London", "winRate": number, "recommendation": "Primary/Secondary/Avoid", "optimalLotSize": number, "avgPipsPerTrade": number}],
  "riskManagement": {
    "maxDailyLoss": number,
    "maxDailyTrades": number,
    "riskPerTrade": number,
    "trailingStopMode": "TIGHT/STANDARD/WIDE/AGGRESSIVE",
    "dailyStopRule": "When to stop trading for the day",
    "aiConfidenceMinimum": number
  },
  "compoundGrowth": {
    "monday": {"startBalance": number, "endBalance": number, "trades": number},
    "tuesday": {"startBalance": number, "endBalance": number, "trades": number},
    "wednesday": {"startBalance": number, "endBalance": number, "trades": number},
    "thursday": {"startBalance": number, "endBalance": number, "trades": number},
    "friday": {"startBalance": number, "endBalance": number, "trades": number}
  },
  "keyInsights": ["insight1", "insight2", "insight3", "insight4"],
  "weeklyProjection": {
    "bestCase": number,
    "expected": number,
    "worstCase": number
  }
}`;

      let openaiInstance: any;
      let selectedModel: string;
      try {
        openaiInstance = await getAiInstance(userId);
        selectedModel = getModelPref(userId);
      } catch (e: any) {
        console.error('[Weekly Strategy] Failed to get AI instance:', e.message);
        return res.status(500).json({ error: 'No AI API key configured. Please add an API key in the AI API Keys page.' });
      }

      const modelToUse = selectedModel.startsWith('gpt') ? selectedModel : 'gpt-4o-mini';
      const supportsJsonFormat = modelToUse.startsWith('gpt');

      let response: any;
      try {
        response = await openaiInstance.chat.completions.create({
          model: modelToUse,
          messages: [
            { role: "system", content: "You are an expert trading strategist. Always respond with valid JSON only. No markdown, no explanation, just the JSON object." },
            { role: "user", content: prompt }
          ],
          ...(supportsJsonFormat ? { response_format: { type: "json_object" } } : {}),
          max_tokens: 3000,
          temperature: 0.4,
        });
      } catch (aiError: any) {
        const errMsg = aiError.message || '';
        if (errMsg.includes('rate') || errMsg.includes('quota') || errMsg.includes('429')) {
          return res.status(429).json({ error: 'AI rate limit hit. Please wait a moment and try again, or switch to a different AI provider.' });
        }
        if (errMsg.includes('key') || errMsg.includes('auth') || errMsg.includes('401')) {
          return res.status(401).json({ error: 'AI API key is invalid or expired. Please update your API key.' });
        }
        throw aiError;
      }

      const content = response.choices[0]?.message?.content || '';
      if (!content.trim()) {
        return res.status(500).json({ error: 'AI returned empty response. Please try again.' });
      }

      let plan: any;
      try {
        plan = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error('[Weekly Strategy] AI returned non-JSON:', content.substring(0, 200));
          return res.status(500).json({ error: 'AI returned an invalid format. Please try again.' });
        }
        try {
          plan = JSON.parse(jsonMatch[0]);
        } catch {
          return res.status(500).json({ error: 'AI returned malformed data. Please try again.' });
        }
      }
      if (!plan || typeof plan !== 'object' || !plan.weeklyPlan) {
        console.error('[Weekly Strategy] AI response missing weeklyPlan:', JSON.stringify(plan).substring(0, 200));
        return res.status(500).json({ error: 'AI response was incomplete. Please try again.' });
      }

      const strategy = {
        profitTarget,
        pairs,
        accountBalance,
        riskLevel: riskLevel || 'ai-controlled',
        lotSize: lotSize || 'auto',
        plan,
        pairStats,
        generatedAt: new Date().toISOString(),
        weekStart: getWeekStart(),
        progressTrades: [],
        currentProfit: 0,
      };

      (global as any).mt5WeeklyStrategies[userId] = strategy;
      console.log(`[Weekly Strategy] Generated plan for user ${userId}: $${profitTarget} target across ${pairs.length} pairs`);
      res.json({ hasStrategy: true, ...strategy });
    } catch (error: any) {
      console.error('[Weekly Strategy] Error:', error);
      res.status(500).json({ error: `Failed to generate strategy: ${error.message || 'Unknown error'}` });
    }
  });

  app.post("/api/weekly-strategy/update-progress", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    const userId = (req.user as User).id;
    const strategy = (global as any).mt5WeeklyStrategies?.[userId];
    if (!strategy) return res.status(404).json({ error: "No active strategy" });

    const closedTradesCache = (global as any).mt5ClosedTrades || {};
    const closedTrades = closedTradesCache[userId]?.trades || [];
    const weekStart = new Date(strategy.weekStart);
    
    const weekTrades = closedTrades.filter((t: any) => {
      const tradeDate = new Date(t.closeTime || t.timestamp || 0);
      return tradeDate >= weekStart && strategy.pairs.some((p: string) => 
        (t.symbol || '').toUpperCase().replace('/', '') === p.toUpperCase().replace('/', '')
      );
    });

    const closedProfit = weekTrades.reduce((sum: number, t: any) => sum + (t.profit || 0), 0);
    const tradeCount = weekTrades.length;
    const wins = weekTrades.filter((t: any) => t.profit > 0).length;
    const winRate = tradeCount > 0 ? Math.round((wins / tradeCount) * 100) : 0;

    const openPosData = (global as any).mt5OpenPositions?.[userId];
    const allOpenPositions = openPosData?.positions || [];
    const planPairs = (strategy.pairs || []).map((p: string) => p.toUpperCase().replace('/', ''));
    const activeTrades = allOpenPositions.filter((p: any) => {
      const sym = (p.symbol || '').toUpperCase().replace('/', '');
      return planPairs.includes(sym);
    });
    const unrealizedPnL = activeTrades.reduce((s: number, p: any) => s + (p.profit || 0), 0);

    const isLive = (global as any).mt5VeddSSAILive?.[userId] === true;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[new Date().getUTCDay()];
    const todayPlan = strategy.plan?.weeklyPlan?.[todayName];

    const activeTradeDetails = activeTrades.map((p: any) => {
      const sym = (p.symbol || '').toUpperCase().replace('/', '');
      const matchingPlanPair = todayPlan?.pairs?.find((pp: any) =>
        (pp.symbol || '').toUpperCase().replace('/', '') === sym
      );
      const planAligned = matchingPlanPair
        ? (matchingPlanPair.direction === 'BOTH' || matchingPlanPair.direction === p.direction)
        : null;
      const lotOverride = (global as any).veddSSAILotOverride?.[`${userId}_${sym}`];
      return {
        symbol: sym,
        direction: p.direction,
        lots: p.lots || 0,
        openPrice: p.openPrice || 0,
        currentProfit: p.profit || 0,
        ticket: p.ticket,
        sl: p.sl || 0,
        tp: p.tp || 0,
        veddAction: isLive && matchingPlanPair ? (planAligned ? 'ALIGNED' : 'CONFLICT') : (isLive ? 'NOT_IN_PLAN' : 'LIVE_OFF'),
        planDirection: matchingPlanPair?.direction || null,
        planSession: matchingPlanPair?.session || null,
        planLotSize: matchingPlanPair?.lotSize || null,
        lotOverrideApplied: lotOverride ? true : false,
        lotOverrideValue: lotOverride || null,
      };
    });

    const totalProfit = closedProfit + unrealizedPnL;
    strategy.currentProfit = Math.round(closedProfit * 100) / 100;
    strategy.progressTrades = weekTrades.length;
    strategy.progressWinRate = winRate;
    strategy.progressPercentage = Math.min(100, Math.max(0, Math.round((closedProfit / strategy.profitTarget) * 100)));

    res.json({
      currentProfit: strategy.currentProfit,
      progressTrades: tradeCount,
      progressWinRate: winRate,
      progressPercentage: strategy.progressPercentage,
      targetRemaining: Math.round((strategy.profitTarget - closedProfit) * 100) / 100,
      daysRemaining: getDaysRemainingInWeek(),
      activeTrades: activeTradeDetails,
      activeTradeCount: activeTrades.length,
      unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
      totalPnL: Math.round(totalProfit * 100) / 100,
      veddSSAILive: isLive,
      lastPositionUpdate: openPosData?.lastUpdated || null,
    });
  });

  // VEDD SS AI Live Mode - toggle live trading guided by the plan
  (global as any).mt5VeddSSAILive = (global as any).mt5VeddSSAILive || {};

  app.get("/api/weekly-strategy/live-mode", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    const userId = (req.user as User).id;
    const isLive = (global as any).mt5VeddSSAILive[userId] === true;
    const strategy = (global as any).mt5WeeklyStrategies?.[userId];
    res.json({ live: isLive, hasStrategy: !!strategy });
  });

  app.post("/api/weekly-strategy/live-mode", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    const userId = (req.user as User).id;
    const { enabled } = req.body;
    const strategy = (global as any).mt5WeeklyStrategies?.[userId];
    if (!strategy) {
      return res.status(400).json({ error: "No active VEDD SS AI plan. Generate a plan first." });
    }
    (global as any).mt5VeddSSAILive[userId] = !!enabled;
    if (!enabled) {
      (global as any).veddSSAILotOverride = (global as any).veddSSAILotOverride || {};
      for (const key of Object.keys((global as any).veddSSAILotOverride)) {
        if (key.startsWith(`${userId}_`)) delete (global as any).veddSSAILotOverride[key];
      }
    }
    console.log(`[VEDD SS AI] Live mode ${enabled ? 'ACTIVATED' : 'DEACTIVATED'} for user ${userId}`);
    res.json({ live: !!enabled, message: enabled ? 'VEDD SS AI is now guiding your EA trades' : 'VEDD SS AI live mode disabled' });
  });

  app.delete("/api/weekly-strategy", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    const userId = (req.user as User).id;
    delete (global as any).mt5WeeklyStrategies[userId];
    (global as any).mt5VeddSSAILive[userId] = false;
    (global as any).veddSSAILotOverride = (global as any).veddSSAILotOverride || {};
    for (const key of Object.keys((global as any).veddSSAILotOverride)) {
      if (key.startsWith(`${userId}_`)) delete (global as any).veddSSAILotOverride[key];
    }
    res.json({ success: true });
  });

  app.post("/api/weekly-strategy/share-card", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    const userId = (req.user as User).id;
    const strategies = (global as any).mt5WeeklyStrategies || {};
    const strat = strategies[userId];
    if (!strat?.plan) return res.status(404).json({ error: "No active VEDD SS AI plan" });

    try {
      const { createCanvas, loadImage } = await import('canvas');
      const path = await import('path');
      const fs = await import('fs');

      const W = 1080, H = 1080;
      const canvas = createCanvas(W, H);
      const ctx = canvas.getContext('2d');

      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#0f172a');
      bg.addColorStop(0.5, '#1a1033');
      bg.addColorStop(1, '#0f172a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const headerGrad = ctx.createLinearGradient(0, 0, W, 220);
      headerGrad.addColorStop(0, '#ea580c');
      headerGrad.addColorStop(1, '#dc2626');
      ctx.fillStyle = headerGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, 0);
      ctx.lineTo(W, 180);
      ctx.quadraticCurveTo(W / 2, 240, 0, 180);
      ctx.closePath();
      ctx.fill();

      try {
        const logoPath = path.default.join(process.cwd(), 'attached_assets', 'IMG_3645.png');
        if (fs.default.existsSync(logoPath)) {
          const logo = await loadImage(logoPath);
          const lh = 60, lw = (logo.width / logo.height) * lh;
          ctx.drawImage(logo, 40, 30, lw, lh);
        }
      } catch {}

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VEDD SS AI', W / 2, 130);
      ctx.font = '20px Arial, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText('AI-Powered Growth Strategy', W / 2, 160);

      let y = 260;

      const drawRoundRect = (cx: any, rx: number, ry: number, rw: number, rh: number, r: number) => {
        cx.beginPath();
        cx.moveTo(rx + r, ry);
        cx.lineTo(rx + rw - r, ry);
        cx.arcTo(rx + rw, ry, rx + rw, ry + r, r);
        cx.lineTo(rx + rw, ry + rh - r);
        cx.arcTo(rx + rw, ry + rh, rx + rw - r, ry + rh, r);
        cx.lineTo(rx + r, ry + rh);
        cx.arcTo(rx, ry + rh, rx, ry + rh - r, r);
        cx.lineTo(rx, ry + r);
        cx.arcTo(rx, ry, rx + r, ry, r);
        cx.closePath();
      };

      const progress = strat.progressPercentage || 0;
      const barW = W - 120, barH = 36;
      const barX = 60;
      ctx.fillStyle = '#1e293b';
      drawRoundRect(ctx, barX, y, barW, barH, 18);
      ctx.fill();
      const fillW = Math.max(0, Math.min(barW, barW * progress / 100));
      if (fillW > 0) {
        const pGrad = ctx.createLinearGradient(barX, y, barX + fillW, y);
        pGrad.addColorStop(0, '#f97316');
        pGrad.addColorStop(1, '#ef4444');
        ctx.fillStyle = pGrad;
        drawRoundRect(ctx, barX, y, fillW, barH, 18);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${progress}%`, W / 2, y + 24);

      y += 70;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 54px Arial, sans-serif';
      ctx.fillText(`$${strat.accountBalance || 0}  →  $${(strat.accountBalance || 0) + (strat.profitTarget || 0)}`, W / 2, y);
      y += 30;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px Arial, sans-serif';
      const multiplier = strat.accountBalance > 0 ? ((strat.accountBalance + strat.profitTarget) / strat.accountBalance).toFixed(1) : '1.0';
      ctx.fillText(`${multiplier}x Growth Target`, W / 2, y);
      y += 55;

      const stats = [
        { label: 'Current Profit', value: `$${strat.currentProfit || 0}`, color: '#22c55e' },
        { label: 'Target', value: `$${strat.profitTarget || 0}`, color: '#f97316' },
        { label: 'Trades', value: `${strat.progressTrades || 0}`, color: '#a78bfa' },
        { label: 'Win Rate', value: `${strat.progressWinRate || 0}%`, color: '#38bdf8' },
      ];
      const boxW = (W - 120 - 30) / 2;
      const boxH = 90;
      stats.forEach((s, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const bx = 60 + col * (boxW + 30);
        const by = y + row * (boxH + 15);
        ctx.fillStyle = '#1e293b';
        drawRoundRect(ctx, bx, by, boxW, boxH, 12);
        ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '16px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.label, bx + boxW / 2, by + 32);
        ctx.fillStyle = s.color;
        ctx.font = 'bold 30px Arial, sans-serif';
        ctx.fillText(s.value, bx + boxW / 2, by + 68);
      });
      y += boxH * 2 + 50;

      if (strat.plan?.feasibility) {
        ctx.fillStyle = strat.plan.feasibility === 'ACHIEVABLE' ? '#22c55e' : strat.plan.feasibility === 'AGGRESSIVE' ? '#f97316' : '#ef4444';
        ctx.font = 'bold 24px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`AI Assessment: ${strat.plan.feasibility}`, W / 2, y);
        y += 35;
      }

      if (strat.pairs?.length) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '18px Arial, sans-serif';
        ctx.fillText(`Trading: ${strat.pairs.join(' | ')}`, W / 2, y);
        y += 40;
      }

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(60, y, W - 120, 2);
      y += 30;

      const user = req.user as User;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${user.username} | Generated ${new Date().toLocaleDateString()}`, W / 2, y);
      y += 30;
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Arial, sans-serif';
      ctx.fillText('vedd.ai | AI Trading Vault', W / 2, y);

      const buffer = canvas.toBuffer('image/png');
      const fileName = `vedd-ss-ai-progress-${userId}-${Date.now()}.png`;
      const outDir = path.default.join(process.cwd(), 'uploads', 'share-cards');
      if (!fs.default.existsSync(outDir)) fs.default.mkdirSync(outDir, { recursive: true });
      const filePath = path.default.join(outDir, fileName);
      fs.default.writeFileSync(filePath, buffer);

      res.json({
        success: true,
        imageUrl: `/uploads/share-cards/${fileName}`,
        stats: {
          accountBalance: strat.accountBalance,
          profitTarget: strat.profitTarget,
          currentProfit: strat.currentProfit || 0,
          progressPercentage: progress,
          progressTrades: strat.progressTrades || 0,
          progressWinRate: strat.progressWinRate || 0,
          pairs: strat.pairs,
          feasibility: strat.plan?.feasibility,
        }
      });
    } catch (err: any) {
      console.error('[VEDD SS AI Share Card] Error:', err);
      res.status(500).json({ error: 'Failed to generate share card' });
    }
  });

  app.post("/api/weekly-strategy/generate-post", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Authentication required" });
    const userId = (req.user as User).id;
    const strategies = (global as any).mt5WeeklyStrategies || {};
    const strat = strategies[userId];
    if (!strat?.plan) return res.status(404).json({ error: "No active VEDD SS AI plan" });

    const { platform = 'twitter' } = req.body;

    try {
      const { getOpenAIInstanceForUser } = await import('./openai');
      const progress = strat.progressPercentage || 0;
      const multiplier = strat.accountBalance > 0 ? ((strat.accountBalance + strat.profitTarget) / strat.accountBalance).toFixed(1) : '1.0';

      const prompt = `You are a social media content creator for VEDD AI Trading Vault. Generate a single engaging ${platform === 'twitter' ? 'tweet (max 250 chars)' : 'social media post (2-3 short paragraphs)'} about the user's VEDD SS AI weekly trading progress.

Stats:
- Account: $${strat.accountBalance} → $${(strat.accountBalance || 0) + (strat.profitTarget || 0)} (${multiplier}x target)
- Progress: ${progress}% complete ($${strat.currentProfit || 0} of $${strat.profitTarget} target)
- Trades: ${strat.progressTrades || 0}
- Win Rate: ${strat.progressWinRate || 0}%
- AI Assessment: ${strat.plan.feasibility || 'N/A'}
- Pairs: ${strat.pairs?.join(', ') || 'N/A'}

Rules:
- Be motivational and authentic, not salesy
- Mention VEDD AI or VEDD SS AI naturally
- Include 2-3 relevant hashtags at the end
- Focus on the AI-guided journey, not guarantees
- Don't mention specific dollar amounts — use percentages and multipliers instead
- Keep it professional but exciting
- Output ONLY the post text, nothing else`;

      const ai = await getOpenAIInstanceForUser(userId);
      const completion = await ai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You generate social media posts. Output only the post text.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.8,
      });
      let result = completion.choices[0]?.message?.content || '';
      result = result.replace(/\$[\d,]+(\.\d{1,2})?/g, '[amount]').replace(/\[amount\]/g, 'my target');

      res.json({
        success: true,
        post: result.trim(),
        platform,
        hashtags: ['#VEDDAi', '#TradingAI', '#VEDDSSAI', '#AITrading']
      });
    } catch (err: any) {
      console.error('[VEDD SS AI Post Gen] Error:', err);
      res.json({
        success: true,
        post: `${progress}% toward my weekly goal with VEDD SS AI 🚀 AI-guided trading keeping me on track. The future of trading is here.\n\n#VEDDAi #AITrading #VEDDSSAI`,
        platform,
        hashtags: ['#VEDDAi', '#TradingAI', '#VEDDSSAI'],
        fallback: true
      });
    }
  });

  function getWeekStart(): string {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - diff);
    monday.setUTCHours(0, 0, 0, 0);
    return monday.toISOString();
  }

  function getDaysRemainingInWeek(): number {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return 0;
    return 5 - dayOfWeek;
  }

  // TradeLocker Connection Routes
  app.get("/api/tradelocker/connection", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const connection = await storage.getUserTradelockerConnection(userId);
    if (!connection) {
      return res.json(null);
    }
    // Don't return encrypted password
    const { encryptedPassword, accessToken, refreshToken, ...safeConnection } = connection;
    res.json(safeConnection);
  });

  app.post("/api/tradelocker/connection", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    const { email, password, serverId, accountId, accountType, autoExecute } = req.body;
    
    if (!email || !password || !serverId || !accountId) {
      return res.status(400).json({ error: "Missing required fields: email, password, serverId, accountId" });
    }
    
    // Check if user already has a connection
    const existing = await storage.getUserTradelockerConnection(userId);
    if (existing) {
      return res.status(400).json({ error: "Connection already exists. Delete it first or update it." });
    }
    
    // Encrypt password
    const encryptedPw = encryptPassword(password);
    
    // Test connection first
    try {
      const service = new TradeLockerService(accountType || 'live', accountId, serverId);
      await service.authenticate(email, password);
    } catch (err) {
      return res.status(400).json({ error: `Failed to connect to TradeLocker: ${err instanceof Error ? err.message : 'Unknown error'}` });
    }
    
    const connection = await storage.createTradelockerConnection({
      userId,
      email,
      encryptedPassword: encryptedPw,
      serverId,
      accountId,
      accountType: accountType || 'live',
      isActive: true,
      autoExecute: autoExecute || false,
    });
    
    const { encryptedPassword: _, ...safeConnection } = connection;
    res.json(safeConnection);
  });

  app.patch("/api/tradelocker/connection", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    const connection = await storage.getUserTradelockerConnection(userId);
    if (!connection) {
      return res.status(404).json({ error: "No connection found" });
    }
    
    const { isActive, autoExecute } = req.body;
    const updated = await storage.updateTradelockerConnection(connection.id, { isActive, autoExecute });
    if (!updated) {
      return res.status(500).json({ error: "Failed to update connection" });
    }
    
    const { encryptedPassword: _, accessToken, refreshToken, ...safeConnection } = updated;
    res.json(safeConnection);
  });

  app.delete("/api/tradelocker/connection", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    const connection = await storage.getUserTradelockerConnection(userId);
    if (!connection) {
      return res.status(404).json({ error: "No connection found" });
    }
    
    await storage.deleteTradelockerConnection(connection.id);
    res.json({ success: true });
  });

  app.post("/api/tradelocker/test", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    const connection = await storage.getUserTradelockerConnection(userId);
    if (!connection) {
      return res.status(404).json({ error: "No connection found" });
    }
    
    try {
      const password = decryptPassword(connection.encryptedPassword);
      const service = new TradeLockerService(
        connection.accountType as 'demo' | 'live',
        connection.accountId,
        connection.serverId
      );
      await service.authenticate(connection.email, password);
      const accountInfo = await service.getAccountInfo();
      
      await storage.updateTradelockerConnection(connection.id, {
        lastConnectedAt: new Date(),
        lastError: null,
      });
      
      res.json({ success: true, account: accountInfo });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      await storage.updateTradelockerConnection(connection.id, {
        lastError: errorMsg,
      });
      res.status(400).json({ success: false, error: errorMsg });
    }
  });

  app.get("/api/tradelocker/trades", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const trades = await storage.getTradelockerTradeLogs(userId, 100);
    res.json(trades);
  });

  // AI Trade Results & Accuracy Tracking
  app.get("/api/ai-trade-accuracy", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as User).id;
      const accuracy = await storage.getAiTradeAccuracy(userId);
      res.json(accuracy);
    } catch (error: any) {
      console.error("Error fetching AI trade accuracy:", error);
      res.status(500).json({ error: "Failed to fetch accuracy data" });
    }
  });

  app.get("/api/ai-trade-results", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as User).id;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const results = await storage.getAiTradeResults(userId, limit);
      res.json(results);
    } catch (error: any) {
      console.error("Error fetching AI trade results:", error);
      res.status(500).json({ error: "Failed to fetch trade results" });
    }
  });

  app.post("/api/ai-trade-results", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as User).id;
      const result = await storage.createAiTradeResult({
        ...req.body,
        userId,
      });
      res.json(result);
    } catch (error: any) {
      console.error("Error creating AI trade result:", error);
      res.status(500).json({ error: "Failed to create trade result" });
    }
  });

  app.patch("/api/ai-trade-results/:id", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as User).id;
      const id = parseInt(req.params.id);
      const updated = await storage.updateAiTradeResult(id, userId, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Trade result not found or access denied" });
      }
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating AI trade result:", error);
      res.status(500).json({ error: "Failed to update trade result" });
    }
  });

  // Delete/dismiss a pending trade (for canceling reversal alerts)
  app.delete("/api/ai-trade-results/:id", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as User).id;
      const id = parseInt(req.params.id);
      await storage.deleteAiTradeResult(id, userId);
      res.json({ success: true, message: "Trade dismissed" });
    } catch (error: any) {
      console.error("Error deleting AI trade result:", error);
      res.status(500).json({ error: "Failed to dismiss trade" });
    }
  });

  // Clear trade history learning data for a user
  app.delete("/api/mt5/learning-recommendations", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as User).id;
      
      // Clear learning recommendations cache
      const learningCache = (global as any).mt5LearningRecommendations || {};
      delete learningCache[userId];
      
      // Clear closed trades cache
      const closedTradesCache = (global as any).mt5ClosedTrades || {};
      delete closedTradesCache[userId];
      
      res.json({ success: true, message: "Trade history learning data cleared" });
    } catch (error: any) {
      console.error("Error clearing learning data:", error);
      res.status(500).json({ error: "Failed to clear learning data" });
    }
  });

  // Reversal Detection - Check if AI signal flips while trades are open
  app.get("/api/reversal-alerts", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as User).id;
      
      // Get pending/open trades
      const openTrades = await storage.getAiTradeResults(userId, 50);
      const now = Date.now();
      const FIFTEEN_MINUTES = 15 * 60 * 1000;
      
      // Filter for pending trades, auto-cancel (skip) trades older than 15 minutes
      const pendingTrades = openTrades.filter(t => {
        if (!((t.result === 'PENDING' || !t.result) && t.symbol)) return false;
        // Auto-cancel: skip trades older than 15 minutes
        if (t.createdAt) {
          const tradeAge = now - new Date(t.createdAt).getTime();
          if (tradeAge > FIFTEEN_MINUTES) return false;
        }
        return true;
      });
      
      if (pendingTrades.length === 0) {
        return res.json({ reversals: [], message: "No open trades to monitor (trades older than 15 minutes are auto-cancelled)" });
      }
      
      // Get recent analyses for comparison, sorted by createdAt descending
      const recentAnalyses = await storage.getChartAnalysesByUserId(userId);
      const sortedAnalyses = recentAnalyses.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      
      // Helper to parse confidence from text (handles "High", "Medium", "Low" and percentages)
      const parseConfidence = (text: string | null): number => {
        if (!text) return 50;
        const lower = text.toLowerCase();
        if (lower.includes('very high') || lower.includes('extremely')) return 90;
        if (lower.includes('high')) return 75;
        if (lower.includes('medium') || lower.includes('moderate')) return 55;
        if (lower.includes('low')) return 35;
        const match = text.match(/(\d+)/);
        return match ? parseInt(match[1]) : 50;
      };
      
      const reversals: Array<{
        tradeId: number;
        symbol: string;
        tradeDirection: string;
        newSignal: string;
        confidence: number;
        reversalStrength: string;
        timeframe: string;
        analysisTime: string;
        message: string;
      }> = [];
      
      for (const trade of pendingTrades) {
        // Find most recent analysis for this symbol (sorted list ensures first match is latest)
        const latestAnalysis = sortedAnalyses.find(a => 
          a.symbol?.toLowerCase() === trade.symbol.toLowerCase()
        );
        
        if (latestAnalysis && latestAnalysis.direction) {
          const tradeDir = trade.direction.toUpperCase();
          const analysisDir = latestAnalysis.direction.toUpperCase();
          
          // Check for reversal (opposite direction)
          if ((tradeDir === 'BUY' && analysisDir === 'SELL') || 
              (tradeDir === 'SELL' && analysisDir === 'BUY')) {
            
            const confidence = parseConfidence(latestAnalysis.confidence);
            
            // Calculate reversal strength based on confidence
            let reversalStrength = 'LOW';
            if (confidence >= 80) reversalStrength = 'CRITICAL';
            else if (confidence >= 65) reversalStrength = 'HIGH';
            else if (confidence >= 50) reversalStrength = 'MEDIUM';
            
            reversals.push({
              tradeId: trade.id,
              symbol: trade.symbol,
              tradeDirection: tradeDir,
              newSignal: analysisDir,
              confidence,
              reversalStrength,
              timeframe: latestAnalysis.timeframe || 'Unknown',
              analysisTime: latestAnalysis.createdAt?.toISOString() || new Date().toISOString(),
              message: `AI now signals ${analysisDir} on ${trade.symbol} (${confidence}% confidence) - you have an open ${tradeDir} position!`
            });
          }
        }
      }
      
      // Limit to max 7 reversals, sorted by strength
      const sortedReversals = reversals.sort((a, b) => {
        const strengthOrder: Record<string, number> = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
        return (strengthOrder[a.reversalStrength] || 4) - (strengthOrder[b.reversalStrength] || 4);
      }).slice(0, 7);
      
      res.json({ 
        reversals: sortedReversals,
        totalReversals: reversals.length,
        openTradesCount: pendingTrades.length,
        message: reversals.length > 0 
          ? `${reversals.length} reversal alert(s) detected!` 
          : "No reversals detected - your trades align with current AI signals"
      });
    } catch (error: any) {
      console.error("Error checking reversal alerts:", error);
      res.status(500).json({ error: "Failed to check reversal alerts" });
    }
  });

  // Trade History Learning - Analyze past trades and generate strategy improvements
  app.get("/api/trade-history-learning/:symbol", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as User).id;
      const symbol = req.params.symbol.toUpperCase();
      
      // Get all trades for this symbol
      const trades = await storage.getAiTradeResultsBySymbol(userId, symbol, 500);
      
      if (trades.length < 3) {
        return res.json({
          symbol,
          totalTrades: trades.length,
          message: "Not enough trade history to analyze. Need at least 3 trades.",
          patterns: [],
          recommendations: [],
        });
      }
      
      // Calculate statistics
      const wins = trades.filter(t => t.result === 'WIN').length;
      const losses = trades.filter(t => t.result === 'LOSS').length;
      const completed = wins + losses;
      const winRate = completed > 0 ? (wins / completed * 100).toFixed(1) : '0';
      
      // Analyze loss patterns by time of day
      const lossTrades = trades.filter(t => t.result === 'LOSS');
      const lossHours: { [key: number]: number } = {};
      const lossDays: { [key: number]: number } = {};
      const lossDirections: { BUY: number; SELL: number } = { BUY: 0, SELL: 0 };
      
      lossTrades.forEach(trade => {
        if (trade.createdAt) {
          const date = new Date(trade.createdAt);
          const hour = date.getHours();
          const day = date.getDay();
          lossHours[hour] = (lossHours[hour] || 0) + 1;
          lossDays[day] = (lossDays[day] || 0) + 1;
        }
        if (trade.direction === 'BUY') lossDirections.BUY++;
        if (trade.direction === 'SELL') lossDirections.SELL++;
      });
      
      // Find worst hours and days
      const worstHour = Object.entries(lossHours).sort((a, b) => b[1] - a[1])[0];
      const worstDay = Object.entries(lossDays).sort((a, b) => b[1] - a[1])[0];
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      // Identify patterns
      const patterns: Array<{ type: string; description: string; severity: string }> = [];
      
      if (worstHour && worstHour[1] >= 3) {
        patterns.push({
          type: 'TIME_OF_DAY',
          description: `Most losses occur around ${worstHour[0]}:00 (${worstHour[1]} losses)`,
          severity: worstHour[1] >= 5 ? 'HIGH' : 'MEDIUM'
        });
      }
      
      if (worstDay && worstDay[1] >= 3) {
        patterns.push({
          type: 'DAY_OF_WEEK',
          description: `${dayNames[parseInt(worstDay[0])]} has the most losses (${worstDay[1]} losses)`,
          severity: worstDay[1] >= 5 ? 'HIGH' : 'MEDIUM'
        });
      }
      
      if (lossDirections.BUY > lossDirections.SELL * 2) {
        patterns.push({
          type: 'DIRECTION_BIAS',
          description: `BUY trades fail more often (${lossDirections.BUY} vs ${lossDirections.SELL} SELL losses)`,
          severity: 'HIGH'
        });
      } else if (lossDirections.SELL > lossDirections.BUY * 2) {
        patterns.push({
          type: 'DIRECTION_BIAS',
          description: `SELL trades fail more often (${lossDirections.SELL} vs ${lossDirections.BUY} BUY losses)`,
          severity: 'HIGH'
        });
      }
      
      // Check for losing streaks
      let maxLossStreak = 0;
      let currentStreak = 0;
      trades.forEach(trade => {
        if (trade.result === 'LOSS') {
          currentStreak++;
          maxLossStreak = Math.max(maxLossStreak, currentStreak);
        } else if (trade.result === 'WIN') {
          currentStreak = 0;
        }
      });
      
      if (maxLossStreak >= 3) {
        patterns.push({
          type: 'LOSING_STREAK',
          description: `Maximum losing streak: ${maxLossStreak} trades in a row`,
          severity: maxLossStreak >= 5 ? 'CRITICAL' : 'HIGH'
        });
      }
      
      res.json({
        symbol,
        totalTrades: trades.length,
        completedTrades: completed,
        wins,
        losses,
        winRate: parseFloat(winRate),
        patterns,
        worstHour: worstHour ? { hour: parseInt(worstHour[0]), losses: worstHour[1] } : null,
        worstDay: worstDay ? { day: dayNames[parseInt(worstDay[0])], losses: worstDay[1] } : null,
        directionStats: lossDirections,
        maxLossStreak,
        recentTrades: trades.slice(0, 10),
      });
    } catch (error: any) {
      console.error("Error analyzing trade history:", error);
      res.status(500).json({ error: "Failed to analyze trade history" });
    }
  });

  // AI Strategy Improvement - Generate recommendations based on trade history
  app.post("/api/trade-history-learning/:symbol/improve", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as User).id;
      const symbol = req.params.symbol.toUpperCase();
      
      // Get trade history analysis
      const trades = await storage.getAiTradeResultsBySymbol(userId, symbol, 100);
      
      if (trades.length < 5) {
        return res.json({
          recommendations: ["Build more trade history (at least 5 trades) for AI strategy analysis."],
        });
      }
      
      // Calculate key metrics for AI prompt
      const wins = trades.filter(t => t.result === 'WIN').length;
      const losses = trades.filter(t => t.result === 'LOSS').length;
      const completed = wins + losses;
      const winRate = completed > 0 ? (wins / completed * 100).toFixed(1) : '0';
      
      // Get loss patterns
      const lossTrades = trades.filter(t => t.result === 'LOSS');
      const lossHours = lossTrades.map(t => t.createdAt ? new Date(t.createdAt).getHours() : null).filter(Boolean);
      const lossDays = lossTrades.map(t => t.createdAt ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(t.createdAt).getDay()] : null).filter(Boolean);
      const lossDirections = lossTrades.map(t => t.direction).filter(Boolean);
      
      // Get recent chart analyses for this symbol
      const recentAnalyses = await storage.getChartAnalysesByUserId(userId);
      const symbolAnalyses = recentAnalyses.filter(a => a.symbol?.toUpperCase().includes(symbol)).slice(0, 5);
      
      // Calculate recommended EA settings based on patterns
      const worstHoursSet = new Set(lossHours);
      const worstDaysSet = new Set(lossDays);
      const buyLosses = lossDirections.filter(d => d === 'BUY').length;
      const sellLosses = lossDirections.filter(d => d === 'SELL').length;
      
      // Determine direction bias recommendation
      let directionBias = 'BOTH';
      if (buyLosses > sellLosses * 2) directionBias = 'SELL_ONLY';
      else if (sellLosses > buyLosses * 2) directionBias = 'BUY_ONLY';
      
      // Calculate hours to avoid (most loss-prone hours)
      const hourCounts: { [key: number]: number } = {};
      lossHours.forEach((h: number | null) => { if (h !== null) hourCounts[h] = (hourCounts[h] || 0) + 1; });
      const hoursToAvoid = Object.entries(hourCounts)
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([hour]) => parseInt(hour));
      
      // Calculate days to avoid
      const dayMap: { [key: string]: number } = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
      const dayCounts: { [key: string]: number } = {};
      lossDays.forEach((d: string | null) => { if (d) dayCounts[d] = (dayCounts[d] || 0) + 1; });
      const daysToAvoid = Object.entries(dayCounts)
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([day]) => day);
      
      const prompt = `You are an expert trading strategy advisor. Analyze this trader's performance on ${symbol} and provide specific, actionable recommendations to improve their strategy.

TRADE STATISTICS:
- Symbol: ${symbol}
- Total Trades: ${completed}
- Win Rate: ${winRate}%
- Wins: ${wins}, Losses: ${losses}

LOSS PATTERNS:
- Hours when losses occurred: ${lossHours.join(', ') || 'N/A'}
- Days when losses occurred: ${lossDays.join(', ') || 'N/A'}
- Directions of losses: BUY: ${buyLosses}, SELL: ${sellLosses}

RECENT TRADE NOTES:
${trades.slice(0, 5).map(t => `- ${t.direction} at ${t.entryPrice}: ${t.result} | ${t.notes || 'No notes'}`).join('\n')}

Based on this data, provide 4-6 specific, actionable recommendations to improve their trading strategy for ${symbol}. Focus on:
1. Best times to trade (or avoid)
2. Direction bias corrections
3. Entry/exit timing improvements
4. Risk management adjustments
5. Pattern-specific advice

Format each recommendation as a clear, concise action item.`;

      // Call OpenAI for strategy recommendations
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.7,
      });
      
      const aiResponse = response.choices[0]?.message?.content || "";
      
      // Parse recommendations from response
      const recommendations = aiResponse.split('\n')
        .filter(line => line.trim().match(/^\d+\.|\-|\*/) || line.includes('Recommendation'))
        .map(line => line.replace(/^\d+\.\s*|\-\s*|\*\s*/, '').trim())
        .filter(line => line.length > 10)
        .slice(0, 6);
      
      // Generate EA settings recommendation
      const eaSettings = {
        symbol,
        directionBias,
        hoursToAvoid,
        daysToAvoid,
        recommendedTimeframes: ['H1', 'H4'], // Default based on general best practices
        tradeOnNewCandle: true,
        maxTradesPerDay: Math.max(1, Math.floor(3 * (parseFloat(winRate) / 100))), // Scale with win rate
        minConfidenceLevel: parseFloat(winRate) < 50 ? 75 : 65, // Higher threshold if losing
        notes: `Generated based on ${completed} trades with ${winRate}% win rate`,
        propFirmSettings: {
          enabled: true,
          dailyDrawdownLimit: 5.0,
          maxDrawdownLimit: 10.0,
          dailyLossLimit: 4.0,
          maxLotSize: 0.5,
          maxOpenTrades: 3,
          noTradingDuringNews: true,
          stopLossRequired: true,
          minRiskRewardRatio: 1.5,
          notes: 'Conservative settings for prop firm challenges and funded accounts.',
        },
      };
      
      res.json({
        symbol,
        winRate: parseFloat(winRate),
        totalTrades: completed,
        recommendations: recommendations.length > 0 ? recommendations : [
          "Continue building trade history for more specific recommendations.",
          "Review your entry timing to ensure alignment with market momentum.",
          "Consider adding confirmation signals before entering trades.",
        ],
        eaSettings,
        rawAnalysis: aiResponse,
      });
    } catch (error: any) {
      console.error("Error generating strategy improvements:", error);
      res.status(500).json({ error: "Failed to generate strategy improvements" });
    }
  });

  // Flip Trade - Close current position and open reverse to recover loss + profit
  app.post("/api/flip-trade", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    try {
      const userId = (req.user as User).id;
      
      // Validate request body with Zod
      const flipTradeSchema = z.object({
        tradeId: z.number().optional(),
        symbol: z.string().min(1, "Symbol is required").regex(/^[A-Z0-9]+$/i, "Invalid symbol format"),
        currentDirection: z.enum(['BUY', 'SELL']),
        newDirection: z.enum(['BUY', 'SELL']),
        positionId: z.string().optional(), // TradeLocker position ID for closing
      });
      
      const validationResult = flipTradeSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data", 
          details: validationResult.error.errors 
        });
      }
      
      const { tradeId, symbol, currentDirection, newDirection, positionId } = validationResult.data;
      
      // Verify directions are opposite
      if (currentDirection === newDirection) {
        return res.status(400).json({ error: "Flip trade requires opposite direction" });
      }
      
      // Verify ownership of trade result if tradeId provided
      if (tradeId) {
        const tradeResult = await storage.getAiTradeResultById(tradeId);
        if (!tradeResult || tradeResult.userId !== userId) {
          return res.status(403).json({ error: "Trade not found or access denied" });
        }
      }
      
      // Get TradeLocker connection
      const connection = await storage.getUserTradelockerConnection(userId);
      if (!connection) {
        return res.status(400).json({ error: "No TradeLocker connection found. Please connect your account first." });
      }
      
      // Initialize TradeLocker service for position operations
      const tlService = new TradeLockerService(
        connection.accountType as 'demo' | 'live',
        connection.accountId,
        connection.serverId
      );
      const password = decryptPassword(connection.encryptedPassword);
      await tlService.authenticate(connection.email, password);
      
      // Get current positions to find the one to close and calculate recovery lot size
      let originalVolume = 0.01;
      let currentLoss = 0;
      let closedPositionId: string | undefined;
      
      const positions = await tlService.getPositions();
      // Use exact symbol match (not includes) for security
      const matchingPosition = positions?.d?.find((pos: any) => {
        const posSymbol = pos.s?.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const targetSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
        return posSymbol === targetSymbol;
      });
      
      // REQUIRE an open position to flip - do not allow opening reverse without closing first
      if (!matchingPosition) {
        return res.status(400).json({ 
          error: `No open position found for ${symbol}. Flip trade requires an existing position to close.` 
        });
      }
      
      originalVolume = parseFloat(matchingPosition.qty) || 0.01;
      currentLoss = parseFloat(matchingPosition.unrealizedPl) || 0;
      closedPositionId = matchingPosition.id;
      
      // Verify the position direction matches what client expects
      const positionSide = matchingPosition.side?.toUpperCase();
      if (positionSide && positionSide !== currentDirection) {
        return res.status(400).json({ 
          error: `Position direction mismatch. Expected ${currentDirection} but found ${positionSide}.` 
        });
      }
      
      // Close the existing position
      console.log(`[Flip Trade] Closing position ${closedPositionId} for ${symbol}`);
      try {
        await tlService.closePosition(closedPositionId);
        console.log(`[Flip Trade] Position ${closedPositionId} closed successfully`);
      } catch (closeError: any) {
        console.error(`[Flip Trade] Failed to close position: ${closeError.message}`);
        return res.status(400).json({ 
          error: `Failed to close existing position: ${closeError.message}` 
        });
      }
      
      // Calculate recovery lot size based on actual position data
      // Recovery multiplier: 1.5x base, scales up with larger losses (max 3x)
      const lossMultiplier = currentLoss < 0 ? Math.min(1 + (Math.abs(currentLoss) / 50), 3) : 1.5;
      const recoveryLotSize = Math.min(
        parseFloat((originalVolume * lossMultiplier).toFixed(2)), 
        1.0 // Cap at 1.0 lot for safety
      );
      
      // Execute the reverse trade on TradeLocker
      const tradeResult = await executeMT5SignalOnTradeLocker(connection, {
        action: 'OPEN',
        symbol: symbol,
        direction: newDirection,
        volume: recoveryLotSize,
      });
      
      if (tradeResult.success) {
        // Update the original trade result as closed/loss if tradeId provided
        if (tradeId) {
          await storage.updateAiTradeResult(tradeId, userId, {
            result: currentLoss < 0 ? 'LOSS' : 'WIN',
            closedAt: new Date(),
            notes: `Flipped to ${newDirection} for recovery. P/L: ${currentLoss.toFixed(2)}`
          });
        }
        
        // Create new trade result for the flip trade
        await storage.createAiTradeResult({
          userId,
          symbol,
          direction: newDirection,
          entryPrice: 0, // Will be filled by TradeLocker
          source: 'auto',
          notes: `Recovery flip from ${currentDirection} - Lot: ${recoveryLotSize} (was ${originalVolume})`,
        });
        
        res.json({
          success: true,
          message: `Flip trade executed! Closed ${currentDirection} and opened ${newDirection} ${symbol} with ${recoveryLotSize} lots.`,
          orderId: tradeResult.orderId,
          lotSize: recoveryLotSize,
          closedPositionId,
          originalLoss: currentLoss,
        });
      } else {
        res.status(400).json({
          success: false,
          error: tradeResult.error || "Failed to execute flip trade"
        });
      }
    } catch (error: any) {
      console.error("Error executing flip trade:", error);
      res.status(500).json({ error: "Failed to execute flip trade: " + error.message });
    }
  });

  app.get("/api/tradelocker/debug-accounts", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    const connection = await storage.getUserTradelockerConnection(userId);
    if (!connection) {
      return res.status(404).json({ error: "No connection found" });
    }
    
    try {
      const password = decryptPassword(connection.encryptedPassword);
      const baseUrl = connection.accountType === 'demo' 
        ? 'https://demo.tradelocker.com/backend-api'
        : 'https://live.tradelocker.com/backend-api';
      
      // Authenticate
      const authResponse = await fetch(`${baseUrl}/auth/jwt/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: connection.email,
          password: password,
          server: connection.serverId,
        }),
      });
      
      if (!authResponse.ok) {
        const errText = await authResponse.text();
        return res.status(400).json({ error: 'Auth failed', details: errText });
      }
      
      const authData = await authResponse.json();
      
      // Get all accounts
      const accountsResponse = await fetch(`${baseUrl}/auth/jwt/all-accounts`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authData.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      const accountsData = await accountsResponse.json();
      
      res.json({
        storedAccountId: connection.accountId,
        storedServerId: connection.serverId,
        allAccountsResponse: accountsData,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ============================================================
  // AMBASSADOR TRAINING & CERTIFICATION ROUTES
  // ============================================================

  // Get ambassador training progress
  app.get("/api/ambassador/training/progress", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    try {
      let progress = await storage.getAmbassadorTrainingProgress(userId);
      if (!progress) {
        // Create initial progress record
        progress = await storage.createAmbassadorTrainingProgress({
          userId,
          completedModules: [],
          completedLessons: [],
          quizScores: {},
          totalProgress: 0,
          isCompleted: false
        });
      }
      res.json(progress);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Update ambassador training progress
  app.post("/api/ambassador/training/progress", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const { completedLessons: newCompletedLessons, quizScores: newQuizScores } = req.body;
    
    try {
      let progress = await storage.getAmbassadorTrainingProgress(userId);
      if (!progress) {
        progress = await storage.createAmbassadorTrainingProgress({
          userId,
          completedModules: [],
          completedLessons: [],
          quizScores: {},
          totalProgress: 0,
          isCompleted: false
        });
      }
      
      // Merge new data with existing
      const completedLessons = Array.isArray(newCompletedLessons) 
        ? newCompletedLessons 
        : (progress.completedLessons as string[]) || [];
      
      const quizScores = newQuizScores && typeof newQuizScores === 'object'
        ? { ...(progress.quizScores as Record<string, number> || {}), ...newQuizScores }
        : (progress.quizScores as Record<string, number>) || {};
      
      // Calculate completed modules from completed lessons
      // Module mapping matches the frontend training modules
      const moduleMap: Record<string, string[]> = {
        'intro': ['intro-1', 'intro-2'],
        'features': ['features-1', 'features-2', 'features-3', 'features-4'],
        'technical-analysis': ['ta-1', 'ta-2', 'ta-3', 'ta-4', 'ta-5', 'ta-6'],
        'social-media': ['social-1', 'social-2', 'social-3'],
        'video-creation': ['video-1', 'video-2', 'video-3', 'video-4'],
        'live-demos': ['live-1', 'live-2', 'live-3'],
        'compliance': ['compliance-1', 'compliance-2', 'compliance-3'],
        'platform-essentials': ['platform-1', 'platform-2', 'platform-3', 'platform-4']
      };
      
      const completedModules: string[] = [];
      for (const [moduleId, lessonIds] of Object.entries(moduleMap)) {
        if (lessonIds.every(id => completedLessons.includes(id))) {
          completedModules.push(moduleId);
        }
      }
      
      // Calculate total progress (total lessons = 29 across 8 modules)
      const totalLessons = 29;
      const totalProgress = Math.round((completedLessons.length / totalLessons) * 100);
      const isCompleted = totalProgress >= 100;
      
      const updatedProgress = await storage.updateAmbassadorTrainingProgress(userId, {
        completedLessons,
        completedModules,
        quizScores,
        totalProgress,
        isCompleted,
        completedAt: isCompleted ? new Date() : undefined
      });
      
      res.json(updatedProgress);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get user's ambassador certification
  app.get("/api/ambassador/certification", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    try {
      const certification = await storage.getAmbassadorCertification(userId);
      res.json(certification || null);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Issue ambassador certification (when training is complete)
  app.post("/api/ambassador/certification/issue", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const user = req.user as User;
    
    try {
      // Check if already certified
      const existingCert = await storage.getAmbassadorCertification(userId);
      if (existingCert) {
        return res.status(400).json({ error: "Already certified", certification: existingCert });
      }
      
      // Check training completion
      const progress = await storage.getAmbassadorTrainingProgress(userId);
      if (!progress || !progress.isCompleted) {
        return res.status(400).json({ error: "Training not completed" });
      }
      
      // Calculate final score from quiz scores
      const quizScores = (progress.quizScores as Record<string, number>) || {};
      const scores = Object.values(quizScores);
      const finalScore = scores.length > 0 
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) 
        : 100;
      
      // Import certificate service functions
      const { generateCertificateNumber, generateVerificationHash, generateCertificateImage, generateNFTMetadata } = await import('./certificate-service');
      
      const certificateNumber = generateCertificateNumber();
      const holderName = user.fullName || user.username;
      const issueDate = new Date();
      const modulesCompleted = ((progress.completedModules as string[]) || []).length;
      
      const certData = {
        holderName,
        certificateNumber,
        issueDate,
        finalScore,
        modulesCompleted
      };
      
      const verificationHash = generateVerificationHash(certData);
      
      // Generate certificate image
      const imageBuffer = await generateCertificateImage(certData);
      const imageBase64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;
      
      // Create certification record
      const certification = await storage.createAmbassadorCertification({
        userId,
        certificateNumber,
        holderName,
        status: 'active',
        finalScore,
        modulesCompleted,
        verificationHash,
        veddTokenBalance: 100, // Initial VEDD token reward
        veddTokenClaimed: false,
        certificateImageUrl: imageBase64
      });
      
      res.json({
        success: true,
        certification,
        message: 'Congratulations! You are now a certified VEDD AI Ambassador!',
        nftMetadata: generateNFTMetadata(certData, imageBase64)
      });
    } catch (err) {
      console.error('Certification error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Connect Solana wallet for NFT minting
  app.post("/api/ambassador/certification/connect-wallet", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const { walletAddress } = req.body;
    
    if (!walletAddress || typeof walletAddress !== 'string') {
      return res.status(400).json({ error: "Wallet address required" });
    }
    
    try {
      const certification = await storage.getAmbassadorCertification(userId);
      if (!certification) {
        return res.status(404).json({ error: "No certification found" });
      }
      
      const updated = await storage.updateAmbassadorCertification(certification.id, {
        solanaWalletAddress: walletAddress
      });
      
      res.json({ success: true, certification: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Claim VEDD tokens
  app.post("/api/ambassador/certification/claim-tokens", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    try {
      const certification = await storage.getAmbassadorCertification(userId);
      if (!certification) {
        return res.status(404).json({ error: "No certification found" });
      }
      
      if (certification.veddTokenClaimed) {
        return res.status(400).json({ error: "Tokens already claimed" });
      }
      
      if (!certification.solanaWalletAddress) {
        return res.status(400).json({ error: "Connect your Solana wallet first" });
      }
      
      // In production, this would initiate a token transfer on Solana
      // For now, we mark as claimed and log the pending transfer
      const updated = await storage.updateAmbassadorCertification(certification.id, {
        veddTokenClaimed: true
      });
      
      res.json({ 
        success: true, 
        message: `${certification.veddTokenBalance} VEDD tokens have been queued for transfer to ${certification.solanaWalletAddress}`,
        certification: updated
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Verify certification (public endpoint)
  app.get("/api/ambassador/verify/:certificateNumber", async (req: Request, res: Response) => {
    const { certificateNumber } = req.params;
    
    try {
      const certification = await storage.getAmbassadorCertificationByNumber(certificateNumber);
      if (!certification) {
        return res.status(404).json({ valid: false, error: "Certificate not found" });
      }
      
      res.json({
        valid: true,
        certificateNumber: certification.certificateNumber,
        holderName: certification.holderName,
        issueDate: certification.issueDate,
        status: certification.status,
        finalScore: certification.finalScore,
        modulesCompleted: certification.modulesCompleted,
        hasNFT: !!certification.nftMintAddress,
        nftMintAddress: certification.nftMintAddress
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ==========================================
  // 44-DAY AMBASSADOR CONTENT FLOW ROUTES
  // ==========================================

  // Get all daily lessons (curriculum)
  app.get("/api/ambassador/content-flow/lessons", async (req: Request, res: Response) => {
    try {
      const { ambassadorContentCurriculum } = await import('./ambassador-content-data');
      res.json(ambassadorContentCurriculum);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get user's content flow stats
  app.get("/api/ambassador/content-flow/stats", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    try {
      const userId = req.user!.id;
      let stats = await storage.getAmbassadorContentStats(userId);
      
      if (!stats) {
        stats = await storage.createAmbassadorContentStats({
          userId,
          currentDay: 1,
          completedDays: 0,
          totalTokensEarned: 0,
          currentStreak: 0,
          longestStreak: 0,
          lastCompletedAt: null,
          journeyStartedAt: null
        });
      }
      
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get user's progress for all days
  app.get("/api/ambassador/content-flow/progress", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    try {
      const userId = req.user!.id;
      const progress = await storage.getAmbassadorContentProgress(userId);
      res.json(progress);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get specific day's lesson and user progress
  app.get("/api/ambassador/content-flow/day/:dayNumber", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    try {
      const dayNumber = parseInt(req.params.dayNumber);
      const userId = req.user!.id;
      
      if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 44) {
        return res.status(400).json({ error: "Invalid day number (1-44)" });
      }
      
      const { ambassadorContentCurriculum } = await import('./ambassador-content-data');
      const lesson = ambassadorContentCurriculum.find(l => l.dayNumber === dayNumber);
      
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }
      
      const userProgress = await storage.getAmbassadorDayProgress(userId, dayNumber);
      const stats = await storage.getAmbassadorContentStats(userId);
      
      // Day 1 is always unlocked, subsequent days require progression
      // If no stats exist, user is new - unlock Day 1 only
      // If stats exist, unlock days up to and including currentDay
      const currentDay = stats?.currentDay || 1;
      const isUnlocked = dayNumber === 1 || dayNumber <= currentDay;
      
      res.json({
        lesson,
        progress: userProgress || { status: isUnlocked ? 'available' : 'locked' },
        isUnlocked
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Start a day (mark as in_progress)
  app.post("/api/ambassador/content-flow/day/:dayNumber/start", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    try {
      const dayNumber = parseInt(req.params.dayNumber);
      const userId = req.user!.id;
      
      if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 44) {
        return res.status(400).json({ error: "Invalid day number (1-44)" });
      }
      
      let stats = await storage.getAmbassadorContentStats(userId);
      
      if (!stats) {
        stats = await storage.createAmbassadorContentStats({
          userId,
          currentDay: 1,
          completedDays: 0,
          totalTokensEarned: 0,
          currentStreak: 0,
          longestStreak: 0,
          lastCompletedAt: null,
          journeyStartedAt: new Date()
        });
      }
      
      if (dayNumber > stats.currentDay) {
        return res.status(403).json({ error: "Day not yet unlocked" });
      }
      
      const progress = await storage.upsertAmbassadorDayProgress(userId, dayNumber, {
        status: 'in_progress',
        startedAt: new Date()
      });
      
      res.json({ success: true, progress });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Generate AI content for a day
  app.post("/api/ambassador/content-flow/day/:dayNumber/generate", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    try {
      const dayNumber = parseInt(req.params.dayNumber);
      const userId = req.user!.id;
      const { customContext } = req.body;
      
      if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 44) {
        return res.status(400).json({ error: "Invalid day number (1-44)" });
      }
      
      const { ambassadorContentCurriculum } = await import('./ambassador-content-data');
      const lesson = ambassadorContentCurriculum.find(l => l.dayNumber === dayNumber);
      
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }
      
      // Initialize OpenAI client
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const prompt = `You are a social media content creator for VEDD AI, a faith-based trading platform. Create an engaging social media post based on the following:

Day ${lesson.dayNumber}: ${lesson.title}

Trading Topic: ${lesson.tradingTopic}
Trading Lesson: ${lesson.tradingLesson}

Scripture: ${lesson.scriptureReference} - "${lesson.scriptureText}"

Devotional Message: ${lesson.devotionalMessage}

Content Guidance: ${lesson.contentPrompt}

${customContext ? `User's additional context: ${customContext}` : ''}

Create a compelling, authentic social media post that:
1. Educates about trading in an accessible way
2. Weaves in the faith message naturally
3. Encourages engagement
4. Is appropriate for platforms like Twitter/X, Instagram, and LinkedIn
5. Keeps it concise but impactful (under 280 characters for Twitter compatibility)

Also provide a longer-form version (2-3 paragraphs) suitable for Instagram caption or LinkedIn.

Format your response as JSON:
{
  "shortPost": "Twitter-length post here",
  "longPost": "Longer Instagram/LinkedIn post here",
  "suggestedHashtags": ["hashtag1", "hashtag2"]
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });
      
      const content = completion.choices[0].message.content;
      const generatedContent = JSON.parse(content || '{}');
      
      const progress = await storage.upsertAmbassadorDayProgress(userId, dayNumber, {
        aiGeneratedContent: JSON.stringify(generatedContent),
        status: 'in_progress'
      });
      
      res.json({ 
        success: true, 
        content: generatedContent,
        suggestedHashtags: lesson.suggestedHashtags,
        progress 
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Complete a day (with optional media upload - accepts both images and videos)
  app.post("/api/ambassador/content-flow/day/:dayNumber/complete", mediaUpload.single('media'), async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    try {
      const dayNumber = parseInt(req.params.dayNumber);
      const userId = req.user!.id;
      const { customContent } = req.body;
      
      if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 44) {
        return res.status(400).json({ error: "Invalid day number (1-44)" });
      }
      
      const { ambassadorContentCurriculum } = await import('./ambassador-content-data');
      const lesson = ambassadorContentCurriculum.find(l => l.dayNumber === dayNumber);
      
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }
      
      let stats = await storage.getAmbassadorContentStats(userId);
      if (!stats) {
        stats = await storage.createAmbassadorContentStats({
          userId,
          currentDay: 1,
          completedDays: 0,
          totalTokensEarned: 0,
          currentStreak: 0,
          longestStreak: 0,
          lastCompletedAt: null,
          journeyStartedAt: new Date()
        });
      }
      
      if (dayNumber > stats.currentDay) {
        return res.status(403).json({ error: "Day not yet unlocked" });
      }
      
      // Check if already completed - prevent double completion
      const existingProgress = await storage.getAmbassadorDayProgress(userId, dayNumber);
      if (existingProgress?.status === 'completed') {
        return res.status(400).json({ 
          error: "Day already completed", 
          tokensEarned: existingProgress.tokensEarned,
          completedAt: existingProgress.completedAt
        });
      }
      
      let mediaUrl = null;
      let mediaType = null;
      // Handle file upload if present (using memory storage, save to disk)
      if (req.file && req.file.buffer) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const filename = `content-${userId}-day${dayNumber}-${Date.now()}${path.extname(req.file.originalname)}`;
        const uploadPath = path.join(process.cwd(), 'uploads', filename);
        await fs.writeFile(uploadPath, req.file.buffer);
        mediaUrl = `/uploads/${filename}`;
        mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
      }
      
      let tokensEarned = lesson.tokenReward;
      if (mediaUrl) {
        tokensEarned += lesson.bonusTokens;
      }
      
      const progress = await storage.upsertAmbassadorDayProgress(userId, dayNumber, {
        status: 'completed',
        completedAt: new Date(),
        userMediaUrl: mediaUrl,
        userMediaType: mediaType,
        customContent: customContent || null,
        tokensEarned
      });
      
      const isConsecutive = stats.lastCompletedAt 
        ? (new Date().getTime() - new Date(stats.lastCompletedAt).getTime()) < 48 * 60 * 60 * 1000
        : true;
      
      const newStreak = isConsecutive ? stats.currentStreak + 1 : 1;
      const newLongestStreak = Math.max(newStreak, stats.longestStreak);
      // Only advance currentDay if completing the current day (not a previous day)
      const newCurrentDay = dayNumber === stats.currentDay 
        ? Math.min(dayNumber + 1, 44) 
        : Math.max(stats.currentDay, dayNumber + 1);
      
      const updatedStats = await storage.updateAmbassadorContentStats(userId, {
        currentDay: newCurrentDay,
        completedDays: stats.completedDays + 1,
        totalTokensEarned: stats.totalTokensEarned + tokensEarned,
        currentStreak: newStreak,
        longestStreak: newLongestStreak,
        lastCompletedAt: new Date(),
        journeyCompletedAt: dayNumber === 44 ? new Date() : null
      });
      
      const userStreak = await storage.getUserStreak(userId);
      if (userStreak) {
        await storage.updateUserStreak(userId, {
          xpPoints: userStreak.xpPoints + tokensEarned
        });
      }
      
      res.json({
        success: true,
        tokensEarned,
        bonusEarned: mediaUrl ? lesson.bonusTokens : 0,
        newStreak,
        progress,
        stats: updatedStats,
        isJourneyComplete: dayNumber === 44
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ==========================================
  // COMMUNITY FEATURES (nas.io style)
  // ==========================================

  // Get social content directions for a specific day
  app.get("/api/ambassador/community/social-directions/:dayNumber", async (req: Request, res: Response) => {
    try {
      const dayNumber = parseInt(req.params.dayNumber);
      if (isNaN(dayNumber) || dayNumber < 1 || dayNumber > 44) {
        return res.status(400).json({ error: 'Invalid day number' });
      }

      let directions = await storage.getSocialDirectionsForDay(dayNumber);
      
      // If no directions exist, generate them with AI
      if (directions.length === 0) {
        const { ambassadorContentCurriculum } = await import('./ambassador-content-data');
        const lesson = ambassadorContentCurriculum.find(l => l.dayNumber === dayNumber);
        
        if (!lesson) {
          return res.status(404).json({ error: 'Lesson not found' });
        }

        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const platforms = ['twitter', 'instagram', 'tiktok', 'linkedin'];
        
        for (const platform of platforms) {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `You are a social media content strategist for VEDD AI Trading Vault ambassadors. Generate platform-specific content for ${platform.toUpperCase()}. Be specific, actionable, and engaging. Return JSON only.`
              },
              {
                role: "user",
                content: `Create a social media post strategy for Day ${dayNumber} of the ambassador journey.
                
Topic: ${lesson.tradingTopic}
Lesson: ${lesson.tradingLesson}
Scripture: ${lesson.scriptureReference} - "${lesson.scriptureText}"
Devotional: ${lesson.devotionalMessage}

Generate a JSON object with these fields:
- contentType: best content type for ${platform} (post/story/reel/thread/carousel/video)
- postIdea: specific content idea (2-3 sentences)
- captionTemplate: ready-to-use caption with emojis (150-280 chars for twitter, longer for others)
- hookLine: attention-grabbing first line
- callToAction: specific CTA
- hashtags: array of 5-8 relevant hashtags
- bestPostingTime: optimal posting time
- engagementTips: array of 3 tips to boost engagement`
              }
            ],
            response_format: { type: "json_object" }
          });

          const content = JSON.parse(completion.choices[0].message.content || '{}');
          
          await storage.createSocialDirection({
            dayNumber,
            platform,
            contentType: content.contentType || 'post',
            postIdea: content.postIdea || '',
            captionTemplate: content.captionTemplate || '',
            hookLine: content.hookLine || '',
            callToAction: content.callToAction || '',
            hashtags: content.hashtags || [],
            bestPostingTime: content.bestPostingTime || null,
            engagementTips: content.engagementTips || [],
            aiGenerated: true
          });
        }
        
        directions = await storage.getSocialDirectionsForDay(dayNumber);
      }

      res.json({ directions });
    } catch (err) {
      console.error('Social directions error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get challenges for current week or all active
  app.get("/api/ambassador/community/challenges", async (req: Request, res: Response) => {
    try {
      const { week, status } = req.query;
      let challenges;
      
      if (week) {
        challenges = await storage.getChallengesByWeek(parseInt(week as string));
      } else {
        challenges = await storage.getChallenges(status as string);
      }
      
      // If no challenges exist, generate weekly challenges with AI
      if (challenges.length === 0 && !status) {
        const currentWeek = week ? parseInt(week as string) : 1;
        await generateWeeklyChallenges(currentWeek);
        challenges = await storage.getChallengesByWeek(currentWeek);
      }
      
      // Get participant counts for each challenge
      const challengesWithStats = await Promise.all(challenges.map(async (c) => {
        const participants = await storage.getChallenges(); // Would need a count method
        return { ...c, participantCount: 0 };
      }));
      
      res.json({ challenges: challengesWithStats });
    } catch (err) {
      console.error('Challenges error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Generate weekly challenges helper function - uses strategic challenges data
  async function generateWeeklyChallenges(weekNumber: number) {
    const { strategicChallenges } = await import("./strategic-community-data");
    
    // Get strategic challenges for this week (or repeatable ones)
    const weekChallenges = strategicChallenges.filter(c => 
      c.weekNumber === weekNumber || c.weekNumber === 0
    );
    
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    
    for (const challenge of weekChallenges) {
      await storage.createChallenge({
        title: challenge.title,
        description: challenge.description,
        challengeType: 'weekly',
        category: challenge.type,
        difficulty: challenge.totalTokenReward > 200 ? 'hard' : challenge.totalTokenReward > 100 ? 'medium' : 'easy',
        objectives: challenge.objectives.map(o => o.description),
        successCriteria: challenge.objectives.map(o => o.verification).join('; '),
        tokenReward: challenge.totalTokenReward,
        bonusReward: challenge.bonusTokens,
        badgeReward: `${challenge.title} Champion`,
        startDate: weekStart,
        endDate: weekEnd,
        weekNumber: weekNumber,
        status: 'active',
        aiGenerated: false,
      });
    }
    
    // Fallback to AI generation if no strategic challenges for this week
    if (weekChallenges.length === 0) {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const challengeTypes = [
        { type: 'content', title: 'Content Creator Challenge' },
        { type: 'engagement', title: 'Community Engagement Challenge' },
        { type: 'learning', title: 'Trading Knowledge Challenge' }
      ];
    
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    for (const ct of challengeTypes) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a community manager for VEDD AI Trading Vault. Create engaging weekly challenges that help ambassadors grow. Return JSON only.`
          },
          {
            role: "user",
            content: `Create a ${ct.type} challenge for Week ${weekNumber} of the ambassador program.
            
Generate a JSON object with:
- title: catchy challenge title
- description: detailed description (2-3 sentences)
- difficulty: easy/medium/hard
- objectives: array of 3-5 specific tasks to complete
- successCriteria: how completion is verified
- tokenReward: suggested tokens (30-100)
- bonusReward: bonus for top 3 performers (0-50)
- badgeReward: name of badge earned (e.g., "Content Champion Week ${weekNumber}")`
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = JSON.parse(completion.choices[0].message.content || '{}');
      
      await storage.createChallenge({
        title: content.title || `${ct.title} Week ${weekNumber}`,
        description: content.description || '',
        challengeType: 'weekly',
        category: ct.type,
        difficulty: content.difficulty || 'medium',
        objectives: content.objectives || [],
        successCriteria: content.successCriteria || '',
        tokenReward: content.tokenReward || 50,
        bonusReward: content.bonusReward || 0,
        badgeReward: content.badgeReward || null,
        startDate: weekStart,
        endDate: weekEnd,
        weekNumber,
        status: 'active',
        aiGenerated: true
      });
    }
    }
  }

  // Join a challenge
  app.post("/api/ambassador/community/challenges/:id/join", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const challengeId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      
      const challenge = await storage.getChallenge(challengeId);
      if (!challenge) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      const existing = await storage.getChallengeParticipation(userId, challengeId);
      if (existing) {
        return res.status(400).json({ error: 'Already joined this challenge' });
      }
      
      const participation = await storage.joinChallenge(userId, challengeId);
      res.json({ success: true, participation });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Complete a challenge
  app.post("/api/ambassador/community/challenges/:id/complete", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const challengeId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { proofUrl } = req.body;
      
      const challenge = await storage.getChallenge(challengeId);
      if (!challenge) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      const participation = await storage.getChallengeParticipation(userId, challengeId);
      if (!participation) {
        return res.status(400).json({ error: 'Must join challenge first' });
      }
      
      if (participation.status === 'completed') {
        return res.status(400).json({ error: 'Challenge already completed' });
      }
      
      const updated = await storage.updateChallengeProgress(userId, challengeId, {
        status: 'completed',
        completedAt: new Date(),
        proofUrl,
        tokensEarned: challenge.tokenReward
      });
      
      // Award tokens to content stats
      const stats = await storage.getAmbassadorContentStats(userId);
      if (stats) {
        await storage.updateAmbassadorContentStats(userId, {
          totalTokensEarned: stats.totalTokensEarned + challenge.tokenReward
        });
      }
      
      // Enqueue VEDD token reward for challenge completion
      let veddRewardResult = null;
      try {
        veddRewardResult = await veddTokenService.enqueueReward(
          userId,
          'challenge_completion',
          challengeId,
          { challengeTitle: challenge.title, challengeType: challenge.type }
        );
      } catch (rewardErr) {
        console.error('Failed to enqueue VEDD reward:', rewardErr);
      }
      
      res.json({ 
        success: true, 
        tokensEarned: challenge.tokenReward, 
        participation: updated,
        veddReward: veddRewardResult
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get user's challenge participation
  app.get("/api/ambassador/community/my-challenges", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const challenges = await storage.getUserChallenges(userId);
      res.json({ challenges });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get events
  app.get("/api/ambassador/community/events", async (req: Request, res: Response) => {
    try {
      const { week, status } = req.query;
      let events;
      
      if (week) {
        events = await storage.getEventsByWeek(parseInt(week as string));
      } else {
        events = await storage.getEvents(status as string);
      }
      
      // If no events exist, generate event templates with AI
      if (events.length === 0 && !status) {
        const currentWeek = week ? parseInt(week as string) : 1;
        await generateWeeklyEvents(currentWeek);
        events = await storage.getEventsByWeek(currentWeek);
      }
      
      res.json({ events });
    } catch (err) {
      console.error('Events error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Weekly Content Calendar API - returns content flow with YouTube tutorials, reels, etc.
  app.get("/api/content-calendar", async (req, res) => {
    try {
      const { week } = req.query;
      const { weeklyContentFlow } = await import("./strategic-community-data");
      
      if (week) {
        const weekNumber = parseInt(week as string);
        const weekContent = weeklyContentFlow.find(w => w.weekNumber === weekNumber);
        if (!weekContent) {
          return res.status(404).json({ error: `No content calendar found for week ${weekNumber}` });
        }
        return res.json({ 
          week: weekNumber,
          theme: weekContent.theme,
          focusArea: weekContent.focusArea,
          contentItems: weekContent.contentItems,
          totalTokenRewards: weekContent.contentItems.reduce((sum, item) => sum + item.tokenReward, 0)
        });
      }
      
      // Return full 6-week content calendar
      const fullCalendar = weeklyContentFlow.map(week => ({
        week: week.weekNumber,
        theme: week.theme,
        focusArea: week.focusArea,
        contentCount: week.contentItems.length,
        totalTokenRewards: week.contentItems.reduce((sum, item) => sum + item.tokenReward, 0),
        contentTypes: [...new Set(week.contentItems.map(item => item.contentType))]
      }));
      
      res.json({ 
        totalWeeks: weeklyContentFlow.length,
        calendar: fullCalendar,
        contentTypes: {
          youtube_tutorial: 'YouTube Tutorial (10+ min deep dive)',
          quick_tip_reel: 'Quick Tip Reel (60 sec TikTok/Reels)',
          carousel_post: 'Carousel Post (Swipeable Instagram/LinkedIn)',
          live_stream: 'Live Stream (Interactive session)',
          story_series: 'Story Series (24hr Instagram/Facebook stories)',
          meme_post: 'Meme Post (Engagement driver)',
          testimonial: 'Testimonial (Success stories)',
          behind_scenes: 'Behind The Scenes (Authentic content)',
          chart_breakdown: 'Chart Breakdown (Technical analysis)',
          community_highlight: 'Community Highlight (Member shoutouts)'
        }
      });
    } catch (err) {
      console.error('Content calendar error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get specific day's content for today or a given day
  app.get("/api/content-calendar/today", async (req, res) => {
    try {
      const { weeklyContentFlow } = await import("./strategic-community-data");
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
      const today = days[new Date().getDay()];
      
      // Get week parameter or default to week 1
      const weekNumber = parseInt(req.query.week as string) || 1;
      const weekContent = weeklyContentFlow.find(w => w.weekNumber === weekNumber);
      
      if (!weekContent) {
        return res.status(404).json({ error: `No content found for week ${weekNumber}` });
      }
      
      const todaysContent = weekContent.contentItems.find(item => item.day === today);
      
      res.json({
        day: today,
        week: weekNumber,
        theme: weekContent.theme,
        content: todaysContent || null,
        message: todaysContent ? `Today's content: ${todaysContent.title}` : `No specific content scheduled for ${today}`
      });
    } catch (err) {
      console.error('Today content error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Generate weekly events helper function - uses strategic events data
  async function generateWeeklyEvents(weekNumber: number) {
    const { strategicEvents } = await import("./strategic-community-data");
    
    // Get strategic events for this week (or repeatable ones like weekly graduation)
    const weekEvents = strategicEvents.filter(e => 
      e.weekNumber === weekNumber || e.weekNumber === 0
    );
    
    // Calculate event dates based on week number
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekNumber - 1) * 7);
    
    for (const event of weekEvents) {
      const eventDate = new Date(weekStart);
      eventDate.setDate(eventDate.getDate() + (event.dayNumber % 7));
      eventDate.setHours(19, 0, 0, 0); // Default 7 PM
      
      await storage.createEvent({
        title: event.title,
        description: event.description,
        eventType: event.eventType,
        format: event.format,
        hostGuide: event.hostGuide,
        talkingPoints: event.talkingPoints,
        agenda: event.agenda,
        resourceLinks: event.resourceLinks,
        suggestedDuration: event.suggestedDuration,
        tokenReward: event.tokenReward,
        hostTokenReward: event.hostTokenReward,
        scheduledDate: eventDate,
        weekNumber: weekNumber,
        status: 'scheduled',
        aiGenerated: false,
      });
    }
    
    // Fallback to AI generation if no strategic events for this week
    if (weekEvents.length === 0) {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const eventTypes = [
        { type: 'live_session', title: 'Weekly Live Trading Session' },
        { type: 'ama', title: 'Ask Me Anything Session' },
        { type: 'workshop', title: 'Ambassador Workshop' }
      ];

      for (const et of eventTypes) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an event coordinator for VEDD AI Trading Vault. Create engaging virtual events that help ambassadors learn and grow. Return JSON only.`
          },
          {
            role: "user",
            content: `Create a ${et.type} event template for Week ${weekNumber} of the ambassador program.
            
Generate a JSON object with:
- title: engaging event title
- description: detailed description (2-3 sentences)
- hostGuide: step-by-step guide for hosting (300-500 words)
- talkingPoints: array of 5-7 key points to cover
- agenda: array of objects with {time: "0-5 min", topic: "Introduction", details: "..."}
- resourceLinks: array of {title, url, description} for helpful resources
- suggestedDuration: duration in minutes (30-90)
- tokenReward: tokens for attendees (15-30)
- hostTokenReward: tokens for hosts (50-100)`
          }
        ],
        response_format: { type: "json_object" }
      });

      const content = JSON.parse(completion.choices[0].message.content || '{}');
      
      await storage.createEvent({
        title: content.title || `${et.title} Week ${weekNumber}`,
        description: content.description || '',
        eventType: et.type,
        format: 'virtual',
        hostGuide: content.hostGuide || '',
        talkingPoints: content.talkingPoints || [],
        agenda: content.agenda || [],
        resourceLinks: content.resourceLinks || [],
        suggestedDuration: content.suggestedDuration || 60,
        tokenReward: content.tokenReward || 25,
        hostTokenReward: content.hostTokenReward || 100,
        weekNumber,
        status: 'template',
        aiGenerated: true
      });
      }
    }
  }

  // Register for an event
  app.post("/api/ambassador/community/events/:id/register", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const eventId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { role } = req.body;
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      
      const existing = await storage.getEventRegistration(userId, eventId);
      if (existing) {
        return res.status(400).json({ error: "You're already registered! Check your upcoming events to view details." });
      }
      
      const registration = await storage.registerForEvent(userId, eventId, role || 'attendee');
      res.json({ success: true, registration });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Mark event attendance and award tokens
  app.post("/api/ambassador/community/events/:id/attend", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const eventId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      
      const registration = await storage.getEventRegistration(userId, eventId);
      if (!registration) {
        return res.status(400).json({ error: 'Must register first' });
      }
      
      if (registration.status === 'attended') {
        return res.status(400).json({ error: 'Already marked as attended' });
      }
      
      const tokensEarned = registration.role === 'host' ? event.hostTokenReward : event.tokenReward;
      
      await storage.updateEventRegistration(userId, eventId, {
        status: 'attended',
        attendedAt: new Date(),
        tokensEarned
      });
      
      // Award tokens
      const stats = await storage.getAmbassadorContentStats(userId);
      if (stats) {
        await storage.updateAmbassadorContentStats(userId, {
          totalTokensEarned: stats.totalTokensEarned + tokensEarned
        });
      }
      
      res.json({ success: true, tokensEarned });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get user's event registrations
  app.get("/api/ambassador/community/my-events", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const events = await storage.getUserEvents(userId);
      res.json({ events });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get events user is hosting (as host, co_host, or speaker)
  app.get("/api/ambassador/host/my-events", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const registrations = await storage.getUserEventRegistrations(userId);
      
      // Filter to only host/co_host/speaker roles
      const hostRegistrations = registrations.filter(r => 
        ['host', 'co_host', 'speaker'].includes(r.role)
      );
      
      // Get full event details for each
      const hostedEvents = await Promise.all(
        hostRegistrations.map(async (reg) => {
          const event = await storage.getAmbassadorEvent(reg.eventId);
          if (!event) return null;
          
          // Get attendee count
          const allRegs = await storage.getEventRegistrations(event.id);
          const attendeeCount = allRegs.filter(r => r.status === 'registered' || r.status === 'attended').length;
          
          // Get the schedule for this event to get the shareSlug
          const schedules = await storage.getEventSchedules(event.id);
          const schedule = schedules.length > 0 ? schedules[0] : null;
          
          return {
            ...event,
            role: reg.role,
            attendeeCount,
            talkingPoints: event.talkingPoints || [],
            agenda: event.agenda || [],
            resourceLinks: event.resourceLinks || [],
            shareSlug: schedule?.shareSlug || null,
            scheduleId: schedule?.id || null,
          };
        })
      );
      
      res.json(hostedEvents.filter(Boolean));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get host stats
  app.get("/api/ambassador/host/stats", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const registrations = await storage.getUserEventRegistrations(userId);
      
      // Filter to host roles
      const hostRegs = registrations.filter(r => 
        ['host', 'co_host', 'speaker'].includes(r.role)
      );
      
      // Calculate stats
      let totalEventsHosted = 0;
      let upcomingEvents = 0;
      let totalAttendees = 0;
      let totalRatings = 0;
      let ratingCount = 0;
      let tokensEarned = 0;
      
      for (const reg of hostRegs) {
        const event = await storage.getAmbassadorEvent(reg.eventId);
        if (!event) continue;
        
        if (event.status === 'completed') {
          totalEventsHosted++;
          tokensEarned += reg.tokensEarned || 0;
          
          // Get attendee count and ratings
          const eventRegs = await storage.getEventRegistrations(event.id);
          totalAttendees += eventRegs.filter(r => r.status === 'attended').length;
          
          for (const r of eventRegs) {
            if (r.rating) {
              totalRatings += r.rating;
              ratingCount++;
            }
          }
        } else if (event.status === 'scheduled') {
          upcomingEvents++;
        }
      }
      
      const averageRating = ratingCount > 0 ? totalRatings / ratingCount : 0;
      
      // Determine host tier
      let hostTier = "Bronze Host";
      if (totalEventsHosted >= 20) hostTier = "Platinum Host";
      else if (totalEventsHosted >= 10) hostTier = "Gold Host";
      else if (totalEventsHosted >= 5) hostTier = "Silver Host";
      
      res.json({
        totalEventsHosted,
        upcomingEvents,
        totalAttendees,
        averageRating: Math.round(averageRating * 10) / 10,
        tokensEarned,
        hostTier,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get host's event schedules with event details and AI-generated guides
  app.get("/api/ambassador/host/schedules", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const schedules = await storage.getHostSchedules(userId);
      
      // Get full event details for each schedule
      const schedulesWithEvents = await Promise.all(
        schedules.map(async (schedule) => {
          const event = await storage.getAmbassadorEvent(schedule.eventId);
          return {
            ...schedule,
            event: event ? {
              id: event.id,
              title: event.title,
              description: event.description,
              eventType: event.eventType,
              format: event.format,
              hostGuide: event.hostGuide,
              talkingPoints: event.talkingPoints || [],
              agenda: event.agenda || [],
              resourceLinks: event.resourceLinks || [],
              tokenReward: event.tokenReward,
              hostTokenReward: event.hostTokenReward,
            } : null,
          };
        })
      );
      
      res.json(schedulesWithEvents);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get event attendees (for hosts)
  app.get("/api/ambassador/events/:eventId/attendees", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const eventId = parseInt(req.params.eventId);
      
      // Verify user is a host for this event
      const registration = await storage.getEventRegistration(userId, eventId);
      if (!registration || !['host', 'co_host', 'speaker'].includes(registration.role)) {
        return res.status(403).json({ error: 'Only hosts can view attendees' });
      }
      
      // Get all registrations for this event
      const registrations = await storage.getEventRegistrations(eventId);
      
      // Get user details for each registration
      const attendees = await Promise.all(
        registrations.map(async (reg) => {
          const user = await storage.getUser(reg.userId);
          return {
            id: reg.id,
            userId: reg.userId,
            username: user?.username || 'Unknown',
            fullName: user?.fullName || user?.username || 'Unknown',
            role: reg.role,
            status: reg.status,
            registeredAt: reg.registeredAt,
            attendedAt: reg.attendedAt,
          };
        })
      );
      
      res.json(attendees);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Update event status (for hosts to mark live/completed)
  app.patch("/api/ambassador/events/:eventId/status", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const eventId = parseInt(req.params.eventId);
      const { status } = req.body;
      
      if (!['scheduled', 'live', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      
      // Verify user is a host for this event
      const registration = await storage.getEventRegistration(userId, eventId);
      if (!registration || !['host', 'co_host'].includes(registration.role)) {
        return res.status(403).json({ error: 'Only hosts can update event status' });
      }
      
      // Update event status
      const updated = await storage.updateAmbassadorEventStatus(eventId, status);
      
      res.json({ success: true, event: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Update schedule status (for hosts to mark live/completed)
  app.patch("/api/ambassador/schedules/:scheduleId/status", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const scheduleId = parseInt(req.params.scheduleId);
      const { status } = req.body;
      
      if (!['scheduled', 'live', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      
      // Get the schedule to verify ownership
      const schedule = await storage.getSchedule(scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      
      if (schedule.hostId !== userId) {
        return res.status(403).json({ error: 'Only the host can update schedule status' });
      }
      
      // Update schedule status with live/end times
      const updateData: any = { status };
      if (status === 'live') {
        updateData.liveStartedAt = new Date();
      } else if (status === 'completed') {
        updateData.liveEndedAt = new Date();
      }
      
      const updated = await storage.updateEventSchedule(scheduleId, updateData);
      
      res.json({ success: true, schedule: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Upload schedule recording
  app.post("/api/ambassador/schedules/:scheduleId/recording", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const scheduleId = parseInt(req.params.scheduleId);
      const { recordingUrl } = req.body;
      
      if (!recordingUrl) {
        return res.status(400).json({ error: 'Recording URL is required' });
      }
      
      // Verify user is the host
      const schedule = await storage.getSchedule(scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      
      if (schedule.hostId !== userId) {
        return res.status(403).json({ error: 'Only the host can upload recordings' });
      }
      
      // Update schedule with recording
      const updated = await storage.updateEventSchedule(scheduleId, {
        recordingUrl,
        recordingUploadedAt: new Date(),
        recordingUploadedBy: userId
      });
      
      res.json({ success: true, message: 'Recording uploaded successfully', schedule: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Upload stream recording (file upload from browser recording)
  app.post("/api/stream/recording", videoUpload.single('recording'), async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const file = req.file;
      const { streamType, streamId } = req.body;
      
      if (!file) {
        return res.status(400).json({ error: 'No recording file uploaded' });
      }
      
      if (!streamType || !streamId) {
        return res.status(400).json({ error: 'Stream type and ID are required' });
      }
      
      const id = parseInt(streamId);
      
      // Save file to uploads directory
      const filename = `stream-recording-${streamType}-${id}-${Date.now()}.webm`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, file.buffer);
      
      const recordingUrl = `/uploads/${filename}`;
      
      // Update the appropriate record
      if (streamType === 'schedule') {
        const schedule = await storage.getSchedule(id);
        if (!schedule) {
          return res.status(404).json({ error: 'Schedule not found' });
        }
        if (schedule.hostId !== userId) {
          return res.status(403).json({ error: 'Only the host can upload recordings' });
        }
        await storage.updateEventSchedule(id, {
          recordingUrl,
          recordingUploadedAt: new Date(),
          recordingUploadedBy: userId
        });
      } else {
        const event = await storage.getEvent(id);
        if (!event) {
          return res.status(404).json({ error: 'Event not found' });
        }
        // Verify user is a host for this event (check registrations)
        const registration = await storage.getEventRegistration(id, undefined, userId);
        const isHost = registration && (registration.role === 'host' || registration.role === 'co-host');
        if (!isHost) {
          return res.status(403).json({ error: 'Only the host can upload recordings' });
        }
        await storage.updateEvent(id, {
          recordingUrl,
          recordingUploadedAt: new Date(),
          recordingUploadedBy: userId
        });
      }
      
      res.json({ success: true, message: 'Recording saved', recordingUrl });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Generate AI presentation outline for an event
  app.post("/api/presentation/generate", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const { eventId, scheduleId, eventTitle, eventDescription, talkingPoints, agenda, duration } = req.body;
      
      if (!eventTitle) {
        return res.status(400).json({ error: 'Event title is required' });
      }
      
      const presentation = await generatePresentationOutline(
        eventTitle,
        eventDescription || '',
        talkingPoints || [],
        agenda || [],
        duration || 30
      );
      
      res.json(presentation);
    } catch (err) {
      console.error('Error generating presentation:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate presentation' });
    }
  });

  // Get live event/schedule stream info (exclusive for registered attendees)
  app.get("/api/ambassador/events/:eventId/stream", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const eventId = parseInt(req.params.eventId);
      
      // Verify user is registered for this event
      const registration = await storage.getEventRegistration(userId, eventId);
      if (!registration) {
        return res.status(403).json({ error: 'You must be registered to access the stream' });
      }
      
      // Get event details
      const event = await storage.getAmbassadorEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      
      // Check if event is live
      if (event.status !== 'live') {
        return res.status(400).json({ error: 'Event is not currently live', status: event.status });
      }
      
      // Return meeting link for registered attendees
      res.json({
        eventId,
        title: event.title,
        status: 'live',
        meetingLink: event.meetingLink,
        isHost: registration.role === 'host' || registration.role === 'co_host'
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get schedule stream info (exclusive for registered attendees)
  app.get("/api/ambassador/schedules/:scheduleId/stream", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const scheduleId = parseInt(req.params.scheduleId);
      
      // Get schedule details
      const schedule = await storage.getSchedule(scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      
      // Verify user is registered for the parent event
      const registration = await storage.getEventRegistration(userId, schedule.eventId);
      if (!registration) {
        return res.status(403).json({ error: 'You must be registered to access the stream' });
      }
      
      // Check if schedule is live
      if (schedule.status !== 'live') {
        return res.status(400).json({ error: 'This session is not currently live', status: schedule.status });
      }
      
      // Return meeting link for registered attendees
      res.json({
        scheduleId,
        eventId: schedule.eventId,
        title: schedule.title,
        status: 'live',
        meetingLink: schedule.meetingLink,
        isHost: schedule.hostId === userId
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get event/schedule recording (exclusive for registered attendees)
  app.get("/api/ambassador/events/:eventId/recording", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const eventId = parseInt(req.params.eventId);
      
      // Verify user is registered for this event
      const registration = await storage.getEventRegistration(userId, eventId);
      if (!registration) {
        return res.status(403).json({ error: 'You must be registered to access the recording' });
      }
      
      // Get event details
      const event = await storage.getAmbassadorEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }
      
      if (!event.recordingUrl) {
        return res.status(404).json({ error: 'No recording available for this event' });
      }
      
      res.json({
        eventId,
        title: event.title,
        recordingUrl: event.recordingUrl,
        recordingUploadedAt: event.recordingUploadedAt
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get schedule recording (exclusive for registered attendees)
  app.get("/api/ambassador/schedules/:scheduleId/recording", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const scheduleId = parseInt(req.params.scheduleId);
      
      // Get schedule details
      const schedule = await storage.getSchedule(scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      
      // Verify user is registered for the parent event
      const registration = await storage.getEventRegistration(userId, schedule.eventId);
      if (!registration) {
        return res.status(403).json({ error: 'You must be registered to access the recording' });
      }
      
      if (!schedule.recordingUrl) {
        return res.status(404).json({ error: 'No recording available for this session' });
      }
      
      res.json({
        scheduleId,
        eventId: schedule.eventId,
        title: schedule.title,
        recordingUrl: schedule.recordingUrl,
        recordingUploadedAt: schedule.recordingUploadedAt
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Upload event recording
  app.post("/api/ambassador/events/:eventId/recording", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
      const userId = (req.user as any).id;
      const eventId = parseInt(req.params.eventId);
      const { recordingUrl } = req.body;
      
      if (!recordingUrl) {
        return res.status(400).json({ error: 'Recording URL is required' });
      }
      
      // Verify user is a host for this event
      const registration = await storage.getEventRegistration(userId, eventId);
      if (!registration || !['host', 'co_host', 'speaker'].includes(registration.role)) {
        return res.status(403).json({ error: 'Only hosts can upload recordings' });
      }
      
      // Update event with recording
      await storage.updateAmbassadorEventRecording(eventId, recordingUrl, userId);
      
      res.json({ success: true, message: 'Recording uploaded successfully' });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get community hub data (aggregated view for a day/week)
  // Auto-generates content when empty for seamless user experience
  app.get("/api/ambassador/community/hub", async (req: Request, res: Response) => {
    try {
      const { day, week, generate } = req.query;
      const dayNumber = day ? parseInt(day as string) : 1;
      const weekNumber = week ? parseInt(week as string) : Math.ceil(dayNumber / 7);
      const shouldGenerate = generate === 'true';
      
      let [socialDirections, challenges, events] = await Promise.all([
        storage.getSocialDirectionsForDay(dayNumber),
        storage.getChallengesByWeek(weekNumber),
        storage.getEventsByWeek(weekNumber)
      ]);
      
      // Auto-generate content if requested and data is empty
      if (shouldGenerate) {
        if (socialDirections.length === 0) {
          // Generate social directions for this day
          const { ambassadorContentCurriculum } = await import('./ambassador-content-data');
          const lesson = ambassadorContentCurriculum.find((l: any) => l.dayNumber === dayNumber);
          
          if (lesson) {
            const OpenAI = (await import("openai")).default;
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const platforms = ['twitter', 'instagram', 'tiktok', 'linkedin'];
            
            for (const platform of platforms) {
              try {
                const completion = await openai.chat.completions.create({
                  model: "gpt-4o",
                  messages: [
                    {
                      role: "system",
                      content: `You are a social media content strategist. Generate platform-specific content for ${platform.toUpperCase()}. Return JSON only.`
                    },
                    {
                      role: "user",
                      content: `Create a social post for: ${lesson.tradingTopic}. Return JSON: {contentType, postIdea, captionTemplate, hookLine, callToAction, hashtags:[], bestPostingTime, engagementTips:[]}`
                    }
                  ],
                  response_format: { type: "json_object" }
                });
                
                const content = JSON.parse(completion.choices[0].message.content || '{}');
                await storage.createSocialDirection({
                  dayNumber,
                  platform,
                  contentType: content.contentType || 'post',
                  postIdea: content.postIdea || '',
                  captionTemplate: content.captionTemplate || '',
                  hookLine: content.hookLine || '',
                  callToAction: content.callToAction || '',
                  hashtags: content.hashtags || [],
                  bestPostingTime: content.bestPostingTime || null,
                  engagementTips: content.engagementTips || [],
                  aiGenerated: true
                });
              } catch (e) {
                console.error(`Failed to generate ${platform} content:`, e);
              }
            }
            socialDirections = await storage.getSocialDirectionsForDay(dayNumber);
          }
        }
        
        if (challenges.length === 0) {
          await generateWeeklyChallenges(weekNumber);
          challenges = await storage.getChallengesByWeek(weekNumber);
        }
        
        if (events.length === 0) {
          await generateWeeklyEvents(weekNumber);
          events = await storage.getEventsByWeek(weekNumber);
        }
      }
      
      res.json({
        dayNumber,
        weekNumber,
        socialDirections,
        challenges,
        events,
        isEmpty: socialDirections.length === 0 && challenges.length === 0 && events.length === 0
      });
    } catch (err) {
      console.error('Community hub error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ==========================================
  // CHALLENGE SESSION ROUTES (AI-Guided Completion)
  // ==========================================

  // Get or start a challenge session with AI guidance
  app.get("/api/ambassador/community/challenges/:id/session", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const challengeId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      
      // Get the challenge details
      const challenge = await storage.getChallenge(challengeId);
      if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
      
      // Check for existing session
      let session = await storage.getChallengeSession(userId, challengeId);
      
      if (!session) {
        // Generate AI steps and guidance for this challenge
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are a trading community coach helping ambassadors complete challenges. Generate step-by-step guidance for completing this challenge. Return JSON only.`
            },
            {
              role: "user",
              content: `Challenge: ${challenge.title}
Description: ${challenge.description}
Objectives: ${JSON.stringify(challenge.objectives)}
Success Criteria: ${challenge.successCriteria}

Generate a breakdown with 3-5 actionable steps. Return JSON: {
  "guidance": "overall motivational guidance",
  "tips": ["tip1", "tip2", "tip3"],
  "encouragement": "encouraging message",
  "steps": [
    {"stepNumber": 1, "title": "Step Title", "description": "What to do", "tips": ["helpful tip"], "completed": false}
  ]
}`
            }
          ],
          response_format: { type: "json_object" }
        });
        
        const aiContent = JSON.parse(completion.choices[0].message.content || '{}');
        
        // Create the session
        session = await storage.createChallengeSession({
          challengeId,
          userId,
          status: 'in_progress',
          currentStep: 1,
          totalSteps: aiContent.steps?.length || 3,
          aiContext: {
            guidance: aiContent.guidance || '',
            tips: aiContent.tips || [],
            encouragement: aiContent.encouragement || ''
          },
          aiSteps: aiContent.steps || []
        });
      }
      
      res.json({ challenge, session });
    } catch (err) {
      console.error('Get challenge session error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Update challenge session progress (complete a step)
  app.post("/api/ambassador/community/challenges/:id/session/step", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const challengeId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { stepNumber } = req.body;
      
      const session = await storage.getChallengeSession(userId, challengeId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      
      // Update the step as completed
      const updatedSteps = (session.aiSteps as any[])?.map((step: any) => 
        step.stepNumber === stepNumber ? { ...step, completed: true } : step
      ) || [];
      
      const completedCount = updatedSteps.filter((s: any) => s.completed).length;
      const allComplete = completedCount === session.totalSteps;
      
      const updated = await storage.updateChallengeSession(userId, challengeId, {
        currentStep: Math.min(stepNumber + 1, session.totalSteps),
        aiSteps: updatedSteps,
        status: allComplete ? 'completed' : 'in_progress',
        completedAt: allComplete ? new Date() : undefined
      });
      
      res.json({ session: updated, allComplete });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Submit evidence for challenge completion
  app.post("/api/ambassador/community/challenges/:id/session/evidence", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const challengeId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { evidenceUrl, evidenceNotes } = req.body;
      
      const session = await storage.getChallengeSession(userId, challengeId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      
      const updated = await storage.updateChallengeSession(userId, challengeId, {
        evidenceUrl,
        evidenceNotes,
        status: 'completed',
        completedAt: new Date()
      });
      
      res.json({ session: updated });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Claim tokens for completed challenge
  app.post("/api/ambassador/community/challenges/:id/session/claim", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const challengeId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      
      const session = await storage.getChallengeSession(userId, challengeId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status !== 'completed') return res.status(400).json({ error: 'Challenge not completed' });
      if (session.tokensClaimed) return res.status(400).json({ error: 'Tokens already claimed' });
      
      const challenge = await storage.getChallenge(challengeId);
      if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
      
      // Award tokens
      await storage.updateChallengeProgress(userId, challengeId, {
        status: 'completed',
        tokensEarned: challenge.tokenReward,
        completedAt: new Date()
      });
      
      // Update ambassador stats
      const stats = await storage.getAmbassadorContentStats(userId);
      if (stats) {
        await storage.updateAmbassadorContentStats(userId, {
          totalTokensEarned: (stats.totalTokensEarned || 0) + challenge.tokenReward
        });
      }
      
      await storage.updateChallengeSession(userId, challengeId, { tokensClaimed: true });
      
      res.json({ success: true, tokensAwarded: challenge.tokenReward });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ==========================================
  // EVENT HOSTING ROUTES (AI-Generated Agenda)
  // ==========================================

  // Get event schedules
  app.get("/api/ambassador/community/events/:id/schedules", async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.id);
      const schedules = await storage.getEventSchedules(eventId);
      const event = await storage.getEvent(eventId);
      
      // Get host info for each schedule
      const schedulesWithHosts = await Promise.all(schedules.map(async (schedule) => {
        const host = await storage.getUser(schedule.hostId);
        return { ...schedule, host: host ? { id: host.id, username: host.username, fullName: host.fullName } : null };
      }));
      
      res.json({ event, schedules: schedulesWithHosts });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get next upcoming schedule for an event
  app.get("/api/ambassador/community/events/:id/next", async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.id);
      const schedules = await storage.getUpcomingSchedules(eventId);
      const event = await storage.getEvent(eventId);
      
      if (schedules.length === 0) {
        return res.json({ event, nextSchedule: null, message: 'No upcoming sessions scheduled. Be the first to host!' });
      }
      
      const nextSchedule = schedules[0];
      const host = await storage.getUser(nextSchedule.hostId);
      
      res.json({
        event,
        nextSchedule: {
          ...nextSchedule,
          host: host ? { id: host.id, username: host.username, fullName: host.fullName } : null
        }
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Create a new event schedule (become a host) with AI-generated agenda
  app.post("/api/ambassador/community/events/:id/host", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const eventId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      const { title, description, startAt, endAt, capacity, meetingLink } = req.body;
      
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      
      // Generate AI agenda
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an event planning expert for a trading community. Generate a detailed agenda and hosting tips. Return JSON only.`
          },
          {
            role: "user",
            content: `Event Type: ${event.eventType}
Event Title: ${event.title}
Event Description: ${event.description}
Host's Session Title: ${title || event.title}
Host's Description: ${description || event.description}

Generate an agenda with timing, topics, and hosting tips. Return JSON: {
  "overview": "brief session overview",
  "agenda": [
    {"time": "0:00-5:00", "topic": "Welcome & Introductions", "description": "What to cover"}
  ],
  "preparationTips": ["tip for preparing"],
  "hostingTips": ["tip for during the session"]
}`
          }
        ],
        response_format: { type: "json_object" }
      });
      
      const aiAgenda = JSON.parse(completion.choices[0].message.content || '{}');
      
      // Generate unique share slug
      const slugBase = (title || event.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 30);
      const shortId = Math.random().toString(36).substring(2, 8);
      const shareSlug = `${slugBase}-${shortId}`;
      
      const schedule = await storage.createEventSchedule({
        eventId,
        hostId: userId,
        title: title || event.title,
        description: description || event.description,
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : undefined,
        capacity: capacity || 50,
        meetingLink,
        shareSlug,
        aiAgenda,
        status: 'scheduled'
      });
      
      // Register user as host in ambassadorEventRegistrations so it shows in Host Dashboard
      const existingReg = await storage.getEventRegistration(userId, eventId);
      if (!existingReg) {
        await storage.registerForEvent(userId, eventId, 'host');
      } else if (existingReg.role === 'attendee') {
        // Upgrade from attendee to host
        await storage.updateEventRegistration(userId, eventId, { role: 'host' });
      }
      
      // Award hosting tokens
      const stats = await storage.getAmbassadorContentStats(userId);
      if (stats) {
        await storage.updateAmbassadorContentStats(userId, {
          totalTokensEarned: (stats.totalTokensEarned || 0) + (event.hostTokenReward || 50)
        });
      }
      
      // Enqueue VEDD token reward for event hosting
      let veddRewardResult = null;
      try {
        veddRewardResult = await veddTokenService.enqueueReward(
          userId,
          'event_hosting',
          schedule.id,
          { eventTitle: event.title, scheduleTitle: schedule.title }
        );
      } catch (rewardErr) {
        console.error('Failed to enqueue VEDD reward for event hosting:', rewardErr);
      }
      
      const shareUrl = `/event/${shareSlug}`;
      res.json({ 
        schedule, 
        tokensAwarded: event.hostTokenReward || 50, 
        shareSlug, 
        shareUrl,
        veddReward: veddRewardResult
      });
    } catch (err) {
      console.error('Host event error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Register for a specific schedule
  app.post("/api/ambassador/community/schedules/:id/register", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const scheduleId = parseInt(req.params.id);
      const userId = (req.user as any).id;
      
      const existing = await storage.getScheduleRegistration(userId, scheduleId);
      if (existing) return res.status(400).json({ error: 'Already registered' });
      
      const registration = await storage.registerForSchedule(userId, scheduleId);
      res.json({ registration });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ==========================================
  // PUBLIC EVENT ROUTES (no auth required)
  // ==========================================

  // Get public event schedule by share slug
  app.get("/api/public/events/:slug", async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const schedule = await storage.getScheduleBySlug(slug);
      
      if (!schedule) {
        return res.status(404).json({ error: 'Event not found' });
      }
      
      // Get the parent event info
      const event = await storage.getEvent(schedule.eventId);
      
      // Get host info (sanitized - no sensitive data)
      const host = await storage.getUser(schedule.hostId);
      
      // Return public-safe data
      res.json({
        schedule: {
          id: schedule.id,
          title: schedule.title,
          description: schedule.description,
          startAt: schedule.startAt,
          endAt: schedule.endAt,
          capacity: schedule.capacity,
          currentAttendees: schedule.currentAttendees,
          status: schedule.status,
          aiAgenda: schedule.aiAgenda,
          shareSlug: schedule.shareSlug,
          recordingUrl: schedule.recordingUrl
        },
        event: event ? {
          id: event.id,
          title: event.title,
          eventType: event.eventType,
          tokenReward: event.tokenReward,
          recordingUrl: event.recordingUrl
        } : null,
        host: host ? {
          username: host.username,
          fullName: host.fullName
        } : null
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ==========================================
  // COMMUNITY RECORDED EVENTS
  // ==========================================

  // Get all recorded events for community viewing
  app.get("/api/community/recorded-events", async (req: Request, res: Response) => {
    try {
      // Get all ambassador event schedules with recordings
      const allSchedules = await storage.getAllAmbassadorSchedules();
      const recordedSchedules = allSchedules.filter((s: any) => s.recordingUrl && s.status === 'completed');
      
      // Get host info for each schedule
      const recordedEvents = await Promise.all(recordedSchedules.map(async (schedule: any) => {
        const host = await storage.getUser(schedule.hostId);
        const event = await storage.getEvent(schedule.eventId);
        return {
          id: schedule.id,
          title: schedule.title || event?.title || 'Community Event',
          description: schedule.description || event?.description,
          eventType: event?.eventType || 'session',
          recordingUrl: schedule.recordingUrl,
          recordingUploadedAt: schedule.recordingUploadedAt,
          shareSlug: schedule.shareSlug,
          startAt: schedule.startAt,
          attendeeCount: schedule.currentAttendees || 0,
          tokenReward: event?.tokenReward || 0,
          host: host ? {
            id: host.id,
            username: host.username,
            fullName: host.fullName,
            profileImageUrl: host.profileImageUrl
          } : null
        };
      }));
      
      // Sort by most recent recording first
      recordedEvents.sort((a, b) => {
        const dateA = a.recordingUploadedAt ? new Date(a.recordingUploadedAt).getTime() : 0;
        const dateB = b.recordingUploadedAt ? new Date(b.recordingUploadedAt).getTime() : 0;
        return dateB - dateA;
      });
      
      res.json({ recordings: recordedEvents });
    } catch (err) {
      console.error('Error fetching recorded events:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ==========================================
  // COMMUNITY COMMENTS ROUTES
  // ==========================================

  // Get comments for a target (challenge or event)
  app.get("/api/ambassador/community/comments/:targetType/:targetId", async (req: Request, res: Response) => {
    try {
      const { targetType, targetId } = req.params;
      const comments = await storage.getComments(targetType, parseInt(targetId));
      
      // Build threaded structure
      const rootComments = comments.filter(c => !c.parentId);
      const replies = comments.filter(c => c.parentId);
      
      const threaded = rootComments.map(comment => ({
        ...comment,
        replies: replies.filter(r => r.parentId === comment.id)
      }));
      
      res.json({ comments: threaded });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Add a comment
  app.post("/api/ambassador/community/comments", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const { targetType, targetId, content, parentId } = req.body;
      const userId = (req.user as any).id;
      
      const comment = await storage.createComment({
        targetType,
        targetId,
        content,
        parentId: parentId || null,
        authorId: userId
      });
      
      // Get author info
      const author = await storage.getUser(userId);
      
      res.json({ comment: { ...comment, author } });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Like a comment
  app.post("/api/ambassador/community/comments/:id/like", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const commentId = parseInt(req.params.id);
      const comment = await storage.likeComment(commentId);
      res.json({ comment });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ==========================================
  // WALLET AUTHENTICATION & GOVERNANCE ROUTES
  // ==========================================

  // Base58 decoder for Solana addresses
  function decodeBase58(str: string): Uint8Array {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      const value = ALPHABET.indexOf(str[i]);
      if (value < 0) return new Uint8Array();
      let carry = value;
      for (let j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    for (let i = 0; i < str.length && str[i] === '1'; i++) {
      bytes.push(0);
    }
    return new Uint8Array(bytes.reverse());
  }

  // Solana signature verification using tweetnacl
  async function verifySolanaSignature(
    message: string,
    signature: string,
    walletAddress: string
  ): Promise<boolean> {
    try {
      const nacl = await import('tweetnacl');
      const naclModule = nacl.default || nacl;

      const messageBytes = new TextEncoder().encode(message);
      
      // Client sends signature as base64 (btoa)
      const signatureBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
      
      // Wallet address is base58 encoded
      const publicKeyBytes = decodeBase58(walletAddress);

      console.log('Signature verification:', {
        messageLength: messageBytes.length,
        signatureLength: signatureBytes.length,
        publicKeyLength: publicKeyBytes.length,
        walletAddress: walletAddress.slice(0, 8) + '...'
      });

      if (publicKeyBytes.length !== 32) {
        console.error('Invalid public key length:', publicKeyBytes.length);
        return false;
      }

      if (signatureBytes.length !== 64) {
        console.error('Invalid signature length:', signatureBytes.length);
        return false;
      }

      const isValid = naclModule.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
      console.log('Signature valid:', isValid);
      return isValid;
    } catch (err) {
      console.error('Signature verification error:', err);
      return false;
    }
  }

  // Server-side Solana token verification (ignore client-sent values for security)
  const VEDD_MEMBERSHIP_TIERS = {
    basic: { minTokens: 100, label: 'Basic', planEquivalent: 'Starter' },
    pro: { minTokens: 500, label: 'Pro', planEquivalent: 'Premium' },
    elite: { label: 'Elite', planEquivalent: 'Yearly', requiresNft: true },
  };

  function determineMembershipTier(veddBalance: number, hasNft: boolean): string {
    if (hasNft) return 'elite';
    if (veddBalance >= VEDD_MEMBERSHIP_TIERS.pro.minTokens) return 'pro';
    if (veddBalance >= VEDD_MEMBERSHIP_TIERS.basic.minTokens) return 'basic';
    return 'none';
  }

  async function verifyTokenBalancesServerSide(walletAddress: string): Promise<{
    veddBalance: number;
    isAmbassador: boolean;
    ambassadorNftMint: string | null;
    hasVeddNft: boolean;
    membershipNftMint: string | null;
  }> {
    const VEDD_TOKEN_MINT = 'Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump';
    const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    
    try {
      const response = await fetch(SOLANA_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenAccountsByOwner',
          params: [
            walletAddress,
            { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
            { encoding: 'jsonParsed' }
          ]
        })
      });
      
      const data = await response.json();
      let veddBalance = 0;
      let isAmbassador = false;
      let ambassadorNftMint: string | null = null;
      let hasVeddNft = false;
      let membershipNftMint: string | null = null;
      
      if (data.result?.value) {
        for (const account of data.result.value) {
          const parsedInfo = account.account.data.parsed.info;
          const mint = parsedInfo.mint;
          const balance = parsedInfo.tokenAmount.uiAmount || 0;
          
          if (mint === VEDD_TOKEN_MINT) {
            veddBalance = balance;
          }
          
          if (mint.startsWith('VEDDAMB') && parsedInfo.tokenAmount.amount === '1') {
            isAmbassador = true;
            ambassadorNftMint = mint;
          }

          if ((mint.startsWith('VEDDNFT') || mint.startsWith('VEDDMEM')) && parsedInfo.tokenAmount.amount === '1' && parsedInfo.tokenAmount.decimals === 0) {
            hasVeddNft = true;
            membershipNftMint = mint;
          }
        }
      }
      
      return { veddBalance, isAmbassador, ambassadorNftMint, hasVeddNft, membershipNftMint };
    } catch (err) {
      console.error('Server-side token verification failed:', err);
      return { veddBalance: 0, isAmbassador: false, ambassadorNftMint: null, hasVeddNft: false, membershipNftMint: null };
    }
  }

  // Authenticate via Solana wallet
  app.post("/api/wallet/authenticate", async (req: Request, res: Response) => {
    const { walletAddress, signature, message } = req.body;
    
    if (!walletAddress || !signature || !message) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // Verify the signature matches the wallet address
      const isValidSignature = await verifySolanaSignature(message, signature, walletAddress);
      if (!isValidSignature) {
        console.error('Invalid signature for wallet:', walletAddress);
        return res.status(401).json({ error: "Invalid wallet signature. Authentication failed." });
      }

      // Verify message freshness (within 5 minutes)
      const timestampMatch = message.match(/Timestamp: (\d+)/);
      if (timestampMatch) {
        const messageTimestamp = parseInt(timestampMatch[1], 10);
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        if (Math.abs(now - messageTimestamp) > fiveMinutes) {
          return res.status(400).json({ error: "Authentication message expired. Please try again." });
        }
      }

      // Server-side verification of token balances (ignore client-sent values)
      const { veddBalance, isAmbassador, ambassadorNftMint, hasVeddNft, membershipNftMint } = await verifyTokenBalancesServerSide(walletAddress);

      // Determine membership tier from token holdings
      const membershipTier = determineMembershipTier(veddBalance, hasVeddNft);
      const tierInfo = membershipTier !== 'none' ? (VEDD_MEMBERSHIP_TIERS as any)[membershipTier] : null;

      // Find or create user by wallet address
      let user = await storage.getUserByWalletAddress(walletAddress);
      let isNewUser = false;
      
      const membershipFields = {
        veddTokenBalance: veddBalance,
        isAmbassador,
        ambassadorNftMint,
        hasVeddNft,
        membershipNftMint,
        membershipTier,
        lastWalletSync: new Date(),
        walletVerified: true,
      };

      if (!user) {
        if (req.isAuthenticated()) {
          const currentUser = req.user as User;
          await storage.updateUser(currentUser.id, {
            walletAddress,
            ...membershipFields,
          });
          user = await storage.getUser(currentUser.id);
        } else {
          const shortAddress = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
          const username = `wallet_${walletAddress.slice(0, 8)}`;
          const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
          const hashedPassword = await hashPasswordForWallet(randomPassword);
          
          user = await storage.createUser({
            username,
            password: hashedPassword,
            email: `${walletAddress.slice(0, 12)}@wallet.veddai.com`,
            fullName: `Wallet User ${shortAddress}`,
            walletAddress,
            ...membershipFields,
          });
          isNewUser = true;
        }
      } else {
        await storage.updateUser(user.id, membershipFields);
      }

      // Apply token-gated subscription based on membership tier
      if (user && membershipTier !== 'none') {
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        await storage.updateUser(user.id, {
          tokenGatedSubscriptionEnd: oneYearFromNow,
          subscriptionStatus: 'active',
        });
      } else if (user && membershipTier === 'none' && user.membershipTier !== 'none') {
        await storage.updateUser(user.id, {
          subscriptionStatus: user.stripeSubscriptionId ? 'active' : 'none',
          membershipTier: 'none',
        });
      }

      // Log the user in via session (wallet-based login)
      if (user) {
        user = await storage.getUser(user.id);
        await new Promise<void>((resolve, reject) => {
          req.login(user, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      
      res.json({ 
        success: true,
        user: user ? { 
          id: user.id, 
          username: user.username, 
          walletAddress, 
          veddBalance, 
          isAmbassador,
          membershipTier,
          hasVeddNft,
        } : null,
        tokenGatedAccess: membershipTier !== 'none',
        membershipTier,
        tierLabel: tierInfo?.label || 'None',
        tierPlanEquivalent: tierInfo?.planEquivalent || null,
        isNewUser,
      });
    } catch (err) {
      console.error('Wallet authentication error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get membership tier info for current user
  app.get("/api/membership/status", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.json({ 
        membershipTier: 'none',
        hasVeddNft: false,
        veddBalance: 0,
        tierLabel: 'None',
        tierPlanEquivalent: null,
        isTokenGated: false,
      });
    }
    
    const user = req.user as User;
    const tier = user.membershipTier || 'none';
    const tierInfo = tier !== 'none' ? (VEDD_MEMBERSHIP_TIERS as any)[tier] : null;
    
    res.json({
      membershipTier: tier,
      hasVeddNft: user.hasVeddNft || false,
      veddBalance: user.veddTokenBalance || 0,
      tierLabel: tierInfo?.label || 'None',
      tierPlanEquivalent: tierInfo?.planEquivalent || null,
      isTokenGated: tier !== 'none',
      tokenGatedSubscriptionEnd: user.tokenGatedSubscriptionEnd,
      walletAddress: user.walletAddress,
      walletVerified: user.walletVerified,
    });
  });

  // Get membership tier requirements (public endpoint)
  app.get("/api/membership/tiers", async (_req: Request, res: Response) => {
    res.json({
      tiers: [
        { id: 'basic', label: 'Basic', minTokens: 100, planEquivalent: 'Starter', requiresNft: false },
        { id: 'pro', label: 'Pro', minTokens: 500, planEquivalent: 'Premium', requiresNft: false },
        { id: 'elite', label: 'Elite', minTokens: null, planEquivalent: 'Yearly', requiresNft: true },
      ],
      tokenMint: 'Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump',
      nftPrefixes: ['VEDDNFT', 'VEDDMEM'],
    });
  });

  // Get governance proposals
  app.get("/api/governance/proposals", async (req: Request, res: Response) => {
    try {
      const proposals = await storage.getGovernanceProposals();
      res.json(proposals);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Create governance proposal
  app.post("/api/governance/proposals", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = req.user as User;
    
    if (!user.veddTokenBalance || user.veddTokenBalance < 100) {
      return res.status(403).json({ error: "Must hold at least 100 VEDD tokens to create proposals" });
    }

    const { title, description, category, proposerWallet, endDate, quorumRequired } = req.body;
    
    if (!title || !description || !category || !proposerWallet || !endDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const proposal = await storage.createGovernanceProposal({
        title,
        description,
        category,
        proposerUserId: user.id,
        proposerWallet,
        endDate: new Date(endDate),
        quorumRequired: quorumRequired || 1000,
        status: 'active',
        startDate: new Date(),
      });
      res.json(proposal);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Vote on governance proposal
  app.post("/api/governance/vote", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = req.user as User;
    
    if (!user.veddTokenBalance || user.veddTokenBalance <= 0) {
      return res.status(403).json({ error: "Must hold VEDD tokens to vote" });
    }

    const { proposalId, vote, walletAddress, votingPower } = req.body;
    
    if (!proposalId || !vote || !walletAddress) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const proposal = await storage.getGovernanceProposal(proposalId);
      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }

      if (proposal.status !== 'active' || new Date(proposal.endDate) < new Date()) {
        return res.status(400).json({ error: "Voting has ended for this proposal" });
      }

      const existingVote = await storage.getUserVote(proposalId, user.id);
      if (existingVote) {
        return res.status(400).json({ error: "You have already voted on this proposal" });
      }

      // Use server-verified token balance, not client-sent votingPower
      const power = user.veddTokenBalance || 1;
      await storage.createGovernanceVote({
        proposalId,
        userId: user.id,
        walletAddress,
        vote,
        votingPower: power,
      });

      // Update proposal vote counts
      const updates: any = {
        totalVotingPower: proposal.totalVotingPower + power,
      };
      if (vote === 'for') {
        updates.votesFor = proposal.votesFor + 1;
      } else if (vote === 'against') {
        updates.votesAgainst = proposal.votesAgainst + 1;
      }
      await storage.updateGovernanceProposal(proposalId, updates);

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ===== VEDD Wallet Endpoints for User =====

  // Get user's ambassador rewards
  app.get("/api/ambassador/my-rewards", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = req.user as User;
    
    try {
      const rewards = await storage.getAmbassadorRewardsByUser(user.id);
      res.json(rewards);
    } catch (err) {
      console.error('Error fetching rewards:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get user's transfer history
  app.get("/api/vedd/my-transfers", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = req.user as User;
    
    try {
      const transfers = await storage.getVeddTransfersByUser(user.id);
      res.json(transfers);
    } catch (err) {
      console.error('Error fetching transfers:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Request withdrawal of verified rewards
  app.post("/api/vedd/request-withdrawal", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = req.user as User;
    
    if (!user.walletAddress) {
      return res.status(400).json({ error: "No wallet connected. Please connect your Solana wallet first." });
    }

    try {
      // Get all verified rewards that haven't been transferred yet
      const verifiedRewards = await storage.getVerifiedUnprocessedRewards(user.id);
      
      if (verifiedRewards.length === 0) {
        return res.status(400).json({ error: "No verified rewards available for withdrawal." });
      }

      const totalAmount = verifiedRewards.reduce((sum, r) => sum + r.totalReward, 0);
      
      // Get the rewards pool wallet
      const poolWallets = await storage.getVeddPoolWallets();
      const rewardsPool = poolWallets.find(w => w.walletType === 'rewards' && w.status === 'active');
      
      if (!rewardsPool) {
        return res.status(500).json({ error: "Rewards pool not configured. Please contact support." });
      }

      // Create a transfer job
      const transferJob = await storage.createVeddTransferJob({
        userId: user.id,
        sourceWalletId: rewardsPool.id,
        destinationWallet: user.walletAddress,
        amount: totalAmount,
        actionType: 'ambassador_withdrawal',
        status: 'pending',
        idempotencyKey: `withdrawal_${user.id}_${Date.now()}`,
        metadata: { rewardIds: verifiedRewards.map(r => r.id) },
      });

      // Link the rewards to the transfer job
      for (const reward of verifiedRewards) {
        await storage.updateAmbassadorReward(reward.id, { transferJobId: transferJob.id });
      }

      res.json({ 
        success: true, 
        transferId: transferJob.id,
        amount: totalAmount,
        message: "Withdrawal request created. Admin will process it shortly."
      });
    } catch (err) {
      console.error('Error requesting withdrawal:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ============================================
  // Internal Wallet API Routes
  // ============================================
  
  // Get user's internal wallet balance
  app.get("/api/wallet/balance", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = req.user as User;
    
    try {
      let wallet = await storage.getInternalWallet(user.id);
      if (!wallet) {
        wallet = await storage.createOrUpdateInternalWallet(user.id, {
          veddBalance: 0,
          pendingBalance: 0,
          totalEarned: 0,
          totalWithdrawn: 0
        });
      }
      res.json(wallet);
    } catch (err) {
      console.error('Error fetching wallet:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Request withdrawal to pump.fun wallet
  app.post("/api/wallet/withdraw", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = req.user as User;
    const { amount, destinationWallet } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid withdrawal amount" });
    }
    
    if (!destinationWallet || !destinationWallet.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
      return res.status(400).json({ error: "Invalid Solana wallet address" });
    }
    
    try {
      const wallet = await storage.getInternalWallet(user.id);
      if (!wallet || wallet.veddBalance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      
      // Move funds from available to pending (atomic operation)
      // Funds stay in pendingBalance until admin approves/rejects
      await storage.createOrUpdateInternalWallet(user.id, {
        veddBalance: wallet.veddBalance - amount,
        pendingBalance: (wallet.pendingBalance || 0) + amount
      });
      
      // Create withdrawal request
      const request = await storage.createWithdrawalRequest(user.id, amount, destinationWallet);
      
      res.json({ 
        success: true, 
        requestId: request.id,
        amount,
        message: "Withdrawal request submitted! Admin will review and process it shortly. Tokens will be sent to your pump.fun wallet."
      });
    } catch (err) {
      console.error('Error requesting withdrawal:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get user's withdrawal history
  app.get("/api/wallet/withdrawals", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = req.user as User;
    
    try {
      const requests = await storage.getWithdrawalRequests(user.id);
      res.json(requests);
    } catch (err) {
      console.error('Error fetching withdrawals:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Admin: Get all pending withdrawal requests
  app.get("/api/admin/wallet/withdrawals", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = req.user as User;
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    try {
      const requests = await storage.getAllWithdrawalRequests();
      res.json(requests);
    } catch (err) {
      console.error('Error fetching withdrawals:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Admin: Process withdrawal request
  app.post("/api/admin/wallet/withdrawals/:id/process", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const user = req.user as User;
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { id } = req.params;
    const { status, adminNotes, solanaTransactionSig } = req.body;
    
    if (!['approved', 'processing', 'completed', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    
    try {
      // Get the withdrawal request to know the user and amount
      const requests = await storage.getAllWithdrawalRequests();
      const request = requests.find(r => r.id === parseInt(id));
      
      if (!request) {
        return res.status(404).json({ error: "Withdrawal request not found" });
      }
      
      // Handle wallet balance updates based on status
      const wallet = await storage.getInternalWallet(request.userId);
      
      if (wallet) {
        if (status === 'completed') {
          // Move from pending to totalWithdrawn (finalize withdrawal)
          await storage.createOrUpdateInternalWallet(request.userId, {
            pendingBalance: Math.max(0, (wallet.pendingBalance || 0) - request.amount),
            totalWithdrawn: (wallet.totalWithdrawn || 0) + request.amount
          });
        } else if (status === 'rejected') {
          // Refund: move from pending back to available balance
          await storage.createOrUpdateInternalWallet(request.userId, {
            pendingBalance: Math.max(0, (wallet.pendingBalance || 0) - request.amount),
            veddBalance: (wallet.veddBalance || 0) + request.amount
          });
        }
      }
      
      const updated = await storage.updateWithdrawalRequest(parseInt(id), {
        status,
        adminId: user.id,
        adminNotes,
        solanaTransactionSig,
        processedAt: new Date()
      });
      
      res.json({ success: true, request: updated });
    } catch (err) {
      console.error('Error processing withdrawal:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ==========================================
  // SOCIAL ACCOUNTS & SHARING
  // ==========================================

  // Get connected social accounts
  app.get("/api/social/accounts", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = req.user as User;
    try {
      const accounts = await storage.getConnectedSocialAccounts(user.id);
      res.json(accounts.map(a => ({
        id: a.id,
        platform: a.platform,
        platformUsername: a.platformUsername,
        isActive: a.isActive
      })));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Zod schemas for social API validation
  const socialPlatformEnum = z.enum(['twitter', 'facebook', 'instagram', 'linkedin', 'tiktok']);
  const socialContentTypeEnum = z.enum(['image', 'video', 'carousel', 'thread', 'story', 'post', 'reel']);
  const socialSourceTypeEnum = z.enum(['content_journey', 'analysis', 'ea_share', 'manual']);

  const connectSocialAccountSchema = z.object({
    platform: socialPlatformEnum,
    platformUsername: z.string().optional()
  });

  const shareSocialContentSchema = z.object({
    platform: socialPlatformEnum,
    contentType: socialContentTypeEnum,
    caption: z.string().optional(),
    mediaUrls: z.array(z.string()).optional(),
    hashtags: z.array(z.string()).optional(),
    sourceType: socialSourceTypeEnum,
    sourceId: z.number().optional()
  });

  // Connect a social account (simulate - would be OAuth in production)
  app.post("/api/social/accounts/connect", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = req.user as User;
    
    const validation = connectSocialAccountSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request", details: validation.error.flatten() });
    }
    
    const { platform, platformUsername } = validation.data;
    
    try {
      const account = await storage.connectSocialAccount({
        userId: user.id,
        platform,
        platformUsername: platformUsername || `@user_${user.id}`,
        isActive: true
      });
      res.json({ success: true, account });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Disconnect a social account
  app.delete("/api/social/accounts/:platform", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = req.user as User;
    const { platform } = req.params;
    
    try {
      await storage.disconnectSocialAccount(user.id, platform);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Share content to social media
  app.post("/api/social/share", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = req.user as User;
    
    const validation = shareSocialContentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request", details: validation.error.flatten() });
    }
    
    const { platform, contentType, caption, mediaUrls, hashtags, sourceType, sourceId } = validation.data;
    
    try {
      // Check if account is connected
      const account = await storage.getConnectedSocialAccount(user.id, platform);
      
      // Create the post record
      const post = await storage.createSocialPost({
        userId: user.id,
        platform,
        contentType,
        caption,
        mediaUrls: mediaUrls || [],
        hashtags: hashtags || [],
        sourceType,
        sourceId,
        status: account?.isActive ? 'published' : 'pending'
      });
      
      // In production, this would call the platform's API to actually post
      // For now, we'll mark it as published if the account is connected
      if (account?.isActive) {
        await storage.updateSocialPost(post.id, {
          status: 'published',
          publishedAt: new Date(),
          platformPostUrl: `https://${platform}.com/post/${post.id}`
        });
      }
      
      res.json({ success: true, post });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // Get user's social posts
  app.get("/api/social/posts", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = req.user as User;
    try {
      const posts = await storage.getSocialPosts(user.id);
      res.json(posts);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
    }
  });

  // ============= SOLANA TOKEN SCANNER =============
  
  // Scan and analyze trending Solana tokens
  app.get("/api/solana/scan", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);
      const dexFilter = (req.query.dex as DexSource) || 'all';
      const validDexes: DexSource[] = ['all', 'raydium', 'orca', 'meteora', 'pumpfun', 'jupiter'];
      const safeDexFilter = validDexes.includes(dexFilter) ? dexFilter : 'all';
      const analyses = await scanAndAnalyzeTokens(limit, safeDexFilter);
      res.json({ success: true, tokens: analyses, scannedAt: new Date().toISOString(), dexFilter: safeDexFilter });
    } catch (error) {
      console.error('Error scanning Solana tokens:', error);
      res.status(500).json({ success: false, error: 'Failed to scan tokens' });
    }
  });
  
  // Search for a specific Solana token
  app.get("/api/solana/search", async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ success: false, error: 'Query parameter required' });
      }
      const tokens = await searchSolanaToken(query);
      res.json({ success: true, tokens });
    } catch (error) {
      console.error('Error searching Solana token:', error);
      res.status(500).json({ success: false, error: 'Failed to search token' });
    }
  });
  
  // Analyze a specific token by address
  app.get("/api/solana/analyze/:address", async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const tokens = await searchSolanaToken(address);
      if (tokens.length === 0) {
        return res.status(404).json({ success: false, error: 'Token not found' });
      }
      const analysis = await analyzeToken(tokens[0]);
      res.json({ success: true, analysis });
    } catch (error) {
      console.error('Error analyzing token:', error);
      res.status(500).json({ success: false, error: 'Failed to analyze token' });
    }
  });
  
  // Get trending tokens (raw data without AI analysis)
  app.get("/api/solana/trending", async (req: Request, res: Response) => {
    try {
      const tokens = await fetchTrendingSolanaTokens();
      res.json({ success: true, tokens });
    } catch (error) {
      console.error('Error fetching trending tokens:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch trending tokens' });
    }
  });
  
  // Get SOL balance for a Solana address (server-side fetch to avoid client rate limiting)
  app.get("/api/solana/balance/:address", async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      if (!address || address.length < 32) {
        return res.status(400).json({ success: false, error: 'Invalid wallet address' });
      }
      
      const RPC_ENDPOINTS = [
        'https://rpc.ankr.com/solana',
        'https://api.mainnet-beta.solana.com',
        'https://mainnet.helius-rpc.com/?api-key=15319bf4-5b40-4958-ac8d-6313aa55eb92',
      ];
      
      let balance: number | null = null;
      
      for (const rpcUrl of RPC_ENDPOINTS) {
        try {
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getBalance',
              params: [address, { commitment: 'confirmed' }]
            })
          });
          
          if (!response.ok) continue;
          
          const data = await response.json();
          if (data.result?.value !== undefined) {
            balance = data.result.value / 1_000_000_000; // Convert lamports to SOL
            console.log('SOL balance for', address.slice(0, 8), ':', balance, 'SOL from', rpcUrl);
            break;
          }
        } catch (err) {
          continue;
        }
      }
      
      res.json({ success: true, balance: balance || 0 });
    } catch (error: any) {
      console.error('Error fetching SOL balance:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch balance' });
    }
  });

  // Get wallet tokens for a Solana address (server-side fetch to avoid client rate limiting)
  app.get("/api/solana/wallet-tokens/:address", async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      if (!address || address.length < 32) {
        return res.status(400).json({ success: false, error: 'Invalid wallet address' });
      }
      
      const RPC_ENDPOINTS = [
        'https://rpc.ankr.com/solana',
        'https://api.mainnet-beta.solana.com',
        'https://mainnet.helius-rpc.com/?api-key=15319bf4-5b40-4958-ac8d-6313aa55eb92',
      ];
      
      let tokenAccounts: any = null;
      let lastError: any = null;
      
      for (const rpcUrl of RPC_ENDPOINTS) {
        try {
          console.log('Wallet tokens: Trying RPC:', rpcUrl);
          const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTokenAccountsByOwner',
              params: [
                address,
                { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
                { encoding: 'jsonParsed', commitment: 'confirmed' }
              ]
            })
          });
          
          if (!response.ok) {
            throw new Error(`RPC error: ${response.status}`);
          }
          
          const data = await response.json();
          if (data.error) {
            throw new Error(data.error.message || 'RPC error');
          }
          
          tokenAccounts = data.result?.value || [];
          console.log('Wallet tokens: Got', tokenAccounts.length, 'accounts from', rpcUrl);
          break;
        } catch (err: any) {
          console.warn('Wallet tokens RPC failed:', rpcUrl, err.message);
          lastError = err;
          await new Promise(r => setTimeout(r, 300));
          continue;
        }
      }
      
      if (tokenAccounts === null) {
        throw lastError || new Error('All RPC endpoints failed');
      }
      
      // Parse token accounts
      const tokens: Array<{
        mint: string;
        symbol: string;
        name: string;
        amount: string;
        decimals: number;
        uiAmount: number;
        priceUsd: number | null;
        valueUsd: number | null;
      }> = [];
      
      const tokenMints: string[] = [];
      
      for (const account of tokenAccounts) {
        const info = account.account?.data?.parsed?.info;
        if (!info) continue;
        
        const uiAmount = info.tokenAmount?.uiAmount || 0;
        if (uiAmount > 0) {
          tokenMints.push(info.mint);
          tokens.push({
            mint: info.mint,
            symbol: info.mint.slice(0, 6) + '...',
            name: 'Unknown',
            amount: info.tokenAmount?.amount || '0',
            decimals: info.tokenAmount?.decimals || 0,
            uiAmount,
            priceUsd: null,
            valueUsd: null,
          });
        }
      }
      
      // Fetch prices from DexScreener
      if (tokenMints.length > 0) {
        try {
          const batchMints = tokenMints.slice(0, 30).join(',');
          const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${batchMints}`);
          if (dexRes.ok) {
            const dexData = await dexRes.json();
            const pairs = dexData.pairs || [];
            
            for (const token of tokens) {
              const pair = pairs.find((p: any) => p.baseToken?.address === token.mint);
              if (pair) {
                token.symbol = pair.baseToken?.symbol || token.symbol;
                token.name = pair.baseToken?.name || 'Unknown';
                token.priceUsd = parseFloat(pair.priceUsd) || null;
                token.valueUsd = token.priceUsd ? token.uiAmount * token.priceUsd : null;
              }
            }
          }
        } catch (e) {
          console.log('Price fetch skipped:', e);
        }
      }
      
      // Sort by value
      tokens.sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));
      
      res.json({ success: true, tokens });
    } catch (error: any) {
      console.error('Error fetching wallet tokens:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch wallet tokens' });
    }
  });

  // ============================================
  // Auto-Trading Wallet API
  // ============================================
  
  // In-memory trading wallet storage (replace with DB in production)
  const tradingWallets: Record<number, {
    id: number;
    solBalance: number;
    lockedBalance: number;
    totalProfitLoss: number;
    isAutoTradeEnabled: boolean;
    maxPositions: number;
    tradeAmountSol: number;
    takeProfitPercent: number;
    stopLossPercent: number;
    minSignalConfidence: number;
  }> = {};
  
  const tokenPositions: Record<number, Array<{
    id: number;
    userId: number;
    tokenAddress: string;
    tokenSymbol: string;
    tokenName: string;
    entryPriceSol: number;
    currentPriceSol: number;
    amountSolInvested: number;
    unrealizedPL: number;
    status: string;
    signalType: string;
    openedAt: string;
  }>> = {};
  
  let positionIdCounter = 1;
  
  // Phantom wallet-based trading settings (no login required, keyed by wallet address)
  const phantomWalletSettings: Record<string, TradingWallet> = {};
  
  // Get phantom trading wallet by address (no auth required)
  app.get("/api/trading/phantom-wallet/:address", async (req: Request, res: Response) => {
    const { address } = req.params;
    if (!address || address.length < 32) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }
    
    if (!phantomWalletSettings[address]) {
      phantomWalletSettings[address] = {
        id: 0,
        solBalance: 0,
        lockedBalance: 0,
        totalProfitLoss: 0,
        isAutoTradeEnabled: false,
        maxPositions: 3,
        tradeAmountSol: 0.1,
        takeProfitPercent: 50,
        stopLossPercent: 20,
        minSignalConfidence: 70,
        isAutoRebalanceEnabled: false,
        rebalanceThresholdPercent: 10,
      };
    }
    
    res.json(phantomWalletSettings[address]);
  });
  
  // Update phantom trading wallet settings by address (no auth required)
  app.patch("/api/trading/phantom-wallet/:address", async (req: Request, res: Response) => {
    const { address } = req.params;
    if (!address || address.length < 32) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }
    
    if (!phantomWalletSettings[address]) {
      phantomWalletSettings[address] = {
        id: 0,
        solBalance: 0,
        lockedBalance: 0,
        totalProfitLoss: 0,
        isAutoTradeEnabled: false,
        maxPositions: 3,
        tradeAmountSol: 0.1,
        takeProfitPercent: 50,
        stopLossPercent: 20,
        minSignalConfidence: 70,
        isAutoRebalanceEnabled: false,
        rebalanceThresholdPercent: 10,
      };
    }
    
    const allowedFields = ['isAutoTradeEnabled', 'maxPositions', 'tradeAmountSol', 'takeProfitPercent', 'stopLossPercent', 'minSignalConfidence', 'isAutoRebalanceEnabled', 'rebalanceThresholdPercent'];
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        (phantomWalletSettings[address] as any)[key] = req.body[key];
      }
    }
    
    console.log('Updated phantom wallet settings for', address.slice(0, 8), ':', phantomWalletSettings[address]);
    res.json(phantomWalletSettings[address]);
  });
  
  // Get trading wallet
  app.get("/api/trading/wallet", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    if (!tradingWallets[userId]) {
      tradingWallets[userId] = {
        id: userId,
        solBalance: 0,
        lockedBalance: 0,
        totalProfitLoss: 0,
        isAutoTradeEnabled: false,
        maxPositions: 3,
        tradeAmountSol: 0.1,
        takeProfitPercent: 50,
        stopLossPercent: 20,
        minSignalConfidence: 70,
        isAutoRebalanceEnabled: false,
        rebalanceThresholdPercent: 10,
      };
    }
    
    res.json(tradingWallets[userId]);
  });
  
  // Update trading wallet settings
  app.patch("/api/trading/wallet", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    if (!tradingWallets[userId]) {
      tradingWallets[userId] = {
        id: userId,
        solBalance: 0,
        lockedBalance: 0,
        totalProfitLoss: 0,
        isAutoTradeEnabled: false,
        maxPositions: 3,
        tradeAmountSol: 0.1,
        takeProfitPercent: 50,
        stopLossPercent: 20,
        minSignalConfidence: 70,
        isAutoRebalanceEnabled: false,
        rebalanceThresholdPercent: 10,
      };
    }
    
    const allowedFields = ['isAutoTradeEnabled', 'maxPositions', 'tradeAmountSol', 'takeProfitPercent', 'stopLossPercent', 'minSignalConfidence', 'isAutoRebalanceEnabled', 'rebalanceThresholdPercent'];
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        (tradingWallets[userId] as any)[key] = req.body[key];
      }
    }
    
    res.json(tradingWallets[userId]);
  });
  
  // Deposit SOL (demo mode)
  app.post("/api/trading/deposit", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }
    
    if (!tradingWallets[userId]) {
      tradingWallets[userId] = {
        id: userId,
        solBalance: 0,
        lockedBalance: 0,
        totalProfitLoss: 0,
        isAutoTradeEnabled: false,
        maxPositions: 3,
        tradeAmountSol: 0.1,
        takeProfitPercent: 50,
        stopLossPercent: 20,
        minSignalConfidence: 70,
      };
    }
    
    tradingWallets[userId].solBalance += amount;
    
    res.json({ 
      success: true, 
      message: `Added ${amount} SOL to your trading wallet (demo mode)`,
      wallet: tradingWallets[userId]
    });
  });
  
  // Get open positions
  app.get("/api/trading/positions", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    
    res.json(tokenPositions[userId] || []);
  });
  
  // Close a position
  app.post("/api/trading/positions/:id/close", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const userId = (req.user as User).id;
    const positionId = parseInt(req.params.id);
    
    const positions = tokenPositions[userId] || [];
    const posIndex = positions.findIndex(p => p.id === positionId);
    
    if (posIndex === -1) {
      return res.status(404).json({ error: "Position not found" });
    }
    
    const position = positions[posIndex];
    const priceDiff = (position.currentPriceSol - position.entryPriceSol);
    const profitLoss = priceDiff * (position.amountSolInvested / position.entryPriceSol);
    
    // Return SOL to wallet
    tradingWallets[userId].solBalance += position.amountSolInvested + profitLoss;
    tradingWallets[userId].lockedBalance -= position.amountSolInvested;
    tradingWallets[userId].totalProfitLoss += profitLoss;
    
    // Mark position as closed
    positions[posIndex].status = 'closed';
    positions[posIndex].unrealizedPL = profitLoss;
    
    res.json({ 
      success: true, 
      message: `Position closed with ${profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(4)} SOL`,
      position: positions[posIndex]
    });
  });

  // ============ User API Keys Management ============
  function sanitizeKeyForResponse(key: any) {
    const { apiKey, ...safeKey } = key;
    return { ...safeKey, hasKey: !!apiKey };
  }

  app.get("/api/user-api-keys", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    try {
      const keys = await storage.getUserApiKeys(req.user!.id);
      res.json(keys.map(sanitizeKeyForResponse));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/user-api-keys", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { provider, apiKey, label } = req.body;
      const validProviders = ['openai', 'anthropic', 'google', 'groq', 'mistral'];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({ message: "Invalid provider. Must be one of: " + validProviders.join(', ') });
      }
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
        return res.status(400).json({ message: "Invalid API key" });
      }

      const existingKeys = await storage.getUserApiKeys(req.user!.id);
      const isUpdating = existingKeys.some(k => k.provider === provider);
      if (!isUpdating && existingKeys.length >= 5) {
        return res.status(400).json({ message: "Maximum of 5 AI providers allowed" });
      }

      const result = await storage.createOrUpdateUserApiKey({
        userId: req.user!.id,
        provider,
        apiKey: apiKey.trim(),
        label: label || provider,
        isActive: true,
        isValid: false,
      });

      res.json(sanitizeKeyForResponse(result));
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/user-api-keys/validate", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { provider } = req.body;
      const key = await storage.getActiveUserApiKey(req.user!.id, provider);
      if (!key) {
        const anyKey = await storage.getUserApiKey(req.user!.id, provider);
        if (!anyKey) return res.status(404).json({ message: "Key not found" });
        return res.status(400).json({ message: "Key is not active. Enable it first.", valid: false, provider });
      }
      const decryptedKey = key.apiKey;

      let isValid = false;
      try {
        if (provider === 'openai') {
          const testClient = new (await import('openai')).default({ apiKey: decryptedKey });
          await testClient.models.list();
          isValid = true;
        } else if (provider === 'anthropic') {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'x-api-key': decryptedKey, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-3-haiku-20240307', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
          });
          isValid = resp.status !== 401 && resp.status !== 403;
        } else if (provider === 'google') {
          const resp = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${decryptedKey}`);
          isValid = resp.ok;
        } else if (provider === 'groq') {
          const resp = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${decryptedKey}` },
          });
          isValid = resp.ok;
        } else if (provider === 'mistral') {
          const resp = await fetch('https://api.mistral.ai/v1/models', {
            headers: { 'Authorization': `Bearer ${decryptedKey}` },
          });
          isValid = resp.ok;
        }
      } catch (e) {
        isValid = false;
      }

      await db.update(userApiKeys)
        .set({ isValid, lastValidated: new Date() })
        .where(and(eq(userApiKeys.userId, req.user!.id), eq(userApiKeys.provider, provider)));

      res.json({ valid: isValid, provider });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/user-api-keys/toggle", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    try {
      const { provider, isActive } = req.body;
      const key = await storage.getUserApiKey(req.user!.id, provider);
      if (!key) return res.status(404).json({ message: "Key not found" });

      await db.update(userApiKeys)
        .set({ isActive: !!isActive })
        .where(and(eq(userApiKeys.userId, req.user!.id), eq(userApiKeys.provider, provider)));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/user-api-keys/:provider", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    try {
      await storage.deleteUserApiKey(req.user!.id, req.params.provider);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/ai-model-preference", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { getUserModelPreference, AVAILABLE_VISION_MODELS } = await import('./openai');
    const currentModel = getUserModelPreference(req.user!.id);
    res.json({ model: currentModel, availableModels: AVAILABLE_VISION_MODELS });
  });

  app.post("/api/ai-model-preference", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { model } = req.body;
    const { setUserModelPreference, AVAILABLE_VISION_MODELS } = await import('./openai');
    const validIds = AVAILABLE_VISION_MODELS.map(m => m.id);
    if (!validIds.includes(model)) {
      return res.status(400).json({ message: `Invalid model. Choose from: ${validIds.join(', ')}` });
    }
    setUserModelPreference(req.user!.id, model);
    const modelInfo = AVAILABLE_VISION_MODELS.find(m => m.id === model);
    res.json({ success: true, model, modelName: modelInfo?.name || model });
  });

  app.get("/api/ai-vision-confirmation", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { isAiVisionConfirmationEnabled, getAiMinConfidence } = await import('./openai');
    res.json({ 
      enabled: isAiVisionConfirmationEnabled(req.user!.id),
      aiMinConfidence: getAiMinConfidence(req.user!.id),
    });
  });

  app.post("/api/ai-vision-confirmation", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { enabled, aiMinConfidence } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: "enabled must be a boolean" });
    }
    const { setAiVisionConfirmation, setAiMinConfidence, getAiMinConfidence } = await import('./openai');
    setAiVisionConfirmation(req.user!.id, enabled);
    if (typeof aiMinConfidence === 'number') {
      setAiMinConfidence(req.user!.id, aiMinConfidence);
    }
    res.json({ success: true, enabled, aiMinConfidence: getAiMinConfidence(req.user!.id) });
  });

  app.get("/api/ai-confirmation-logs", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { getAiConfirmationLogs } = await import('./openai');
    const logs = getAiConfirmationLogs(req.user!.id);
    res.json(logs);
  });

  const httpServer = createServer(app);
  
  streamingService.initialize(httpServer);
  
  return httpServer;
}
