import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { Db } from '@/lib/db';
import { createHousehold } from '@/lib/household';
import { createPlan } from '@/lib/plans/service';
import { runSlot, type Sender } from '@/lib/notify/send';
import { isoDateInSA } from '@/lib/period';
import { seededTestDb } from './helpers';

let db: Db;
let pg: PGlite;
let checkers: number;
beforeAll(async () => {
  ({ db, pg } = await seededTestDb());
  checkers = Number((await pg.query<{ id: number }>(`select id from branches where name = 'TEST Checkers Somerset West'`)).rows[0]!.id);
  await pg.query('delete from push_subscriptions');
});

describe('scheduler (§14)', () => {
  it('tonight at 16:00: sends once, logs, respects quiet hours and removes dead subscriptions', async () => {
    const today = isoDateInSA(new Date());
    const h = await createHousehold(db, crypto.randomUUID());
    await createPlan(db, h, { household: { light: 0, average: 2, big: 0 }, shops: { mainBranchId: checkers, topUpBranchId: null }, days: 7 });
    await pg.query(`insert into push_subscriptions (household_id, endpoint, keys) values ($1, $2, '{"p256dh":"x","auth":"y"}')`, [h.id, `https://push.example/${h.id}`]);
    const payloads: string[] = [];
    const sender: Sender = async (_s, p) => (payloads.push(p), { gone: false });

    const quiet = await runSlot(db, 'tonight', { now: new Date(`${today}T19:00:00Z`), sender }); // 21:00 SAST
    expect(quiet.sent).toBe(0);
    const first = await runSlot(db, 'tonight', { now: new Date(`${today}T14:00:00Z`), sender });
    expect(first.sent).toBe(1);
    const p = JSON.parse(payloads[0]!);
    expect(p.title).toMatch(/^Tonight: /);
    expect(p.url).toMatch(/^\/recipe\//);
    expect(p.id).toBeGreaterThan(0);
    const again = await runSlot(db, 'tonight', { now: new Date(`${today}T14:05:00Z`), sender });
    expect(again.sent).toBe(0);
    const logs = await pg.query<{ kind: string }>(`select kind from notification_log where household_id = $1`, [h.id]);
    expect(logs.rows.map((r) => r.kind)).toEqual(['tonight']);

    const gone: Sender = async () => ({ gone: true });
    await pg.query(`delete from notification_log where household_id = $1`, [h.id]);
    const r = await runSlot(db, 'tonight', { now: new Date(`${today}T14:00:00Z`), sender: gone });
    expect(r.gone).toBe(1);
    expect((await pg.query(`select 1 from push_subscriptions where household_id = $1`, [h.id])).rows).toHaveLength(0);
  });

  it('opted-out kinds are never sent', async () => {
    const today = isoDateInSA(new Date());
    const h = await createHousehold(db, crypto.randomUUID());
    await createPlan(db, h, { household: { light: 0, average: 1, big: 0 }, shops: { mainBranchId: checkers, topUpBranchId: null }, days: 3 });
    await pg.query(`update households set notification_opt_out = '{tonight}' where id = $1`, [h.id]);
    await pg.query(`insert into push_subscriptions (household_id, endpoint, keys) values ($1, $2, '{"p256dh":"x","auth":"y"}')`, [h.id, `https://push.example/${h.id}`]);
    const sent: string[] = [];
    await runSlot(db, 'tonight', { now: new Date(`${today}T14:00:00Z`), sender: async (s) => (sent.push(s.endpoint), { gone: false }) });
    expect(sent).not.toContain(`https://push.example/${h.id}`);
  });
});
