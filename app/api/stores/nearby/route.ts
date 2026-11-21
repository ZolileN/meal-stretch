/** GET /api/stores/nearby?lat&lng → branches nearest first, radius auto-widened 5 → 10 → 25 → 50 km (LOC-3). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, limitOr429, parseQuery } from '@/lib/api';
import { getDb } from '@/lib/db';
import { coarsen, distanceLabel, inSouthAfrica, walkMinutes } from '@/lib/location/geo';
import { listRetailers, nearbyBranches } from '@/lib/location/queries';

const schema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
});

export async function GET(req: Request) {
  const limited = await limitOr429(req, 'stores', 60, 60);
  if (limited) return limited;
  const parsed = parseQuery(req, schema);
  if (!parsed.ok) return parsed.res;
  const p = coarsen(parsed.data);
  if (!inSouthAfrica(p)) return apiError(422, 'outside_sa', 'That location is outside South Africa');
  const db = getDb();
  const [{ radiusKm, branches }, retailers] = await Promise.all([nearbyBranches(db, p), listRetailers(db)]);
  return NextResponse.json({
    radiusKm,
    retailers: retailers.map((r) => ({ id: r.id, name: r.name, loyaltyProgramId: r.loyalty_program_id, loyaltyProgramName: r.loyalty_program_name })),
    branches: branches.map((b) => ({ ...b, distanceLabel: distanceLabel(b.distanceM), walkMinutes: walkMinutes(b.distanceM) })),
  });
}
