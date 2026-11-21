'use client';
/**
 * One-time tip card (THEME §2.15): title, text, dot stepper, Skip and Next/Done.
 * Rendered in the page flow (never floating over content); "seen" is stored per feature on the device.
 */
import { useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

const key = (id: string) => `ms_coach_${id}`;
const seen = (id: string) => {
  try {
    return window.localStorage.getItem(key(id)) === '1';
  } catch {
    return true; // storage blocked: don't nag every visit
  }
};
const noop = () => () => undefined;

export function CoachMark({
  id,
  steps,
  labels,
  className,
}: {
  id: string;
  steps: { title: string; text: string }[];
  labels: { skip: string; next: string; done: string; step: (n: number, total: number) => string };
  className?: string;
}) {
  const already = useSyncExternalStore(noop, () => seen(id), () => true);
  const [i, setI] = useState(0);
  const [closed, setClosed] = useState(false);
  if (already || closed || steps.length === 0) return null;
  const finish = () => {
    try {
      window.localStorage.setItem(key(id), '1');
    } catch {
      /* ignore */
    }
    setClosed(true);
  };
  const s = steps[i]!;
  const last = i === steps.length - 1;
  return (
    <aside className={cn('fade-in relative rounded-card border border-primary-soft bg-surface p-5 shadow-float', className)} aria-label={labels.step(i + 1, steps.length)} data-testid={`coach-${id}`}>
      <p className="font-heading text-h3 font-bold text-primary">{s.title}</p>
      <p className="mt-1 text-small text-text">{s.text}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex gap-1.5" aria-hidden>
          {steps.map((_, k) => (
            <span key={k} className={cn('size-2 rounded-full', k === i ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>
        <div className="flex gap-1">
          {!last && (
            <Button variant="ghost" onClick={finish}>
              {labels.skip}
            </Button>
          )}
          <Button onClick={() => (last ? finish() : setI(i + 1))}>{last ? labels.done : labels.next}</Button>
        </div>
      </div>
    </aside>
  );
}
