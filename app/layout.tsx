import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { BRAND } from '@/lib/brand';
import { VercelInsights } from '@/components/VercelInsights';
import './globals.css';

// Self-hosted by next/font at build time, Latin subset only (docs/THEME.md §1).
const heading = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-heading', display: 'swap' });
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: { default: BRAND.storeTitle, template: `%s · ${BRAND.name}` },
    description: t('description'),
    applicationName: BRAND.name,
    icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
    appleWebApp: { capable: true, title: BRAND.shortName, statusBarStyle: 'default' },
  };
}

export const viewport: Viewport = {
  themeColor: BRAND.colors.primary,
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${heading.variable} ${body.variable}`}>
      <body className="min-h-dvh bg-bg text-body text-text antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <VercelInsights />
      </body>
    </html>
  );
}
