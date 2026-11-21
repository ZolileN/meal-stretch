'use client';
export function Stepper({
  value, min, max, onChange, label, decLabel, incLabel,
}: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; decLabel: string; incLabel: string }) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className="tap rounded-full border text-xl font-bold" aria-label={decLabel} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <output aria-live="polite" className="min-w-8 text-center text-2xl font-bold">
        {value}
      </output>
      <button type="button" className="tap rounded-full border text-xl font-bold" aria-label={incLabel} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}
