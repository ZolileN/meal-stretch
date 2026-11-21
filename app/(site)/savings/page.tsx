/** S1 savings (PRD §7.5). */
import { getDb } from '@/lib/db';
import { currentHousehold } from '@/lib/household';
import { lifetimeSavings } from '@/lib/savings';
import { SavingsView } from '@/components/savings/SavingsView';

export const dynamic = 'force-dynamic';

export default async function SavingsPage() {
  const db = getDb();
  const h = await currentHousehold(db);
  return <SavingsView s={h ? await lifetimeSavings(db, h.id) : null} />;
}
