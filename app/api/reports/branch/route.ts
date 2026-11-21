/** POST /api/reports/branch: "My shop isn't listed" / closed / wrong location (LOC-5). */
import { NextResponse } from 'next/server';
import { apiError, limitOr429, parseBody } from '@/lib/api';
import { getDb } from '@/lib/db';
import { createBranchReport, reportSchema } from '@/lib/location/reports';
import { coarsen, inSouthAfrica } from '@/lib/location/geo';

export async function POST(req: Request) {
  const limited = await limitOr429(req, 'branch-report', 5, 3600);
  if (limited) return limited;
  const body = await parseBody(req, reportSchema);
  if (!body.ok) return body.res;
  const point = body.data.point ? coarsen(body.data.point) : null;
  if (point && !inSouthAfrica(point)) return apiError(422, 'outside_sa', 'That location is outside South Africa');
  try {
    const id = await createBranchReport(getDb(), { ...body.data, point, householdId: null });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === '23503') return apiError(400, 'unknown_retailer', 'Unknown shop');
    throw e;
  }
}
