/** Small uppercase label ("PLAN WEEK") or an h3 title with an optional "See all" link (THEME §2.14). */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export function SectionHeader({
  title,
  variant = 'label',
  as: Tag = 'h2',
  action,
  id,
  className,
}: {
  title: React.ReactNode;
  variant?: 'label' | 'title';
  as?: 'h2' | 'h3';
  action?: { href: string; label: string };
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <Tag id={id} className={variant === 'label' ? 'text-caption font-bold uppercase tracking-wider text-text-muted' : 'text-h3 font-bold text-primary'}>
        {title}
      </Tag>
      {action && (
        <Link href={action.href} className="tap inline-flex items-center gap-0.5 text-small font-semibold text-primary">
          {action.label}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      )}
    </div>
  );
}
