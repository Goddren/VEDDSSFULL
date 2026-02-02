import { User } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      isAuthenticated(): boolean;
      user?: User;
    }
  }
}

export {};
