import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { latestPlan } from '@/lib/plans/service';
import { buildPlanView } from '@/lib/plans/view';
import { PlanScreen } from '@/components/plan/PlanScreen';

export const dynamic = 'force-dynamic';

export default async function PlanPage() {
  const db = getDb();
  const h = await currentHousehold(db);
  const plan = h ? await latestPlan(db, h.id) : null;
  if (!plan) redirect('/start');
  const view = await buildPlanView(db, plan, await getLocale());
  return <PlanScreen view={view} />;
}
