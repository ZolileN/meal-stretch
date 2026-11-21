/** Pilot dashboard (§16, Phase 8): activation, W1–W4 retention, savings, budget fit, list size, receipt match rate. */
import { sql } from 'drizzle-orm';
import { query, type Db } from '@/lib/db';

export async function pilotMetrics(db: Db) {
  const [funnel] = await query<Record<string, number>>(
    db,
    sql`with started as (select household_id, min(created_at) t from events where name = 'onboarding_started' and household_id is not null group by 1),
        planned as (select household_id, min(created_at) t from events where name = 'plan_generated' and household_id is not null group by 1)
        select
          (select count(*)::int from started) as started,
          (select count(*)::int from started s join planned p using (household_id) where p.t <= s.t + interval '1 day') as activated,
          (select count(*)::int from planned) as planned,
          (select count(distinct household_id)::int from events where name = 'plan_marked_shopped') as shopped,
          (select count(distinct household_id)::int from events where name = 'receipt_verified') as receipts,
          (select count(distinct household_id)::int from events where name = 'account_created') as accounts`,
  );
  const retention = await query<{ cohort: string; size: number; w1: number; w2: number; w3: number; w4: number }>(
    db,
    sql`with first as (select household_id, date_trunc('week', min(created_at)) wk from events where name = 'plan_generated' and household_id is not null group by 1),
        weeks as (select distinct e.household_id, (date_trunc('week', e.created_at) - f.wk) / 7 as k
                  from events e join first f using (household_id) where e.name = 'plan_generated')
        select to_char(f.wk, 'YYYY-MM-DD') cohort, count(*)::int size,
          count(*) filter (where exists (select 1 from weeks w where w.household_id = f.household_id and extract(day from w.k) = 1))::int w1,
          count(*) filter (where exists (select 1 from weeks w where w.household_id = f.household_id and extract(day from w.k) = 2))::int w2,
          count(*) filter (where exists (select 1 from weeks w where w.household_id = f.household_id and extract(day from w.k) = 3))::int w3,
          count(*) filter (where exists (select 1 from weeks w where w.household_id = f.household_id and extract(day from w.k) = 4))::int w4
        from first f group by f.wk order by f.wk desc limit 12`,
  );
  const savings = await query<{ bucket: string; n: number }>(
    db,
    sql`select case when (props->>'savings_pct')::int < 5 then '0–4%' when (props->>'savings_pct')::int < 10 then '5–9%'
                    when (props->>'savings_pct')::int < 15 then '10–14%' when (props->>'savings_pct')::int < 20 then '15–19%' else '20%+' end bucket,
               count(*)::int n
        from events where name = 'plan_generated' group by 1 order by min((props->>'savings_pct')::int)`,
  );
  const [budget] = await query<{ with_budget: number; under: number }>(
    db,
    sql`select count(*) filter (where props->>'status' in ('under', 'over'))::int with_budget, count(*) filter (where props->>'status' = 'under')::int under
        from events where name = 'plan_generated'`,
  );
  const listSize = await query<{ items: number; n: number }>(
    db,
    sql`select (props->>'items')::int items, count(*)::int n from events where name = 'plan_generated' group by 1 order by 1`,
  );
  const [lists] = await query<{ median: number | null }>(
    db,
    sql`select percentile_cont(0.5) within group (order by (result->'totals'->>'items')::int) median
        from plans where days = 7 and (request->'household'->>'light')::int * 75 + (request->'household'->>'average')::int * 100 + (request->'household'->>'big')::int * 140 between 350 and 450`,
  );
  const [receipts] = await query<{ rate: number | null }>(db, sql`select avg((props->>'match_rate')::float) rate from events where name = 'receipt_verified'`);
  return {
    funnel: Object.fromEntries(Object.entries(funnel ?? {}).map(([k, v]) => [k, Number(v)])),
    activationPct: funnel && Number(funnel.started) ? Math.round((Number(funnel.activated) / Number(funnel.started)) * 100) : null,
    retention,
    savings,
    budgetFitPct: budget && Number(budget.with_budget) ? Math.round((Number(budget.under) / Number(budget.with_budget)) * 100) : null,
    listSize,
    medianItems7DaysFamily4: lists?.median === null || lists?.median === undefined ? null : Number(lists.median),
    receiptMatchRatePct: receipts?.rate === null || receipts?.rate === undefined ? null : Math.round(Number(receipts.rate) * 100),
  };
}
