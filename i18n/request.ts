import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, isLocale, LOCALE_COOKIE } from './config';

export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : defaultLocale;
  const messages = (await import(`../messages/${locale}.json`)).default;
  // Untranslated keys in xh/af fall back to English.
  const en = locale === 'en' ? messages : (await import('../messages/en.json')).default;
  return { locale, messages: deepMerge(en, messages), timeZone: 'Africa/Johannesburg' };
});

type Msgs = { [k: string]: string | Msgs };
function deepMerge(base: Msgs, over: Msgs): Msgs {
  const out: Msgs = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = base[k];
    if (typeof v === 'string') {
      // "TODO:" marks strings awaiting human translation; show English until reviewed.
      out[k] = v.startsWith('TODO:') && typeof b === 'string' ? b : v;
    } else if (typeof b === 'object' && b) out[k] = deepMerge(b, v);
    else out[k] = v;
  }
  return out;
}
