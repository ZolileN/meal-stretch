/** Integer cents → "R1,234.50" with tabular numbers (THEME §2.6). */
import { formatRand, formatRandShort } from '@/lib/money';
import { cn } from '@/lib/cn';

export function MoneyText({
  cents,
  short = true,
  strike = false,
  strikeLabel,
  className,
}: {
  cents: number;
  /** R58 instead of R58.00 when whole rands. */
  short?: boolean;
  /** Normal price shown next to a special: struck through and muted. */
  strike?: boolean;
  /** Screen-reader prefix for a struck price, e.g. "was". */
  strikeLabel?: string;
  className?: string;
}) {
  const text = short ? formatRandShort(cents) : formatRand(cents);
  if (strike)
    return (
      <s className={cn('money text-text-muted', className)}>
        {strikeLabel && <span className="sr-only">{strikeLabel} </span>}
        {text}
      </s>
    );
  return <span className={cn('money', className)}>{text}</span>;
}
