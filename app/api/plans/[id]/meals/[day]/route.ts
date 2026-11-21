/** DELETE /api/plans/:id/meals/:day → remove meal; tells how much was saved (PLN-8). */
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { removeMeal } from '@/lib/plans/actions';
import { loadOwnedPlan, planErrorResponse } from '@/lib/plans/route-helpers';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; day: string }> }) {
  const { id, day } = await ctx.params;
  if (!/^\d{1,2}$/.test(day)) return apiError(400, 'invalid_day', 'Day must be a number');
  const owned = await loadOwnedPlan(id);
  if (owned instanceof Response) return owned;
  try {
    const { plan, savedCents } = await removeMeal(owned.db, owned.h, owned.plan, Number(day));
    return NextResponse.json({ result: plan.result, savedCents });
  } catch (e) {
    return planErrorResponse(e);
  }
}
