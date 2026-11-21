/**
 * Fixed-window rate limiter. The default store is in-memory (per server instance), which is enough to
 * stop accidental hammering of Google/Claude-backed routes; hard cost caps (Claude daily caps) are
 * DB-backed separately (lib/claude.ts).
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Promise<number> | number;
}

export class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { start: number; count: number }>();
  hit(key: string, windowMs: number, now: number) {
    const b = this.buckets.get(key);
    if (!b || now - b.start >= windowMs) {
      this.buckets.set(key, { start: now, count: 1 });
      if (this.buckets.size > 10_000) this.sweep(windowMs, now);
      return 1;
    }
    b.count += 1;
    return b.count;
  }
  private sweep(windowMs: number, now: number) {
    for (const [k, v] of this.buckets) if (now - v.start >= windowMs) this.buckets.delete(k);
  }
}

const defaultStore = new MemoryStore();

export interface LimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export async function rateLimit(
  key: string,
  opts: { limit: number; windowSec: number; now?: number; store?: RateLimitStore },
): Promise<LimitResult> {
  const now = opts.now ?? Date.now();
  const count = await (opts.store ?? defaultStore).hit(key, opts.windowSec * 1000, now);
  return { ok: count <= opts.limit, remaining: Math.max(0, opts.limit - count), retryAfterSec: opts.windowSec };
}

/** Best-effort client key from proxy headers (never stored). */
export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = fwd || req.headers.get('x-real-ip') || 'local';
  return `${scope}:${ip}`;
}
