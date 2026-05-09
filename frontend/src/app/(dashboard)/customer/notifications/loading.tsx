import { NotificationListSkeleton } from "@/components/feedback/Skeleton";

export default function CustomerNotificationsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-2 py-4">
      <div className="h-8 w-48 rounded-lg bg-[var(--surface-muted)] motion-safe:animate-skeleton-pulse" aria-hidden="true" />
      <NotificationListSkeleton rows={6} />
    </div>
  );
}
