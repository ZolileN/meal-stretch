/** Pure OpenStreetMap (Overpass JSON) → branches/places mapping for scripts/import-osm.ts. */
import { coarsen } from './geo';
import { normName } from './normalize';

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const RULES: { retailerId: string; re: RegExp }[] = [
  { retailerId: 'checkers', re: /^checkers( hyper)?\b/ },
  { retailerId: 'shoprite', re: /^shoprite\b/ },
  { retailerId: 'pnp', re: /^pick n pay\b|^pnp\b/ },
  { retailerId: 'spar', re: /^(super|kwik)?spar\b/ },
  { retailerId: 'woolworths', re: /^woolworths\b/ },
  { retailerId: 'boxer', re: /^boxer\b/ },
  { retailerId: 'usave', re: /^usave\b/ },
];
// Not grocery branches for our purposes
const EXCLUDE = /liquor|tops|clothing|pharmacy|medirite|express fuel|petshop|home|cellular|money market/;

export function matchRetailer(tags: Record<string, string> = {}): string | null {
  const shop = tags.shop;
  if (shop && !['supermarket', 'convenience', 'wholesale', 'general', 'grocery'].includes(shop)) return null;
  for (const raw of [tags.brand, tags.name, tags.operator]) {
    if (!raw) continue;
    const n = normName(raw);
    if (EXCLUDE.test(n)) return null;
    for (const r of RULES) if (r.re.test(n)) return r.retailerId;
  }
  return null;
}

function point(e: OsmElement) {
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  return lat === undefined || lon === undefined ? null : { lat, lng: lon };
}

export interface OsmBranch {
  osmId: string;
  retailerId: string;
  name: string;
  address: string | null;
  suburb: string | null;
  city: string | null;
  lat: number;
  lng: number;
}

export function toBranch(e: OsmElement, retailerNames: Record<string, string>): OsmBranch | null {
  const retailerId = matchRetailer(e.tags);
  const p = point(e);
  if (!retailerId || !p) return null;
  const t = e.tags ?? {};
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  return {
    osmId: `${e.type}/${e.id}`,
    retailerId,
    name: t.name ?? `${retailerNames[retailerId] ?? retailerId}${t['addr:suburb'] ? ' ' + t['addr:suburb'] : ''}`,
    address: street || null,
    suburb: t['addr:suburb'] ?? null,
    city: t['addr:city'] ?? null,
    lat: p.lat,
    lng: p.lng,
  };
}

const PLACE_KINDS: Record<string, string> = {
  city: 'city', town: 'town', suburb: 'suburb', neighbourhood: 'neighbourhood', quarter: 'section', village: 'village', hamlet: 'village',
};
const PLACE_RANK: Record<string, number> = { city: 8, town: 7, suburb: 6, township: 6, section: 4, neighbourhood: 4, village: 3 };

export interface OsmPlace {
  osmId: string;
  name: string;
  nameNorm: string;
  kind: string;
  parentName: string | null;
  lat: number;
  lng: number;
  rank: number;
}

export function toPlace(e: OsmElement): OsmPlace | null {
  const t = e.tags ?? {};
  const kind = t.place ? PLACE_KINDS[t.place] : undefined;
  const p = point(e);
  if (!kind || !p || !t.name) return null;
  const c = coarsen(p);
  const isTownship = /township/i.test(t.name) || t['place:type'] === 'township';
  const k = isTownship ? 'township' : kind;
  return {
    osmId: `${e.type}/${e.id}`,
    name: t.name,
    nameNorm: normName(t.name),
    kind: k,
    parentName: t['is_in:city'] ?? t['addr:city'] ?? null,
    ...c,
    rank: PLACE_RANK[k] ?? 0,
  };
}

