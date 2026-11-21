import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  coarsen, distanceLabel, inSouthAfrica, isCoarse, nearestPerChain, shouldUseGoogle, walkMinutes, widenRadius,
} from '@/lib/location/geo';

describe('coarsen', () => {
  it('rounds to 3 dp', () => {
    expect(coarsen({ lat: -33.857123, lng: 25.632987 })).toEqual({ lat: -33.857, lng: 25.633 });
  });
  it('always yields coarse points within ~70 m per axis', () => {
    fc.assert(
      fc.property(fc.double({ min: -90, max: 90, noNaN: true }), fc.double({ min: -180, max: 180, noNaN: true }), (lat, lng) => {
        const c = coarsen({ lat, lng });
        return isCoarse(c) && Math.abs(c.lat - lat) <= 0.0005 + 1e-9 && Math.abs(c.lng - lng) <= 0.0005 + 1e-9;
      }),
    );
  });
  it('isCoarse rejects precise points', () => {
    expect(isCoarse({ lat: -33.8571, lng: 25.6 })).toBe(false);
    expect(isCoarse({ lat: Number.NaN, lng: 1 })).toBe(false);
  });
});

describe('inSouthAfrica', () => {
  it.each([
    [-33.857, 25.632, true], // Bluewater Bay
    [-34.076, 18.843, true], // Somerset West
    [-26.2, 28.04, true], // Johannesburg
    [-29.31, 27.48, true], // Maseru (inside the box)
    [51.5, -0.12, false], // London
    [-22.56, 17.08, false], // Windhoek
    [-17.82, 31.05, false], // Harare
    [Number.NaN, 25, false],
  ])('(%d, %d) → %s', (lat, lng, out) => expect(inSouthAfrica({ lat, lng })).toBe(out));
});

describe('distanceLabel + walkMinutes', () => {
  it.each([
    [0, '10 m'],
    [449, '450 m'],
    [999, '1.0 km'],
    [2100, '2.1 km'],
    [2149, '2.1 km'],
    [9950, '10 km'],
    [12400, '12 km'],
    [-1, ''],
  ])('%d m → %s', (m, out) => expect(distanceLabel(m)).toBe(out));

  it('walk time at 5 km/h, none beyond 3 km', () => {
    expect(walkMinutes(500)).toBe(6);
    expect(walkMinutes(30)).toBe(1);
    expect(walkMinutes(3001)).toBeNull();
  });
});

describe('widenRadius (LOC-3)', () => {
  const at = (...km: number[]) => km.map((k, i) => ({ id: i, distanceM: k * 1000 }));
  it('stays at 5 km when ≥3 results inside', () => {
    const r = widenRadius(at(1, 2, 4.9, 8));
    expect(r.radiusKm).toBe(5);
    expect(r.results.map((x) => x.id)).toEqual([0, 1, 2]);
  });
  it('widens 5 → 10 → 25 → 50 until ≥3', () => {
    expect(widenRadius(at(1, 7, 9)).radiusKm).toBe(10);
    expect(widenRadius(at(1, 7, 20)).radiusKm).toBe(25);
    expect(widenRadius(at(30, 40, 49)).radiusKm).toBe(50);
  });
  it('returns what it has at 50 km when fewer than 3', () => {
    const r = widenRadius(at(45, 60));
    expect(r.radiusKm).toBe(50);
    expect(r.results).toHaveLength(1);
  });
  it('empty input', () => expect(widenRadius([])).toEqual({ radiusKm: 50, results: [] }));
  it('results sorted and within radius (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 80_000 }), { maxLength: 30 }), (ds) => {
        const { radiusKm, results } = widenRadius(ds.map((d) => ({ distanceM: d })));
        return results.every((r, i) => r.distanceM <= radiusKm * 1000 && (i === 0 || results[i - 1]!.distanceM <= r.distanceM));
      }),
    );
  });
});

describe('nearestPerChain + shouldUseGoogle', () => {
  it('keeps the nearest per retailer', () => {
    const r = nearestPerChain([
      { retailerId: 'spar', distanceM: 900 },
      { retailerId: 'checkers', distanceM: 2000 },
      { retailerId: 'spar', distanceM: 300 },
    ]);
    expect(r).toEqual([
      { retailerId: 'spar', distanceM: 300 },
      { retailerId: 'checkers', distanceM: 2000 },
    ]);
  });
  it('Google only for digits or <3 local results, and only when enabled', () => {
    expect(shouldUseGoogle('12 Main Rd', 5, true)).toBe(true);
    expect(shouldUseGoogle('Bluewater', 1, true)).toBe(true);
    expect(shouldUseGoogle('Bluewater', 3, true)).toBe(false);
    expect(shouldUseGoogle('12 Main Rd', 0, false)).toBe(false);
  });
});

describe('inSouthAfrica outline', () => {
  it.each([
    [-25.97, 32.57, false], // Maputo
    [-24.65, 25.91, false], // Gaborone
    [-26.32, 31.14, true], // Mbabane (eSwatini, inside the outline by design)
    [-33.92, 18.42, true], // Cape Town
    [-29.86, 31.02, true], // Durban
    [-22.95, 30.48, true], // Thohoyandou
    [-28.74, 24.76, true], // Kimberley
  ])('(%d, %d) → %s', (lat, lng, out) => expect(inSouthAfrica({ lat, lng })).toBe(out));
});
