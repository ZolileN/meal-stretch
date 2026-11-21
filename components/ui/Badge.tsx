/** Small pills (THEME §2.4): counts (terracotta), status and tags. */
import { cn } from '@/lib/cn';

export type BadgeTone = 'count' | 'active' | 'special' | 'member' | 'stale' | 'info' | 'danger' | 'eyebrow';

const TONES: Record<BadgeTone, string> = {
  count: 'bg-accent text-on-primary min-w-6 justify-center',
  active: 'bg-primary-soft text-on-primary',
  special: 'bg-savings-soft text-savings-text',
  member: 'bg-primary text-on-primary',
  stale: 'bg-surface-muted text-text',
  info: 'border border-info bg-surface text-info',
  danger: 'bg-danger-soft text-danger',
  /** "UP NEXT" on the green hero. */
  eyebrow: 'bg-on-primary/15 text-on-primary',
};

export function Badge({ tone = 'info', className, ...rest }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn('money inline-flex items-center rounded-pill px-2 py-0.5 text-caption font-bold uppercase tracking-wide', TONES[tone], className)}
      {...rest}
    />
  );
}
