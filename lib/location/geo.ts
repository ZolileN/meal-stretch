/** Pure location helpers (LOC-1, LOC-3). No I/O. */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Round to 3 dp (~110 m) before coordinates leave the device or are stored (PRD §15 coarse location). */
export function coarsen(p: LatLng): LatLng {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { lat: r(p.lat), lng: r(p.lng) };
}

/** True when the point is a finite coordinate with at most 3 decimal places. */
export function isCoarse(p: LatLng): boolean {
  const ok = (n: number) => Number.isFinite(n) && Math.abs(Math.round(n * 1000) - n * 1000) < 1e-6;
  return ok(p.lat) && ok(p.lng);
}

/**
 * Coarse outline of South Africa as [lng, lat] (generous along the coast; Lesotho and eSwatini fall
 * inside). Good enough to reject points in Namibia, Botswana, Zimbabwe, Mozambique or abroad.
 */
const SA_OUTLINE: readonly [number, number][] = [
  [16.2, -28.4], [20.0, -28.3], [20.0, -24.6], [21.0, -25.4], [23.0, -25.4], [25.5, -25.6], [26.9, -24.6],
  [27.9, -23.2], [29.3, -22.1], [31.3, -22.3], [31.6, -23.5], [32.0, -25.0], [32.1, -26.0], [33.0, -26.8],
  [32.9, -28.3], [31.5, -29.6], [30.4, -31.0], [28.3, -33.0], [26.0, -34.1], [22.5, -34.4], [20.0, -35.0],
  [18.3, -34.6], [17.6, -32.8], [16.2, -28.4],
];

function pointInPolygon(x: number, y: number, poly: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inSouthAfrica(p: LatLng): boolean {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  if (p.lat < -35.2 || p.lat > -22.0 || p.lng < 16.2 || p.lng > 33.1) return false;
  return pointInPolygon(p.lng, p.lat, SA_OUTLINE);
}

/** "450 m", "2.1 km", "12 km". Units are SI symbols, not translatable copy. */
export function distanceLabel(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  const m10 = Math.max(10, Math.round(meters / 10) * 10);
  if (m10 < 1000) return `${m10} m`;
  const km1 = Math.round(meters / 100) / 10;
  return km1 < 10 ? `${km1.toFixed(1)} km` : `${Math.round(meters / 1000)} km`;
}

/** Walking minutes at 5 km/h; null beyond 3 km (nobody walks there with shopping). */
export function walkMinutes(meters: number): number | null {
  if (!Number.isFinite(meters) || meters < 0 || meters > 3000) return null;
  return Math.max(1, Math.round(meters / (5000 / 60)));
}

/** LOC-3: widen 5 → 10 → 25 → 50 km until ≥ 3 results. */
export const RADIUS_STEPS_KM = [5, 10, 25, 50] as const;
export const MIN_RESULTS = 3;

/**
 * Pure radius widening: given every branch within the largest radius, pick the smallest step with at
 * least `min` results and return only the branches inside it (nearest first).
 */
export function widenRadius<T extends { distanceM: number }>(
  candidates: readonly T[],
  steps: readonly number[] = RADIUS_STEPS_KM,
  min = MIN_RESULTS,
): { radiusKm: number; results: T[] } {
  const sorted = [...candidates].sort((a, b) => a.distanceM - b.distanceM);
  const last = steps[steps.length - 1] ?? 50;
  for (const km of steps) {
    const inside = sorted.filter((c) => c.distanceM <= km * 1000);
    if (inside.length >= min || km === last) return { radiusKm: km, results: inside };
  }
  return { radiusKm: last, results: sorted.filter((c) => c.distanceM <= last * 1000) };
}

/** The nearest branch per chain, in distance order (O2 chips). */
export function nearestPerChain<T extends { retailerId: string; distanceM: number }>(branches: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const b of [...branches].sort((a, z) => a.distanceM - z.distanceM)) {
    if (seen.has(b.retailerId)) continue;
    seen.add(b.retailerId);
    out.push(b);
  }
  return out;
}

/** LOC-2: Google Places only when the query has digits (street numbers) or local results are thin. */
export function shouldUseGoogle(query: string, localCount: number, googleEnabled: boolean): boolean {
  if (!googleEnabled) return false;
  return /\d/.test(query) || localCount < 3;
}
