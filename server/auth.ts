import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  // Use simple in-memory session with no external store
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'trading-chart-app-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: false
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log(`[AUTH] Login attempt for username: ${username}`);
        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log(`[AUTH] User not found: ${username}`);
          return done(null, false);
        }
        const match = await comparePasswords(password, user.password);
        console.log(`[AUTH] Password match for ${username}: ${match}`);
        if (!match) {
          return done(null, false);
        }
        return done(null, user);
      } catch (error) {
        console.error(`[AUTH] Login error:`, error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Username already exists"
        });
      }

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      req.login(user, (err) => {
        if (err) return next(err);
        // Omit password from response
        const { password, ...userWithoutPassword } = user;
        res.status(201).json({
          success: true,
          user: userWithoutPassword
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({
        success: false,
        message: "Error during registration"
      });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: Error | null, user: SelectUser | false, info: { message: string }) => {
      if (err) return next(err);
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: info?.message || "Invalid username or password"
        });
      }
      
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        // Omit password from response
        const { password, ...userWithoutPassword } = user;
        res.json({
          success: true,
          user: userWithoutPassword
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({
        success: true,
        message: "Logged out successfully"
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
    }
    
    // Omit password from response
    const { password, ...userWithoutPassword } = req.user as SelectUser;
    res.json({
      success: true,
      user: userWithoutPassword
    });
  });

  // Update user profile
  app.patch("/api/user", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
    }

    try {
      const userId = (req.user as SelectUser).id;
      const { fullName, email } = req.body;

      // Validate the input
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format"
        });
      }

      // Update the user in the database
      const updatedUser = await storage.updateUser(userId, { fullName, email });
      
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      // Omit password from response
      const { password, ...userWithoutPassword } = updatedUser;
      
      res.json({
        success: true,
        message: "Profile updated successfully",
        user: userWithoutPassword
      });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating profile"
      });
    }
  });

  // Update password
  app.post("/api/user/change-password", async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated"
      });
    }

    try {
      const { currentPassword, newPassword } = req.body;
      const user = req.user as SelectUser;

      // Validate the input
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters"
        });
      }

      // Verify current password
      if (!(await comparePasswords(currentPassword, user.password))) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect"
        });
      }

      // Hash new password
      const hashedPassword = await hashPassword(newPassword);
      
      // Update the user's password in the database
      const updatedUser = await storage.updateUserPassword(user.id, hashedPassword);
      
      if (!updatedUser) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }
      
      res.json({
        success: true,
        message: "Password changed successfully"
      });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({
        success: false,
        message: "Error changing password"
      });
    }
  });
}