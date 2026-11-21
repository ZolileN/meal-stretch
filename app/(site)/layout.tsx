import { LocationBar } from '@/components/location/LocationBar';
import { LocationProvider } from '@/components/location/LocationProvider';
import { ServiceWorker } from '@/components/ServiceWorker';
import { Nav } from '@/components/Nav';

/** User-facing pages: the location bar is on every one of them (LOC-6). */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocationProvider>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col">
        <header className="sticky top-0 z-40">
          <LocationBar />
        </header>
        <div className="flex-1">{children}</div>
        <Nav />
        <ServiceWorker />
      </div>
    </LocationProvider>
  );
}
