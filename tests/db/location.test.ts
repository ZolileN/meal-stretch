import { beforeAll, describe, expect, it } from 'vitest';
import { branchesByIds, nearbyBranches, reverseLabel, searchPlaces } from '@/lib/location/queries';
import type { Db } from '@/lib/db';
import { seededTestDb } from './helpers';

let db: Db;
beforeAll(async () => {
  ({ db } = await seededTestDb());
});

describe('location queries (PostGIS)', () => {
  it('searches local places by prefix and fuzzy match', async () => {
    const hits = await searchPlaces(db, 'Bluewater Bay');
    expect(hits[0]?.name).toBe('Bluewater Bay');
    expect((await searchPlaces(db, 'blue'))[0]?.name).toBe('Bluewater Bay');
    expect((await searchPlaces(db, 'somrset west')).map((h) => h.name)).toContain('Somerset West');
    expect(await searchPlaces(db, 'x')).toEqual([]);
  });

  it('search results are coarse (3 dp)', async () => {
    const [h] = await searchPlaces(db, 'Strand');
    expect(h).toBeDefined();
    expect(Math.round(h!.lat * 1000) / 1000).toBe(h!.lat);
  });

  it('reverse label prefers the suburb over the city', async () => {
    expect(await reverseLabel(db, { lat: -33.859, lng: 25.63 })).toBe('Bluewater Bay');
    expect(await reverseLabel(db, { lat: -34.077, lng: 18.845 })).toBe('Somerset West');
    expect(await reverseLabel(db, { lat: -30.0, lng: 22.0 })).toBeNull();
  });

  it('nearby branches: nearest first, nearest-of-chain flagged, radius widened', async () => {
    const r = await nearbyBranches(db, { lat: -34.076, lng: 18.843 });
    expect(r.radiusKm).toBe(5);
    expect(r.branches.length).toBeGreaterThanOrEqual(3);
    const d = r.branches.map((b) => b.distanceM);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(r.branches.every((b) => b.branchName.startsWith('TEST '))).toBe(true);
    const nearestChains = r.branches.filter((b) => b.nearestOfChain).map((b) => b.retailerId);
    expect(new Set(nearestChains).size).toBe(nearestChains.length);
    expect(nearestChains).toContain('checkers');
  });

  it('widens when few branches are close', async () => {
    // Middle of nowhere near Gqeberha's outskirts: fewer than 3 within 5 km
    const r = await nearbyBranches(db, { lat: -33.75, lng: 25.55 });
    expect(r.radiusKm).toBeGreaterThan(5);
  });

  it('branchesByIds returns loyalty programmes', async () => {
    const r = await nearbyBranches(db, { lat: -33.857, lng: 25.632 });
    const ids = r.branches.slice(0, 2).map((b) => b.branchId);
    const got = await branchesByIds(db, ids);
    expect(got.map((g) => g.id).sort()).toEqual([...ids].sort());
    expect(got.find((g) => g.retailerId === 'checkers')?.loyaltyProgramId).toBe('xtra_savings');
  });
});
