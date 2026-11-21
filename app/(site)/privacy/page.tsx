/** POPIA privacy notice in plain language (PRD §15). isiXhosa copy pending human review (human-todo). */
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/lib/brand';

export default async function Privacy() {
  const t = await getTranslations('privacy');
  return (
    <main className="space-y-3 px-4 py-6">
      <h1 className="text-xl font-bold">{t('title')}</h1>
      <p>{t('intro', { brand: BRAND.name })}</p>
      <ul className="list-disc space-y-2 pl-5">
        {(['location', 'household', 'receipts', 'push', 'noAds', 'rights', 'contact'] as const).map((k) => (
          <li key={k}>{t(k)}</li>
        ))}
      </ul>
    </main>
  );
}
