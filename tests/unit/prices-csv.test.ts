import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv, validateCsv } from '@/lib/prices/csv';

const H = 'retailer_id,branch_id,product_name,brand,pack_qty,pack_unit,ingredient_id,price_cents,member_price_cents,special_price_cents,special_ends_on,observed_at';
const now = new Date('2026-11-21T10:00:00Z');

describe('CSV parsing', () => {
  it('handles quotes, escaped quotes and comments', () => {
    const rows = parseCsv('# comment\na,"b, c","say ""hi"""\n\nx,y,z');
    expect(rows.map((r) => r.cells)).toEqual([['a', 'b, c', 'say "hi"'], ['x', 'y', 'z']]);
    expect(rows[0]!.line).toBe(2);
  });
});

describe('CSV validation (Zod per row)', () => {
  it('accepts good rows and converts kg/l', () => {
    const { rows, rejected } = validateCsv(
      `${H}\ncheckers,,Beef Mince,FIXTURE,1.5,kg,beef_mince,9999,,8999,2026-11-25,2026-11-20\nshoprite,12,Milk,,2,l,milk,3999,3499,,,2026-11-20T08:00:00Z`,
      now,
    );
    expect(rejected).toEqual([]);
    expect(rows[0]).toMatchObject({ pack_qty: 1500, pack_unit: 'g', special_price_cents: 8999, member_price_cents: null, branch_id: null });
    expect(rows[1]).toMatchObject({ pack_qty: 2000, pack_unit: 'ml', branch_id: 12, member_price_cents: 3499 });
  });

  it('rejects rows with reasons and line numbers', () => {
    const { rows, rejected } = validateCsv(
      [
        H,
        'checkers,,Beef,,500,g,beef_mince,79.99,,,,2026-11-20', // float money
        'checkers,,Beef,,500,g,beef_mince,7999,,8999,,2026-11-20', // special above shelf
        'checkers,,Beef,,500,lb,beef_mince,7999,,,,2026-11-20', // bad unit
        'checkers,,Beef,,500,g,beef_mince,0,,,,2026-11-20', // zero price
        'checkers,,Beef,,500,g,beef_mince,7999,,,,2026-12-25', // future
        'checkers,,Beef,,500,g,beef_mince,7999,,,,yesterday', // bad date
        'checkers,,Beef,,500,g,beef_mince,600000,,,,2026-11-20', // > R5,000
        'checkers,,Beef,,500', // wrong column count
        'Checkers!,,Beef,,500,g,beef_mince,7999,7999,,,2026-11-20', // bad retailer + member not below shelf
      ].join('\n'),
      now,
    );
    expect(rows).toEqual([]);
    expect(rejected.map((r) => r.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rejected[0]!.reasons.join()).toMatch(/whole cents/);
    expect(rejected[1]!.reasons.join()).toMatch(/special must be below/);
    expect(rejected[4]!.reasons.join()).toMatch(/future/);
    expect(rejected[6]!.reasons.join()).toMatch(/R5,000/);
    expect(rejected[7]!.reasons.join()).toMatch(/columns/);
    expect(rejected[8]!.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('reports missing columns', () => {
    const { rejected } = validateCsv('retailer_id,price_cents\ncheckers,100', now);
    expect(rejected[0]!.reasons[0]).toMatch(/missing columns/);
  });

  it('the fixture CSV is valid and labelled fictional', () => {
    const text = readFileSync('seed/prices.fixture.csv', 'utf8');
    expect(text.split('\n')[0]).toMatch(/FICTIONAL/);
    const { rows, rejected } = validateCsv(text, new Date('2100-01-01'));
    expect(rejected).toEqual([]);
    expect(rows.length).toBeGreaterThan(300);
    expect(new Set(rows.map((r) => r.retailer_id))).toEqual(new Set(['checkers', 'shoprite', 'pnp', 'spar', 'usave']));
    expect(rows.some((r) => r.special_price_cents !== null)).toBe(true);
    expect(rows.some((r) => r.member_price_cents !== null)).toBe(true);
    expect(rows.every((r) => r.brand === 'FIXTURE')).toBe(true);
  });
});
