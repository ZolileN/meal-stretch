/** GET /api/plans/:id → plan + result (§13). */
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { getPlan } from '@/lib/plans/service';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const h = await currentHousehold(db);
  if (!h) return apiError(404, 'not_found', 'Plan not found');
  const plan = await getPlan(db, h.id, id);
  if (!plan) return apiError(404, 'not_found', 'Plan not found');
  return NextResponse.json({ plan: { id: plan.id, status: plan.status, startDate: plan.startDate, days: plan.days, request: plan.request }, result: plan.result });
}
