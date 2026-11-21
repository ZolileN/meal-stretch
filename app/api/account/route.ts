/** DELETE /api/account: delete the household (and account) data (ACC-4). */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { apiError } from '@/lib/api';
import { getDb } from '@/lib/db';
import { currentHousehold, DEVICE_COOKIE } from '@/lib/household';
import { sessionUser } from '@/lib/auth/session';
import { deleteHousehold } from '@/lib/account';

export async function DELETE() {
  const db = getDb();
  const [h, user] = await Promise.all([currentHousehold(db), sessionUser()]);
  if (!h && !user) return apiError(404, 'not_found', 'Nothing to delete');
  if (h) await deleteHousehold(db, h.id, user?.id ?? null);
  else if (user) await deleteHousehold(db, '00000000-0000-0000-0000-000000000000', user.id);
  const store = await cookies();
  store.delete(DEVICE_COOKIE);
  for (const c of store.getAll()) if (c.name.includes('authjs')) store.delete(c.name);
  return NextResponse.json({ deleted: true });
}
