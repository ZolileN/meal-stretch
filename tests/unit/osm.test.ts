import { describe, expect, it } from 'vitest';
import { matchRetailer, overpassAroundQuery, overpassQuery, overpassTileQuery, PROVINCE_BBOX, provinceTiles, toBranch, toPlace } from '@/lib/location/osm';

describe('OSM mapping', () => {
  it.each([
    [{ shop: 'supermarket', brand: 'Checkers' }, 'checkers'],
    [{ shop: 'supermarket', name: 'Checkers Hyper Somerset Mall' }, 'checkers'],
    [{ shop: 'supermarket', brand: 'Pick n Pay' }, 'pnp'],
    [{ shop: 'supermarket', name: 'SUPERSPAR Bluewater Bay' }, 'spar'],
    [{ shop: 'convenience', name: 'KwikSpar Strand' }, 'spar'],
    [{ shop: 'supermarket', brand: 'Woolworths' }, 'woolworths'],
    [{ shop: 'supermarket', name: 'Shoprite Motherwell' }, 'shoprite'],
    [{ shop: 'alcohol', name: 'Checkers LiquorShop' }, null],
    [{ shop: 'supermarket', name: 'Checkers LiquorShop' }, null],
    [{ shop: 'supermarket', name: 'TOPS at SPAR' }, null],
    [{ shop: 'supermarket', name: 'Corner Superette' }, null],
  ])('%o → %s', (tags, out) => expect(matchRetailer(tags as Record<string, string>)).toBe(out));

  it('maps a way with a centre to a branch', () => {
    const b = toBranch(
      { type: 'way', id: 42, center: { lat: -34.0781234, lon: 18.8461234 }, tags: { shop: 'supermarket', brand: 'Checkers', 'addr:street': 'Main Rd', 'addr:housenumber': '1' } },
      { checkers: 'Checkers' },
    );
    expect(b).toMatchObject({ osmId: 'way/42', retailerId: 'checkers', name: 'Checkers', address: '1 Main Rd' });
  });

  it('maps places with coarse points', () => {
    const p = toPlace({ type: 'node', id: 7, lat: -33.85712, lon: 25.63298, tags: { place: 'suburb', name: 'Bluewater Bay' } });
    expect(p).toMatchObject({ osmId: 'node/7', kind: 'suburb', nameNorm: 'bluewater bay', lat: -33.857, lng: 25.633 });
    expect(toPlace({ type: 'node', id: 8, lat: 1, lon: 1, tags: { place: 'island', name: 'X' } })).toBeNull();
  });

  it('builds safe Overpass queries', () => {
    expect(overpassQuery('ZA-EC')).toContain('"ZA-EC"');
    expect(() => overpassQuery('ZA-EC"];out;')).toThrow();
    expect(overpassAroundQuery(-33.857, 25.632, 25_000)).toContain('around:25000,-33.857,25.632');
    expect(() => overpassAroundQuery(Number.NaN, 25, 1000)).toThrow();
    expect(() => overpassAroundQuery(-33, 25, 500_000)).toThrow();
  });
});

describe('province tiles', () => {
  it('cover every province box without gaps, in tiles of at most 0.5°', () => {
    for (const iso of Object.keys(PROVINCE_BBOX)) {
      const [s, w, n, e] = PROVINCE_BBOX[iso]!;
      const tiles = provinceTiles(iso);
      expect(tiles.length).toBeGreaterThan(0);
      for (const [ts, tw, tn, te] of tiles) {
        expect(tn - ts).toBeLessThanOrEqual(0.5 + 1e-9);
        expect(te - tw).toBeLessThanOrEqual(0.5 + 1e-9);
      }
      const area = tiles.reduce((a, [ts, tw, tn, te]) => a + (tn - ts) * (te - tw), 0);
      expect(area).toBeCloseTo((n - s) * (e - w), 3);
    }
    expect(Object.keys(PROVINCE_BBOX)).toEqual(expect.arrayContaining(['ZA-GP', 'ZA-KZN']));
  });
  it('tile queries are limited to the province and the tile', () => {
    const q = overpassTileQuery('ZA-GP', [-26.5, 27.6, -26, 28.1]);
    expect(q).toContain('area["ISO3166-2"="ZA-GP"]');
    expect(q).toContain('(area.a)(-26.5,27.6,-26,28.1)');
    expect(() => overpassTileQuery('ZA-GP"];out;', [-26.5, 27.6, -26, 28.1])).toThrow();
    expect(() => overpassTileQuery('ZA-GP', [-26, 27.6, -26.5, 28.1])).toThrow();
    expect(() => provinceTiles('ZA-XX')).toThrow();
  });
});
