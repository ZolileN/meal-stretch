'use client';
/** LOC-6: persistent location bar; tap opens the sheet at the shops step. */
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';

// The sheet and picker are only needed once opened: keep them out of every page's first-load JS (§15).
const LocationSheet = dynamic(() => import('./LocationSheet').then((m) => m.LocationSheet), { ssr: false });
import { useShops } from './LocationProvider';

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
        className="tap flex w-full items-center justify-between border-b bg-white px-4 py-2 text-left"
        aria-label={t('barChange')}
      >
        <span>
          <span className="block font-semibold">{ready && hasShops ? t('barNear', { place: label }) : t('barChoose')}</span>
          {ready && names && <span className="block text-sm text-gray-600">{names}</span>}
        </span>
        <span aria-hidden>▾</span>
      </button>
      {sheetOpen && <LocationSheet step={sheetOpen} onClose={closeSheet} />}
    </>
  );
}

