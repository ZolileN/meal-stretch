import { cn } from '@/lib/cn';

/** Cream shimmer placeholder (THEME §2.16). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('skeleton block rounded-img', className)} />;
}
