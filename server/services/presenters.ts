/**
 * My Presenter — a saved face for Content Studio generation.
 *
 * A user uploads a photo of themselves once; the photo is stored in the
 * durable asset store (content-asset-store.ts) and the presenter row points
 * at it. Clips and reels pass the photo as the image-to-video start image;
 * explainers film every scene from it (see explainer-video.ts). Rows are
 * strictly per-user: every read/write is scoped by user_id.
 */

import { pool } from '../db';

export interface Presenter {
  id: number;
  name: string;
  imageUrl: string; // app-relative durable URL, /api/content-studio/asset/:id
  createdAt: string;
}

let tableReady: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  return (tableReady ??= pool.query(`CREATE TABLE IF NOT EXISTS content_presenters (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`).then(() => undefined).catch((e) => { tableReady = null; throw e; }));
}

function rowToPresenter(r: any): Presenter {
  return { id: r.id, name: r.name, imageUrl: r.image_url, createdAt: r.created_at };
}

export async function listPresenters(userId: number): Promise<Presenter[]> {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT id, name, image_url, created_at FROM content_presenters WHERE user_id=$1 ORDER BY created_at DESC`,
    [userId]);
  return rows.map(rowToPresenter);
}

export async function createPresenter(userId: number, name: string, imageUrl: string): Promise<Presenter> {
  await ensureTable();
  const { rows } = await pool.query(
    `INSERT INTO content_presenters (user_id, name, image_url) VALUES ($1,$2,$3)
     RETURNING id, name, image_url, created_at`,
    [userId, name, imageUrl]);
  return rowToPresenter(rows[0]);
}

export async function getPresenter(userId: number, id: number): Promise<Presenter | null> {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT id, name, image_url, created_at FROM content_presenters WHERE id=$1 AND user_id=$2`,
    [id, userId]);
  return rows.length ? rowToPresenter(rows[0]) : null;
}

export async function deletePresenter(userId: number, id: number): Promise<boolean> {
  await ensureTable();
  const { rowCount } = await pool.query(
    `DELETE FROM content_presenters WHERE id=$1 AND user_id=$2`, [id, userId]);
  return (rowCount ?? 0) > 0;
}

/**
 * Absolute, provider-fetchable URL for a presenter's photo. Asset URLs are
 * app-relative (/api/content-studio/asset/:id); Replicate and fal fetch the
 * start image over the public internet, so resolve against the origin of
 * the request that asked for the generation.
 */
export function presenterAbsoluteUrl(req: any, imageUrl: string): string {
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const host = req && typeof req.get === 'function' ? req.get('host') : null;
  if (!host) return imageUrl;
  return `${req.protocol || 'https'}://${host}${imageUrl}`;
}
