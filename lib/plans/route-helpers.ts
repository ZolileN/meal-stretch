import { apiError } from '@/lib/api';
import { getDb, type Db } from '@/lib/db';
import { currentHousehold, type Household } from '@/lib/household';
import { getPlan, PlanError, type StoredPlan } from './service';

export async function loadOwnedPlan(id: string): Promise<{ db: Db; h: Household; plan: StoredPlan } | Response> {
  const db = getDb();
  const h = await currentHousehold(db);
  if (!h) return apiError(404, 'not_found', 'Plan not found');
  const plan = await getPlan(db, h.id, id);
  if (!plan) return apiError(404, 'not_found', 'Plan not found');
  return { db, h, plan };
}

export function planErrorResponse(e: unknown): Response {
  if (e instanceof PlanError) return apiError(e.status, e.code, e.message);
  throw e;
}
