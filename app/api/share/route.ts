/** GET/POST/DELETE /api/share: household share links (ACC-3). */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, parseBody } from '@/lib/api';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { currentHousehold, ensureHousehold } from '@/lib/household';
import { createShareLink, listShareLinks, revokeShareLink } from '@/lib/share';
import { track } from '@/lib/events';

export async function GET() {
  const db = getDb();
  const h = await currentHousehold(db);
  return NextResponse.json({ links: h ? await listShareLinks(db, h.id) : [] });
}

export async function POST() {
  const db = getDb();
  const h = await ensureHousehold(db);
  const token = await createShareLink(db, h.id);
  await track(db, h.id, 'share_link_created');
  return NextResponse.json({ token, url: `${env().APP_URL}/s/${token}` }, { status: 201 });
}

export async function DELETE(req: Request) {
  const body = await parseBody(req, z.object({ token: z.string().min(20).max(64) }));
  if (!body.ok) return body.res;
  const db = getDb();
  const h = await currentHousehold(db);
  if (!h || !(await revokeShareLink(db, h.id, body.data.token))) return apiError(404, 'not_found', 'Link not found');
  return NextResponse.json({ ok: true });
}
