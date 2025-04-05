import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeChartImage, testOpenAIApiKey } from "./openai";
import multer from "multer";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { insertChartAnalysisSchema, insertAchievementSchema, insertUserAchievementSchema } from "@shared/schema";

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
      // Check if user is authenticated
      if (!req.isAuthenticated()) {
        return res.status(401).json({ 
          success: false,
          message: "Authentication required" 
        });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Generate a unique filename
      const fileName = `${uuidv4()}.${req.file.mimetype.split('/')[1]}`;
      const filePath = path.join(uploadsDir, fileName);

      // Save file to disk
      await fs.promises.writeFile(filePath, req.file.buffer);

      // Return the file path for further processing
      res.json({ url: `/uploads/${fileName}` });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Error uploading file" });
    }
  });

  // Chart analysis endpoint
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
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Image file not found" });
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
      
      // Check for specific OpenAI error types
      if (error && error.code === 'billing_not_active' || 
          (error && error.error && error.error.code === 'billing_not_active')) {
        return res.status(403).json({ 
          message: "Billing not active",
          error: "Your OpenAI account is not active. Please check your billing details on the OpenAI website.",
          code: "BILLING_INACTIVE",
          valid: false
        });
      } else if (error && error.status === 401 || 
                (error && error.error && error.error.type === 'invalid_request_error')) {
        return res.status(401).json({ 
          message: "Invalid API key",
          error: "The provided API key is invalid. Please check your API key and try again.",
          code: "INVALID_API_KEY",
          valid: false
        });
      }
      
      res.status(500).json({ 
        message: "Error configuring API key",
        error: error instanceof Error ? error.message : "Unknown error",
        valid: false
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
      
      // Get all user's analyses to calculate achievement progress
      const analyses = await storage.getChartAnalysesByUserId(userId);
      const userAchievements = await storage.getUserAchievements(userId);
      const allAchievements = await storage.getAllAchievements();
      
      // Calculate progress based on analyses
      const updatedAchievements = [];
      const newlyUnlockedAchievements = [];
      
      // For each achievement, check if user has it, and if not, create it with progress
      for (const achievement of allAchievements) {
        const userAchievement = userAchievements.find(ua => ua.achievementId === achievement.id);
        
        // Calculate progress based on achievement category and type
        let progress = 0;
        let isCompleted = false;
        
        switch (achievement.category) {
          case 'analysis':
            // Count total analyses
            progress = analyses.length;
            isCompleted = progress >= achievement.threshold;
            break;
            
          case 'consistency':
            // Check if user has done analyses on consecutive days
            // (simplified for this example)
            const uniqueDays = new Set(
              analyses.map(a => new Date(a.createdAt).toISOString().split('T')[0])
            );
            progress = uniqueDays.size;
            isCompleted = progress >= achievement.threshold;
            break;
            
          case 'accuracy':
            // Calculate based on high confidence analyses
            const highConfidenceAnalyses = analyses.filter(a => 
              a.confidence.toLowerCase() === 'high' || a.confidence.toLowerCase() === 'very high'
            );
            progress = highConfidenceAnalyses.length;
            isCompleted = progress >= achievement.threshold;
            break;
            
          case 'exploration':
            // Count unique symbols analyzed
            const uniqueSymbols = new Set(analyses.map(a => a.symbol));
            progress = uniqueSymbols.size;
            isCompleted = progress >= achievement.threshold;
            break;
        }
        
        if (!userAchievement) {
          // Create new user achievement with calculated progress
          const newUserAchievement = await storage.createUserAchievement({
            userId,
            achievementId: achievement.id,
            progress,
            isCompleted
          });
          
          if (isCompleted) {
            newlyUnlockedAchievements.push({
              ...newUserAchievement,
              achievement
            });
          }
          
          updatedAchievements.push({
            ...newUserAchievement,
            achievement
          });
        } else if (!userAchievement.isCompleted && progress >= achievement.threshold) {
          // Update existing achievement to completed status
          const completedAchievement = await storage.completeUserAchievement(userAchievement.id);
          
          newlyUnlockedAchievements.push({
            ...completedAchievement,
            achievement
          });
          
          updatedAchievements.push({
            ...completedAchievement,
            achievement
          });
        } else if (progress > userAchievement.progress) {
          // Update progress on existing achievement
          const updatedUserAchievement = await storage.updateUserAchievementProgress(
            userAchievement.id, 
            progress
          );
          
          updatedAchievements.push({
            ...updatedUserAchievement,
            achievement
          });
        }
      }
      
      res.json({
        updated: updatedAchievements,
        newlyUnlocked: newlyUnlockedAchievements
      });
    } catch (error) {
      console.error("Error checking achievements:", error);
      res.status(500).json({ message: "Error checking achievements" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
