/** Vercel Cron: nightly current_prices refresh so freshness flags follow the calendar (§10.1). */
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { cronAuthorized } from '@/lib/cron';
import { getDb } from '@/lib/db';
import { refreshCurrentPrices } from '@/lib/prices/import';

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return apiError(401, 'unauthorized', 'Cron only');
  await refreshCurrentPrices(getDb());
  return NextResponse.json({ ok: true });
}
