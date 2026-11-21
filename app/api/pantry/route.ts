/** GET/PUT /api/pantry: pantry items (PLN-11). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseBody } from '@/lib/api';
import { getDb } from '@/lib/db';
import { currentHousehold, ensureHousehold } from '@/lib/household';
import { setPantry } from '@/lib/plans/actions';
import { pantryOf } from '@/lib/plans/service';

const schema = z.object({ items: z.array(z.object({ ingredientId: z.string().regex(/^[a-z0-9_]{2,60}$/), qty: z.number().int().min(0).max(1_000_000) })).max(100) }).strict();

export async function GET() {
  const db = getDb();
  const h = await currentHousehold(db);
  return NextResponse.json({ items: h ? await pantryOf(db, h.id) : [] });
}

export async function PUT(req: Request) {
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const db = getDb();
  const h = await ensureHousehold(db);
  return NextResponse.json({ items: await setPantry(db, h, body.data.items) });
}
