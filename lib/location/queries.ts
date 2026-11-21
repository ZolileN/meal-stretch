/** Location + store queries (parameterised SQL only). */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';
import { coarsen, RADIUS_STEPS_KM, widenRadius, type LatLng } from './geo';
import { normName } from './normalize';

/** Postgres array literal passed as ONE parameter (drizzle expands JS arrays into lists). */
export function pgArray(values: readonly (number | string)[]): string {
  return '{' + values.map((v) => (typeof v === 'number' ? String(v) : '"' + v.replace(/[\\"]/g, (c) => '\\' + c) + '"')).join(',') + '}';
}

export interface PlaceHit {
  id: number;
  name: string;
  kind: string;
  parentName: string | null;
  lat: number;
  lng: number;
}

export async function searchPlaces(db: Db, q: string, limit = 8): Promise<PlaceHit[]> {
  const n = normName(q);
  if (n.length < 2) return [];
  const rows = await query<{ id: string | number; name: string; kind: string; parent_name: string | null; lat: number; lng: number }>(
    db,
    sql`select id, name, kind, parent_name, st_y(geom::geometry) as lat, st_x(geom::geometry) as lng
        from places
        where name_norm like ${'%' + n + '%'} or name_norm % ${n}
        order by (name_norm like ${n + '%'}) desc, similarity(name_norm, ${n}) desc, rank desc, name
        limit ${limit}`,
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name, kind: r.kind, parentName: r.parent_name, ...coarsen({ lat: Number(r.lat), lng: Number(r.lng) }) }));
}

/** Label for a point: nearest suburb-level place within 6 km, else nearest town/city within 40 km. */
export async function reverseLabel(db: Db, p: LatLng): Promise<string | null> {
  const c = coarsen(p);
  const rows = await query<{ name: string }>(
    db,
    sql`with pt as (select st_setsrid(st_makepoint(${c.lng}, ${c.lat}), 4326)::geography as g)
        select name from places, pt
        where (kind not in ('city', 'town') and st_dwithin(geom, pt.g, 6000))
           or (kind in ('city', 'town') and st_dwithin(geom, pt.g, 40000))
        order by (kind in ('city', 'town')), st_distance(geom, pt.g)
        limit 1`,
  );
  return rows[0]?.name ?? null;
}

export interface BranchHit {
  branchId: number;
  retailerId: string;
  retailerName: string;
  branchName: string;
  suburb: string | null;
  city: string | null;
  distanceM: number;
  nearestOfChain: boolean;
  verified: boolean;
}

export async function nearbyBranches(db: Db, p: LatLng): Promise<{ radiusKm: number; branches: BranchHit[] }> {
  const c = coarsen(p);
  const maxKm = RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1]!;
  const rows = await query<{
    branch_id: string | number; retailer_id: string; retailer_name: string; branch_name: string; suburb: string | null;
    city: string | null; distance_m: number | string; nearest_of_chain: boolean; verified: boolean;
  }>(db, sql`select * from nearby_branches(${c.lat}, ${c.lng}, ${maxKm * 1000}, 100)`);
  const all = rows.map((r) => ({
    branchId: Number(r.branch_id),
    retailerId: r.retailer_id,
    retailerName: r.retailer_name,
    branchName: r.branch_name,
    suburb: r.suburb,
    city: r.city,
    distanceM: Math.round(Number(r.distance_m)),
    nearestOfChain: Boolean(r.nearest_of_chain),
    verified: Boolean(r.verified),
  }));
  const { radiusKm, results } = widenRadius(all);
  return { radiusKm, branches: results };
}

export async function branchesByIds(db: Db, ids: number[]) {
  if (ids.length === 0) return [];
  if (!ids.every(Number.isSafeInteger)) throw new Error('branch ids must be integers');
  const rows = await query<{ id: string | number; retailer_id: string; name: string; retailer_name: string; loyalty_program_id: string | null }>(
    db,
    sql`select b.id, b.retailer_id, b.name, r.name as retailer_name, r.loyalty_program_id
        from branches b join retailers r on r.id = b.retailer_id
        where b.id = any(${pgArray(ids)}::bigint[])`,
  );
  return rows.map((r) => ({ id: Number(r.id), retailerId: r.retailer_id, name: r.name, retailerName: r.retailer_name, loyaltyProgramId: r.loyalty_program_id }));
}

export async function listRetailers(db: Db) {
  return query<{ id: string; name: string; loyalty_program_id: string | null; loyalty_program_name: string | null }>(
    db,
    sql`select id, name, loyalty_program_id, loyalty_program_name from retailers where active order by name`,
  );
}
