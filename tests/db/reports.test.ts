import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createBranchReport, reportSchema } from '@/lib/location/reports';
import type { Db } from '@/lib/db';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
});

describe('branch reports (LOC-5)', () => {
  it('stores retailer, note and a coarse point', async () => {
    const id = await createBranchReport(db, {
      kind: 'missing', retailerId: 'boxer', note: 'near taxi rank', point: { lat: -34.07712, lng: 18.84619 }, householdId: null,
    });
    const r = await pg.query<{ retailer_id: string; note: string; lat: number; lng: number; status: string }>(
      'select retailer_id, note, st_y(geom::geometry) lat, st_x(geom::geometry) lng, status from branch_reports where id = $1', [id],
    );
    expect(r.rows[0]).toMatchObject({ retailer_id: 'boxer', note: 'near taxi rank', status: 'open' });
    expect(r.rows[0]!.lat).toBeCloseTo(-34.077, 6);
    expect(r.rows[0]!.lng).toBeCloseTo(18.846, 6);
  });
  it('works without a point', async () => {
    const id = await createBranchReport(db, { kind: 'closed', retailerText: 'Corner Superette', point: null, householdId: null });
    expect(id).toBeGreaterThan(0);
  });
  it('validates input', () => {
    expect(reportSchema.safeParse({ kind: 'missing' }).success).toBe(false);
    expect(reportSchema.safeParse({ retailerId: 'DROP TABLE' }).success).toBe(false);
    expect(reportSchema.safeParse({ retailerId: 'spar', note: 'x'.repeat(501) }).success).toBe(false);
    expect(reportSchema.safeParse({ retailerId: 'spar' }).success).toBe(true);
  });
});
