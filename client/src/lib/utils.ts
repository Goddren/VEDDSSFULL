import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: string | number): string {
  if (typeof value === 'string') {
    value = parseFloat(value);
  }
  
  if (isNaN(value)) {
    return 'N/A';
  }
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 5,
  }).format(value);
}

export function getConfidenceColor(confidence: string, includeBg: boolean = true): string {
  switch (confidence.toLowerCase()) {
    case 'high':
      return includeBg ? 'bg-red-500/20 text-red-500' : 'text-red-500';
    case 'medium':
      return includeBg ? 'bg-yellow-500/20 text-yellow-500' : 'text-yellow-500';
    case 'low':
      return includeBg ? 'bg-blue-500/20 text-blue-500' : 'text-blue-500';
    default:
      return includeBg ? 'bg-gray-500/20 text-gray-500' : 'text-gray-500';
  }
}

export function getDirectionColor(direction: string): string {
  switch (direction.toLowerCase()) {
    case 'buy':
      return 'bg-green-500/20 text-green-500';
    case 'sell':
      return 'bg-red-500/20 text-red-500';
    default:
      return 'bg-gray-500/20 text-gray-500';
  }
}

export function getStrengthColor(strength: string): string {
  switch (strength.toLowerCase()) {
    case 'strong':
      return 'bg-red-500/20 text-red-500';
    case 'moderate':
      return 'bg-yellow-500/20 text-yellow-500';
    case 'weak':
      return 'bg-blue-500/20 text-blue-500';
    default:
      return 'bg-gray-500/20 text-gray-500';
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = error => reject(error);
  });
}

/**
 * Normalizes an image URL to ensure it loads properly across the application
 * @param imageUrl The raw image URL from the database
 * @returns A properly formatted URL for loading the image
 */
export function normalizeImageUrl(imageUrl: string): string {
  if (!imageUrl) return '';
  
  // If it's an external URL (starts with http), use it as is
  if (imageUrl.startsWith('http')) {
    return imageUrl;
  }
  
  // If it's already an API endpoint URL, use it as is (preserves annotated-image URLs)
  if (imageUrl.startsWith('/api/')) {
    return imageUrl;
  }
  
  // If it's a path with /uploads/ prefix, extract the filename and use shared-image endpoint
  if (imageUrl.startsWith('/uploads/')) {
    const filename = imageUrl.split('/').pop();
    return `/api/shared-image/${filename}`;
  }
  
  // If it's just a filename, assume it's in uploads dir
  if (!imageUrl.includes('/')) {
    return `/api/shared-image/${imageUrl}`;
  }
  
  // Default case - use shared-image endpoint with extracted filename
  return `/api/shared-image/${imageUrl.split('/').pop()}`;
}
