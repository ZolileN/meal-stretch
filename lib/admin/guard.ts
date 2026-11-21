/** ADM-1: admin area behind a server-side role check against ADMIN_EMAILS. */
import { notFound } from 'next/navigation';
import { adminEmails } from '@/lib/env';
import { sessionUser } from '@/lib/auth/session';

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && adminEmails().includes(email!.toLowerCase());
}

/** For pages and server actions: 404 for everyone who isn't an allow-listed admin (doesn't reveal /admin). */
export async function requireAdmin(): Promise<{ id: string; email: string }> {
  const user = await sessionUser();
  if (!user || !isAdminEmail(user.email)) notFound();
  return { id: user.id, email: user.email! };
}
