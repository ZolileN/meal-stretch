/** Magic-link email (ACC-2) via Resend; outside production without a key, links go to a dev mailbox. */
import { env } from '@/lib/env';
import { BRAND } from '@/lib/brand';
import { log } from '@/lib/log';

// globalThis: Next bundles each route separately, so a module-level Map would not be shared between routes.
const g = globalThis as unknown as { __msDevMailbox?: Map<string, string> };
const devMailbox = (g.__msDevMailbox ??= new Map<string, string>());
export const lastDevLink = (email: string) => devMailbox.get(email.toLowerCase()) ?? null;

export async function sendMagicLink(email: string, url: string, copy: { subject: string; body: string; button: string }) {
  const key = env().RESEND_API_KEY;
  if (!key) {
    if (env().NODE_ENV === 'production' && !env().E2E) throw new Error('Email sign-in is not configured');
    devMailbox.set(email.toLowerCase(), url);
    log.info('dev_magic_link', { email: email.replace(/(.).+@/, '$1…@') });
    return;
  }
  const html = `<p>${copy.body}</p><p><a href="${url}" style="background:${BRAND.colors.primary};color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">${copy.button}</a></p>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env().EMAIL_FROM, to: email, subject: copy.subject, html, text: `${copy.body}\n${url}` }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}`);
}
