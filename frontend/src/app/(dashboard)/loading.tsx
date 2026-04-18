import { LoadingSkeleton } from "@/components/ui/portal-primitives";

export default function DashboardLoading() {
  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <LoadingSkeleton label="Loading workspace..." rows={4} className="surface-panel-elevated" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <LoadingSkeleton key={index} compact className="h-28" />
        ))}
      </div>
      <LoadingSkeleton label="Loading records..." rows={6} className="surface-panel-elevated" />
    </div>
  );
}
