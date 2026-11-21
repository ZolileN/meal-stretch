'use client';
import { Minus, Plus } from 'lucide-react';

const btn = 'press tap grid place-items-center rounded-full border border-border bg-surface text-primary hover:border-primary-soft disabled:opacity-40';

export function Stepper({
  value, min, max, onChange, label, decLabel, incLabel,
}: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; decLabel: string; incLabel: string }) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={decLabel} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus aria-hidden className="size-5" />
      </button>
      <output aria-live="polite" className="money min-w-8 text-center font-heading text-h1 font-extrabold text-primary">
        {value}
      </output>
      <button type="button" className={btn} aria-label={incLabel} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus aria-hidden className="size-5" />
      </button>
    </div>
  );
}
