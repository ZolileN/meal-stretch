/** First-party analytics events (PRD §16). No third-party trackers. Never throws into the request. */
import { sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { log } from '@/lib/log';

export const APP_VERSION = '0.1.0';

export const EVENT_NAMES = [
  'onboarding_started', 'location_set', 'shops_set', 'cards_set', 'budget_set', 'plan_generated', 'plan_over_budget',
  'fit_budget_tapped', 'meal_swapped', 'meal_cheaper', 'meal_removed', 'tweak_submitted', 'list_opened', 'list_item_ticked',
  'list_completed', 'plan_marked_shopped', 'receipt_uploaded', 'receipt_verified', 'push_permission', 'notification_opened',
  'account_created', 'share_link_created',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export async function track(db: Db, householdId: string | null, name: EventName, props: Record<string, unknown> = {}) {
  try {
    await db.execute(
      sql`insert into events (household_id, name, props) values (${householdId}::uuid, ${name},
          ${JSON.stringify({ ...props, household_id: householdId, app_version: APP_VERSION })}::jsonb)`,
    );
  } catch (e) {
    log.warn('event_failed', { name, error: String(e) });
  }
}
