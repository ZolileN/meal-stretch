/** Line accuracy for the extraction harness (Phase 7 DoD: ≥ 90%). A line counts when price and name agree. */
import { normaliseProductName } from '@/lib/prices/match';

export interface ExpectedLine {
  raw_name: string;
  price_cents: number;
}

function similar(a: string, b: string): boolean {
  const x = normaliseProductName(a);
  const y = normaliseProductName(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const grams = (s: string) => new Set([...Array(Math.max(0, s.length - 2)).keys()].map((i) => s.slice(i, i + 3)));
  const gx = grams(x);
  const gy = grams(y);
  const inter = [...gx].filter((g) => gy.has(g)).length;
  return inter / Math.max(1, gx.size + gy.size - inter) >= 0.4;
}

export function lineAccuracy(expected: ExpectedLine[], actual: ExpectedLine[]): number {
  if (expected.length === 0) return actual.length === 0 ? 1 : 0;
  const pool = [...actual];
  let hit = 0;
  for (const e of expected) {
    const i = pool.findIndex((a) => a.price_cents === e.price_cents && similar(a.raw_name, e.raw_name));
    if (i >= 0) {
      hit++;
      pool.splice(i, 1);
    }
  }
  // extra hallucinated lines count against accuracy
  return hit / (expected.length + pool.length);
}
