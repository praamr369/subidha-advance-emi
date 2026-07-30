"use client";

import Link from "next/link";
import { Truck, Package } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import CustomerPageShell, {
  CPageCard,
  CPageSection,
  CPageStats,
  CPageStat,
  CPageTabs,
} from "@/components/layout/CustomerPageShell";
import {
  listCustomerDeliveries,
  type DeliveryRecord,
  type DeliveryStatus,
} from "@/services/deliveries";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function resolveLatestEvent(row: DeliveryRecord): { label: string; value: string | null | undefined } {
  if (row.returned_at) return { label: "Returned", value: row.returned_at };
  if (row.delivered_at) return { label: "Delivered", value: row.delivered_at };
  if (row.out_for_delivery_at) return { label: "Out for delivery", value: row.out_for_delivery_at };
  if (row.dispatched_at) return { label: "Dispatched", value: row.dispatched_at };
  if (row.scheduled_date) return { label: "Scheduled", value: row.scheduled_date };
  return { label: "Requested", value: row.created_at };
}

const STATUS_TABS = [
  { value: "" as DeliveryStatus | "", label: "All" },
  { value: "PENDING" as DeliveryStatus, label: "Pending" },
  { value: "IN_TRANSIT" as DeliveryStatus, label: "In Transit" },
  { value: "DELIVERED" as DeliveryStatus, label: "Delivered" },
  { value: "RETURNED" as DeliveryStatus, label: "Returned" },
];

function DeliveryCard({ row }: { row: DeliveryRecord }) {
  const event = resolveLatestEvent(row);
  return (
    <CPageCard href={`/customer/deliveries/${row.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground truncate">
            {row.delivery_reference || `DEL-${row.id}`}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {row.subscription_number || "—"}
          </div>
          {row.product_name ? (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{row.product_name}</div>
          ) : null}
        </div>
        <ERPStatusBadge status={row.status} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
        <div>
          <span className="text-muted-foreground">{event.label}</span>
          <div className="font-semibold mt-0.5">{formatDate(event.value)}</div>
        </div>
        {row.delivery_reference ? (
          <div>
            <span className="text-muted-foreground">Reference</span>
            <div className="font-mono font-semibold mt-0.5 truncate">{row.delivery_reference}</div>
          </div>
        ) : null}
      </div>
    </CPageCard>
  );
}

export default function CustomerDeliveriesPage() {
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | "">("");
  const [rows, setRows] = useState<DeliveryRecord[]>([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState({
    total: 0, pending: 0, delivered: 0, in_transit: 0, returned: 0,
    scheduled: 0, dispatched: 0, out_for_delivery: 0, failed: 0, cancelled: 0, return_requested: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: DeliveryStatus | "") => {
    setLoading(true);
    try {
      const payload = await listCustomerDeliveries({ status: status || undefined });
      setRows(payload.results);
      setCount(payload.count);
      setSummary(payload.summary);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deliveries.");
      setRows([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(statusFilter); }, [load, statusFilter]);

  const inProgress = useMemo(
    () => summary.pending + summary.scheduled + summary.in_transit + summary.dispatched + summary.out_for_delivery,
    [summary]
  );

  return (
    <CustomerPageShell
      title="Deliveries"
      subtitle="Track your product delivery status"
      actions={
        <Link
          href="/customer/deliveries/handover"
          className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          Handover
        </Link>
      }
    >
      {/* Stats */}
      {!loading && summary.total > 0 ? (
        <CPageStats>
          <CPageStat label="Total" value={summary.total} />
          <CPageStat label="In Progress" value={inProgress} tone={inProgress > 0 ? "info" : "default"} />
          <CPageStat label="Delivered" value={summary.delivered} tone="success" />
          {summary.returned > 0 ? <CPageStat label="Returned" value={summary.returned} /> : null}
        </CPageStats>
      ) : null}

      {/* Filter tabs */}
      <CPageSection>
        <CPageTabs
          tabs={STATUS_TABS}
          active={statusFilter}
          onChange={(v) => setStatusFilter(v)}
        />
      </CPageSection>

      {loading ? <ERPLoadingState label="Loading deliveries..." /> : null}

      {!loading && error ? (
        <ERPErrorState
          title="Could not load deliveries"
          description={error}
          onRetry={() => void load(statusFilter)}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState
          title="No deliveries"
          description={statusFilter ? `No deliveries with status "${statusFilter}".` : "No delivery records found."}
          icon={<Truck className="h-10 w-10 text-muted-foreground/40" />}
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <CPageSection>
          <div className="space-y-3">
            {rows.map((row) => (
              <DeliveryCard key={row.id} row={row} />
            ))}
          </div>
        </CPageSection>
      ) : null}
    </CustomerPageShell>
  );
}
