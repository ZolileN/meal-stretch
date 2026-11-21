/** GET/PUT /api/plans/:id/ticks: batch tick updates { lines: [{ key, ticked, at? }] } (LST-3). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/api';
import { getTicks, putTicks } from '@/lib/plans/actions';
import { loadOwnedPlan } from '@/lib/plans/route-helpers';

const schema = z
  .object({ lines: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{2,60}:\d{1,12}$/), ticked: z.boolean(), at: z.string().datetime().optional() })).max(200) })
  .strict();

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const owned = await loadOwnedPlan((await ctx.params).id);
  if (owned instanceof Response) return owned;
  return NextResponse.json({ ticks: await getTicks(owned.db, owned.plan.id) });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const owned = await loadOwnedPlan((await ctx.params).id);
  if (owned instanceof Response) return owned;
  return NextResponse.json(await putTicks(owned.db, owned.h, owned.plan, body.data.lines));
}
