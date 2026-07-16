// ── Slide flattener — bakes caption text (and optionally the VEDD logo) ─────
// directly onto a generated image into ONE file, so an ambassador can save
// it straight to their phone and upload to Instagram/TikTok/etc. in one tap
// instead of juggling a separate image + caption text.

import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';

const CANVAS_SIZE = 1080; // standard square social-post size
const LOGO_PATH = path.join(process.cwd(), 'attached_assets', 'IMG_3645.png');

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Rough character-width-based word wrap — good enough for a fixed-width SVG
// text block without needing real font metrics.
function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/.{3}$/, '...');
  }
  return lines;
}

export interface FlattenSlideOptions {
  imageBuffer: Buffer;
  heading?: string | null;
  body?: string | null;
  includeLogo?: boolean;
}

/**
 * Composites caption text (and optionally the VEDD logo) onto a base image,
 * returning one flattened PNG buffer ready to download/share directly.
 */
export async function flattenSlideImage(opts: FlattenSlideOptions): Promise<Buffer> {
  const base = await sharp(opts.imageBuffer)
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'cover', position: 'attention' })
    .toBuffer();

  const headingLines = opts.heading ? wrapText(opts.heading, 24, 3) : [];
  const bodyLines = opts.body ? wrapText(opts.body, 40, 4) : [];

  const hasText = headingLines.length > 0 || bodyLines.length > 0;
  const gradientHeight = hasText ? Math.min(CANVAS_SIZE * 0.55, 140 + (headingLines.length + bodyLines.length) * 46) : 0;

  const textSvgParts: string[] = [];
  let y = CANVAS_SIZE - gradientHeight + 60;
  for (const line of headingLines) {
    textSvgParts.push(`<text x="48" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="800" fill="#ffffff">${escapeXml(line)}</text>`);
    y += 60;
  }
  y += 8;
  for (const line of bodyLines) {
    textSvgParts.push(`<text x="48" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="400" fill="#e5e5e5">${escapeXml(line)}</text>`);
    y += 42;
  }

  const overlaySvg = `
    <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
      ${hasText ? `
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#000000" stop-opacity="0" />
          <stop offset="100%" stop-color="#000000" stop-opacity="0.82" />
        </linearGradient>
      </defs>
      <rect x="0" y="${CANVAS_SIZE - gradientHeight}" width="${CANVAS_SIZE}" height="${gradientHeight}" fill="url(#fade)" />
      ` : ''}
      ${textSvgParts.join('\n')}
    </svg>
  `;

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(overlaySvg), top: 0, left: 0 },
  ];

  if (opts.includeLogo && fs.existsSync(LOGO_PATH)) {
    const logoWidth = Math.round(CANVAS_SIZE * 0.22);
    const logoBuffer = await sharp(LOGO_PATH)
      .resize(logoWidth, null, { fit: 'inside' })
      .ensureAlpha()
      .png()
      .toBuffer();
    const logoMeta = await sharp(logoBuffer).metadata();
    const margin = 32;
    composites.push({
      input: logoBuffer,
      left: CANVAS_SIZE - (logoMeta.width ?? logoWidth) - margin,
      top: CANVAS_SIZE - (logoMeta.height ?? logoWidth) - margin,
    });
  }

  return sharp(base).composite(composites).png().toBuffer();
}
