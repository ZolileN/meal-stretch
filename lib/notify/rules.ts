/**
 * Notification rules (PRD §14). Pure: the caller passes "now" and the household's state.
 *  - quiet hours 20:00–07:00 Africa/Johannesburg
 *  - max 1 notification per day, except "tonight" (which itself is at most once a day)
 *  - each kind can be switched off; nothing without a push subscription
 */
import { daysInMonth, diffDays, hourInSA, isoDateInSA, nextPayday, DEFAULT_PAYDAY } from '@/lib/period';

export type NotifyKind = 'specials_day' | 'tonight' | 'month_end' | 'payday' | 'receipt_nudge';
/** Morning slot tries these in order and sends at most one. */
export const MORNING_PRIORITY: NotifyKind[] = ['payday', 'month_end', 'specials_day', 'receipt_nudge'];
export const QUIET_START = 20;
export const QUIET_END = 7;

export interface NotifyState {
  now: Date;
  optOut: string[];
  hasSubscription: boolean;
  /** notifications already sent (any time); the rules look at today's in SA time */
  sent: { kind: NotifyKind; sentAt: Date }[];
  paydayDom: number | null;
  plan: { status: 'active' | 'shopped' | 'archived' | 'draft'; meals: { date: string; recipeId: string }[]; shoppedAt: Date | null } | null;
  receiptSinceShopped: boolean;
  newSpecials: boolean;
}

export type Decision = { send: true } | { send: false; reason: string };

export function inQuietHours(now: Date): boolean {
  const h = hourInSA(now);
  return h >= QUIET_START || h < QUIET_END;
}

export function isPayday(today: string, paydayDom: number | null): boolean {
  const dom = paydayDom ?? DEFAULT_PAYDAY;
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  return d === Math.min(dom, daysInMonth(y, m));
}

export function daysToPayday(today: string, paydayDom: number | null): number {
  return diffDays(today, nextPayday(today, paydayDom ?? DEFAULT_PAYDAY));
}

export function decide(kind: NotifyKind, s: NotifyState): Decision {
  if (!s.hasSubscription) return { send: false, reason: 'no_subscription' };
  if (s.optOut.includes(kind)) return { send: false, reason: 'opted_out' };
  if (inQuietHours(s.now)) return { send: false, reason: 'quiet_hours' };
  const today = isoDateInSA(s.now);
  const sentToday = s.sent.filter((x) => isoDateInSA(x.sentAt) === today);
  if (sentToday.some((x) => x.kind === kind)) return { send: false, reason: 'already_sent_today' };
  if (kind !== 'tonight' && sentToday.some((x) => x.kind !== 'tonight')) return { send: false, reason: 'daily_cap' };

  switch (kind) {
    case 'tonight':
      if (s.plan?.status !== 'active') return { send: false, reason: 'no_active_plan' };
      return s.plan.meals.some((m) => m.date === today) ? { send: true } : { send: false, reason: 'no_meal_today' };
    case 'month_end': {
      if (s.plan?.status !== 'active') return { send: false, reason: 'no_active_plan' };
      const d = daysToPayday(today, s.paydayDom);
      return d === 7 || d === 3 ? { send: true } : { send: false, reason: 'not_7_or_3_days' };
    }
    case 'payday':
      return isPayday(today, s.paydayDom) ? { send: true } : { send: false, reason: 'not_payday' };
    case 'specials_day':
      return s.newSpecials ? { send: true } : { send: false, reason: 'no_new_specials' };
    case 'receipt_nudge': {
      const at = s.plan?.shoppedAt;
      if (s.plan?.status !== 'shopped' || !at) return { send: false, reason: 'not_shopped' };
      const hours = (s.now.getTime() - at.getTime()) / 3600e3;
      if (hours < 24 || hours > 72) return { send: false, reason: 'outside_window' };
      return s.receiptSinceShopped ? { send: false, reason: 'receipt_uploaded' } : { send: true };
    }
  }
}

/** Morning slot: the first eligible kind by priority (max one). */
export function pickMorning(s: NotifyState): NotifyKind | null {
  for (const k of MORNING_PRIORITY) if (decide(k, s).send) return k;
  return null;
}
