/**
 * POST /api/plans/:id/ideas { day, text } → up to 5 recipes from our catalogue that match what the household
 * feels like, each priced by the engine for that day. Claude only picks recipe ids (lib/plans/ideas.ts).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, limitOr429, parseBody } from '@/lib/api';
import { ClaudeError } from '@/lib/claude';
import { ideasFor } from '@/lib/plans/actions';
import { loadOwnedPlan, planErrorResponse } from '@/lib/plans/route-helpers';

const schema = z.object({ day: z.number().int().min(1).max(14), text: z.string().trim().min(2).max(300) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await limitOr429(req, 'ideas', 30, 3600);
  if (limited) return limited;
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const owned = await loadOwnedPlan((await ctx.params).id);
  if (owned instanceof Response) return owned;
  try {
    return NextResponse.json(await ideasFor(owned.db, owned.h, owned.plan, body.data.day, body.data.text));
  } catch (e) {
    if (e instanceof ClaudeError) {
      if (e.code === 'cap_reached') return apiError(429, 'cap_reached', 'You can ask for ideas 20 times a day.');
      return apiError(503, e.code, 'Ideas are not available right now. Please try again.');
    }
    return planErrorResponse(e);
  }
}
