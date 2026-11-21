/** Display dates the South African way ("21 Nov", "Sat") for any UI locale. */
import { TZ } from './period';

const INTL_LOCALE: Record<string, string> = { en: 'en-ZA', af: 'af-ZA', xh: 'xh-ZA' };
const at = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);

function fmt(locale: string, opts: Intl.DateTimeFormatOptions) {
  const tag = INTL_LOCALE[locale] ?? 'en-ZA';
  try {
    return new Intl.DateTimeFormat(tag, { timeZone: TZ, ...opts });
  } catch {
    return new Intl.DateTimeFormat('en-ZA', { timeZone: TZ, ...opts });
  }
}

export const dayMonth = (iso: string, locale: string) => fmt(locale, { day: 'numeric', month: 'short' }).format(at(iso));
export const weekdayShort = (iso: string, locale: string) => fmt(locale, { weekday: 'short' }).format(at(iso));
export const weekdayLong = (iso: string, locale: string) => fmt(locale, { weekday: 'long', day: 'numeric', month: 'short' }).format(at(iso));
