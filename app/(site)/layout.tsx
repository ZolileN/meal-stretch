import { getTranslations } from 'next-intl/server';
import { LocationProvider } from '@/components/location/LocationProvider';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SiteHeader } from '@/components/SiteHeader';
import { BottomNav } from '@/components/ui/BottomNav';
import { sessionUser } from '@/lib/auth/session';
import { hourInSA } from '@/lib/period';

const part = (h: number) => (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening');

/** User-facing pages: header + location bar on every page (LOC-6), floating nav (THEME §2.7). */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [t, th, user] = await Promise.all([getTranslations('nav'), getTranslations('home'), sessionUser()]);
  const first = user?.name?.trim().split(/\s+/)[0] ?? null;
  const greeting = th('greeting', { part: part(hourInSA(new Date())), name: first ?? 'none' });
  return (
    <LocationProvider>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <SiteHeader greeting={greeting} initial={first ? first[0]!.toUpperCase() : null} settingsLabel={t('settings')} />
        <div className="pb-nav flex-1">{children}</div>
        <BottomNav label={t('label')} labels={{ home: t('home'), plan: t('plan'), tonight: t('tonight'), list: t('list'), savings: t('savings') }} />
        <ServiceWorker />
      </div>
    </LocationProvider>
  );
}
