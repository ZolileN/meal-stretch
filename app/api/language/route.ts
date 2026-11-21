/** POST /api/language { language } → cookie + household setting (I18N). */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { parseBody } from '@/lib/api';
import { getDb } from '@/lib/db';
import { currentHousehold, updateHousehold } from '@/lib/household';
import { LOCALE_COOKIE, locales } from '@/i18n/config';

export async function POST(req: Request) {
  const body = await parseBody(req, z.object({ language: z.enum(locales) }));
  if (!body.ok) return body.res;
  (await cookies()).set(LOCALE_COOKIE, body.data.language, { path: '/', maxAge: 365 * 24 * 3600, sameSite: 'lax' });
  const db = getDb();
  const h = await currentHousehold(db);
  if (h) await updateHousehold(db, h.id, { language: body.data.language });
  return NextResponse.json({ ok: true });
}
