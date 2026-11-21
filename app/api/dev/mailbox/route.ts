/** Dev/e2e only: last magic link sent to an address (no email provider configured). 404 in production. */
import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api';
import { env } from '@/lib/env';
import { lastDevLink } from '@/lib/auth/mail';

export async function GET(req: Request) {
  if (env().NODE_ENV === 'production' && !env().E2E) return apiError(404, 'not_found', 'Not found');
  const email = new URL(req.url).searchParams.get('email') ?? '';
  const link = lastDevLink(email);
  return link ? NextResponse.json({ link }) : apiError(404, 'not_found', 'No link');
}
