'use client';
/**
 * Top of every user page: greeting (Home) or wordmark, the account/settings avatar (THEME §6.4:
 * Settings lives here, not in the nav), and the persistent location bar under it (LOC-6).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User } from 'lucide-react';
import { LocationBar } from '@/components/location/LocationBar';
import { Wordmark } from '@/components/ui/Wordmark';
import { circleButtonClass } from '@/components/ui/TopBar';

export function SiteHeader({ greeting, initial, settingsLabel }: { greeting: string; initial: string | null; settingsLabel: string }) {
  const pathname = usePathname() ?? '/';
  const home = pathname === '/';
  return (
    <header className="space-y-3 px-gutter pt-4 pb-2">
      <div className="flex items-center justify-between gap-3">
        {home ? (
          <p className="font-heading text-h2 font-extrabold text-primary" data-testid="greeting">
            {greeting}
          </p>
        ) : (
          <Link href="/" className="tap inline-flex items-center">
            <Wordmark />
          </Link>
        )}
        <Link href="/settings" aria-label={settingsLabel} className={circleButtonClass()} data-testid="avatar">
          {initial ? <span className="font-heading text-small font-extrabold">{initial}</span> : <User aria-hidden className="size-5" />}
        </Link>
      </div>
      <LocationBar />
    </header>
  );
}
