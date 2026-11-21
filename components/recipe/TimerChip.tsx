'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export function TimerChip({ minutes }: { minutes: number }) {
  const t = useTranslations('recipe');
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left === null || left <= 0) return;
    const id = setTimeout(() => setLeft((l) => (l === null ? null : l - 1)), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const mmss = left === null ? '' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <button type="button" onClick={() => setLeft(minutes * 60)} className="tap mt-1 rounded-full border border-brand px-3 py-1 text-sm font-semibold text-brand" aria-live="polite">
      {left === null ? t('timer', { minutes }) : left > 0 ? t('timerRunning', { time: mmss }) : t('timerDone')}
    </button>
  );
}
