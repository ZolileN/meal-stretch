/** GET /api/account/export: everything we hold about this household as JSON (ACC-4). */
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { sessionUser } from '@/lib/auth/session';
import { exportHousehold } from '@/lib/account';

export async function GET() {
  const db = getDb();
  const h = await currentHousehold(db);
  if (!h) return apiError(404, 'not_found', 'No data yet');
  const user = await sessionUser();
  const data = await exportHousehold(db, h.id, user?.id ?? null);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
