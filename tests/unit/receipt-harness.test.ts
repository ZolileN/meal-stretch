import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { lineAccuracy } from '@/lib/receipts/score';

describe('line accuracy scoring', () => {
  it('scores matches, misses and extras', () => {
    const exp = [{ raw_name: 'BEEF MINCE 1KG', price_cents: 8999 }, { raw_name: 'MAIZE MEAL 5KG', price_cents: 6999 }];
    expect(lineAccuracy(exp, [{ raw_name: 'Beef mince 1kg', price_cents: 8999 }, { raw_name: 'Super maize meal 5kg', price_cents: 6999 }])).toBe(1);
    expect(lineAccuracy(exp, [{ raw_name: 'Beef mince', price_cents: 8999 }])).toBe(0.5);
    expect(lineAccuracy(exp, [...exp, { raw_name: 'Ghost', price_cents: 1 }])).toBeCloseTo(2 / 3);
  });
});

// Extraction harness over real slips: skipped until someone adds photos (docs/human-todo.md).
const dir = 'fixtures/receipts';
const recorded = 'fixtures/claude/receipt-harness';
const photos = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : [];
describe.skipIf(photos.length === 0 || !existsSync(recorded))('receipt extraction harness (recorded)', () => {
  it('recorded extractions reach ≥ 90% line accuracy', () => {
    const scores = photos.map((p) => {
      const expected = JSON.parse(readFileSync(`${dir}/${p.replace(/\.\w+$/, '')}.expected.json`, 'utf8'));
      const rec = readdirSync(recorded).find((f) => f.startsWith(p));
      if (!rec) return 0;
      return lineAccuracy(expected.lines, JSON.parse(readFileSync(`${recorded}/${rec}`, 'utf8')).lines);
    });
    expect(scores.reduce((a, b) => a + b, 0) / scores.length).toBeGreaterThanOrEqual(0.9);
  });
});
