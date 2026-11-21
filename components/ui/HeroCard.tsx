/**
 * Tonight hero (THEME §2.9): a solid primary panel, or an optional photo under a gradient.
 * The image is decoration only: without it (data saver, failed load, none) the green version shows.
 */
import { cn } from '@/lib/cn';
import { Badge } from './Badge';
import { HeroImage } from './HeroImage';

export function HeroCard({
  eyebrow,
  title,
  meta,
  imageUrl,
  actions,
  titleAs: Title = 'h2',
  className,
  ...rest
}: {
  titleAs?: 'h1' | 'h2';
  eyebrow?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  imageUrl?: string | null;
  actions?: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section className={cn('relative isolate overflow-hidden rounded-card bg-primary text-on-primary shadow-card', className)} {...rest}>
      {imageUrl && <HeroImage src={imageUrl} />}
      {/* Gradient keeps white text readable on any photo; on the solid panel it adds depth. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-primary via-primary/80 to-primary-soft/40" />
      <div className="relative flex min-h-44 flex-col justify-end gap-2 p-5">
        {eyebrow && (
          <Badge tone="eyebrow" className="self-start">
            {eyebrow}
          </Badge>
        )}
        <Title className="font-heading text-h1 font-extrabold break-words">{title}</Title>
        {meta && <div className="text-small text-on-primary/90">{meta}</div>}
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}
