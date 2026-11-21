/** Pill button (THEME §2.1). Server-safe: no hooks, so it renders in server and client trees. */
import Link from 'next/link';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse' | 'translucent';
export type ButtonSize = 'lg' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-hover disabled:bg-surface-muted disabled:text-text-muted',
  secondary: 'border-2 border-primary bg-surface text-primary hover:bg-surface-muted disabled:opacity-50',
  ghost: 'text-primary hover:bg-surface-muted disabled:opacity-50',
  danger: 'bg-danger text-on-primary hover:opacity-90 disabled:bg-surface-muted disabled:text-text-muted',
  /** White pill on a green hero. */
  inverse: 'bg-surface text-primary hover:bg-surface-muted disabled:opacity-50',
  /** Secondary action on a green hero. */
  translucent: 'border border-on-primary/40 bg-on-primary/15 text-on-primary hover:bg-on-primary/25 disabled:opacity-50',
};
const SIZES: Record<ButtonSize, string> = {
  lg: 'min-h-14 w-full px-6 text-body',
  md: 'min-h-11 px-5 text-small',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'press tap inline-flex items-center justify-center gap-2 rounded-pill text-center font-semibold disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; icon?: React.ReactNode };

export function Button({
  variant,
  size,
  icon,
  loading = false,
  loadingLabel,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: Common & React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingLabel?: string }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <LoaderCircle aria-hidden className="size-5 animate-spin" /> : icon}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}

export function ButtonLink({ variant, size, icon, className, children, ...rest }: Common & React.ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
