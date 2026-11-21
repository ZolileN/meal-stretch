import { describe, expect, it } from 'vitest';
import { extractionSchema, totalsMatch, validateLines } from '@/lib/extraction';
import { stripPii, stripPiiDeep } from '@/lib/receipts/pii';
import { normaliseProductName, parseSize } from '@/lib/prices/match';

describe('extraction Zod validation (§10.4)', () => {
  it('rejects bad documents', () => {
    expect(extractionSchema.safeParse({ document_type: 'menu', retailer: 'x', lines: [] }).success).toBe(false);
    expect(extractionSchema.safeParse({ document_type: 'receipt', retailer: '', lines: [] }).success).toBe(false);
    expect(extractionSchema.safeParse({ document_type: 'receipt', retailer: 'Checkers', lines: 'x' }).success).toBe(false);
    expect(extractionSchema.safeParse({ document_type: 'receipt', retailer: 'Checkers', date: '21/11/2026', lines: [] }).success).toBe(false);
    expect(extractionSchema.parse({ document_type: 'receipt', retailer: 'Checkers', lines: [] })).toMatchObject({ branch_text: null, total_cents: null });
  });
  it('rejects lines with price ≤ 0 or > R5,000 or float cents, keeps the rest', () => {
    const r = validateLines([
      { raw_name: 'BEEF MINCE', price_cents: 8999 },
      { raw_name: 'VOID', price_cents: 0 },
      { raw_name: 'TV', price_cents: 500_001 },
      { raw_name: 'MILK', price_cents: 21.99 },
      { raw_name: 'RICE 2KG', price_cents: 3999, quantity: 2, was_price_cents: 4499, member_only: true, confidence: 0.9 },
    ]);
    expect(r.lines.map((l) => l.raw_name)).toEqual(['BEEF MINCE', 'RICE 2KG']);
    expect(r.lines[0]).toMatchObject({ quantity: 1, member_only: false, was_price_cents: null });
    expect(r.rejected.map((x) => x.index)).toEqual([1, 2, 3]);
  });
  it('totals within ±2%', () => {
    const lines = validateLines([{ raw_name: 'a', price_cents: 10_000 }, { raw_name: 'b', price_cents: 5_000 }]).lines;
    expect(totalsMatch(lines, 15_000)).toBe(true);
    expect(totalsMatch(lines, 15_300)).toBe(true);
    expect(totalsMatch(lines, 15_400)).toBe(false);
    expect(totalsMatch(lines, null)).toBe(false);
  });
});

describe('PII stripping (RCP-6)', () => {
  it.each([
    ['CARD 4111 1111 1111 1111 APPROVED', 'CARD [removed] APPROVED'],
    ['VISA ************1234', 'VISA [removed]'],
    ['Call us 021 555 1234', 'Call us [removed]'],
    ['+27 82 123 4567 queries', '[removed] queries'],
    ['Cashier: Thandi Mokoena', 'Cashier: [removed]'],
    ['Member: J Smith XTRA', 'Member: [removed]'],
    ['ID 8001015009087', 'ID [removed]'],
    ['email me@example.co.za', 'email [removed]'],
  ])('%s', (input, out) => expect(stripPii(input)).toBe(out));
  it('keeps product lines intact', () => {
    expect(stripPii('BEEF MINCE 1KG')).toBe('BEEF MINCE 1KG');
    expect(stripPii('PILCHARDS 400G 2 @ 23.99')).toBe('PILCHARDS 400G 2 @ 23.99');
  });
  it('deep strips extraction objects', () => {
    const v = stripPiiDeep({ branch_text: 'Checkers Somerset Mall tel 021 555 1234', lines: [{ raw_name: 'Cashier: Ann Lee', price_cents: 1 }] });
    expect(v.branch_text).toBe('Checkers Somerset Mall tel [removed]');
    expect(v.lines[0]!.raw_name).toBe('Cashier: [removed]');
    expect(v.lines[0]!.price_cents).toBe(1);
  });
});

describe('matching normalisation (§10.3)', () => {
  it.each([
    ['2kg', { qty: 2000, unit: 'g' }],
    ['750ml', { qty: 750, unit: 'ml' }],
    ['1.5 L', { qty: 1500, unit: 'ml' }],
    ['6s', { qty: 6, unit: 'unit' }],
    ['6 x 410g', { qty: 2460, unit: 'g' }],
    ['BEEF MINCE 500G', { qty: 500, unit: 'g' }],
    ['', null],
  ])('parseSize(%s)', (s, out) => expect(parseSize(s)).toEqual(out));
  it('strips sizes and noise words', () => {
    expect(normaliseProductName('FIXTURE Beef Mince 1kg')).toBe('beef mince');
    expect(normaliseProductName('Checkers Chopped Tomatoes 410G')).toBe('chopped tomatoes');
  });
});
