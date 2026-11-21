/** POST /api/push/opened { id } from the service worker → notification_log.opened_at (§14, §16). */
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { parseBody } from '@/lib/api';
import { getDb, query } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { track } from '@/lib/events';

export async function POST(req: Request) {
  const body = await parseBody(req, z.object({ id: z.number().int().positive() }));
  if (!body.ok) return body.res;
  const db = getDb();
  const h = await currentHousehold(db);
  if (!h) return NextResponse.json({ ok: false });
  const rows = await query<{ kind: string }>(
    db,
    sql`update notification_log set opened_at = coalesce(opened_at, now()) where id = ${body.data.id} and household_id = ${h.id}::uuid returning kind`,
  );
  if (rows[0]) await track(db, h.id, 'notification_opened', { kind: rows[0].kind });
  return NextResponse.json({ ok: Boolean(rows[0]) });
}
