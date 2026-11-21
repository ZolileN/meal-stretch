/** Vercel Cron: GET /api/cron/notify?slot=morning|tonight (vercel.json). */
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { cronAuthorized } from '@/lib/cron';
import { getDb } from '@/lib/db';
import { runSlot } from '@/lib/notify/send';

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return apiError(401, 'unauthorized', 'Cron only');
  const slot = new URL(req.url).searchParams.get('slot');
  if (slot !== 'morning' && slot !== 'tonight') return apiError(400, 'invalid_query', 'slot must be morning or tonight');
  return NextResponse.json(await runSlot(getDb(), slot));
}
