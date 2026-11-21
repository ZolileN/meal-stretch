'use client';
/** LOC-6: persistent location bar; tap opens the sheet at the shops step. */
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { ChevronDown, MapPin } from 'lucide-react';
import { useShops } from './LocationProvider';

// The sheet and picker are only needed once opened: keep them out of every page's first-load JS (§15).
const LocationSheet = dynamic(() => import('./LocationSheet').then((m) => m.LocationSheet), { ssr: false });

export function LocationBar() {
  const t = useTranslations('location');
  const { shops, ready, sheetOpen, openSheet, closeSheet } = useShops();
  const hasShops = Boolean(shops.location && shops.main);
  const label = shops.location?.label ?? t('unknownPlace');
  const names = shops.main
    ? shops.topUp
      ? t('plus', { main: shops.main.retailerName, topUp: shops.topUp.retailerName })
      : shops.main.retailerName
    : null;

  return (
    <>
      <button
        type="button"
        data-testid="location-bar"
        onClick={() => openSheet(shops.location ? 'shops' : 'where')}
        className="press tap flex w-full items-center gap-3 rounded-pill border border-border bg-surface py-2 pr-4 pl-2 text-left shadow-card"
        aria-label={t('barChange')}
      >
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-muted text-primary">
          <MapPin className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-semibold text-text">{ready && hasShops ? t('barNear', { place: label }) : t('barChoose')}</span>
          {ready && names && <span className="block truncate text-caption text-text-muted">{names}</span>}
        </span>
        <ChevronDown aria-hidden className="size-5 shrink-0 text-text-muted" />
      </button>
      {sheetOpen && <LocationSheet step={sheetOpen} onClose={closeSheet} />}
    </>
  );
}
