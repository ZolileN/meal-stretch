import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { query, type Db } from '@/lib/db';
import { coarsen } from './geo';

export const reportSchema = z
  .object({
    kind: z.enum(['missing', 'closed', 'wrong_location']).default('missing'),
    retailerId: z.string().regex(/^[a-z_]{2,30}$/).nullable().optional(),
    retailerText: z.string().trim().max(80).nullable().optional(),
    branchId: z.number().int().positive().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    point: z.object({ lat: z.number().finite(), lng: z.number().finite() }).nullable().optional(),
  })
  .refine((r) => r.retailerId || r.retailerText || r.branchId, { message: 'Say which shop' });

export async function createBranchReport(
  db: Db,
  r: {
    kind: 'missing' | 'closed' | 'wrong_location';
    retailerId?: string | null;
    retailerText?: string | null;
    branchId?: number | null;
    note?: string | null;
    point: { lat: number; lng: number } | null;
    householdId: string | null;
  },
): Promise<number> {
  const p = r.point ? coarsen(r.point) : null;
  const rows = await query<{ id: string | number }>(
    db,
    sql`insert into branch_reports (kind, retailer_id, retailer_text, branch_id, note, geom, household_id)
        values (${r.kind}, ${r.retailerId ?? null}, ${r.retailerText ?? null}, ${r.branchId ?? null}, ${r.note ?? null},
                case when ${p?.lng ?? null}::float8 is null then null
                     else st_setsrid(st_makepoint(${p?.lng ?? null}::float8, ${p?.lat ?? null}::float8), 4326)::geography end,
                ${r.householdId}::uuid)
        returning id`,
  );
  return Number(rows[0]!.id);
}
