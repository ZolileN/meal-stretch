import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  assertCents, divRound, formatRand, formatRandShort, isCents, MoneyError, parseDecimalToCents, parseRand, percent,
  randsToCents, sumCents,
} from '@/lib/money';

describe('formatRand', () => {
  it.each([
    [0, 'R0.00'],
    [5, 'R0.05'],
    [99, 'R0.99'],
    [100, 'R1.00'],
    [123450, 'R1,234.50'],
    [100000000, 'R1,000,000.00'],
    [-500, '-R5.00'],
    [-123450, '-R1,234.50'],
  ])('%i → %s', (cents, out) => expect(formatRand(cents)).toBe(out));

  it('short form drops .00 only', () => {
    expect(formatRandShort(40600)).toBe('R406');
    expect(formatRandShort(7999)).toBe('R79.99');
    expect(formatRandShort(-2200)).toBe('-R22');
  });

  it('signed deltas', () => {
    expect(formatRandShort(1500, { signed: true })).toBe('+R15');
    expect(formatRandShort(-2200, { signed: true })).toBe('-R22');
    expect(formatRandShort(0, { signed: true })).toBe('R0');
  });

  it('rejects non-integer cents', () => {
    expect(() => formatRand(12.5)).toThrow(MoneyError);
    expect(() => formatRand(Number.NaN)).toThrow(MoneyError);
  });
});

describe('parseRand', () => {
  it.each([
    ['R1,234.50', 123450],
    ['1234.5', 123450],
    ['R 1 234.50', 123450],
    ['12', 1200],
    ['r79.99', 7999],
    ['-R5', -500],
    ['−R5.00', -500],
    ['0.05', 5],
  ])('%s → %i', (s, c) => expect(parseRand(s)).toBe(c));

  it.each(['', 'abc', '1.234', '12,5', 'R1,23', '1.2.3', 'R'])('rejects %s', (s) => expect(parseRand(s)).toBeNull());

  it('round-trips formatRand', () => {
    fc.assert(fc.property(fc.integer({ min: -1e10, max: 1e10 }), (c) => parseRand(formatRand(c)) === c));
  });
});

describe('helpers', () => {
  it('assertCents', () => {
    expect(assertCents(5)).toBe(5);
    expect(() => assertCents(0.1)).toThrow(/integer cents/);
    expect(() => assertCents('5')).toThrow();
    expect(isCents(3)).toBe(true);
    expect(isCents(3.3)).toBe(false);
  });
  it('parseDecimalToCents avoids float maths', () => {
    expect(parseDecimalToCents('79.99')).toBe(7999);
    expect(parseDecimalToCents('0.1')).toBe(10);
    expect(parseDecimalToCents('1.005')).toBeNull();
    expect(parseDecimalToCents('12')).toBe(1200);
  });
  it('randsToCents, sumCents, divRound, percent', () => {
    expect(randsToCents(600)).toBe(60000);
    expect(() => randsToCents(1.5)).toThrow();
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(() => sumCents([1, 0.5])).toThrow();
    expect(divRound(40600, 7)).toBe(5800);
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(() => divRound(1, 0)).toThrow();
    expect(percent(11800, 52400)).toBe(23);
    expect(percent(1, 0)).toBe(0);
  });
});
