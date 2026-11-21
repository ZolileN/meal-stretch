import { getTranslations } from 'next-intl/server';

// Placeholder until Phase 4 (O3 household + budget).
export default async function HouseholdStep() {
  const t = await getTranslations('home');
  return (
    <main className="px-4 py-6">
      <h1 className="text-xl font-bold">{t('startPlan')}</h1>
    </main>
  );
}
