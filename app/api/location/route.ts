/**
 * GET /api/location
 *   ?q=<text>&session=<uuid>[&lat&lng]  → search (local places first; Google only if gated in, LOC-2)
 *   ?lat=&lng=                          → reverse label from local places (no paid API, LOC-1)
 *   ?placeId=&session=                  → resolve a Google prediction to a coarse point
 * Edge-compatible (fetch + Neon HTTP); runs on the default runtime (docs/decisions.md).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, limitOr429, parseQuery } from '@/lib/api';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { coarsen, inSouthAfrica, shouldUseGoogle } from '@/lib/location/geo';
import { googleAutocomplete, googlePlaceDetails } from '@/lib/location/google';
import { reverseLabel, searchPlaces } from '@/lib/location/queries';

const coord = z.coerce.number().finite();
const schema = z.object({
  q: z.string().trim().min(1).max(80).optional(),
  session: z.string().uuid().optional(),
  lat: coord.min(-90).max(90).optional(),
  lng: coord.min(-180).max(180).optional(),
  placeId: z.string().max(300).optional(),
});

export async function GET(req: Request) {
  const limited = await limitOr429(req, 'location', 60, 60);
  if (limited) return limited;
  const parsed = parseQuery(req, schema);
  if (!parsed.ok) return parsed.res;
  const { q, session, lat, lng, placeId } = parsed.data;
  const db = getDb();
  const key = env().GOOGLE_PLACES_API_KEY;

  if (placeId) {
    if (!key || !session) return apiError(400, 'google_disabled', 'Place lookup is not available');
    const p = await googlePlaceDetails(key, placeId, session);
    if (!p) return apiError(404, 'not_found', 'Place not found in South Africa');
    return NextResponse.json({ point: { lat: p.lat, lng: p.lng }, label: p.label || (await reverseLabel(db, p)) });
  }

  if (q) {
    const local = await searchPlaces(db, q);
    let google: Awaited<ReturnType<typeof googleAutocomplete>> = [];
    if (session && key && shouldUseGoogle(q, local.length, true)) {
      const bias = lat !== undefined && lng !== undefined ? coarsen({ lat, lng }) : undefined;
      google = await googleAutocomplete(key, q, session, bias).catch(() => []);
    }
    return NextResponse.json({
      results: [
        ...local.map((p) => ({ type: 'place' as const, id: `place:${p.id}`, name: p.name, secondary: p.parentName, point: { lat: p.lat, lng: p.lng } })),
        ...google.map((g) => ({ type: 'google' as const, id: `google:${g.placeId}`, placeId: g.placeId, name: g.name, secondary: g.secondary })),
      ],
    });
  }

  if (lat !== undefined && lng !== undefined) {
    const p = coarsen({ lat, lng });
    if (!inSouthAfrica(p)) return apiError(422, 'outside_sa', 'That location is outside South Africa');
    return NextResponse.json({ point: p, label: await reverseLabel(db, p) });
  }

  return apiError(400, 'invalid_query', 'Provide q, lat+lng or placeId');
}
