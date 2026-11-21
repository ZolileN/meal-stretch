/** POST /api/plans/:id/replace { day, recipeId | 'cheapest' } → updated result (PLN-6, PLN-7). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/api';
import { replaceMeal } from '@/lib/plans/actions';
import { loadOwnedPlan, planErrorResponse } from '@/lib/plans/route-helpers';

const schema = z.object({ day: z.number().int().min(1).max(14), recipeId: z.union([z.literal('cheapest'), z.string().regex(/^[a-z0-9_]{2,80}$/)]) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const owned = await loadOwnedPlan((await ctx.params).id);
  if (owned instanceof Response) return owned;
  try {
    const { plan, deltaCents } = await replaceMeal(owned.db, owned.h, owned.plan, body.data.day, body.data.recipeId);
    return NextResponse.json({ result: plan.result, deltaCents });
  } catch (e) {
    return planErrorResponse(e);
  }
}
