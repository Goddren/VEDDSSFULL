// Promo code management for subscription discounts

export interface PromoCode {
  code: string;
  discountPercentage: number;
  description: string;
  validUntil: Date;
  tier: 'standard' | 'pro' | 'enterprise' | 'all';
  isFirstTimeOnly: boolean;
  isActive: boolean;
}

// Generate a unique promo code based on user info and timestamp
export function generateUniquePromoCode(email: string): string {
  // Get the first 3 chars of email username (before @)
  const emailPrefix = email.split('@')[0].substring(0, 3).toUpperCase();
  
  // Get current timestamp in a shortened form
  const timestamp = Date.now().toString().substring(7, 13);
  
  // Create a random suffix (3 characters)
  const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
  
  // Combine all parts
  return `EARLY-${emailPrefix}${timestamp}${randomSuffix}`;
}

// Save promo code to localStorage
export function savePromoCode(promoCode: PromoCode): void {
  // Get existing codes or initialize empty array
  const existingCodes = localStorage.getItem('promoCodes');
  const codes = existingCodes ? JSON.parse(existingCodes) : [];
  
  // Add new code
  codes.push(promoCode);
  
  // Save back to localStorage
  localStorage.setItem('promoCodes', JSON.stringify(codes));
}

// Get promo code by code string
export function getPromoCode(code: string): PromoCode | undefined {
  const existingCodes = localStorage.getItem('promoCodes');
  if (!existingCodes) return undefined;
  
  const codes: PromoCode[] = JSON.parse(existingCodes);
  return codes.find(c => c.code === code && c.isActive && new Date(c.validUntil) > new Date());
}

// Generate early access promo code for higher tiers
export function generateEarlyAccessPromoCode(email: string): PromoCode {
  const code = generateUniquePromoCode(email);
  
  // Set expiration date to 7 days from now
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 7);
  
  return {
    code,
    discountPercentage: 50,
    description: 'Early Access 50% OFF Premium Plans',
    validUntil,
    tier: 'all', // Valid for all tiers
    isFirstTimeOnly: true,
    isActive: true
  };
}

// Create an early access 50% promo code for higher tiers and save it
export function createEarlyAccessPromo(email: string): PromoCode {
  const promoCode = generateEarlyAccessPromoCode(email);
  savePromoCode(promoCode);
  return promoCode;
}

// Check if user already has an early access promo
export function hasEarlyAccessPromo(): boolean {
  const existingCodes = localStorage.getItem('promoCodes');
  if (!existingCodes) return false;
  
  const codes: PromoCode[] = JSON.parse(existingCodes);
  return codes.some(c => 
    c.isActive && 
    c.discountPercentage === 50 && 
    new Date(c.validUntil) > new Date() &&
    c.description.includes('Early Access')
  );
}