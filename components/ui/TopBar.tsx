/** Back button + title + optional right action (THEME §2.8). */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

export function circleButtonClass(onPhoto = false) {
  return cn(
    'press tap grid size-11 shrink-0 place-items-center rounded-full',
    onPhoto ? 'bg-surface/80 text-primary backdrop-blur' : 'border border-border bg-surface text-primary shadow-card',
  );
}

export function TopBar({
  backHref,
  backLabel,
  title,
  right,
  onPhoto = false,
  className,
}: {
  backHref?: string;
  backLabel: string;
  title?: React.ReactNode;
  right?: React.ReactNode;
  onPhoto?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {backHref && (
        <Link href={backHref} aria-label={backLabel} className={circleButtonClass(onPhoto)}>
          <ArrowLeft aria-hidden className="size-5" />
        </Link>
      )}
      {title && <h1 className="min-w-0 flex-1 font-heading text-h2 font-bold text-primary">{title}</h1>}
      {!title && <span className="flex-1" />}
      {right}
    </div>
  );
}
