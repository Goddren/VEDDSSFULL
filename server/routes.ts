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
  insertAnalysisFeedbackSchema
} from "@shared/schema";
import { addTradeSetupAnnotations, createAnnotatedImageUrl } from "./image-processor";

// Configure multer for file uploads
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

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Twilio if credentials are available
  setupTwilio();
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
  "bestChartTimeframe": "string - the recommended timeframe for EA entry"
}`;

      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1024,
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
      
      // Add chart details for the recommended timeframe
      const recommendedAnalysis = analyses.find((a: any) => a.timeframe === synthesis.bestChartTimeframe);
      if (recommendedAnalysis) {
        synthesis.recommendedChart = {
          timeframe: synthesis.bestChartTimeframe,
          direction: recommendedAnalysis.direction,
          confidence: recommendedAnalysis.confidence,
          patterns: recommendedAnalysis.patterns || [],
          rsi: recommendedAnalysis.momentumIndicators?.rsi?.value,
          reasoning: `This ${synthesis.bestChartTimeframe} timeframe provides the strongest entry signal aligned with the unified analysis`
        };
      }
      
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

  // Trading Coach endpoints
  app.post('/api/trading-coach', tradingCoachHandler);
  
  // Trading Tips endpoint
  app.get('/api/trading-tips', tradingTipsHandler);

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

  // EA Live Refresh endpoint - REQUIRES AUTHENTICATION
  app.post('/api/ea/refresh-analysis', async (req: Request, res: Response) => {
    try {
      // SECURITY: Require user authentication
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required. Please log in to use EA refresh feature." 
        });
      }

      const userId = (req.user as Express.User).id;
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
      
      const { name, description, platformType, eaCode, symbol, strategyType, isShared, price } = req.body;
      
      const ea = await storage.savEA({
        userId: (req.user as User).id,
        name,
        description,
        platformType,
        eaCode,
        symbol,
        strategyType,
        isShared: isShared || false,
        price: price ? Math.round(price * 100) : null
      });
      
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

  const httpServer = createServer(app);
  return httpServer;
}
