import { cn } from '@/lib/cn';

export function EmptyState({ icon, title, text, action, className }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center rounded-card border border-dashed border-border bg-surface px-6 py-8 text-center', className)}>
      {icon && (
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-surface-muted text-primary">
          {icon}
        </span>
      )}
      <p className="mt-3 font-heading text-h3 font-bold text-primary">{title}</p>
      {text && <p className="mt-1 text-small text-text-muted">{text}</p>}
      {action && <div className="mt-4 w-full">{action}</div>}
    </div>
  );
}
