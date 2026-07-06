// Per-article Open Graph social share image — every shared blog link
// previously fell back to the same static og-image.png regardless of which
// article it was. Renders a 1200×630 card (title + category + VEDD branding)
// using the `canvas` package, which is already a soft dependency elsewhere
// in this codebase (certificate-service.ts, image-processor.ts) with the
// same lazy-import-and-degrade-gracefully pattern reused here.

function wrapText(ctx: any, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…');
  }
  return lines;
}

export async function generateBlogOgImage(title: string, category: string): Promise<Buffer> {
  let createCanvas: any;
  try {
    ({ createCanvas } = await import('canvas' as any));
  } catch {
    throw new Error('OG image generation unavailable: canvas module not installed on this host');
  }

  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0a0a14');
  gradient.addColorStop(1, '#12060a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Accent glow, top-left
  const glow = ctx.createRadialGradient(150, 100, 0, 150, 100, 500);
  glow.addColorStop(0, 'rgba(220,38,38,0.35)');
  glow.addColorStop(1, 'rgba(220,38,38,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(220,38,38,0.4)';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, width - 48, height - 48);

  // Category badge
  ctx.font = 'bold 22px Arial';
  const badgeText = category.toUpperCase();
  const badgeWidth = ctx.measureText(badgeText).width + 48;
  ctx.fillStyle = 'rgba(220,38,38,0.18)';
  ctx.strokeStyle = 'rgba(220,38,38,0.5)';
  ctx.lineWidth = 1.5;
  const badgeX = 72, badgeY = 90, badgeH = 44;
  ctx.beginPath();
  (ctx as any).roundRect ? (ctx as any).roundRect(badgeX, badgeY, badgeWidth, badgeH, 22) : ctx.rect(badgeX, badgeY, badgeWidth, badgeH);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f87171';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + 24, badgeY + badgeH / 2 + 1);

  // Title
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 58px Arial';
  const titleLines = wrapText(ctx, title, width - 144, 3);
  let titleY = 240;
  for (const line of titleLines) {
    ctx.fillText(line, 72, titleY);
    titleY += 68;
  }

  // VEDD wordmark, bottom-left
  ctx.fillStyle = '#dc2626';
  ctx.font = 'bold 32px Arial';
  ctx.fillText('VEDD', 72, height - 72);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '22px Arial';
  ctx.fillText('AI Trading Vault', 175, height - 72);

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '20px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('veddbuild.com/blog', width - 72, height - 72);

  return canvas.toBuffer('image/png');
}
