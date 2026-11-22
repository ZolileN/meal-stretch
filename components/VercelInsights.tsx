'use client';
/** Cookieless page views + real-phone speed (Vercel). URLs are cleaned first: lib/analytics.ts. */
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { redactEvent } from '@/lib/analytics';

export function VercelInsights() {
  return (
    <>
      <Analytics beforeSend={redactEvent} />
      <SpeedInsights beforeSend={redactEvent} />
    </>
  );
}
