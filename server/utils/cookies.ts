import type { Request } from 'express';

/** Parse a named cookie from the raw Cookie header without requiring cookie-parser. */
export function getRequestCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie || '';
  const match = header.match(new RegExp(`(?:^|; )${encodeURIComponent(name)}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
