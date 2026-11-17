/**
 * Auto-generates a VEDD blog post every Wednesday and Friday, so the
 * community gets fresh content without an admin manually clicking
 * "Generate" — same underlying pipeline as POST /api/blog/generate,
 * just triggered on a schedule instead of an HTTP call.
 */
import { generateVeddBlogPost } from '../openai';
import { storage } from '../storage';
import { persistRemoteAsset } from './content-asset-store';
import { loopTick } from '../crash-heartbeat';
import { recordProcessError } from '../process-guards';

const TARGET_UTC_DAYS = [3, 5]; // Wednesday, Friday (Date#getUTCDay())
const RUN_HOUR_UTC = 13; // 13:00 UTC — after the 09:00 UTC ambassador-prime run

async function runScheduledBlogPost() {
  try {
    const generated = await generateVeddBlogPost(undefined, 0);

    let coverImage: string | undefined;
    try {
      const { generateContentImage } = await import('./image-generation');
      const image = await generateContentImage(`Blog cover image for an article titled "${generated.title}": ${generated.excerpt}`, 'blog-cover');
      if (image?.url) {
        const persisted = await persistRemoteAsset(image.url);
        coverImage = persisted?.url ?? image.url;
      }
    } catch (err: any) {
      console.error('[blog-scheduler] cover image generation failed (non-fatal):', err.message);
    }

    const saved = await storage.createBlogPost({
      ...generated,
      coverImage,
      isPublished: true,
      isFeatured: false,
      aiGenerated: true,
      publishedAt: new Date(),
      tags: generated.tags,
    } as any);
    console.log(`[blog-scheduler] Published "${saved.title}" (slug: ${saved.slug})`);
  } catch (e: any) {
    console.error('[blog-scheduler] Scheduled run error:', e.message);
  }
}

export function startBlogPostScheduler() {
  function scheduleNext() {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(RUN_HOUR_UTC, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    while (!TARGET_UTC_DAYS.includes(next.getUTCDay())) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    console.log(`[blog-scheduler] Next auto blog post at ${next.toISOString()} (in ${Math.round(delay / 60000)} min)`);
    // Crash-hunt hardening (2026-11-16): the re-arm used to sit after the
    // await with no guard — any escape from runScheduledBlogPost (whose own
    // catch ends in console.error, so a throw inside that path counts)
    // killed the scheduler permanently. Re-arm now lives in `finally`.
    setTimeout(async () => {
      try {
        await runScheduledBlogPost();
        loopTick('blog-scheduler');
      } catch (err) {
        recordProcessError('guardedJob', err, 'blog-scheduler');
      } finally {
        scheduleNext();
      }
    }, delay);
  }
  scheduleNext();
}
