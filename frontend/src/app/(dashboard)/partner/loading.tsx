import { CardSkeleton, TableSkeleton } from "@/components/feedback/Skeleton";

export default function PartnerPortalLoading() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <CardSkeleton key={`partner-card-${index}`} />
        ))}
      </div>
      <TableSkeleton rows={7} columns={5} />
    </div>
  );
}
