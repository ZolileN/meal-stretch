'use client';
import { useEffect } from 'react';

/** Registers /sw.js in production builds (offline plan/list/recipes, push). */
export function ServiceWorker() {
  useEffect(() => {
    // The install event is caught by an inline script in app/layout.tsx (it can fire before hydration).
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
