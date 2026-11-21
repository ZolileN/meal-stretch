/**
 * Savings donut (THEME §2.11). Track surface-muted, fill savings amber; the % is always printed in
 * the centre so the ring is never the only signal.
 */
import { cn } from '@/lib/cn';

export function StatRing({ pct, label, size = 88, stroke = 10, className }: { pct: number; label: string; size?: number; stroke?: number; className?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div role="img" aria-label={label} className={cn('relative inline-grid shrink-0 place-items-center', className)} style={{ width: size, height: size }}>
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-surface-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          className="stroke-savings"
        />
      </svg>
      <span aria-hidden className="money absolute font-heading text-h3 font-extrabold text-savings-text">
        {p}%
      </span>
    </div>
  );
}
