/** POPIA privacy notice in plain language (PRD §15). isiXhosa copy pending human review (human-todo). */
import { getTranslations } from 'next-intl/server';
import { BRAND } from '@/lib/brand';
import { Card } from '@/components/ui/Card';

export default async function Privacy() {
  const t = await getTranslations('privacy');
  return (
    <main className="space-y-3 px-gutter pt-2 pb-4">
      <h1 className="font-heading text-h1 font-extrabold text-primary">{t('title')}</h1>
      <p className="text-text">{t('intro', { brand: BRAND.name })}</p>
      <Card className="p-5">
        <ul className="list-disc space-y-3 pl-5 text-small">
          {(['location', 'household', 'receipts', 'push', 'noAds', 'rights', 'contact'] as const).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
