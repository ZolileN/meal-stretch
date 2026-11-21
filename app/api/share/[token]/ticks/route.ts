/** PUT /api/share/:token/ticks: people with the share link may tick the list (read + tick only, ACC-3). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, limitOr429, parseBody } from '@/lib/api';
import { getDb } from '@/lib/db';
import { householdById } from '@/lib/household';
import { putTicks } from '@/lib/plans/actions';
import { latestPlan } from '@/lib/plans/service';
import { resolveShare } from '@/lib/share';

const schema = z.object({ lines: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{2,60}:\d{1,12}$/), ticked: z.boolean(), at: z.string().datetime().optional() })).max(200) }).strict();

export async function PUT(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const limited = await limitOr429(req, 'share-ticks', 120, 60);
  if (limited) return limited;
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const db = getDb();
  const hid = await resolveShare(db, (await ctx.params).token);
  const h = hid ? await householdById(db, hid) : null;
  const plan = h ? await latestPlan(db, h.id) : null;
  if (!h || !plan) return apiError(404, 'not_found', 'This link is no longer active');
  return NextResponse.json(await putTicks(db, h, plan, body.data.lines));
}
