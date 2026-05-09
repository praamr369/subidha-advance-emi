import { ChartSkeleton, DashboardGridSkeleton, FormSkeleton, TableSkeleton } from "@/components/feedback/Skeleton";

/**
 * Route-level skeleton shells for dashboard segments (loading.tsx).
 * Motion variants respect reduced-motion via primitives and Tailwind motion-safe-*.
 */
export function AdminStandardHubSkeleton() {
  return (
    <div className="space-y-5 px-1 py-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <DashboardGridSkeleton cards={4} />
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
}

export function WorkspaceSkeleton({ narrow }: { narrow?: boolean }) {
  return (
    <div className="space-y-5 px-1 py-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <DashboardGridSkeleton cards={narrow ? 3 : 4} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <TableSkeleton rows={7} columns={6} />
        <ChartSkeleton />
      </div>
    </div>
  );
}

export function DirectSaleShellSkeleton() {
  return (
    <div className="space-y-5 px-1 py-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <DashboardGridSkeleton cards={4} />
      <div className="grid gap-4 xl:grid-cols-2">
        <TableSkeleton rows={7} columns={5} />
        <TableSkeleton rows={5} columns={7} />
      </div>
    </div>
  );
}

export function FormHeavySkeleton() {
  return (
    <div className="space-y-5 px-1 py-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <DashboardGridSkeleton cards={3} />
      <FormSkeleton fields={6} />
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div className="space-y-5 px-1 py-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <DashboardGridSkeleton cards={3} />
      <ChartSkeleton />
      <TableSkeleton rows={6} columns={5} />
    </div>
  );
}
