import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

/** PWA manifest from lib/brand.ts (§6 installable PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.storeTitle,
    short_name: BRAND.shortName,
    description: BRAND.tagline,
    start_url: '/plan',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: BRAND.colors.bg,
    theme_color: BRAND.colors.primary,
    lang: 'en-ZA',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
