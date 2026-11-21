/** ACC-4: JSON export and delete (removes household data; price observations keep the price, lose the link). */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';
import { deleteBlob } from '@/lib/blob';
import { log } from '@/lib/log';

export async function exportHousehold(db: Db, householdId: string, userId: string | null) {
  const q = <T>(s: ReturnType<typeof sql>) => query<T>(db, s);
  const [household] = await q<Record<string, unknown>>(sql`select * from households where id = ${householdId}::uuid`);
  return {
    exportedAt: new Date().toISOString(),
    household,
    user: userId ? (await q<Record<string, unknown>>(sql`select id, email, name, created_at from users where id = ${userId}::uuid`))[0] ?? null : null,
    plans: await q(sql`select id, start_date, days, status, request, result, created_at, shopped_at from plans where household_id = ${householdId}::uuid order by created_at`),
    pantry: await q(sql`select ingredient_id, qty, updated_at from pantry_items where household_id = ${householdId}::uuid`),
    receipts: await q(sql`select id, retailer_id, purchased_on, total_cents, extraction, status, created_at from receipts where household_id = ${householdId}::uuid`),
    savings: await q(sql`select kind, ref_id, savings_cents, created_at from savings_events where household_id = ${householdId}::uuid`),
    notifications: await q(sql`select kind, sent_at, opened_at from notification_log where household_id = ${householdId}::uuid`),
    shareLinks: await q(sql`select created_at, revoked_at from share_links where household_id = ${householdId}::uuid`),
    events: await q(sql`select name, props, created_at from events where household_id = ${householdId}::uuid order by created_at`),
  };
}

export async function deleteHousehold(db: Db, householdId: string, userId: string | null) {
  const images = await query<{ image_url: string }>(db, sql`select image_url from receipts where household_id = ${householdId}::uuid and image_url is not null`);
  for (const i of images) await deleteBlob(i.image_url).catch((e) => log.error('blob_delete_failed', { error: String(e) }));
  await db.execute(sql`update events set household_id = null, props = props - 'household_id' where household_id = ${householdId}::uuid`);
  await db.execute(sql`update llm_calls set household_id = null, output = null where household_id = ${householdId}::uuid`);
  await db.execute(sql`update branch_reports set household_id = null where household_id = ${householdId}::uuid`);
  // Merged-in (older) households of the same person go too.
  await db.execute(sql`delete from households where merged_into = ${householdId}::uuid`);
  // Cascades: plans, ticks, pantry, receipts (+ lines), savings, push, notifications, share links, access.
  // price_observations.household_id is ON DELETE SET NULL: the price stays, the link to the person goes.
  await db.execute(sql`delete from households where id = ${householdId}::uuid`);
  if (userId) await db.execute(sql`delete from users where id = ${userId}::uuid`);
}
