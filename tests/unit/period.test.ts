import { describe, expect, it } from 'vitest';
import { addDaysIso, diffDays, hourInSA, isoDateInSA, nextPayday, periodDays } from '@/lib/period';

describe('SA dates', () => {
  it('uses Africa/Johannesburg (UTC+2)', () => {
    expect(isoDateInSA(new Date('2026-11-21T21:59:00Z'))).toBe('2026-11-21');
    expect(isoDateInSA(new Date('2026-11-21T22:01:00Z'))).toBe('2026-11-22');
    expect(hourInSA(new Date('2026-11-21T14:00:00Z'))).toBe(16);
  });
  it('date arithmetic', () => {
    expect(addDaysIso('2026-11-28', 5)).toBe('2026-12-03');
    expect(diffDays('2026-11-21', '2026-11-25')).toBe(4);
    expect(diffDays('2026-12-30', '2027-01-02')).toBe(3);
  });
});

describe('payday maths (ONB-4)', () => {
  it('next payday is strictly after today', () => {
    expect(nextPayday('2026-11-21')).toBe('2026-11-25');
    expect(nextPayday('2026-11-25')).toBe('2026-12-25');
    expect(nextPayday('2026-11-26')).toBe('2026-12-25');
    expect(nextPayday('2026-12-28')).toBe('2027-01-25');
  });
  it('payday on the 31st falls on the last day of short months', () => {
    expect(nextPayday('2027-02-10', 31)).toBe('2027-02-28');
    expect(nextPayday('2028-02-10', 30)).toBe('2028-02-29');
    expect(nextPayday('2027-02-28', 31)).toBe('2027-03-31');
  });
  it('"until the 25th" = suppers up to the day before payday, clamped 3–14', () => {
    expect(periodDays({ kind: 'payday' }, '2026-11-18')).toMatchObject({ days: 7, raw: 7, endsOn: '2026-11-24' });
    expect(periodDays({ kind: 'payday' }, '2026-11-21')).toMatchObject({ days: 4, raw: 4 });
    expect(periodDays({ kind: 'payday' }, '2026-11-24')).toMatchObject({ days: 3, raw: 1 }); // min 3
    expect(periodDays({ kind: 'payday' }, '2026-11-26')).toMatchObject({ days: 14, raw: 29 }); // max 14
    expect(periodDays({ kind: 'payday' }, '2026-11-21', 1)).toMatchObject({ days: 10, raw: 10 });
  });
  it('"until month-end" includes the last day', () => {
    expect(periodDays({ kind: 'monthEnd' }, '2026-11-21')).toMatchObject({ days: 10, endsOn: '2026-11-30' });
    expect(periodDays({ kind: 'monthEnd' }, '2026-11-28')).toMatchObject({ days: 3, raw: 3 });
  });
  it('week and picked date', () => {
    expect(periodDays({ kind: 'week' }, '2026-11-21')).toMatchObject({ days: 7, endsOn: '2026-11-27' });
    expect(periodDays({ kind: 'date', date: '2026-11-25' }, '2026-11-21')).toMatchObject({ days: 5 });
    expect(periodDays({ kind: 'date', date: '2026-12-31' }, '2026-11-21').days).toBe(14);
  });
});

import { dayMonth, weekdayShort } from '@/lib/dates';
describe('display dates', () => {
  it('South African order', () => {
    expect(dayMonth('2026-11-21', 'en')).toBe('21 Nov');
    expect(weekdayShort('2026-11-21', 'en')).toBe('Sat');
    expect(dayMonth('2026-11-21', 'xh')).toMatch(/21/);
  });
});
