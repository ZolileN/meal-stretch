/** The MealStretch signature for any saving (THEME §2.5): "−R20" in savings-text on savings-soft. */
import { PiggyBank } from 'lucide-react';
import { formatRandShort } from '@/lib/money';
import { cn } from '@/lib/cn';

export function SavingsChip({ cents, children, icon = true, className, ...rest }: React.HTMLAttributes<HTMLSpanElement> & { cents?: number; icon?: boolean }) {
  return (
    <span className={cn('money inline-flex items-center gap-1.5 rounded-pill bg-savings-soft px-3 py-1 text-small font-semibold text-savings-text', className)} {...rest}>
      {icon && <PiggyBank aria-hidden className="size-4 shrink-0 stroke-savings" />}
      {children ?? (cents !== undefined ? `−${formatRandShort(cents)}` : null)}
    </span>
  );
}
