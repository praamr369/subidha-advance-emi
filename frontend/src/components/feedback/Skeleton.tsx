import { cn } from "@/lib/utils";

type BaseProps = {
  className?: string;
};

function SkeletonBlock({ className }: BaseProps) {
  return (
    <div
      className={cn(
        "skeleton-shimmer motion-safe:animate-skeleton-pulse rounded-lg bg-muted/50",
        className
      )}
      aria-hidden="true"
    />
  );
}

export function CardSkeleton({ className }: BaseProps) {
  return (
    <div className={cn("surface-glass rounded-xl p-4", className)}>
      <SkeletonBlock className="h-3 w-24" />
      <SkeletonBlock className="mt-4 h-8 w-28" />
      <SkeletonBlock className="mt-3 h-3 w-full" />
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 4, className }: BaseProps & { rows?: number; columns?: number }) {
  return (
    <div className={cn("table-surface-frame", className)}>
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
    <div
      className={cn("surface-glass space-y-4 rounded-xl p-5", className)}
      aria-busy="true"
      aria-label="Loading form"
    >
      {Array.from({ length: fields }).map((_, index) => (
        <div key={`field-${index}`} className="space-y-2">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-10 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** Matches StatCard shell height for dashboard metric rows */
export function StatCardSkeleton({ className }: BaseProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.6rem] border border-border bg-[var(--surface-card-elevated)] p-5 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.42)]",
        className
      )}
      aria-hidden="true"
    >
      <SkeletonBlock className="h-3 w-28" />
      <SkeletonBlock className="mt-4 h-9 w-20" />
      <SkeletonBlock className="mt-3 h-3 w-full max-w-[12rem]" />
    </div>
  );
}

export function DashboardGridSkeleton({
  cards = 4,
  className,
}: BaseProps & { cards?: number }) {
  return (
    <div
      className={cn("grid gap-4 md:grid-cols-2 xl:grid-cols-4", className)}
      aria-busy="true"
      aria-label="Loading dashboard metrics"
    >
      {Array.from({ length: cards }).map((_, i) => (
        <StatCardSkeleton key={`dash-metric-${i}`} />
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: BaseProps) {
  return (
    <div
      className={cn("surface-glass rounded-xl border border-border p-4", className)}
      aria-busy="true"
      aria-label="Loading chart"
    >
      <SkeletonBlock className="h-4 w-36" />
      <SkeletonBlock className="mt-6 h-40 w-full rounded-xl" />
    </div>
  );
}

export function NotificationListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="space-y-2 px-1 py-2" aria-busy="true" aria-label="Loading notifications">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={`n-sk-${i}`}
          className="space-y-2 rounded-xl border border-border bg-background px-3 py-3"
        >
          <SkeletonBlock className="h-3 w-3/4" />
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}
