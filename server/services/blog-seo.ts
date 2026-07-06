// Server-side per-article SEO meta injection for /blog/:slug.
//
// The app is a pure client-rendered SPA with no SSR — social link-unfurl
// bots (Slack, X, Facebook, LinkedIn, iMessage) and most crawlers read the
// static HTML response directly and never execute JavaScript, so a
// client-side document.title change is invisible to them. This rewrites
// the static meta tags in the HTML response itself before it's served,
// for exactly the request whose URL matches a blog article.

import { storage } from '../storage';

const BASE_URL = 'https://veddbuild.com';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function injectBlogSeoMeta(html: string, url: string): Promise<string> {
  const match = url.match(/^\/blog\/([^/?]+)/);
  if (!match) return html;

  let post;
  try {
    const slug = decodeURIComponent(match[1]);
    post = await storage.getBlogPostBySlug(slug);
  } catch {
    return html;
  }
  if (!post || !post.isPublished) return html;

  const title = escapeHtml(`${post.title} | VEDD AI Trading Vault`);
  const description = escapeHtml(
    (post.excerpt || stripHtml(post.content || '')).slice(0, 200)
  );
  const pageUrl = `${BASE_URL}/blog/${post.slug}`;
  const image = (post as any).coverImage
    ? String((post as any).coverImage).startsWith('http')
      ? (post as any).coverImage
      : `${BASE_URL}${(post as any).coverImage}`
    : `${BASE_URL}/og-image.png`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.excerpt || undefined,
    "image": image,
    "datePublished": post.publishedAt ? new Date(post.publishedAt).toISOString() : undefined,
    "dateModified": post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
    "author": { "@type": "Organization", "name": "VEDD AI" },
    "publisher": {
      "@type": "Organization",
      "name": "VEDD AI Trading Vault",
      "logo": { "@type": "ImageObject", "url": `${BASE_URL}/icons/icon-192x192.png` },
    },
    "mainEntityOfPage": { "@type": "WebPage", "@id": pageUrl },
  };

  let out = html;
  out = out.replace(/<title>.*?<\/title>/s, `<title>${title}</title>`);
  out = out.replace(/<meta name="description" content=".*?"\s*\/>/s, `<meta name="description" content="${description}" />`);
  out = out.replace(/<link rel="canonical" href=".*?"\s*\/>/s, `<link rel="canonical" href="${pageUrl}" />`);
  out = out.replace(/<meta property="og:type" content=".*?"\s*\/>/s, `<meta property="og:type" content="article" />`);
  out = out.replace(/<meta property="og:url" content=".*?"\s*\/>/s, `<meta property="og:url" content="${pageUrl}" />`);
  out = out.replace(/<meta property="og:title" content=".*?"\s*\/>/s, `<meta property="og:title" content="${title}" />`);
  out = out.replace(/<meta property="og:description" content=".*?"\s*\/>/s, `<meta property="og:description" content="${description}" />`);
  out = out.replace(/<meta property="og:image" content=".*?"\s*\/>/s, `<meta property="og:image" content="${image}" />`);
  out = out.replace(/<meta name="twitter:url" content=".*?"\s*\/>/s, `<meta name="twitter:url" content="${pageUrl}" />`);
  out = out.replace(/<meta name="twitter:title" content=".*?"\s*\/>/s, `<meta name="twitter:title" content="${title}" />`);
  out = out.replace(/<meta name="twitter:description" content=".*?"\s*\/>/s, `<meta name="twitter:description" content="${description}" />`);
  out = out.replace(/<meta name="twitter:image" content=".*?"\s*\/>/s, `<meta name="twitter:image" content="${image}" />`);
  out = out.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
  );
  return out;
}
