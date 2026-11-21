import { describe, expect, it } from 'vitest';
import { matchRetailer, overpassQuery, toBranch, toPlace } from '@/lib/location/osm';

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
  });
});
