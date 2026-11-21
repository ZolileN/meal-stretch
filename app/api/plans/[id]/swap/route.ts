/** POST /api/plans/:id/swap { day } → 3 alternatives with deltas (PLN-6). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/api';
import { swapOptionsFor } from '@/lib/plans/actions';
import { loadOwnedPlan, planErrorResponse } from '@/lib/plans/route-helpers';

const schema = z.object({ day: z.number().int().min(1).max(14) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const owned = await loadOwnedPlan((await ctx.params).id);
  if (owned instanceof Response) return owned;
  try {
    return NextResponse.json(await swapOptionsFor(owned.db, owned.h, owned.plan, body.data.day));
  } catch (e) {
    return planErrorResponse(e);
  }
}
