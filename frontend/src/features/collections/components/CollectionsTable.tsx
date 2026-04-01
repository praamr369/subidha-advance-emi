"use client";

import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import RiskBadge from "@/components/ui/RiskBadge";
import type { CollectionQueueItem } from "@/services/collections.service";

type CollectionsTableProps = {
  title: string;
  items?: CollectionQueueItem[];
  loading: boolean;
  error?: unknown;
  onCollect: (item: CollectionQueueItem) => void;
};

export default function CollectionsTable({
  title,
  items,
  loading,
  error,
  onCollect,
}: CollectionsTableProps) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>

      {loading ? (
        <div className="px-6 py-8 text-sm text-muted-foreground">Loading collection items...</div>
      ) : error ? (
        <div className="px-6 py-6">
          <ErrorState
            message={error instanceof Error ? error.message : "Failed to load collection items."}
          />
        </div>
      ) : !items || items.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState
            title="No records found"
            description="There are no collection items in this queue."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Customer</th>
                <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Subscription</th>
                <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Batch</th>
                <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Lucky ID</th>
                <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Due</th>
                <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Penalty</th>
                <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Payable</th>
                <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Overdue</th>
                <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Risk</th>
                <th className="px-6 py-3 text-sm font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-b-0">
                  <td className="px-6 py-4 text-sm text-foreground">{item.customerName}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {item.subscriptionCode || `#${item.subscriptionId}`}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {item.batchName ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {item.luckyId ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">₹{item.amountDue}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    ₹{item.penaltyAmount ?? 0}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-foreground">
                    ₹{item.payableNow}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {item.overdueDays ?? 0} days
                  </td>
                  <td className="px-6 py-4">
                    <RiskBadge level={item.riskLevel} />
                  </td>
                  <td className="px-6 py-4">
                    <button
                      type="button"
                      onClick={() => onCollect(item)}
                      className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                    >
                      Collect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}