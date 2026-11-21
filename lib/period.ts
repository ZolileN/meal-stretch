/**
 * Planning-period maths (ONB-4) and South African dates. Pure; "now" is always passed in.
 * Rule (docs/decisions.md): "until <date money arrives>" plans suppers up to the day BEFORE that date;
 * "until month-end" plans through the last day of the month. Results are clamped to 3–14 days.
 */
export const TZ = 'Africa/Johannesburg';
export const MIN_DAYS = 3;
export const MAX_DAYS = 14;
export const DEFAULT_PAYDAY = 25;

/** ISO date (YYYY-MM-DD) in Africa/Johannesburg for an instant. */
export function isoDateInSA(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Hour (0–23) in Africa/Johannesburg. */
export function hourInSA(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return { y, m, d };
};
const toIso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDaysIso(iso: string, n: number): string {
  const { y, m, d } = parse(iso);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from a to b (b − a). */
export function diffDays(a: string, b: string): number {
  const pa = parse(a);
  const pb = parse(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** Next payday strictly after today. A payday on the 29th–31st falls on the month's last day in short months. */
export function nextPayday(today: string, paydayDom = DEFAULT_PAYDAY): string {
  const { y, m, d } = parse(today);
  const dom = Math.min(Math.max(1, paydayDom), 31);
  const thisMonth = Math.min(dom, daysInMonth(y, m));
  if (d < thisMonth) return toIso(y, m, thisMonth);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return toIso(ny, nm, Math.min(dom, daysInMonth(ny, nm)));
}

export const clampDays = (n: number) => Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(n)));

export type PeriodChoice = { kind: 'week' } | { kind: 'payday' } | { kind: 'monthEnd' } | { kind: 'date'; date: string };

export function periodDays(choice: PeriodChoice, today: string, paydayDom = DEFAULT_PAYDAY): { days: number; raw: number; endsOn: string } {
  let raw: number;
  if (choice.kind === 'week') raw = 7;
  else if (choice.kind === 'payday') raw = diffDays(today, nextPayday(today, paydayDom));
  else if (choice.kind === 'monthEnd') {
    const { y, m } = parse(today);
    raw = diffDays(today, toIso(y, m, daysInMonth(y, m))) + 1;
  } else raw = diffDays(today, choice.date) + 1;
  const days = clampDays(raw);
  return { days, raw, endsOn: addDaysIso(today, days - 1) };
}
