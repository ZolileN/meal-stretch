import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { latestPlanFresh } from '@/lib/plans/service';
import { buildPlanView } from '@/lib/plans/view';
import { PlanScreen } from '@/components/plan/PlanScreen';
import { shouldPromptShopped } from '@/lib/plans/actions';
import { sessionUser } from '@/lib/auth/session';
import { signInMethods } from '@/lib/auth/methods';
import { isoDateInSA } from '@/lib/period';

export const dynamic = 'force-dynamic';

export default async function PlanPage() {
  const db = getDb();
  const h = await currentHousehold(db);
  const plan = h ? await latestPlanFresh(db, h.id) : null;
  if (!plan) redirect('/start');
  const view = await buildPlanView(db, plan, await getLocale());
  const user = await sessionUser();
  return <PlanScreen view={view} today={isoDateInSA(new Date())} shoppedPrompt={shouldPromptShopped(plan, false, new Date())} signedIn={Boolean(user)} signInMethods={signInMethods()} />;
}
