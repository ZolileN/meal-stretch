/** ADM-5 branch reports queue: accept/reject; accepted creates/updates the branch with verified = true. */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';

export async function openReports(db: Db) {
  return query<{ id: number; kind: string; retailer_id: string | null; retailer_text: string | null; branch_id: number | null; note: string | null; lat: number | null; lng: number | null; created_at: string }>(
    db,
    sql`select id, kind, retailer_id, retailer_text, branch_id, note, st_y(geom::geometry) lat, st_x(geom::geometry) lng, created_at
        from branch_reports where status = 'open' order by created_at limit 200`,
  );
}

export async function acceptReport(db: Db, reportId: number, opts: { name?: string; retailerId?: string } = {}) {
  const [r] = await query<{ kind: string; retailer_id: string | null; branch_id: number | null; has_geom: boolean }>(
    db,
    sql`select kind, retailer_id, branch_id, geom is not null as has_geom from branch_reports where id = ${reportId} and status = 'open'`,
  );
  if (!r) throw new Error('Report not open');
  let branchId: number | null = r.branch_id === null ? null : Number(r.branch_id);
  if (r.kind === 'missing') {
    const retailer = opts.retailerId ?? r.retailer_id;
    if (!retailer || !r.has_geom || !opts.name) throw new Error('A missing shop needs a chain, a name and a location');
    const [b] = await query<{ id: string | number }>(
      db,
      sql`insert into branches (retailer_id, name, geom, verified, source)
          select ${retailer}, ${opts.name}, geom, true, 'report' from branch_reports where id = ${reportId} returning id`,
    );
    branchId = Number(b!.id);
  } else if (r.kind === 'closed' && branchId !== null) {
    await db.execute(sql`update branches set active = false, verified = true, updated_at = now() where id = ${branchId}`);
  } else if (r.kind === 'wrong_location' && branchId !== null && r.has_geom) {
    await db.execute(
      sql`update branches set geom = (select geom from branch_reports where id = ${reportId}), verified = true, updated_at = now() where id = ${branchId}`,
    );
  }
  await db.execute(sql`update branch_reports set status = 'accepted', resolved_branch_id = ${branchId}, resolved_at = now() where id = ${reportId}`);
  return branchId;
}

export async function rejectReport(db: Db, reportId: number) {
  await db.execute(sql`update branch_reports set status = 'rejected', resolved_at = now() where id = ${reportId} and status = 'open'`);
}
