/** GET/PUT /api/household: profile, loyalty, exclusions, shops (§13). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/api';
import { getDb } from '@/lib/db';
import { currentHousehold, ensureHousehold, updateHousehold } from '@/lib/household';
import { EXCLUSION_TAGS } from '@/lib/recipes/tags';

const schema = z
  .object({
    light: z.number().int().min(0).max(12),
    average: z.number().int().min(0).max(12),
    big: z.number().int().min(0).max(12),
    loyalty: z.array(z.string().regex(/^[a-z_]{2,30}$/)).max(10),
    exclusions: z.array(z.enum(EXCLUSION_TAGS)).max(EXCLUSION_TAGS.length),
    neverSwapProteins: z.array(z.string().regex(/^[a-z0-9_]{2,60}$/)).max(30),
    paydayDom: z.number().int().min(1).max(31).nullable(),
    language: z.enum(['en', 'xh', 'af']),
    mainBranchId: z.number().int().positive().nullable(),
    topUpBranchId: z.number().int().positive().nullable(),
    notificationOptOut: z.array(z.enum(['specials_day', 'tonight', 'month_end', 'payday', 'receipt_nudge'])).max(5),
  })
  .partial()
  .strict();

const publicView = (h: Awaited<ReturnType<typeof ensureHousehold>>) => {
  const { deviceId: _deviceId, ...rest } = h;
  return rest;
};

export async function GET() {
  const h = await currentHousehold(getDb());
  return NextResponse.json({ household: h ? publicView(h) : null });
}

export async function PUT(req: Request) {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const db = getDb();
  const h = await ensureHousehold(db);
  const people = (body.data.light ?? h.light) + (body.data.average ?? h.average) + (body.data.big ?? h.big);
  if (people < 1 || people > 12) return NextResponse.json({ error: { code: 'invalid_body', message: 'between 1 and 12 people' } }, { status: 400 });
  const updated = await updateHousehold(db, h.id, body.data);
  return NextResponse.json({ household: publicView(updated) });
}
