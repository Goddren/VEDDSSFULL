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

  // Font sizes match the on-screen CSS preview's proportions (heading/body
  // relative to card width), scaled up to the 1080px bake canvas — the old
  // fixed 54/34px sizes were noticeably smaller than what the preview showed,
  // so the baked download looked like a downgrade from what the user saw.
  const HEADING_SIZE = 80;
  const BODY_SIZE = 48;
  const headingLines = opts.heading ? wrapText(opts.heading, 16, 3) : [];
  const bodyLines = opts.body ? wrapText(opts.body, 27, 4) : [];

  const hasText = headingLines.length > 0 || bodyLines.length > 0;
  const gradientHeight = hasText ? Math.min(CANVAS_SIZE * 0.6, 180 + (headingLines.length + bodyLines.length) * 76) : 0;

  // VEDD Content Style Guide palette: gold accent divider/eyebrow, white
  // headline, near-black (#0A0A0B) fade instead of a generic pure-black one.
  const GOLD = '#F0D269';
  const NEAR_BLACK = '#0A0A0B';

  const textSvgParts: string[] = [];
  let y = CANVAS_SIZE - gradientHeight + 100;
  if (headingLines.length > 0) {
    // Small gold divider above the headline, matching every branded card's
    // accent-colored rule. Sits a full line above the heading's baseline so
    // it never overlaps the cap-height of the first line of text.
    textSvgParts.push(`<rect x="48" y="${y - 96}" width="60" height="5" fill="${GOLD}" />`);
  }
  for (const line of headingLines) {
    textSvgParts.push(`<text x="48" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${HEADING_SIZE}" font-weight="800" fill="#ffffff">${escapeXml(line)}</text>`);
    y += 88;
  }
  y += 12;
  for (const line of bodyLines) {
    textSvgParts.push(`<text x="48" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${BODY_SIZE}" font-weight="400" fill="#e5e5e5">${escapeXml(line)}</text>`);
    y += 60;
  }

  const overlaySvg = `
    <svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
      ${hasText ? `
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${NEAR_BLACK}" stop-opacity="0" />
          <stop offset="100%" stop-color="${NEAR_BLACK}" stop-opacity="0.88" />
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
