'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/cn';

export function TimerChip({ minutes }: { minutes: number }) {
  const t = useTranslations('recipe');
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left === null || left <= 0) return;
    const id = setTimeout(() => setLeft((l) => (l === null ? null : l - 1)), 1000);
    return () => clearTimeout(id);
  }, [left]);
  const mmss = left === null ? '' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const running = left !== null && left > 0;
  return (
    <button
      type="button"
      onClick={() => setLeft(minutes * 60)}
      className={cn(
        'press tap money mt-2 inline-flex items-center gap-1.5 rounded-pill border px-4 text-small font-semibold',
        running ? 'border-primary bg-primary text-on-primary' : left === 0 ? 'border-savings bg-savings-soft text-savings-text' : 'border-primary bg-surface text-primary',
      )}
      aria-live="polite"
    >
      <Timer aria-hidden className="size-4" />
      {left === null ? t('timer', { minutes }) : left > 0 ? t('timerRunning', { time: mmss }) : t('timerDone')}
    </button>
  );
}
