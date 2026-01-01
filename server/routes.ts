import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { User } from "@shared/schema";
import { analyzeChartImage, testOpenAIApiKey, generateTradingTip, generateMarketTrendPredictions } from "./openai";
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

      // Call OpenAI for analysis
      const analysis = await analyzeChartImage(cleanBase64);
      console.log('Analysis completed successfully');
      
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
        annotatedImageUrl: annotatedImageUrl || undefined
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
          const analysis = await analyzeChartImage(frame.base64);
          
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

      // Call OpenAI for analysis
      const analysis = await analyzeChartImage(base64Image);
      
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
      const subscription = await getUserSubscription(userId);
      
      res.json(subscription || { planId: 1, planName: "Free", status: "active" });
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
        const apiToken = await storage.getApiTokenByToken(token);
        
        if (!apiToken || !apiToken.isActive) {
          return res.status(401).json({ 
            success: false,
            message: "Invalid or inactive API token" 
          });
        }
        
        userId = apiToken.userId;
        
        // Update last used timestamp
        await storage.updateApiTokenLastUsed(apiToken.id);
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

Provide a brief analysis focusing on:
1. Current trend direction (BUY/SELL/NEUTRAL)
2. Confidence level (0-100%)
3. Any detected patterns or warnings
4. Whether the original direction is still valid

Return ONLY a JSON object with this structure:
{
  "direction": "BUY|SELL|NEUTRAL",
  "confidence": 75,
  "patterns": ["Pattern1", "Pattern2"],
  "directionChanged": true/false,
  "warning": "Optional warning message",
  "recommendation": "Brief trading recommendation"
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

      // Return the fresh analysis
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
          warning: analysis.warning || "",
          recommendation: analysis.recommendation || ""
        }
      });

      console.log(`EA Refresh Complete: ${symbol} - ${analysis.direction} (${analysis.confidence}%)`);

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
      
      if (!action || !symbol || !direction) {
        return res.status(400).json({ error: "Missing required fields: action, symbol, direction" });
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

  const httpServer = createServer(app);
  return httpServer;
}
