import { HouseholdForm, type HouseholdDefaults } from '@/components/onboarding/HouseholdForm';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { latestPlan } from '@/lib/plans/service';

export const dynamic = 'force-dynamic';

export default async function HouseholdStep() {
  const db = getDb();
  const h = await currentHousehold(db).catch(() => null);
  // A new plan starts from the household's people and avoid list and the last plan's budget (whole rands).
  const last = h ? await latestPlan(db, h.id).catch(() => null) : null;
  const cents = last?.request.budgetCents ?? null;
  const defaults: HouseholdDefaults | undefined = h
    ? { light: h.light, average: h.average, big: h.big, budgetRands: cents !== null ? Math.floor(cents / 100) : null, avoid: h.exclusions }
    : undefined;
  return (
    <main className="px-gutter pt-2">
      <HouseholdForm paydayDom={h?.paydayDom ?? undefined} defaults={defaults} />
    </main>
  );
}
