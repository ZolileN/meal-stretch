/** POST /api/plans/:id/tweak { text } → Claude parse → engine re-run → { patch, result } (PLN-13). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, limitOr429, parseBody } from '@/lib/api';
import { ClaudeError } from '@/lib/claude';
import { track } from '@/lib/events';
import { pantryOf, createPlanFromRequest } from '@/lib/plans/service';
import { applyTweak, parseTweak } from '@/lib/plans/tweak';
import { loadOwnedPlan } from '@/lib/plans/route-helpers';

const schema = z.object({ text: z.string().trim().min(2).max(500) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await limitOr429(req, 'tweak', 20, 3600);
  if (limited) return limited;
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const owned = await loadOwnedPlan((await ctx.params).id);
  if (owned instanceof Response) return owned;
  const { db, h, plan } = owned;
  try {
    const { output: patch } = await parseTweak(db, h.id, body.data.text);
    await track(db, h.id, 'tweak_submitted', { parsed_ok: patch.understood });
    if (!patch.understood) return NextResponse.json({ patch, result: null }, { status: 422 });
    const next = applyTweak({ ...plan.request, loyalty: h.loyalty, neverSwapProteins: h.neverSwapProteins, pantry: await pantryOf(db, h.id) }, patch);
    const stored = await createPlanFromRequest(db, h.id, next);
    return NextResponse.json({ patch, planId: stored.id, result: stored.result });
  } catch (e) {
    if (e instanceof ClaudeError) {
      await track(db, h.id, 'tweak_submitted', { parsed_ok: false });
      if (e.code === 'cap_reached') return apiError(429, 'cap_reached', 'You can make 10 changes a day.');
      return apiError(503, e.code, 'We could not understand that right now. Please try again.');
    }
    throw e;
  }
}
