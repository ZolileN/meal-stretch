import { describe, expect, it } from 'vitest';
import type { Offer } from '../src/types';
import { selectPacks } from '../src/packs';
import { ageDays, isStale, isUsable, packPrice } from '../src/price';
import { scaleQty, servings, servingsHundredths } from '../src/portions';

const AS_OF = '2026-11-21';
let pid = 1;
const offer = (packQty: number, priceCents: number, extra: Partial<Offer> = {}): Offer => ({
  productId: pid++, branchId: 1, packQty, priceCents, memberPriceCents: null, specialPriceCents: null, specialEndsOn: null,
  observedAt: '2026-11-20T08:00:00.000Z', source: 'catalogue', ...extra,
});

describe('pack DP (§9.4)', () => {
  it('exact: picks the pack that covers Q exactly at min cost', () => {
    const s = selectPacks(1000, [offer(500, 5499), offer(1000, 9999)], 50, AS_OF)!;
    expect(s.packs.map((p) => [p.offer.packQty, p.count])).toEqual([[1000, 1]]);
    expect([s.costCents, s.leftoverQty]).toEqual([9999, 0]);
  });
  it('overshoot: cheapest cover above Q, reporting leftover', () => {
    const s = selectPacks(1100, [offer(500, 5499), offer(1000, 9999)], 50, AS_OF)!;
    expect(s.costCents).toBe(15498);
    expect(s.boughtQty).toBe(1500);
    expect(s.leftoverQty).toBe(400);
  });
  it('multi-pack mix of different sizes', () => {
    const s = selectPacks(2250, [offer(1000, 6499), offer(2000, 11999)], 50, AS_OF)!;
    expect(s.packs.map((p) => [p.offer.packQty, p.count]).sort()).toEqual([[1000, 1], [2000, 1]]);
    expect(s.costCents).toBe(18498);
  });
  it('tie-break: fewer packs, then less leftover', () => {
    expect(selectPacks(1000, [offer(500, 1000), offer(1000, 2000)], 50, AS_OF)!.packs).toHaveLength(1);
    const s = selectPacks(900, [offer(1200, 2000), offer(1000, 2000)], 50, AS_OF)!;
    expect(s.packs[0]!.offer.packQty).toBe(1000);
  });
  it('pack sizes that are not multiples of roundTo (410 g tins)', () => {
    const s = selectPacks(500, [offer(410, 1599)], 50, AS_OF)!;
    expect([s.packs[0]!.count, s.leftoverQty]).toEqual([2, 320]);
  });
  it('uses effective (special/member) prices when choosing', () => {
    const s = selectPacks(2000, [offer(1000, 6499), offer(2000, 12999, { specialPriceCents: 9999 })], 50, AS_OF)!;
    expect(s.costCents).toBe(9999);
    expect(s.normalCents).toBe(12999);
    expect(s.specialsCents).toBe(3000);
  });
  it('no offers → null (unpriced); zero need → empty selection', () => {
    expect(selectPacks(500, [], 50, AS_OF)).toBeNull();
    expect(selectPacks(0, [offer(500, 100)], 50, AS_OF)!.packs).toEqual([]);
  });
});

describe('portions (§9.3)', () => {
  it.each([
    [{ light: 0, average: 1, big: 0 }, 1],
    [{ light: 1, average: 0, big: 0 }, 1], // 0.75 → 1.0
    [{ light: 2, average: 0, big: 0 }, 1.5],
    [{ light: 0, average: 0, big: 1 }, 1.5], // 1.4 → 1.5
    [{ light: 2, average: 1, big: 1 }, 4], // 1.5 + 1 + 1.4 = 3.9 → 4.0
    [{ light: 3, average: 2, big: 1 }, 6], // 2.25 + 2 + 1.4 = 5.65 → rounds up to 6.0
  ])('%o → %d servings', (h, s) => expect(servings(h)).toBe(s));
  it('scales per-serving qty and rounds up to roundTo', () => {
    expect(scaleQty(75, 450, 50)).toBe(350); // 337.5 → 350
    expect(scaleQty(100, 400, 50)).toBe(400);
    expect(scaleQty(2, 450, 1)).toBe(9); // eggs
    expect(scaleQty(3, 100, 5)).toBe(5);
    expect(scaleQty(0, 400, 50)).toBe(0);
    expect(servingsHundredths({ light: 0, average: 0, big: 0 })).toBe(0);
  });
});

describe('effective vs normal price (§9.2) and savings split (§9.7)', () => {
  it('shelf only', () => expect(packPrice(offer(1, 1000), AS_OF)).toEqual({ effective: 1000, normal: 1000, specials: 0, member: 0 }));
  it('special', () => expect(packPrice(offer(1, 1000, { specialPriceCents: 800 }), AS_OF)).toEqual({ effective: 800, normal: 1000, specials: 200, member: 0 }));
  it('member (card held)', () => expect(packPrice(offer(1, 1000, { memberPriceCents: 900 }), AS_OF)).toEqual({ effective: 900, normal: 1000, specials: 0, member: 100 }));
  it('member below special: member credited only beyond the special', () =>
    expect(packPrice(offer(1, 1000, { specialPriceCents: 850, memberPriceCents: 700 }), AS_OF)).toEqual({ effective: 700, normal: 1000, specials: 150, member: 150 }));
  it('special below member: all to specials', () =>
    expect(packPrice(offer(1, 1000, { specialPriceCents: 600, memberPriceCents: 700 }), AS_OF)).toEqual({ effective: 600, normal: 1000, specials: 400, member: 0 }));
  it('expired special ignored', () =>
    expect(packPrice(offer(1, 1000, { specialPriceCents: 600, specialEndsOn: '2026-11-20' }), AS_OF).effective).toBe(1000));
  it('special ending today still applies', () =>
    expect(packPrice(offer(1, 1000, { specialPriceCents: 600, specialEndsOn: '2026-11-21' }), AS_OF).effective).toBe(600));
});

describe('price age (§9.2)', () => {
  it('8-day-old is stale but usable; 22-day-old excluded', () => {
    const o8 = offer(1, 1, { observedAt: '2026-11-13T08:00:00.000Z' });
    const o7 = offer(1, 1, { observedAt: '2026-11-14T08:00:00.000Z' });
    const o22 = offer(1, 1, { observedAt: '2026-10-30T08:00:00.000Z' });
    expect([ageDays(o8.observedAt, AS_OF), isStale(o8, AS_OF), isUsable(o8, AS_OF)]).toEqual([8, true, true]);
    expect(isStale(o7, AS_OF)).toBe(false);
    expect([ageDays(o22.observedAt, AS_OF), isUsable(o22, AS_OF)]).toEqual([22, false]);
  });
});

describe('guide prices (looked up online)', () => {
  it('stay usable for 90 days (others 21) and are always flagged stale', () => {
    const at = (days: number) => new Date(Date.parse(`${AS_OF}T08:00:00Z`) - days * 86_400_000).toISOString();
    const guide = (d: number) => offer(1000, 2999, { source: 'guide', observedAt: at(d) });
    expect(isUsable(guide(30), AS_OF)).toBe(true);
    expect(isUsable(guide(90), AS_OF)).toBe(true);
    expect(isUsable(guide(91), AS_OF)).toBe(false);
    expect(isUsable(offer(1000, 2999, { observedAt: at(30) }), AS_OF)).toBe(false);
    expect(isStale(guide(0), AS_OF)).toBe(true);
    expect(isStale(offer(1000, 2999, { observedAt: at(0) }), AS_OF)).toBe(false);
  });
});
