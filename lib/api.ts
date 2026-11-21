/** API helpers: uniform error shape { error: { code, message } } (PRD §13). */
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export function parseQuery<T extends z.ZodType>(req: Request, schema: T): { ok: true; data: z.infer<T> } | { ok: false; res: Response } {
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const r = schema.safeParse(raw);
  if (!r.success) return { ok: false, res: apiError(400, 'invalid_query', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')) };
  return { ok: true, data: r.data };
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: Response }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false, res: apiError(400, 'invalid_json', 'Body must be JSON') };
  }
  const r = schema.safeParse(json);
  if (!r.success) return { ok: false, res: apiError(400, 'invalid_body', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')) };
  return { ok: true, data: r.data };
}

export async function limitOr429(req: Request, scope: string, limit: number, windowSec: number): Promise<Response | null> {
  const r = await rateLimit(clientKey(req, scope), { limit, windowSec });
  if (r.ok) return null;
  const res = apiError(429, 'rate_limited', 'Too many requests. Please try again shortly.');
  res.headers.set('retry-after', String(r.retryAfterSec));
  return res;
}
