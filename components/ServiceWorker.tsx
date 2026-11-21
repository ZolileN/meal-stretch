'use client';
import { useEffect } from 'react';

/** Registers /sw.js in production builds (offline plan/list/recipes, push). */
export function ServiceWorker() {
  useEffect(() => {
    // Keep the install event for the plan screen's prompt (shown only after the first plan).
    const onInstallable = (e: Event) => {
      e.preventDefault();
      (window as unknown as { __msInstall?: Event }).__msInstall = e;
      window.dispatchEvent(new Event('ms:installable'));
    };
    window.addEventListener('beforeinstallprompt', onInstallable);
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return () => window.removeEventListener('beforeinstallprompt', onInstallable);
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    return () => window.removeEventListener('beforeinstallprompt', onInstallable);
  }, []);
  return null;
}
