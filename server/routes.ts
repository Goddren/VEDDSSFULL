import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeChartImage, testOpenAIApiKey, generateTradingTip, generateMarketTrendPredictions } from "./openai";
import { setupTwilio, sendTradingSignal } from "./twilio";
import { checkUserAchievements } from "./achievement-tracker";
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

      const { base64Image, filename } = req.body;
      
      if (!base64Image) {
        return res.status(400).json({ message: "No base64 image data provided" });
      }
      
      console.log('Received base64 image data, calling OpenAI');

      // Call OpenAI for analysis
      const analysis = await analyzeChartImage(base64Image);
      console.log('Analysis completed successfully');
      
      // Create a filename for storage
      const extension = filename?.split('.').pop() || 'png';
      const generatedFilename = `${uuidv4()}.${extension}`;
      const filePath = path.join(uploadsDir, generatedFilename);
      const imageUrl = `/uploads/${generatedFilename}`;
      
      // Save the image to disk (decode base64 to binary)
      try {
        const imageBuffer = Buffer.from(base64Image, 'base64');
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
          recommendation: analysis.recommendation || "No recommendation available"
        });
      } catch (dbError) {
        console.error('Error storing analysis in database:', dbError);
        // Continue even if database storage fails
      }

      // Return the analysis result
      res.json(analysis);
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
      } catch (storageError) {
        console.error("Error storing analysis in database:", storageError);
        // Continue processing even if storage fails
      }

      // Return the full analysis to the client
      res.json(analysis);
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
      
      // Share the analysis
      const sharedAnalysis = await storage.shareChartAnalysis(id, notes);
      res.json(sharedAnalysis);
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
      const filePath = path.join(process.cwd(), 'uploads', sanitizedFilename);
      
      // Check if the file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Image not found" });
      }
      
      // Send the file
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error serving image:", error);
      res.status(500).json({ message: "Error serving image" });
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

  const httpServer = createServer(app);
  return httpServer;
}
