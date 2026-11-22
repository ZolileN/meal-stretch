/**
 * What Vercel Web Analytics / Speed Insights may see (docs/decisions.md 2026-11-22).
 * They get the page path only: query strings and #fragments are dropped (sign-in links, filters), share-link
 * tokens are replaced by a placeholder, and admin/dev pages are not reported at all. No cookies, no user ids.
 */
const SKIP = /^\/(admin|dev)(\/|$)/;

/** Clean a URL before it leaves the device; null = don't send. */
export function cleanAnalyticsUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw, 'https://local.invalid');
  } catch {
    return null;
  }
  const path = u.pathname.replace(/^\/s\/[^/]+/, '/s/[token]');
  if (SKIP.test(path)) return null;
  return u.origin === 'https://local.invalid' ? path : `${u.origin}${path}`;
}

/** Shared beforeSend for both scripts: same event back with a clean url, or null to drop it. */
export function redactEvent<E extends { url: string }>(event: E): E | null {
  const url = cleanAnalyticsUrl(event.url);
  return url === null ? null : { ...event, url };
}
