/**
 * ACC-2: on sign-in, attach the anonymous device household to the account, or merge it into the
 * account's existing household. Idempotent: a household is only merged once (merged_into guard),
 * and savings_events' unique(kind, ref_id) prevents double counting.
 */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';
import { householdByDevice, householdByUser } from '@/lib/household';

export { householdByUser };

export async function mergeHouseholds(db: Db, fromId: string, toId: string): Promise<boolean> {
  if (fromId === toId) return false;
  const [r] = await query<{ merged: number }>(
    db,
    sql`with m as (
          update households set merged_into = ${toId}::uuid, device_id = null, updated_at = now()
          where id = ${fromId}::uuid and merged_into is null returning id
        ),
        p as (update plans set household_id = ${toId}::uuid where household_id in (select id from m) returning 1),
        r as (update receipts set household_id = ${toId}::uuid where household_id in (select id from m) returning 1),
        s as (update savings_events set household_id = ${toId}::uuid where household_id in (select id from m) returning 1),
        ps as (update push_subscriptions set household_id = ${toId}::uuid where household_id in (select id from m) returning 1),
        nl as (update notification_log set household_id = ${toId}::uuid where household_id in (select id from m) returning 1),
        sl as (update share_links set household_id = ${toId}::uuid where household_id in (select id from m) returning 1),
        ev as (update events set household_id = ${toId}::uuid where household_id in (select id from m) returning 1),
        lc as (update llm_calls set household_id = ${toId}::uuid where household_id in (select id from m) returning 1),
        po as (update price_observations set household_id = ${toId}::uuid where household_id in (select id from m) returning 1),
        pa as (
          insert into pantry_items (household_id, ingredient_id, qty)
          select ${toId}::uuid, ingredient_id, qty from pantry_items where household_id in (select id from m)
          on conflict (household_id, ingredient_id) do update set qty = greatest(pantry_items.qty, excluded.qty), updated_at = now()
          returning 1
        )
        select count(*)::int as merged from m`,
  );
  if (!r?.merged) return false;
  // Keep only the newest active plan.
  await db.execute(
    sql`update plans set status = 'archived', updated_at = now()
        where household_id = ${toId}::uuid and status = 'active'
          and id <> (select id from plans where household_id = ${toId}::uuid and status = 'active' order by created_at desc limit 1)`,
  );
  return true;
}

/** Called right after sign-in with the device cookie (if any). Returns the account's household id. */
export async function attachDeviceHousehold(db: Db, userId: string, deviceId: string | null): Promise<string | null> {
  const found = deviceId ? await householdByDevice(db, deviceId) : null;
  // Shared phone: the cookie may still point at someone else's household after they signed out. Never take it over.
  const device = found && (found.userId === null || found.userId === userId) ? found : null;
  const mine = await householdByUser(db, userId);
  let target: string | null = mine?.id ?? null;
  if (device && !mine) {
    await db.execute(sql`update households set user_id = ${userId}::uuid, updated_at = now() where id = ${device.id}::uuid`);
    target = device.id;
  } else if (device && mine && device.id !== mine.id && device.userId === null) {
    await mergeHouseholds(db, device.id, mine.id);
  }
  if (!target) return null;
  await db.execute(
    sql`insert into household_members_access (household_id, user_id, role) values (${target}::uuid, ${userId}::uuid, 'owner') on conflict do nothing`,
  );
  // LOC-4: shops synced to user_shops on sign-up
  await db.execute(
    sql`insert into user_shops (user_id, main_branch_id, top_up_branch_id, loyalty)
        select ${userId}::uuid, main_branch_id, top_up_branch_id, loyalty from households where id = ${target}::uuid and main_branch_id is not null
        on conflict (user_id) do update set main_branch_id = excluded.main_branch_id, top_up_branch_id = excluded.top_up_branch_id,
          loyalty = excluded.loyalty, updated_at = now()`,
  );
  return target;
}
