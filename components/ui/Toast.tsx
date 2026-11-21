'use client';
/** Short confirmation above the bottom nav; announced politely and dismissed after a few seconds. */
import { useEffect } from 'react';
import { CircleCheck, CircleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

/** `above="footer"` lifts it over a sticky footer card (shopping list) so it never hides the total. */
export function Toast({ message, tone = 'success', onDone, ms = 4000, testId, above = 'nav' }: { message: string | null; tone?: 'success' | 'error'; onDone: () => void; ms?: number; testId?: string; above?: 'nav' | 'footer' }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, ms);
    return () => clearTimeout(id);
  }, [message, ms, onDone]);
  return (
    <div className={cn(above === 'footer' ? 'bottom-above-footer' : 'bottom-above-nav', 'pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4')} aria-live="polite" data-floating>
      {message && (
        <p
          role="status"
          data-testid={testId}
          className={cn(
            'fade-in pointer-events-auto flex max-w-md items-center gap-2 rounded-pill px-4 py-3 text-small font-semibold shadow-float',
            tone === 'success' ? 'bg-primary text-on-primary' : 'bg-danger text-on-primary',
          )}
        >
          {tone === 'success' ? <CircleCheck aria-hidden className="size-5 shrink-0" /> : <CircleAlert aria-hidden className="size-5 shrink-0" />}
          {message}
        </p>
      )}
    </div>
  );
}
