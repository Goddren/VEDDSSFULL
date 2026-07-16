// ── Content Studio durable asset store ──────────────────────────────────────
// DALL-E and Replicate both hand back TEMPORARY hosted URLs — re-hosting the
// actual bytes (base64 in Postgres, same philosophy as cred-store.ts) is what
// makes generated content survive past the provider's expiry window and past
// Render's ephemeral-disk redeploys. Every step here is best-effort: if
// persistence fails for any reason, callers should fall back to the raw
// provider URL rather than blocking the user's generation result.

import { pool } from '../db';

const MAX_ASSET_BYTES = 25 * 1024 * 1024; // 25MB raw — generous for a DALL-E PNG or a short Wan-2.2 clip

export interface PersistedAsset {
  id: number;
  url: string; // permanent, app-hosted URL
  mimeType: string;
}

/**
 * Downloads a remote (temporary) asset URL and stores its bytes permanently.
 * Returns null (never throws) on any failure — the caller should fall back
 * to the original remote URL rather than treat this as fatal.
 */
export async function persistRemoteAsset(remoteUrl: string): Promise<PersistedAsset | null> {
  try {
    const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) {
      console.error(`[content-asset-store] fetch failed for ${remoteUrl}: ${res.status}`);
      return null;
    }
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_ASSET_BYTES) {
      console.error(`[content-asset-store] asset too large to persist (${buf.byteLength} bytes) — falling back to remote URL`);
      return null;
    }
    const base64 = buf.toString('base64');
    const { rows } = await pool.query(
      `INSERT INTO content_studio_assets (mime_type, data) VALUES ($1, $2) RETURNING id`,
      [contentType, base64],
    );
    const id = rows[0].id as number;
    return { id, url: `/api/content-studio/asset/${id}`, mimeType: contentType };
  } catch (err: any) {
    console.error('[content-asset-store] persistRemoteAsset failed (non-fatal):', err?.message ?? err);
    return null;
  }
}

/** Fetches a previously-persisted asset's bytes + mime type by id, for the serving route. */
export async function getPersistedAsset(id: number): Promise<{ mimeType: string; data: Buffer } | null> {
  try {
    const { rows } = await pool.query(`SELECT mime_type, data FROM content_studio_assets WHERE id = $1`, [id]);
    if (rows.length === 0) return null;
    return { mimeType: rows[0].mime_type, data: Buffer.from(rows[0].data, 'base64') };
  } catch (err: any) {
    console.error('[content-asset-store] getPersistedAsset failed:', err?.message ?? err);
    return null;
  }
}
