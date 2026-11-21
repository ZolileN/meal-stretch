/** Selectable pill (THEME §2.3): diets, days, avoid lists, loyalty cards, store filters. */
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Chip({ selected, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'press tap inline-flex items-center gap-1.5 rounded-pill border px-4 py-2 text-small font-medium',
        selected ? 'border-primary bg-surface-muted text-primary' : 'border-border bg-surface text-text hover:border-primary-soft',
        className,
      )}
      {...rest}
    >
      {selected && <Check aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />}
      {children}
    </button>
  );
}
