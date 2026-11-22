/** POST/DELETE /api/push/subscribe: Web Push subscription (consent recorded, §14). */
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { limitOr429, parseBody } from '@/lib/api';
import { getDb } from '@/lib/db';
import { currentHousehold, ensureHousehold } from '@/lib/household';
import { track } from '@/lib/events';

const schema = z.object({ endpoint: z.string().url().max(1000).startsWith('https://'), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }) });

export async function POST(req: Request) {
  const limited = await limitOr429(req, 'push-subscribe', 10, 3600);
  if (limited) return limited;
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const db = getDb();
  const h = await ensureHousehold(db);
  await db.execute(
    sql`insert into push_subscriptions (household_id, endpoint, keys) values (${h.id}::uuid, ${body.data.endpoint}, ${JSON.stringify(body.data.keys)}::jsonb)
        on conflict (endpoint) do update set household_id = excluded.household_id, keys = excluded.keys`,
  );
  await db.execute(sql`update households set push_consent_at = coalesce(push_consent_at, now()) where id = ${h.id}::uuid`);
  await track(db, h.id, 'push_permission', { granted: true });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  const body = await parseBody(req, z.object({ endpoint: z.string().url().max(1000) }));
  if (!body.ok) return body.res;
  const db = getDb();
  const h = await currentHousehold(db);
  if (h) await db.execute(sql`delete from push_subscriptions where endpoint = ${body.data.endpoint} and household_id = ${h.id}::uuid`);
  return NextResponse.json({ ok: true });
}
