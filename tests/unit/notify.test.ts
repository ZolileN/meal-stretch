import { describe, expect, it } from 'vitest';
import { daysToPayday, decide, inQuietHours, isPayday, pickMorning, type NotifyState } from '@/lib/notify/rules';

// 2026-11-21 is a Saturday; SA = UTC+2
const at = (iso: string) => new Date(iso);
const base = (p: Partial<NotifyState> = {}): NotifyState => ({
  now: at('2026-11-21T14:00:00Z'), // 16:00 SAST
  optOut: [],
  hasSubscription: true,
  sent: [],
  paydayDom: 25,
  plan: { status: 'active', meals: [{ date: '2026-11-21', recipeId: 'umngqusho' }], shoppedAt: null },
  receiptSinceShopped: false,
  newSpecials: false,
  ...p,
});

describe('quiet hours 20:00–07:00 SAST', () => {
  it.each([
    ['2026-11-21T04:59:00Z', true], // 06:59
    ['2026-11-21T05:00:00Z', false], // 07:00
    ['2026-11-21T17:59:00Z', false], // 19:59
    ['2026-11-21T18:00:00Z', true], // 20:00
    ['2026-11-21T22:30:00Z', true], // 00:30
  ])('%s → %s', (iso, quiet) => expect(inQuietHours(at(iso))).toBe(quiet));
  it('blocks every kind', () => expect(decide('tonight', base({ now: at('2026-11-21T19:00:00Z') }))).toEqual({ send: false, reason: 'quiet_hours' }));
});

describe('caps', () => {
  it('max one per day except tonight', () => {
    const morning = { kind: 'payday' as const, sentAt: at('2026-11-21T06:00:00Z') };
    expect(decide('specials_day', base({ newSpecials: true, sent: [morning] }))).toEqual({ send: false, reason: 'daily_cap' });
    expect(decide('tonight', base({ sent: [morning] }))).toEqual({ send: true });
  });
  it('tonight at most once a day', () => {
    expect(decide('tonight', base({ sent: [{ kind: 'tonight', sentAt: at('2026-11-21T14:00:00Z') }] }))).toEqual({ send: false, reason: 'already_sent_today' });
  });
  it('yesterday does not count (SA calendar day)', () => {
    const late = { kind: 'payday' as const, sentAt: at('2026-11-20T21:59:00Z') }; // 23:59 SAST on the 20th
    expect(decide('specials_day', base({ newSpecials: true, sent: [late] }))).toEqual({ send: true });
  });
  it('opt-out per kind and no subscription', () => {
    expect(decide('tonight', base({ optOut: ['tonight'] }))).toEqual({ send: false, reason: 'opted_out' });
    expect(decide('tonight', base({ hasSubscription: false }))).toEqual({ send: false, reason: 'no_subscription' });
  });
});

describe('payday maths', () => {
  it('default 25th; short months clamp', () => {
    expect(isPayday('2026-11-25', null)).toBe(true);
    expect(isPayday('2026-11-24', 25)).toBe(false);
    expect(isPayday('2027-02-28', 31)).toBe(true);
    expect(isPayday('2027-02-28', 28)).toBe(true);
    expect(daysToPayday('2026-11-18', 25)).toBe(7);
    expect(daysToPayday('2026-11-22', 25)).toBe(3);
    expect(daysToPayday('2026-11-25', 25)).toBe(30);
  });
  it('month_end at 7 and 3 days before payday with an active plan', () => {
    const morning = (d: string) => at(`${d}T06:00:00Z`);
    expect(decide('month_end', base({ now: morning('2026-11-18') }))).toEqual({ send: true });
    expect(decide('month_end', base({ now: morning('2026-11-22') }))).toEqual({ send: true });
    expect(decide('month_end', base({ now: morning('2026-11-20') }))).toEqual({ send: false, reason: 'not_7_or_3_days' });
    expect(decide('month_end', base({ now: morning('2026-11-18'), plan: null }))).toEqual({ send: false, reason: 'no_active_plan' });
  });
});

describe('triggers + morning priority', () => {
  it('tonight needs a meal today', () => {
    expect(decide('tonight', base())).toEqual({ send: true });
    expect(decide('tonight', base({ plan: { status: 'active', meals: [{ date: '2026-11-22', recipeId: 'x' }], shoppedAt: null } }))).toEqual({ send: false, reason: 'no_meal_today' });
  });
  it('receipt nudge 24–72 h after shopped, only without a receipt', () => {
    const shopped = { status: 'shopped' as const, meals: [], shoppedAt: at('2026-11-20T08:00:00Z') };
    expect(decide('receipt_nudge', base({ plan: shopped }))).toEqual({ send: true });
    expect(decide('receipt_nudge', base({ plan: shopped, receiptSinceShopped: true }))).toEqual({ send: false, reason: 'receipt_uploaded' });
    expect(decide('receipt_nudge', base({ plan: { ...shopped, shoppedAt: at('2026-11-21T08:00:00Z') } }))).toEqual({ send: false, reason: 'outside_window' });
  });
  it('payday beats specials; one per morning', () => {
    const s = base({ now: at('2026-11-25T06:00:00Z'), newSpecials: true });
    expect(pickMorning(s)).toBe('payday');
    expect(pickMorning({ ...s, sent: [{ kind: 'payday', sentAt: at('2026-11-25T06:00:00Z') }] })).toBeNull();
    expect(pickMorning(base({ now: at('2026-11-21T06:00:00Z'), newSpecials: true }))).toBe('specials_day');
  });
});
