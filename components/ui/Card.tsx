/** White card, radius 24, warm shadow (THEME §2.2). */
import { cn } from '@/lib/cn';

type CardProps = React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' | 'li' | 'form'; bordered?: boolean; tone?: 'surface' | 'savings' | 'danger' | 'muted' };

const TONES = {
  surface: 'bg-surface',
  savings: 'bg-savings-soft',
  danger: 'bg-danger-soft',
  muted: 'bg-surface-muted',
} as const;

export function Card({ as: Tag = 'section', bordered = true, tone = 'surface', className, ...rest }: CardProps) {
  return <Tag className={cn('rounded-card shadow-card', TONES[tone], bordered && 'border border-border', className)} {...(rest as React.HTMLAttributes<HTMLElement>)} />;
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 px-5 pt-5', className)} {...rest} />;
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...rest} />;
}
