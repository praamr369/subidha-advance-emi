"use client";

import StatCard from "@/components/ui/StatCard";
import ErrorState from "@/components/ui/ErrorState";
import { LoadingSkeleton } from "@/components/ui/portal-primitives";
import { useDashboardSummary } from "@/features/admin-dashboard/hooks/useDashboardSummary";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export default function DashboardKpiRow() {
  const { data, isLoading, isError, error } = useDashboardSummary();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <LoadingSkeleton key={index} compact className="h-28" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Failed to load dashboard summary."}
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <StatCard label="Pending Advance EMIs" value={data?.pendingEmisCount ?? 0} />
      <StatCard label="Overdue Advance EMIs" value={data?.overdueEmisCount ?? 0} tone={(data?.overdueEmisCount ?? 0) > 0 ? "warning" : "default"} />
      <StatCard label="Today Collection" value={formatCurrency(data?.todayCollectionAmount ?? 0)} tone="success" />
      <StatCard label="Active Subscriptions" value={data?.activeSubscriptionsCount ?? 0} />
      <StatCard label="Total Subscriptions" value={data?.totalSubscriptionsCount ?? 0} />
      <StatCard label="Recon Attention" value={data?.reconciliationAttentionCount ?? 0} tone={(data?.reconciliationAttentionCount ?? 0) > 0 ? "warning" : "default"} />
    </div>
  );
}
