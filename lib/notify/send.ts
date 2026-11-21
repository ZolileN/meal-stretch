/** Scheduler + sender (PRD §14): decides per household with lib/notify/rules.ts, sends Web Push, logs. */
import { sql } from 'drizzle-orm';
import webpush from 'web-push';
import { createTranslator } from 'next-intl';
import { query, type Db } from '@/lib/db';
import { env, features } from '@/lib/env';
import { log } from '@/lib/log';
import { formatRandShort } from '@/lib/money';
import { isoDateInSA } from '@/lib/period';
import { recipeNames } from '@/lib/recipes/queries';
import { decide, pickMorning, type NotifyKind, type NotifyState } from './rules';
import en from '@/messages/runtime/en.json';
import xh from '@/messages/runtime/xh.json';
import af from '@/messages/runtime/af.json';

const MESSAGES = { en, xh, af } as const;
type Lang = keyof typeof MESSAGES;

export interface Payload {
  title: string;
  body: string;
  url: string;
}

export type Sender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<{ gone: boolean }>;

export const webPushSender: Sender = async (sub, payload) => {
  const e = env();
  webpush.setVapidDetails(e.VAPID_SUBJECT, e.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  try {
    await webpush.sendNotification(sub, payload, { TTL: 6 * 3600 });
    return { gone: false };
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) return { gone: true };
    throw err;
  }
};

type T = (key: string, values?: Record<string, string | number>) => string;
function translator(lang: string): T {
  const l = (lang in MESSAGES ? lang : 'en') as Lang;
  return createTranslator({ locale: l, messages: MESSAGES[l] as never, namespace: 'notify' as never }) as unknown as T;
}

interface HouseholdRow {
  id: string;
  language: string;
  payday_dom: number | null;
  notification_opt_out: string[];
}

async function stateFor(db: Db, h: HouseholdRow, now: Date) {
  const [plan] = await query<{ id: string; status: NotifyState['plan'] extends infer P ? (P extends { status: infer S } ? S : never) : never; result: unknown; shopped_at: string | null; main_branch_id: number }>(
    db,
    sql`select id, status, result, shopped_at, (request->'shops'->>'mainBranchId')::bigint as main_branch_id from plans
        where household_id = ${h.id}::uuid and status in ('active', 'shopped') order by created_at desc limit 1`,
  );
  const sent = await query<{ kind: NotifyKind; sent_at: string }>(
    db,
    sql`select kind, sent_at from notification_log where household_id = ${h.id}::uuid and sent_at > now() - interval '2 days'`,
  );
  const result = (plan ? (typeof plan.result === 'string' ? JSON.parse(plan.result) : plan.result) : null) as {
    meals: { day: number; date: string; recipeId: string; perPlateCents: number }[];
  } | null;
  const shoppedAt = plan?.shopped_at ? new Date(plan.shopped_at) : null;
  const [receipt] = shoppedAt
    ? await query<{ n: number }>(db, sql`select count(*)::int as n from receipts where household_id = ${h.id}::uuid and created_at >= ${shoppedAt.toISOString()}::timestamptz`)
    : [{ n: 0 }];
  const lastSpecials = sent.filter((s) => s.kind === 'specials_day').map((s) => s.sent_at).sort().pop();
  const [specials] = plan
    ? await query<{ n: number }>(
        db,
        sql`select count(*)::int as n from price_observations o join branches b on b.id = ${plan.main_branch_id}
            where o.retailer_id = b.retailer_id and o.special_price_cents is not null and o.source in ('leaflet', 'catalogue')
              and o.created_at > coalesce(${lastSpecials ?? null}::timestamptz, now() - interval '1 day')`,
      )
    : [{ n: 0 }];
  const state: NotifyState = {
    now,
    optOut: h.notification_opt_out ?? [],
    hasSubscription: true,
    sent: sent.map((s) => ({ kind: s.kind, sentAt: new Date(s.sent_at) })),
    paydayDom: h.payday_dom === null ? null : Number(h.payday_dom),
    plan: plan ? { status: plan.status, meals: result?.meals ?? [], shoppedAt } : null,
    receiptSinceShopped: Number(receipt?.n ?? 0) > 0,
    newSpecials: Number(specials?.n ?? 0) > 0,
  };
  return { state, plan, result };
}

