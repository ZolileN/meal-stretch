/**
 * Our own wordmark (THEME §6.1): the name from BRAND in Plus Jakarta Sans, with an amber "stretch"
 * bar under "Stretch" (the savings signature). No imagery borrowed from anyone else.
 */
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';

export function Wordmark({ className }: { className?: string }) {
  const split = BRAND.name.search(/[A-Z](?=[a-z]+$)/); // "Meal|Stretch"
  const [a, b] = split > 0 ? [BRAND.name.slice(0, split), BRAND.name.slice(split)] : [BRAND.name, ''];
  return (
    <span className={cn('inline-flex items-baseline font-heading text-h3 font-extrabold tracking-tight text-primary', className)} aria-label={BRAND.name}>
      <span aria-hidden>{a}</span>
      {b && (
        <span aria-hidden className="relative">
          {b}
          <span className="absolute inset-x-0 -bottom-0.5 h-1 rounded-pill bg-savings" />
        </span>
      )}
    </span>
  );
}
