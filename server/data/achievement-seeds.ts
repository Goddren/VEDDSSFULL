import { InsertAchievement } from "@shared/schema";

export const initialAchievements: InsertAchievement[] = [
  // Analysis Achievements
  {
    name: "First Analysis",
    description: "Complete your first chart analysis",
    category: "analysis",
    icon: "chart-bar",
    points: 10,
    threshold: 1,
    isSecret: false
  },
  {
    name: "Analysis Apprentice",
    description: "Complete 5 chart analyses",
    category: "analysis",
    icon: "chart-bar",
    points: 20,
    threshold: 5,
    isSecret: false
  },
  {
    name: "Analysis Expert",
    description: "Complete 25 chart analyses",
    category: "analysis", 
    icon: "chart-bar",
    points: 50,
    threshold: 25,
    isSecret: false
  },
  {
    name: "Analysis Master",
    description: "Complete 100 chart analyses",
    category: "analysis",
    icon: "chart-bar",
    points: 100,
    threshold: 100,
    isSecret: false
  },
  
  // Consistency Achievements
  {
    name: "Trading Habit",
    description: "Use the platform for 3 consecutive days",
    category: "consistency",
    icon: "calendar-check",
    points: 15,
    threshold: 3,
    isSecret: false
  },
  {
    name: "Trading Routine",
    description: "Use the platform for 7 consecutive days",
    category: "consistency",
    icon: "calendar-check",
    points: 30,
    threshold: 7,
    isSecret: false
  },
  {
    name: "Trading Discipline",
    description: "Use the platform for 30 consecutive days",
    category: "consistency",
    icon: "calendar-check",
    points: 100,
    threshold: 30,
    isSecret: false
  },
  
  // Accuracy Achievements
  {
    name: "First Win",
    description: "Make a successful prediction",
    category: "accuracy",
    icon: "target",
    points: 15,
    threshold: 1,
    isSecret: false
  },
  {
    name: "Winning Streak",
    description: "Make 5 successful predictions in a row",
    category: "accuracy",
    icon: "target",
    points: 50,
    threshold: 5,
    isSecret: false
  },
  {
    name: "Prediction Master",
    description: "Achieve 80% accuracy in your predictions",
    category: "accuracy",
    icon: "target",
    points: 100,
    threshold: 1,
    isSecret: false
  },
  
  // Exploration Achievements
  {
    name: "Market Explorer",
    description: "Analyze 3 different markets or currency pairs",
    category: "exploration",
    icon: "compass",
    points: 20,
    threshold: 3,
    isSecret: false
  },
  {
    name: "Global Trader",
    description: "Analyze 10 different markets or currency pairs",
    category: "exploration",
    icon: "compass",
    points: 50,
    threshold: 10,
    isSecret: false
  },
  
  // Special Achievements
  {
    name: "Pattern Hunter",
    description: "Discover 5 different chart patterns",
    category: "special",
    icon: "puzzle-piece",
    points: 30,
    threshold: 5,
    isSecret: false
  },
  {
    name: "Social Trader",
    description: "Share your first analysis with others",
    category: "special",
    icon: "award",
    points: 15,
    threshold: 1,
    isSecret: false
  },
  {
    name: "Market Guru",
    description: "Help others by sharing 10 analyses",
    category: "special",
    icon: "award",
    points: 50,
    threshold: 10,
    isSecret: false
  },
  {
    name: "Night Owl",
    description: "Complete an analysis after midnight",
    category: "special",
    icon: "moon",
    points: 10,
    threshold: 1,
    isSecret: true
  },
  {
    name: "Weekend Warrior",
    description: "Analyze markets on both Saturday and Sunday",
    category: "special",
    icon: "calendar-star",
    points: 15,
    threshold: 1,
    isSecret: true
  },
  {
    name: "Trading Legend",
    description: "Reach level 10 in the trading system",
    category: "special",
    icon: "crown",
    points: 100,
    threshold: 1,
    isSecret: true
  }
];