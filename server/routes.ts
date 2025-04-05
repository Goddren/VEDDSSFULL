import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { analyzeChartImage } from "./openai";
import multer from "multer";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { insertChartAnalysisSchema } from "@shared/schema";

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

      // Store the analysis in the database
      const chartAnalysis = await storage.createChartAnalysis({
        userId: req.body.userId || 1, // Default to user ID 1 if none provided
        imageUrl: imageUrl,
        symbol: analysis.symbol,
        timeframe: analysis.timeframe,
        price: analysis.currentPrice,
        direction: analysis.direction,
        trend: analysis.trend,
        confidence: analysis.confidence,
        entryPoint: analysis.entryPoint,
        exitPoint: analysis.exitPoint,
        stopLoss: analysis.stopLoss,
        takeProfit: analysis.takeProfit,
        riskRewardRatio: analysis.riskRewardRatio,
        potentialPips: analysis.potentialPips,
        patterns: analysis.patterns,
        indicators: analysis.indicators,
        supportResistance: analysis.supportResistance,
        recommendation: analysis.recommendation
      });

      res.json(analysis);
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ message: "Error analyzing chart" });
    }
  });

  // Get all analyses
  app.get("/api/analyses", async (_req: Request, res: Response) => {
    try {
      const analyses = await storage.getAllChartAnalyses();
      res.json(analyses);
    } catch (error) {
      console.error("Error fetching analyses:", error);
      res.status(500).json({ message: "Error fetching analyses" });
    }
  });

  // Get single analysis by ID
  app.get("/api/analyses/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const analysis = await storage.getChartAnalysis(id);
      if (!analysis) {
        return res.status(404).json({ message: "Analysis not found" });
      }

      res.json(analysis);
    } catch (error) {
      console.error("Error fetching analysis:", error);
      res.status(500).json({ message: "Error fetching analysis" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
