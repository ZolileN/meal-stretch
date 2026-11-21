import { HouseholdForm } from '@/components/onboarding/HouseholdForm';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';

export const dynamic = 'force-dynamic';

export default async function HouseholdStep() {
  const h = await currentHousehold(getDb()).catch(() => null);
  return (
    <main className="px-gutter pt-2">
      <HouseholdForm paydayDom={h?.paydayDom ?? undefined} />
    </main>
  );
}
