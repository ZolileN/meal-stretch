'use client';
/**
 * Bottom sheet (THEME §2.12): grab handle, 28 px top radius, focus trap, Escape and swipe-down to
 * close, focus returns to the opener. Location picker, swap options and loyalty cards use it.
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Sheet({
  title,
  titleHidden = false,
  closeLabel,
  onClose,
  children,
  className,
}: {
  title: string;
  titleHidden?: boolean;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return closeRef.current();
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return e.preventDefault();
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    if ((panel.current?.scrollTop ?? 0) > 0) return;
    drag.current = { y: e.touches[0]!.clientY, dy: 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, e.touches[0]!.clientY - drag.current.y);
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onTouchEnd = () => {
    if (!drag.current || !panel.current) return;
    const { dy } = drag.current;
    drag.current = null;
    panel.current.style.transform = '';
    if (dy > 90) closeRef.current();
  };

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-text/40" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={cn('sheet-in pb-safe max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-sheet bg-surface px-5 pt-2 shadow-float outline-none transition-transform', className)}
      >
        <div aria-hidden className="mx-auto mb-2 h-1.5 w-10 rounded-pill bg-border" />
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className={cn('font-heading text-h3 font-bold text-primary', titleHidden && 'sr-only')}>{title}</p>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="press tap -mr-2 grid place-items-center rounded-full text-text-muted hover:bg-surface-muted">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