/** Same filters as overpassQuery, limited to a radius around a point (light enough for busy public servers). */
export function overpassAroundQuery(lat: number, lng: number, radiusM: number): string {
  if (![lat, lng, radiusM].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || radiusM <= 0 || radiusM > 100_000)
    throw new Error(`bad area ${lat},${lng},${radiusM}`);
  const a = `around:${Math.round(radiusM)},${lat},${lng}`;
  return `[out:json][timeout:90];
(
  nwr["shop"~"^(supermarket|convenience|wholesale)$"](${a});
  node["place"~"^(city|town|suburb|neighbourhood|quarter|village|hamlet)$"](${a});
);
out center tags;`;
}

/** Pilot areas (PRD §17): 25 km covers the 15 km store radius plus nearby suburbs. */
export const PILOT_AREAS = [
  { name: 'Bluewater Bay', iso: 'ZA-EC', lat: -33.857, lng: 25.632 },
  { name: 'Somerset West', iso: 'ZA-WC', lat: -34.077, lng: 18.846 },
] as const;

/** Generous bounding boxes [south, west, north, east] of SA provinces (OSM ISO 3166-2 codes, checked 2026-11). */
export const PROVINCE_BBOX: Record<string, [number, number, number, number]> = {
  'ZA-WC': [-34.9, 17.7, -30.4, 24.3],
  'ZA-EC': [-34.3, 22.7, -30.0, 30.3],
  'ZA-NC': [-32.9, 16.4, -24.7, 25.7],
  'ZA-FS': [-30.8, 24.3, -26.6, 29.9],
  'ZA-GP': [-27.0, 27.1, -25.0, 29.1],
  'ZA-KZN': [-31.2, 28.8, -26.8, 33.0],
  'ZA-NW': [-28.0, 22.6, -24.6, 28.4],
  'ZA-LP': [-25.5, 26.3, -22.1, 31.9],
  'ZA-MP': [-27.5, 28.1, -24.3, 32.1],
};

/** Split a province's box into tiles of about `step` degrees (~55 km at 0.5°). */
export function provinceTiles(iso: string, step = 0.5): [number, number, number, number][] {
  const box = PROVINCE_BBOX[iso];
  if (!box) throw new Error(`no bounding box for ${iso}`);
  const [s, w, n, e] = box;
  const out: [number, number, number, number][] = [];
  const r = (x: number) => Math.round(x * 1000) / 1000;
  for (let lat = s; lat < n - 1e-9; lat += step)
    for (let lng = w; lng < e - 1e-9; lng += step) out.push([r(lat), r(lng), r(Math.min(lat + step, n)), r(Math.min(lng + step, e))]);
  return out;
}

/** Shops and places inside the province AND one tile: small queries that busy public Overpass servers can answer. */
export function overpassTileQuery(iso: string, [s, w, n, e]: [number, number, number, number]): string {
  if (!/^ZA-[A-Z]{1,3}$/.test(iso)) throw new Error(`bad ISO code ${iso}`);
  if (![s, w, n, e].every(Number.isFinite) || s >= n || w >= e) throw new Error(`bad tile ${s},${w},${n},${e}`);
  const b = `${s},${w},${n},${e}`;
  return `[out:json][timeout:90];
area["ISO3166-2"="${iso}"]->.a;
(
  nwr["shop"~"^(supermarket|convenience|wholesale)$"](area.a)(${b});
  node["place"~"^(city|town|suburb|neighbourhood|quarter|village|hamlet)$"](area.a)(${b});
);
out center tags;`;
}

/** Overpass QL for a whole province (ISO 3166-2, e.g. ZA-EC). Heavy: prefer --tiles on public servers. */
export function overpassQuery(iso: string): string {
  if (!/^ZA-[A-Z]{1,3}$/.test(iso)) throw new Error(`bad ISO code ${iso}`);
  return `[out:json][timeout:180];
area["ISO3166-2"="${iso}"]->.a;
(
  nwr["shop"~"^(supermarket|convenience|wholesale)$"](area.a);
  node["place"~"^(city|town|suburb|neighbourhood|quarter|village|hamlet)$"](area.a);
);
out center tags;`;
}
