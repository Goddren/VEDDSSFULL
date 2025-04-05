import { 
  users, chartAnalyses, achievements, userAchievements,
  type User, type InsertUser, type ChartAnalysis, type InsertChartAnalysis,
  type Achievement, type InsertAchievement, type UserAchievement, type InsertUserAchievement 
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

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
  
  // Achievement methods
  createAchievement(achievement: InsertAchievement): Promise<Achievement>;
  getAchievement(id: number): Promise<Achievement | undefined>;
  getAllAchievements(): Promise<Achievement[]>;
  getAchievementsByCategory(category: string): Promise<Achievement[]>;
  
  // User Achievement methods
  createUserAchievement(userAchievement: InsertUserAchievement): Promise<UserAchievement>;
  getUserAchievements(userId: number): Promise<(UserAchievement & { achievement: Achievement })[]>;
  updateUserAchievementProgress(id: number, progress: number): Promise<UserAchievement>;
  completeUserAchievement(id: number): Promise<UserAchievement>;
  
  // Session store for authentication
  sessionStore: session.Store;
}

// Create PostgreSQL session store
const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool,
      createTableIfMissing: true 
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        email: insertUser.email || '',
        fullName: insertUser.fullName || null,
        profileImage: insertUser.profileImage || null,
      })
      .returning();
    return user;
  }

  async createChartAnalysis(analysis: InsertChartAnalysis): Promise<ChartAnalysis> {
    // Ensure required fields are present
    if (!analysis.imageUrl || !analysis.direction || !analysis.trend || 
        !analysis.confidence || !analysis.entryPoint || !analysis.exitPoint || 
        !analysis.stopLoss || !analysis.takeProfit || 
        !analysis.patterns || !analysis.indicators) {
      throw new Error("Missing required fields for chart analysis");
    }
    
    const [chartAnalysis] = await db
      .insert(chartAnalyses)
      .values({
        imageUrl: analysis.imageUrl,
        userId: analysis.userId,
        symbol: analysis.symbol || null,
        timeframe: analysis.timeframe || null,
        price: analysis.price || null,
        direction: analysis.direction,
        trend: analysis.trend,
        confidence: analysis.confidence,
        entryPoint: analysis.entryPoint,
        exitPoint: analysis.exitPoint,
        stopLoss: analysis.stopLoss,
        takeProfit: analysis.takeProfit,
        riskRewardRatio: analysis.riskRewardRatio || null,
        potentialPips: analysis.potentialPips || null,
        patterns: analysis.patterns,
        indicators: analysis.indicators,
        supportResistance: analysis.supportResistance || null,
        recommendation: analysis.recommendation || null,
      })
      .returning();
    
    return chartAnalysis;
  }

  async getChartAnalysis(id: number): Promise<ChartAnalysis | undefined> {
    const [analysis] = await db
      .select()
      .from(chartAnalyses)
      .where(eq(chartAnalyses.id, id));
    return analysis;
  }

  async getChartAnalysesByUserId(userId: number): Promise<ChartAnalysis[]> {
    return db
      .select()
      .from(chartAnalyses)
      .where(eq(chartAnalyses.userId, userId));
  }

  async getAllChartAnalyses(): Promise<ChartAnalysis[]> {
    return db.select().from(chartAnalyses);
  }

  async updateUser(id: number, userData: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({
        ...userData,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set({
        password: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  // Achievement methods
  async createAchievement(achievement: InsertAchievement): Promise<Achievement> {
    const [newAchievement] = await db
      .insert(achievements)
      .values(achievement)
      .returning();
    return newAchievement;
  }

  async getAchievement(id: number): Promise<Achievement | undefined> {
    const [achievement] = await db
      .select()
      .from(achievements)
      .where(eq(achievements.id, id));
    return achievement;
  }

  async getAllAchievements(): Promise<Achievement[]> {
    return db.select().from(achievements);
  }

  async getAchievementsByCategory(category: string): Promise<Achievement[]> {
    return db
      .select()
      .from(achievements)
      .where(eq(achievements.category, category));
  }

  // User Achievement methods
  async createUserAchievement(userAchievement: InsertUserAchievement): Promise<UserAchievement> {
    const [newUserAchievement] = await db
      .insert(userAchievements)
      .values(userAchievement)
      .returning();
    return newUserAchievement;
  }

  async getUserAchievements(userId: number): Promise<(UserAchievement & { achievement: Achievement })[]> {
    const result = await db
      .select({
        userAchievement: userAchievements,
        achievement: achievements
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(eq(userAchievements.userId, userId));
    
    return result.map(row => ({
      ...row.userAchievement,
      achievement: row.achievement
    }));
  }

  async updateUserAchievementProgress(id: number, progress: number): Promise<UserAchievement> {
    const [updatedUserAchievement] = await db
      .update(userAchievements)
      .set({
        progress
      })
      .where(eq(userAchievements.id, id))
      .returning();
    return updatedUserAchievement;
  }

  async completeUserAchievement(id: number): Promise<UserAchievement> {
    const [completedUserAchievement] = await db
      .update(userAchievements)
      .set({
        isCompleted: true,
        progress: sql`${userAchievements.progress} + 1`,
        unlockedAt: new Date()
      })
      .where(eq(userAchievements.id, id))
      .returning();
    return completedUserAchievement;
  }
}

// Export a singleton instance of the database storage
export const storage = new DatabaseStorage();
