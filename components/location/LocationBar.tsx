'use client';
/** LOC-6: persistent location bar; tap opens the sheet at the shops step. */
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { ShopLocation } from '../ShopLocation';
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

function LocationSheet({ step, onClose }: { step: 'where' | 'shops'; onClose: () => void }) {
  const t = useTranslations('location');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t('shopsTitle')}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 outline-none"
      >
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={onClose} className="tap text-sm font-semibold">
            {t('close')}
          </button>
        </div>
        <ShopLocation initialStep={step} onDone={onClose} />
      </div>
    </div>
  );
}
