import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from 'canvas';

/**
 * Adds a VEDDAI watermark to an image and saves it to the uploads/shared directory
 * @param originalImagePath The path to the original image
 * @param outputFilename The filename to save the watermarked image as
 * @returns The path to the watermarked image
 */
export async function addWatermarkToImage(originalImagePath: string, outputFilename: string): Promise<string> {
  try {
    // Load the original image
    const image = await loadImage(originalImagePath);
    
    // Create a canvas with the same dimensions as the image
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    
    // Draw the original image on the canvas
    ctx.drawImage(image, 0, 0, image.width, image.height);
    
    // Add a semi-transparent overlay in the bottom-right corner
    const logoWidth = Math.min(image.width * 0.25, 150); // Logo width is 25% of image width, max 150px
    const logoHeight = logoWidth * 0.4; // Maintain aspect ratio
    const padding = 20;
    
    // Set the position (bottom-right corner with padding)
    const logoX = image.width - logoWidth - padding;
    const logoY = image.height - logoHeight - padding;
    
    // Draw a semi-transparent background for the logo
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(logoX, logoY, logoWidth, logoHeight);
    
    // Draw the VEDDAI text as a logo
    ctx.fillStyle = 'white';
    ctx.font = `bold ${logoHeight * 0.6}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VEDDAI', logoX + logoWidth / 2, logoY + logoHeight / 2);
    
    // Add a small tagline below the logo
    ctx.font = `${logoHeight * 0.25}px Arial`;
    ctx.fillText('AI-Powered Trading Analysis', logoX + logoWidth / 2, logoY + logoHeight * 0.75);
    
    // Ensure the shared directory exists
    const sharedDir = path.join('uploads', 'shared');
    if (!fs.existsSync(sharedDir)) {
      fs.mkdirSync(sharedDir, { recursive: true });
    }
    
    // Save the image to the shared directory
    const outputPath = path.join(sharedDir, outputFilename);
    const out = fs.createWriteStream(outputPath);
    const stream = canvas.createJPEGStream({ quality: 0.95 });
    
    return new Promise((resolve, reject) => {
      stream.pipe(out);
      out.on('finish', () => resolve(outputPath));
      out.on('error', reject);
    });
  } catch (error) {
    console.error('Error adding watermark to image:', error);
    throw error;
  }
}

/**
 * Creates a shared image URL for a watermarked image
 * @param filename The filename of the watermarked image
 * @returns The URL to access the shared image
 */
export function createSharedImageUrl(filename: string): string {
  return `/api/shared-image/${filename}`;
}