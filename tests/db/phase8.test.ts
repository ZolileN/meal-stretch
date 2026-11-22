import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/db';
import { createHousehold, householdById, householdByUser } from '@/lib/household';
import { createPlan, latestPlan } from '@/lib/plans/service';
import { markShopped } from '@/lib/plans/actions';
import { attachDeviceHousehold, mergeHouseholds } from '@/lib/auth/merge';
import { dbAdapter } from '@/lib/auth/adapter';
import { lifetimeSavings } from '@/lib/savings';
import { createShareLink, resolveShare, revokeShareLink } from '@/lib/share';
import { deleteHousehold, exportHousehold } from '@/lib/account';
import { costPreview, getRecipe, saveRecipe } from '@/lib/admin/recipes';
import { acceptReport, openReports, rejectReport } from '@/lib/admin/reports';
import { priceHealth } from '@/lib/admin/health';
import { pilotMetrics } from '@/lib/pilot';
import { createBranchReport } from '@/lib/location/reports';
import { track } from '@/lib/events';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let checkers: number;
beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  checkers = Number((await pg.query<{ id: number }>(`select id from branches where name = 'TEST Checkers Somerset West'`)).rows[0]!.id);
});

const shops = () => ({ mainBranchId: checkers, topUpBranchId: null });
const newUser = async (email: string) => dbAdapter(() => db).createUser!({ id: '', email, emailVerified: null });

describe('accounts (ACC-2): attach or merge the anonymous household', () => {
  it('first sign-in attaches the device household and syncs user_shops', async () => {
    const device = crypto.randomUUID();
    const h = await createHousehold(db, device);
    await createPlan(db, h, { shops: shops(), days: 3 });
    const u = await newUser(`a${Date.now()}@example.com`);
    const id = await attachDeviceHousehold(db, u.id, device);
    expect(id).toBe(h.id);
    expect((await householdByUser(db, u.id))!.id).toBe(h.id);
    const us = await pg.query(`select main_branch_id from user_shops where user_id = $1`, [u.id]);
    expect(Number((us.rows[0] as { main_branch_id: number }).main_branch_id)).toBe(checkers);
    expect(await attachDeviceHousehold(db, u.id, device)).toBe(h.id); // idempotent
  });

  it('second phone: anonymous data merges into the account without duplicates', async () => {
    const u = await newUser(`b${Date.now()}@example.com`);
    const phoneA = await createHousehold(db, crypto.randomUUID());
    await attachDeviceHousehold(db, u.id, phoneA.deviceId);
    const planA = await createPlan(db, (await householdById(db, phoneA.id))!, { shops: shops(), days: 3 });
    await markShopped(db, phoneA, planA);

    const phoneB = await createHousehold(db, crypto.randomUUID());
    const planB = await createPlan(db, phoneB, { shops: shops(), days: 4 });
    await markShopped(db, phoneB, planB);
    await pg.query(`insert into pantry_items (household_id, ingredient_id, qty) values ($1, 'rice', 500), ($2, 'rice', 800)`, [phoneA.id, phoneB.id]);

    await attachDeviceHousehold(db, u.id, phoneB.deviceId);
    expect(await mergeHouseholds(db, phoneB.id, phoneA.id)).toBe(false); // already merged
    const life = await lifetimeSavings(db, phoneA.id);
    expect(life.totalCents).toBe(planA.result.totals.savingsCents + planB.result.totals.savingsCents);
    expect(life.shoppedPlans).toBe(2);
    const rice = await pg.query<{ qty: number }>(`select qty from pantry_items where household_id = $1 and ingredient_id = 'rice'`, [phoneA.id]);
    expect(Number(rice.rows[0]!.qty)).toBe(800);
    expect((await householdById(db, phoneB.id))!.deviceId).toBeNull();
    const plans = await pg.query<{ n: number }>(`select count(*)::int n from plans where household_id = $1`, [phoneA.id]);
    expect(plans.rows[0]!.n).toBe(2);
  });

  it("shared phone: signing in never takes over another account's household", async () => {
    const device = crypto.randomUUID();
    const h = await createHousehold(db, device);
    const owner = await newUser(`c${Date.now()}@example.com`);
    expect(await attachDeviceHousehold(db, owner.id, device)).toBe(h.id);
    // owner signs out; someone else signs in on the same phone (cookie unchanged)
    const other = await newUser(`d${Date.now()}@example.com`);
    expect(await attachDeviceHousehold(db, other.id, device)).toBeNull();
    expect((await householdById(db, h.id))!.userId).toBe(owner.id);
    expect(await householdByUser(db, other.id)).toBeNull();
    const access = await pg.query(`select 1 from household_members_access where household_id = $1 and user_id = $2`, [h.id, other.id]);
    expect(access.rows).toHaveLength(0);
    // the owner signing back in still gets their household
    expect(await attachDeviceHousehold(db, owner.id, device)).toBe(h.id);
  });
});

describe('share links (ACC-3)', () => {
  it('create → resolve → revoke', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    const token = await createShareLink(db, h.id);
    expect(token.length).toBeGreaterThanOrEqual(30);
    expect(await resolveShare(db, token)).toBe(h.id);
    expect(await resolveShare(db, 'nope')).toBeNull();
    const other = await createHousehold(db, crypto.randomUUID());
    expect(await revokeShareLink(db, other.id, token)).toBe(false);
    expect(await revokeShareLink(db, h.id, token)).toBe(true);
    expect(await resolveShare(db, token)).toBeNull();
  });
});

