import { env } from '@/lib/env';

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without a secret, only non-production allows it. */
export function cronAuthorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return env().NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}
