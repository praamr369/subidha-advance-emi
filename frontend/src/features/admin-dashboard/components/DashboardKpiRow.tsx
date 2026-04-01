"use client";

import StatCard from "@/components/ui/StatCard";
import ErrorState from "@/components/ui/ErrorState";
import { useDashboardSummary } from "@/features/admin-dashboard/hooks/useDashboardSummary";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export default function DashboardKpiRow() {
  const { data, isLoading, isError, error } = useDashboardSummary();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-border bg-card"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        message={
          error instanceof Error
            ? error.message
            : "Failed to load dashboard summary."
        }
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <StatCard label="Pending EMIs" value={data?.pendingEmisCount ?? 0} />
      <StatCard label="Overdue EMIs" value={data?.overdueEmisCount ?? 0} />
      <StatCard
        label="Today Collection"
        value={formatCurrency(data?.todayCollectionAmount ?? 0)}
      />
      <StatCard
        label="Active Subscriptions"
        value={data?.activeSubscriptionsCount ?? 0}
      />
      <StatCard
        label="Total Subscriptions"
        value={data?.totalSubscriptionsCount ?? 0}
      />
      <StatCard
        label="Recon Attention"
        value={data?.reconciliationAttentionCount ?? 0}
      />
    </div>
  );
}