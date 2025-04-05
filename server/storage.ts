import { users, type User, type InsertUser, chartAnalyses, type ChartAnalysis, type InsertChartAnalysis } from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createChartAnalysis(analysis: InsertChartAnalysis): Promise<ChartAnalysis> {
    const id = this.currentChartAnalysisId++;
    const newAnalysis: ChartAnalysis = {
      ...analysis,
      id,
      createdAt: new Date(),
    };
    this.chartAnalyses.set(id, newAnalysis);
    return newAnalysis;
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
}

export const storage = new MemStorage();
