/** POST /api/events: the few §16 events that happen on the device. Whitelisted names + Zod props. */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { limitOr429, parseBody } from '@/lib/api';
import { getDb } from '@/lib/db';
import { ensureHousehold } from '@/lib/household';
import { track } from '@/lib/events';

const schema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('onboarding_started'), props: z.object({}).strict().optional() }),
  z.object({ name: z.literal('location_set'), props: z.object({ source: z.enum(['gps', 'search', 'google']) }).strict() }),
  z.object({ name: z.literal('shops_set'), props: z.object({ main_retailer: z.string().regex(/^[a-z_]{2,30}$/), has_top_up: z.boolean() }).strict() }),
  z.object({ name: z.literal('cards_set'), props: z.object({ count: z.number().int().min(0).max(10) }).strict() }),
  z.object({ name: z.literal('push_permission'), props: z.object({ granted: z.boolean() }).strict() }),
]);

export async function POST(req: Request) {
  const limited = await limitOr429(req, 'events', 60, 60);
  if (limited) return limited;
  const body = await parseBody(req, schema);
  if (!body.ok) return body.res;
  const db = getDb();
  const h = await ensureHousehold(db);
  await track(db, h.id, body.data.name, body.data.props ?? {});
  return NextResponse.json({ ok: true }, { status: 202 });
}
