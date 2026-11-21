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

/** Overpass QL for a province (ISO 3166-2, e.g. ZA-EC). */
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
