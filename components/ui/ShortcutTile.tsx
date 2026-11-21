/** Square-ish shortcut card: icon in a soft circle, title, subtitle (THEME §2.10). */
import Link from 'next/link';
import { cn } from '@/lib/cn';

const inner = (icon: React.ReactNode, title: string, subtitle?: string) => (
  <>
    <span aria-hidden className="grid size-10 place-items-center rounded-full bg-savings-soft text-savings-text">
      {icon}
    </span>
    <span className="mt-3 block font-heading text-small font-bold text-primary">{title}</span>
    {subtitle && <span className="mt-0.5 block text-caption text-text-muted">{subtitle}</span>}
  </>
);
const cls = 'press tap flex min-h-28 flex-col items-start rounded-card border border-border bg-surface p-4 text-left shadow-card hover:border-primary-soft disabled:opacity-50';

export function ShortcutTile({ icon, title, subtitle, href, className, ...rest }: { icon: React.ReactNode; title: string; subtitle?: string; href?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  if (href)
    return (
      <Link href={href} className={cn(cls, className)}>
        {inner(icon, title, subtitle)}
      </Link>
    );
  return (
    <button type="button" className={cn(cls, className)} {...rest}>
      {inner(icon, title, subtitle)}
    </button>
  );
}
