import { CardSkeleton, TableSkeleton } from "@/components/feedback/Skeleton";

export default function AdminPortalLoading() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <CardSkeleton key={`admin-card-${index}`} />
        ))}
      </div>
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
}
