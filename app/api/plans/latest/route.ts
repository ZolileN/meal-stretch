/** GET /api/plans/latest → the household's current plan (used by the offline list and tests). */
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { latestPlanFresh } from '@/lib/plans/service';

export async function GET() {
  const db = getDb();
  const h = await currentHousehold(db);
  const plan = h ? await latestPlanFresh(db, h.id) : null;
  if (!plan) return apiError(404, 'not_found', 'No plan yet');
  return NextResponse.json({ plan: { id: plan.id, status: plan.status, startDate: plan.startDate, days: plan.days, request: plan.request }, result: plan.result });
}
