/**
 * Anonymous household (ONB-1, ACC-1): identified by an httpOnly device_id cookie (1 year).
 * Signed-in users are resolved through their session in Phase 8 (lib/auth).
 */
import { cookies } from 'next/headers';
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';
import { env } from '@/lib/env';

export const DEVICE_COOKIE = 'ms_device';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface Household {
  id: string;
  deviceId: string | null;
  userId: string | null;
  light: number;
  average: number;
  big: number;
  loyalty: string[];
  exclusions: string[];
  neverSwapProteins: string[];
  paydayDom: number | null;
  language: 'en' | 'xh' | 'af';
  mainBranchId: number | null;
  topUpBranchId: number | null;
  receiptConsentAt: string | null;
  pushConsentAt: string | null;
  notificationOptOut: string[];
  createdAt: string;
}

type Row = Record<string, unknown>;
export function mapHousehold(r: Row): Household {
  const ts = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: String(r.id),
    deviceId: (r.device_id as string) ?? null,
    userId: (r.user_id as string) ?? null,
    light: Number(r.light),
    average: Number(r.average),
    big: Number(r.big),
    loyalty: (r.loyalty as string[]) ?? [],
    exclusions: (r.exclusions as string[]) ?? [],
    neverSwapProteins: (r.never_swap_proteins as string[]) ?? [],
    paydayDom: r.payday_dom === null || r.payday_dom === undefined ? null : Number(r.payday_dom),
    language: (r.language as Household['language']) ?? 'en',
    mainBranchId: r.main_branch_id === null || r.main_branch_id === undefined ? null : Number(r.main_branch_id),
    topUpBranchId: r.top_up_branch_id === null || r.top_up_branch_id === undefined ? null : Number(r.top_up_branch_id),
    receiptConsentAt: ts(r.receipt_consent_at),
    pushConsentAt: ts(r.push_consent_at),
    notificationOptOut: (r.notification_opt_out as string[]) ?? [],
    createdAt: ts(r.created_at)!,
  };
}

export async function householdByDevice(db: Db, deviceId: string): Promise<Household | null> {
  if (!UUID.test(deviceId)) return null;
  const rows = await query<Row>(db, sql`select * from households where device_id = ${deviceId}::uuid and merged_into is null`);
  return rows[0] ? mapHousehold(rows[0]) : null;
}

export async function householdById(db: Db, id: string): Promise<Household | null> {
  if (!UUID.test(id)) return null;
  const rows = await query<Row>(db, sql`select * from households where id = ${id}::uuid`);
  return rows[0] ? mapHousehold(rows[0]) : null;
}

export async function createHousehold(db: Db, deviceId: string): Promise<Household> {
  const rows = await query<Row>(
    db,
    sql`insert into households (device_id) values (${deviceId}::uuid)
        on conflict (device_id) do update set updated_at = now() returning *`,
  );
  return mapHousehold(rows[0]!);
}

export async function householdByUser(db: Db, userId: string): Promise<Household | null> {
  const rows = await query<Row>(db, sql`select * from households where user_id = ${userId}::uuid and merged_into is null order by created_at limit 1`);
  return rows[0] ? mapHousehold(rows[0]) : null;
}

/** Household for this request: the signed-in account's first, else the device cookie's. Never creates one. */
export async function currentHousehold(db: Db): Promise<Household | null> {
  const { sessionUser } = await import('@/lib/auth/session');
  const user = await sessionUser();
  if (user) {
    const h = await householdByUser(db, user.id);
    if (h) return h;
  }
  const store = await cookies();
  const id = store.get(DEVICE_COOKIE)?.value;
  const h = id ? await householdByDevice(db, id) : null;
  // Never hand a household that belongs to someone else to a different signed-in user.
  if (h && user && h.userId && h.userId !== user.id) return null;
  return h && (!h.userId || h.userId === user?.id) ? h : null;
}

/** Route handlers only: get or create the anonymous household and set the device cookie. */
export async function ensureHousehold(db: Db): Promise<Household> {
  const existing = await currentHousehold(db);
  if (existing) return existing;
  const store = await cookies();
  let id = store.get(DEVICE_COOKIE)?.value;
  if (!id || !UUID.test(id) || (await householdByDevice(db, id))) id = crypto.randomUUID();
  store.set(DEVICE_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().NODE_ENV === 'production',
    path: '/',
    maxAge: 365 * 24 * 3600,
  });
  const created = await createHousehold(db, id);
  const { sessionUser } = await import('@/lib/auth/session');
  const user = await sessionUser();
  if (!user) return created;
  const rows = await query<Row>(db, sql`update households set user_id = ${user.id}::uuid where id = ${created.id}::uuid returning *`);
  return mapHousehold(rows[0]!);
}

export interface HouseholdPatch {
  light?: number;
  average?: number;
  big?: number;
  loyalty?: string[];
  exclusions?: string[];
  neverSwapProteins?: string[];
  paydayDom?: number | null;
  language?: 'en' | 'xh' | 'af';
  mainBranchId?: number | null;
  topUpBranchId?: number | null;
  notificationOptOut?: string[];
}

const arr = (v: string[]) => `{${v.map((x) => `"${x.replace(/["\\]/g, '')}"`).join(',')}}`;

export async function updateHousehold(db: Db, id: string, p: HouseholdPatch): Promise<Household> {
  const sets = [];
  if (p.light !== undefined) sets.push(sql`light = ${p.light}`);
  if (p.average !== undefined) sets.push(sql`average = ${p.average}`);
  if (p.big !== undefined) sets.push(sql`big = ${p.big}`);
  if (p.loyalty !== undefined) sets.push(sql`loyalty = ${arr(p.loyalty)}::text[]`);
  if (p.exclusions !== undefined) sets.push(sql`exclusions = ${arr(p.exclusions)}::text[]`);
  if (p.neverSwapProteins !== undefined) sets.push(sql`never_swap_proteins = ${arr(p.neverSwapProteins)}::text[]`);
  if (p.paydayDom !== undefined) sets.push(sql`payday_dom = ${p.paydayDom}`);
  if (p.language !== undefined) sets.push(sql`language = ${p.language}`);
  if (p.mainBranchId !== undefined) sets.push(sql`main_branch_id = ${p.mainBranchId}`);
  if (p.topUpBranchId !== undefined) sets.push(sql`top_up_branch_id = ${p.topUpBranchId}`);
  if (p.notificationOptOut !== undefined) sets.push(sql`notification_opt_out = ${arr(p.notificationOptOut)}::text[]`);
  sets.push(sql`updated_at = now()`);
  const rows = await query<Row>(db, sql`update households set ${sql.join(sets, sql`, `)} where id = ${id}::uuid returning *`);
  return mapHousehold(rows[0]!);
}
