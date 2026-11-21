/** Fire-and-forget device events (§16). Never blocks the UI. */
export function trackClient(name: string, props: Record<string, unknown> = {}) {
  try {
    void fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, props }), keepalive: true }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}
