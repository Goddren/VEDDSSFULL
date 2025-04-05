import { users, type User, type InsertUser, chartAnalyses, type ChartAnalysis, type InsertChartAnalysis } from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<User>): Promise<User | undefined>;
  updateUserPassword(id: number, hashedPassword: string): Promise<User | undefined>;
  
  // Chart analysis methods
  createChartAnalysis(analysis: InsertChartAnalysis): Promise<ChartAnalysis>;
  getChartAnalysis(id: number): Promise<ChartAnalysis | undefined>;
  getChartAnalysesByUserId(userId: number): Promise<ChartAnalysis[]>;
  getAllChartAnalyses(): Promise<ChartAnalysis[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private chartAnalyses: Map<number, ChartAnalysis>;
  currentUserId: number;
  currentChartAnalysisId: number;

  constructor() {
    this.users = new Map();
    this.chartAnalyses = new Map();
    this.currentUserId = 1;
    this.currentChartAnalysisId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const now = new Date();
    const user: User = { 
      ...insertUser, 
      id,
      fullName: insertUser.fullName || null,
      profileImage: insertUser.profileImage || null,
      email: insertUser.email || '',
      createdAt: now,
      updatedAt: now
    };
    this.users.set(id, user);
    return user;
  }

  async createChartAnalysis(analysis: InsertChartAnalysis): Promise<ChartAnalysis> {
    const id = this.currentChartAnalysisId++;
    
    // Ensure required fields are present
    if (!analysis.imageUrl || !analysis.direction || !analysis.trend || 
        !analysis.confidence || !analysis.entryPoint || !analysis.exitPoint || 
        !analysis.stopLoss || !analysis.takeProfit || 
        !analysis.patterns || !analysis.indicators) {
      throw new Error("Missing required fields for chart analysis");
    }
    
    // Create a properly typed ChartAnalysis object
    const chartAnalysis: ChartAnalysis = {
      id,
      createdAt: new Date(),
      // Required fields
      imageUrl: analysis.imageUrl,
      direction: analysis.direction,
      trend: analysis.trend,
      confidence: analysis.confidence,
      entryPoint: analysis.entryPoint,
      exitPoint: analysis.exitPoint,
      stopLoss: analysis.stopLoss,
      takeProfit: analysis.takeProfit,
      patterns: analysis.patterns,
      indicators: analysis.indicators,
      
      // Optional fields with null fallbacks
      userId: analysis.userId ?? null,
      symbol: analysis.symbol ?? null,
      timeframe: analysis.timeframe ?? null,
      price: analysis.price ?? null,
      riskRewardRatio: analysis.riskRewardRatio ?? null,
      potentialPips: analysis.potentialPips ?? null,
      supportResistance: analysis.supportResistance ?? null,
      recommendation: analysis.recommendation ?? null
    };
    
    this.chartAnalyses.set(id, chartAnalysis);
    return chartAnalysis;
  }

  async getChartAnalysis(id: number): Promise<ChartAnalysis | undefined> {
    return this.chartAnalyses.get(id);
  }

  async getChartAnalysesByUserId(userId: number): Promise<ChartAnalysis[]> {
    return Array.from(this.chartAnalyses.values()).filter(
      analysis => analysis.userId === userId
    );
  }

  async getAllChartAnalyses(): Promise<ChartAnalysis[]> {
    return Array.from(this.chartAnalyses.values());
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser = { ...user, ...userData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser = { ...user, password: hashedPassword };
    this.users.set(id, updatedUser);
    return updatedUser;
  }
}

export const storage = new MemStorage();
