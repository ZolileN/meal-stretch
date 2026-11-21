'use client';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { ShopLocation } from '../ShopLocation';

export function LocationSheet({ step, onClose }: { step: 'where' | 'shops'; onClose: () => void }) {
  const t = useTranslations('location');
  return (
    <Sheet title={t('shopsTitle')} titleHidden closeLabel={t('close')} onClose={onClose}>
      <ShopLocation initialStep={step} onDone={onClose} surface="surface" />
    </Sheet>
  );
}