async function payloadFor(db: Db, kind: NotifyKind, h: HouseholdRow, now: Date, ctx: Awaited<ReturnType<typeof stateFor>>): Promise<Payload> {
  const t = translator(h.language);
  const today = isoDateInSA(now);
  switch (kind) {
    case 'tonight': {
      const meal = ctx.result!.meals.find((m) => m.date === today)!;
      const n = (await recipeNames(db, [meal.recipeId], h.language)).get(meal.recipeId);
      return { title: t('tonightTitle', { name: n?.name ?? meal.recipeId }), body: t('tonightBody', { minutes: n?.cookMinutes ?? 0, perPlate: formatRandShort(meal.perPlateCents) }), url: `/recipe/${meal.recipeId}` };
    }
    case 'month_end': {
      const { daysToPayday } = await import('./rules');
      return { title: t('monthEndTitle', { days: daysToPayday(today, ctx.state.paydayDom) }), body: t('monthEndBody'), url: '/list' };
    }
    case 'payday':
      return { title: t('paydayTitle'), body: t('paydayBody'), url: '/start/household' };
    case 'specials_day': {
      const [store] = ctx.plan
        ? await query<{ name: string }>(db, sql`select r.name from branches b join retailers r on r.id = b.retailer_id where b.id = ${ctx.plan.main_branch_id}`)
        : [];
      return { title: t('specialsTitle'), body: t('specialsBody', { store: store?.name ?? '' }), url: '/plan' };
    }
    case 'receipt_nudge':
      return { title: t('receiptTitle'), body: t('receiptBody'), url: '/receipts/new' };
  }
}

export async function runSlot(db: Db, slot: 'morning' | 'tonight', opts: { now?: Date; sender?: Sender; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  const sender = opts.sender ?? (features.push() ? webPushSender : null);
  const households = await query<HouseholdRow>(
    db,
    sql`select distinct h.id, h.language, h.payday_dom, h.notification_opt_out from households h
        join push_subscriptions s on s.household_id = h.id where h.merged_into is null
        order by h.id limit ${opts.limit ?? 2000}`,
  );
  const stats = { households: households.length, sent: 0, skipped: 0, gone: 0, errors: 0 };
  for (const h of households) {
    try {
      const ctx = await stateFor(db, h, now);
      const kind = slot === 'tonight' ? (decide('tonight', ctx.state).send ? 'tonight' : null) : pickMorning(ctx.state);
      if (!kind) {
        stats.skipped++;
        continue;
      }
      const payload = await payloadFor(db, kind, h, now, ctx);
      const [logged] = await query<{ id: string | number }>(
        db,
        sql`insert into notification_log (household_id, kind, ref) values (${h.id}::uuid, ${kind}, ${ctx.plan?.id ?? null}) returning id`,
      );
      const subs = await query<{ id: number; endpoint: string; keys: { p256dh: string; auth: string } | string }>(
        db,
        sql`select id, endpoint, keys from push_subscriptions where household_id = ${h.id}::uuid`,
      );
      for (const s of subs) {
        if (!sender) continue; // no VAPID keys configured: logged only (docs/human-todo.md)
        const keys = typeof s.keys === 'string' ? JSON.parse(s.keys) : s.keys;
        const r = await sender({ endpoint: s.endpoint, keys }, JSON.stringify({ ...payload, id: Number(logged!.id) }));
        if (r.gone) {
          stats.gone++;
          await db.execute(sql`delete from push_subscriptions where id = ${s.id}`);
        }
      }
      stats.sent++;
    } catch (e) {
      stats.errors++;
      log.error('notify_failed', { householdId: h.id, error: String(e) });
    }
  }
  log.info('notify_slot', { slot, ...stats });
  return stats;
}
