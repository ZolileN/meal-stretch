/** POST /api/plans/:id/shopped → savings_event + leftovers into pantry; idempotent (SAV-3). */
import { NextResponse } from 'next/server';
import { markShopped } from '@/lib/plans/actions';
import { loadOwnedPlan } from '@/lib/plans/route-helpers';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const owned = await loadOwnedPlan((await ctx.params).id);
  if (owned instanceof Response) return owned;
  const { changed } = await markShopped(owned.db, owned.h, owned.plan);
  return NextResponse.json({ status: 'shopped', changed });
}