describe('export + delete (ACC-4)', () => {
  it('export has everything; delete removes the household but keeps price observations without the link', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    const plan = await createPlan(db, h, { shops: shops(), days: 3 });
    await markShopped(db, h, plan);
    await track(db, h.id, 'list_opened');
    const prod = Number((await pg.query<{ id: number }>(`select id from products limit 1`)).rows[0]!.id);
    await pg.query(`insert into price_observations (product_id, branch_id, retailer_id, price_cents, source, observed_at, household_id) values ($1, $2, 'checkers', 1234, 'receipt', now(), $3)`, [prod, checkers, h.id]);
    const ex = await exportHousehold(db, h.id, null);
    expect(ex.plans).toHaveLength(1);
    expect(ex.savings).toHaveLength(1);
    expect(ex.events.length).toBeGreaterThan(0);

    await deleteHousehold(db, h.id, null);
    expect(await householdById(db, h.id)).toBeNull();
    expect((await pg.query(`select 1 from plans where household_id = $1`, [h.id])).rows).toHaveLength(0);
    expect((await pg.query(`select 1 from savings_events where household_id = $1`, [h.id])).rows).toHaveLength(0);
    expect((await pg.query(`select 1 from events where household_id = $1`, [h.id])).rows).toHaveLength(0);
    const obs = await pg.query<{ household_id: string | null }>(`select household_id from price_observations where price_cents = 1234 and product_id = $1`, [prod]);
    expect(obs.rows[0]!.household_id).toBeNull();
  });
});

describe('admin (ADM-4/5/6) + pilot dashboard', () => {
  it('recipe editor: save derives contains tags, publishes, previews cost at a branch', async () => {
    await saveRecipe(db, {
      id: 'test_pap_and_wors', name: 'Test pap & wors', description: null, cookMinutes: 30, tags: ['protein:boerewors', 'starch:maize_meal', 'meat_free'],
      steps: ['Cook pap', 'Fry wors'], ingredients: [{ ingredientId: 'boerewors', qtyPerServing: 125, optional: false }, { ingredientId: 'maize_meal', qtyPerServing: 100, optional: false }, { ingredientId: 'salt', qtyPerServing: 2, optional: false }],
      published: true,
    });
    const r = (await getRecipe(db, 'test_pap_and_wors'))!;
    expect(r.ingredients.map((i) => i.ingredientId)).toEqual(['boerewors', 'maize_meal', 'salt']);
    const tags = (await pg.query<{ tags: string[] }>(`select tags from recipes where id = 'test_pap_and_wors'`)).rows[0]!.tags;
    expect(tags).toEqual(expect.arrayContaining(['contains:beef', 'contains:pork']));
    expect(tags).not.toContain('meat_free');
    await saveRecipe(db, { ...r, ingredients: r.ingredients.filter((i) => i.ingredientId !== 'salt') });
    expect((await getRecipe(db, 'test_pap_and_wors'))!.ingredients).toHaveLength(2);
    await expect(saveRecipe(db, { ...r, ingredients: [{ ingredientId: 'unicorn', qtyPerServing: 1, optional: false }] })).rejects.toThrow(/Unknown ingredients/);
    const cost = await costPreview(db, r, checkers, 4, new Date().toISOString().slice(0, 10));
    expect(cost.packsCents).toBeGreaterThan(0);
    expect(cost.perPlateCents).toBeGreaterThan(0);
    expect(cost.unpriced).toEqual([]);
  });

  it('branch reports: accept missing → verified branch; reject', async () => {
    // far from the TEST branches so other test files (shared DB) aren't affected
    const a = await createBranchReport(db, { kind: 'missing', retailerId: 'boxer', point: { lat: -29.5, lng: 24.5 }, householdId: null });
    const b = await createBranchReport(db, { kind: 'missing', retailerText: 'Spaza', point: null, householdId: null });
    expect((await openReports(db)).map((r) => Number(r.id))).toEqual(expect.arrayContaining([a, b]));
    const branchId = (await acceptReport(db, a, { name: 'Boxer Karoo Test' }))!;
    const br = await pg.query<{ verified: boolean; source: string }>(`select verified, source from branches where id = $1`, [branchId]);
    expect(br.rows[0]).toMatchObject({ verified: true, source: 'report' });
    await rejectReport(db, b);
    expect((await openReports(db)).map((r) => Number(r.id))).not.toContain(b);
  });

  it('price health: coverage and stale counts per retailer', async () => {
    const h = await priceHealth(db);
    const spar = h.find((r) => r.retailerId === 'spar')!;
    const checkersRow = h.find((r) => r.retailerId === 'checkers')!;
    expect(checkersRow.coveragePct).toBeGreaterThanOrEqual(90);
    expect(spar.stale).toBeGreaterThan(0); // fixture butternut is 10 days old
    expect(spar.coveragePct).toBeLessThan(100); // fixture SPAR lacks soya mince + chakalaka
  });

  it('pilot metrics compute from events and plans', async () => {
    const h = await createHousehold(db, crypto.randomUUID());
    await track(db, h.id, 'onboarding_started');
    await createPlan(db, h, { household: { light: 0, average: 4, big: 0 }, shops: shops(), days: 7, budgetRands: 900 });
    const m = await pilotMetrics(db);
    expect(m.funnel.started).toBeGreaterThanOrEqual(1);
    expect(m.funnel.activated).toBeGreaterThanOrEqual(1);
    expect(m.activationPct).not.toBeNull();
    expect(m.budgetFitPct).not.toBeNull();
    expect(m.savings.length).toBeGreaterThan(0);
    expect(m.medianItems7DaysFamily4).toBeGreaterThan(0);
    expect(m.retention[0]!.size).toBeGreaterThan(0);
    expect(await latestPlan(db, h.id)).not.toBeNull();
  });
});
