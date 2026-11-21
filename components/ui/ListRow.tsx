/**
 * Shopping list row (THEME §2.13): checkbox circle, name + size, price right-aligned, chevron.
 * The checkbox is a real <input> (styled with appearance-none) so it stays accessible and testable.
 */
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export function ListRow({
  checked,
  onToggle,
  checkLabel,
  name,
  detail,
  tags,
  price,
  expanded,
  onExpand,
  moreLabel,
  children,
  className,
  ...rest
}: {
  checked: boolean;
  onToggle: () => void;
  checkLabel: string;
  name: React.ReactNode;
  detail?: React.ReactNode;
  tags?: React.ReactNode;
  price?: React.ReactNode;
  expanded?: boolean;
  onExpand?: () => void;
  moreLabel?: string;
  children?: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLLIElement>, 'children'>) {
  return (
    <li className={cn('px-4 py-3', className)} {...rest}>
      <div className="flex items-start gap-3">
        <label className="tap -m-2 grid shrink-0 cursor-pointer place-items-center p-2">
          <span className="relative grid size-7 place-items-center">
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              aria-label={checkLabel}
              className="press peer size-7 cursor-pointer appearance-none rounded-full border-2 border-border bg-surface checked:border-success checked:bg-success"
            />
            <Check aria-hidden strokeWidth={3} className="pointer-events-none absolute size-4 text-on-primary opacity-0 peer-checked:opacity-100" />
          </span>
        </label>
        {/* Name and price share a wrapping row: at large text sizes the price drops under the name. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1 basis-28" data-part="name">
            <p className={cn('font-medium break-words', checked && 'text-text-muted line-through')}>{name}</p>
            {detail && <p className="text-small text-text-muted">{detail}</p>}
            {tags && <div className="mt-1 flex flex-wrap gap-1">{tags}</div>}
          </div>
          {price && (
            <div className={cn('money ml-auto shrink-0 text-right', checked && 'opacity-60')} data-part="price">
              {price}
            </div>
          )}
        </div>
        {onExpand && (
          <button type="button" onClick={onExpand} aria-expanded={expanded} aria-label={moreLabel} className="press tap -my-2 -mr-2 grid shrink-0 place-items-center rounded-full text-text-muted hover:text-primary">
            <ChevronDown aria-hidden className={cn('size-5 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
      </div>
      {expanded && children && <div className="fade-in mt-2 pl-10">{children}</div>}
    </li>
  );
}
