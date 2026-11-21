/** GET /api/receipts/:id → extraction + matching + verified savings (poll while processing). */
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { receiptView } from '@/lib/receipts/pipeline';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const db = getDb();
  const h = await currentHousehold(db);
  const v = h ? await receiptView(db, h.id, (await ctx.params).id) : null;
  if (!v) return apiError(404, 'not_found', 'Receipt not found');
  return NextResponse.json(v);
}
