import PortalPage from "@/components/ui/PortalPage";
import EmptyState from "@/components/feedback/EmptyState";
import Link from "next/link";

export default function CustomerAnalyticsReportPage() {
  return (
    <PortalPage title="Customer Analytics" subtitle="Understand retention, risk segments, and lifecycle value.">
      <div className="space-y-4">
        <EmptyState
          title="Customer analytics is not yet implemented"
          description="This report requires backend-supported aggregates (cohorts, retention, churn segments) and/or a stable export endpoint. Until then, use Revenue, Overdue, Batch Performance, and Reconciliation reports."
        />
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/reports/revenue"
            className="inline-flex items-center rounded-md border border-border bg-foreground px-3 py-2 text-sm font-medium text-background shadow-sm transition hover:opacity-90"
          >
            Revenue Report
          </Link>
          <Link
            href="/admin/reports/overdue"
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            Overdue Report
          </Link>
          <Link
            href="/admin/reconciliation"
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            Subscription Reconciliation
          </Link>
        </div>
      </div>
    </PortalPage>
  );
}
