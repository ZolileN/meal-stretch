/** ACC-3: revocable household share links (read + tick). */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';

export async function createShareLink(db: Db, householdId: string): Promise<string> {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString('base64url');
  await db.execute(sql`insert into share_links (token, household_id) values (${token}, ${householdId}::uuid)`);
  return token;
}

export async function listShareLinks(db: Db, householdId: string) {
  return query<{ token: string; created_at: string }>(
    db,
    sql`select token, created_at from share_links where household_id = ${householdId}::uuid and revoked_at is null order by created_at desc`,
  );
}

export async function revokeShareLink(db: Db, householdId: string, token: string): Promise<boolean> {
  const r = await query<{ token: string }>(
    db,
    sql`update share_links set revoked_at = now() where token = ${token} and household_id = ${householdId}::uuid and revoked_at is null returning token`,
  );
  return r.length > 0;
}

/** Household behind an active (not revoked) token; null otherwise. */
export async function resolveShare(db: Db, token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [r] = await query<{ household_id: string }>(
    db,
    sql`select s.household_id from share_links s join households h on h.id = s.household_id
        where s.token = ${token} and s.revoked_at is null and h.merged_into is null`,
  );
  return r?.household_id ?? null;
}
