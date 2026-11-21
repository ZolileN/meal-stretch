'use client';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ShopLocation } from '../ShopLocation';

export function LocationSheet({ step, onClose }: { step: 'where' | 'shops'; onClose: () => void }) {
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
