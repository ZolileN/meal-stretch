/** Vercel Cron: delete receipt images after 30 days (RCP-6). */
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { apiError } from '@/lib/api';
import { cronAuthorized } from '@/lib/cron';
import { getDb, query } from '@/lib/db';
import { deleteBlob } from '@/lib/blob';
import { log } from '@/lib/log';

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return apiError(401, 'unauthorized', 'Cron only');
  const db = getDb();
  const due = await query<{ id: string; image_url: string }>(
    db,
    sql`select id, image_url from receipts where image_url is not null and image_delete_after < now() limit 500`,
  );
  let deleted = 0;
  for (const r of due) {
    try {
      await deleteBlob(r.image_url);
      await db.execute(sql`update receipts set image_url = null where id = ${r.id}::uuid`);
      deleted++;
    } catch (e) {
      log.error('receipt_image_delete_failed', { id: r.id, error: String(e) });
    }
  }
  return NextResponse.json({ deleted });
}
