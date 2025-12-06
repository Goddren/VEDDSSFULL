import { RateLimitConfig } from './types';

class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private configs: Map<string, RateLimitConfig> = new Map();
  
  registerProvider(provider: string, config: RateLimitConfig): void {
    this.configs.set(provider, config);
    this.requests.set(provider, []);
  }
  
  async checkLimit(provider: string): Promise<boolean> {
    const config = this.configs.get(provider);
    if (!config) return true;
    
    const timestamps = this.requests.get(provider) || [];
    const now = Date.now();
    
    const validTimestamps = timestamps.filter(t => now - t < config.windowMs);
    this.requests.set(provider, validTimestamps);
    
    return validTimestamps.length < config.maxRequests;
  }
  
  recordRequest(provider: string): void {
    const timestamps = this.requests.get(provider) || [];
    timestamps.push(Date.now());
    this.requests.set(provider, timestamps);
  }
  
  async waitForSlot(provider: string): Promise<void> {
    const config = this.configs.get(provider);
    if (!config) return;
    
    while (!(await this.checkLimit(provider))) {
      await new Promise(resolve => setTimeout(resolve, config.retryAfterMs));
    }
  }
  
  getRemainingRequests(provider: string): number {
    const config = this.configs.get(provider);
    if (!config) return Infinity;
    
    const timestamps = this.requests.get(provider) || [];
    const now = Date.now();
    const validTimestamps = timestamps.filter(t => now - t < config.windowMs);
    
    return Math.max(0, config.maxRequests - validTimestamps.length);
  }
}

export const rateLimiter = new RateLimiter();
