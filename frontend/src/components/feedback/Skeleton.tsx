import { cn } from "@/lib/utils";

type BaseProps = {
  className?: string;
};

function SkeletonBlock({ className }: BaseProps) {
  return <div className={cn("animate-skeleton-pulse rounded-lg bg-[var(--surface-muted)]", className)} />;
}

export function CardSkeleton({ className }: BaseProps) {
  return (
    <div className={cn("rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4", className)}>
      <SkeletonBlock className="h-3 w-24" />
      <SkeletonBlock className="mt-4 h-8 w-28" />
      <SkeletonBlock className="mt-3 h-3 w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 4, className }: BaseProps & { rows?: number; columns?: number }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-[var(--surface-card-elevated)]", className)}>
      <div className="grid gap-2 border-b border-border p-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonBlock key={`header-${index}`} className="h-3 w-3/4" />
        ))}
      </div>
      <div className="space-y-3 p-4">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`row-${rowIndex}`} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <SkeletonBlock key={`cell-${rowIndex}-${colIndex}`} className="h-3 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton({ fields = 5, className }: BaseProps & { fields?: number }) {
  return (
    <div className={cn("space-y-4 rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-5", className)}>
      {Array.from({ length: fields }).map((_, index) => (
        <div key={`field-${index}`} className="space-y-2">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-10 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
