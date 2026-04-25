import { CardSkeleton, TableSkeleton } from "@/components/feedback/Skeleton";

export default function CashierPortalLoading() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <CardSkeleton key={`cashier-card-${index}`} />
        ))}
      </div>
      <TableSkeleton rows={6} columns={4} />
    </div>
  );
}
