/** POST /api/plans/:id/have { ingredientId } → "Already have it": pantry + re-price (LST-4). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/api';
import { alreadyHave } from '@/lib/plans/actions';
import { loadOwnedPlan, planErrorResponse } from '@/lib/plans/route-helpers';

const schema = z.object({ ingredientId: z.string().regex(/^[a-z0-9_]{2,60}$/) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const owned = await loadOwnedPlan((await ctx.params).id);
  if (owned instanceof Response) return owned;
  try {
    const { plan, savedCents } = await alreadyHave(owned.db, owned.h, owned.plan, body.data.ingredientId);
    return NextResponse.json({ result: plan.result, savedCents });
  } catch (e) {
    return planErrorResponse(e);
  }
}
