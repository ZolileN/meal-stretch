/** Real screens with fixed fictional data, for screenshot tests (dev/E2E only). */
import { notFound } from 'next/navigation';
import { DEV_LIST, DEV_PLAN, DEV_SAVINGS, DEV_TODAY } from '@/lib/dev/fixtures';
import { devOnly } from '@/lib/dev/guard';
import { ShoppingList } from '@/components/list/ShoppingList';
import { HomeScreen } from '@/components/plan/HomeScreen';
import { PlanScreen } from '@/components/plan/PlanScreen';
import { SavingsView } from '@/components/savings/SavingsView';

export const dynamic = 'force-dynamic';

export default async function DevScreen({ params }: { params: Promise<{ name: string }> }) {
  devOnly();
  const { name } = await params;
  switch (name) {
    case 'home':
      return <HomeScreen view={DEV_PLAN} today={DEV_TODAY} />;
    case 'plan':
      return <PlanScreen view={DEV_PLAN} today={DEV_TODAY} />;
    case 'over': {
      const over = { ...DEV_PLAN, budget: { budgetCents: 70000, status: 'over' as const, remainingCents: null, shortfallCents: 11240, maxAffordableDays: null } };
      return <PlanScreen view={over} today={DEV_TODAY} />;
    }
    case 'list':
      return <ShoppingList view={DEV_LIST} shareText="TEST" />;
    case 'savings':
      return <SavingsView s={DEV_SAVINGS} />;
    default:
      notFound();
  }
}
