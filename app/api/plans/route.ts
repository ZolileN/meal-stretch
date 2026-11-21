/** POST /api/plans: partial PlanRequest (server fills from household) → { planId, result } (§13). */
import { NextResponse } from 'next/server';
import { apiError, limitOr429, parseBody } from '@/lib/api';
import { getDb } from '@/lib/db';
import { ensureHousehold } from '@/lib/household';
import { track } from '@/lib/events';
import { createPlan, PlanError, planInputSchema } from '@/lib/plans/service';

export async function POST(req: Request) {
  const limited = await limitOr429(req, 'plans', 30, 60);
  if (limited) return limited;
  const body = await parseBody(req, planInputSchema);
  if (!body.ok) return body.res;
  const db = getDb();
  const household = await ensureHousehold(db);
  try {
    if (body.data.fromPlanId && body.data.mode === 'cheapest') await track(db, household.id, 'fit_budget_tapped');
    const plan = await createPlan(db, household, body.data);
    return NextResponse.json({ planId: plan.id, result: plan.result }, { status: 201 });
  } catch (e) {
    if (e instanceof PlanError) return apiError(e.status, e.code, e.message);
    throw e;
  }
}
