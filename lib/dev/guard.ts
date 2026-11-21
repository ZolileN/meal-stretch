import { notFound } from 'next/navigation';
import { env } from '@/lib/env';

/** /dev/* pages exist only in development and in the E2E build (E2E is never set in production). */
export function devOnly() {
  if (env().NODE_ENV === 'production' && !env().E2E) notFound();
}
