"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Package,
  Truck,
  RefreshCw,
  Undo2,
  Box,
  AlertTriangle,
} from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { fetchLogisticsCockpit, type LogisticsCockpit } from "@/services/logistics";
import { markAdminDeliveryDelivered } from "@/services/deliveries";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Something went wrong.";
}

function StatusChip({ value, isError = false }: { value: string; isError?: boolean }) {
  const v = (value || "").toUpperCase();
  let cls = "bg-muted text-muted-foreground ring-border";
  if (isError || v.includes("CANCEL") || v === "FAILED" || v === "REJECTED") {
    cls = "bg-rose-50 text-rose-700 ring-rose-200";
  } else if (v === "PENDING" || v === "SCHEDULED" || v === "OPEN" || v === "IN_TRANSIT" || v === "OUT_FOR_DELIVERY") {
    cls = "bg-amber-50 text-amber-700 ring-amber-200";
  } else if (v === "DELIVERED" || v === "CLOSED" || v === "RESOLVED" || v === "SETTLED" || v === "POSTED") {
    cls = "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}>
      {value || "—"}
    </span>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
  headerVariant = "default",
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  children: React.ReactNode;
  headerVariant?: "default" | "warning";
}) {
  const isWarning = headerVariant === "warning";
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className={`flex items-center gap-2 border-b px-5 py-3 ${isWarning ? 'border-amber-200 bg-amber-50/50' : 'border-border'}`}>
        <Icon className={`h-4 w-4 ${isWarning ? 'text-amber-600' : 'text-primary'}`} />
        <h2 className={`text-sm font-semibold ${isWarning ? 'text-amber-900' : 'text-foreground'}`}>{title}</h2>
        {count !== undefined ? (
          <span className={`rounded-full px-2 py-0.5 text-xs ${isWarning ? 'bg-amber-100 text-amber-800' : 'bg-muted text-muted-foreground'}`}>
            {count}
          </span>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function AdminLogisticsCockpitPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LogisticsCockpit | null>(null);
  const [markingId, setMarkingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchLogisticsCockpit();
      setData(res);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleMarkDelivered = async (id: number) => {
    try {
      setMarkingId(id);
      await markAdminDeliveryDelivered(id, {});
      // Optimistically remove
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          deliveries_today: prev.deliveries_today.filter((d) => d.id !== id),
          deliveries_today_count: Math.max(0, prev.deliveries_today_count - 1),
        };
      });
    } catch (err) {
      alert(toErrorMessage(err));
    } finally {
      setMarkingId(null);
    }
  };

  const stats = [
    { label: "Ship Today", value: data?.deliveries_today_count ?? 0 },
    { label: "Stock Alerts", value: data?.stock_alerts_count ?? 0 },
    { label: "Returns Pending", value: data?.returns_in_flight_count ?? 0 },
  ];

  return (
    <ERPPageShell eyebrow="Operations" title="Logistics Cockpit" stats={stats}>
      {error && (
        <div className="mb-6 rounded-md bg-rose-50 p-4 text-sm text-rose-700">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" /> Failed to load cockpit
          </div>
          <div className="mt-1 opacity-90">{error}</div>
          <button type="button" onClick={loadData} className="mt-3 inline-flex items-center justify-center rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <RefreshCw className="mr-2 h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <p className="mt-4 text-sm">Loading logistics data...</p>
        </div>
      )}

      {!loading && data && (
        <div className="space-y-6">
          <Section icon={Truck} title="Ship Today" count={data.deliveries_today_count}>
            {data.deliveries_today.length === 0 ? (
              <ERPEmptyState
                icon={<Truck className="h-5 w-5 text-muted-foreground" />}
                title="Nothing to ship right now"
                description="All deliveries are caught up for today."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Reference</th>
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Scheduled Date</th>
                      <th className="pb-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.deliveries_today.map((item) => (
                      <tr key={`${item.type}-${item.id}`} className="transition hover:bg-muted/50">
                        <td className="py-3">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${
                              item.type === "SUBSCRIPTION"
                                ? "bg-sky-50 text-sky-700 ring-sky-200"
                                : "bg-violet-50 text-violet-700 ring-violet-200"
                            }`}
                          >
                            {item.type.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-3">
                          {item.type === "SUBSCRIPTION" ? item.subscription_number : item.case_no}
                          {item.product_name && (
                            <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                              {item.product_name}
                            </div>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="font-medium">{item.customer_name}</div>
                          {item.customer_phone && <div className="text-xs text-muted-foreground">{item.customer_phone}</div>}
                        </td>
                        <td className="py-3">
                          <StatusChip value={item.status} />
                        </td>
                        <td className="py-3">
                          <span className={item.is_overdue ? "text-rose-600 font-medium" : ""}>
                            {item.scheduled_date ? new Date(item.scheduled_date).toLocaleDateString() : "—"}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          {item.type === "SUBSCRIPTION" ? (
                            <button
                              type="button"
                              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-muted disabled:opacity-50"
                              disabled={markingId === item.id}
                              onClick={() => {
                                if (window.confirm(`Mark delivery for ${item.customer_name} as Delivered?`)) {
                                  handleMarkDelivered(item.id);
                                }
                              }}
                            >
                              {markingId === item.id ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                "Mark Delivered"
                              )}
                            </button>
                          ) : (
                            <Link
                              href={`/admin/deliveries?case=${item.id}`}
                              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-muted"
                            >
                              Open Case
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section 
            icon={AlertTriangle} 
            title="Stock Alerts" 
            count={data.stock_alerts_count}
            headerVariant={data.stock_alerts_count > 0 ? "warning" : "default"}
          >
            {data.stock_alerts.length === 0 ? (
              <ERPEmptyState
                icon={<Box className="h-5 w-5 text-muted-foreground" />}
                title="Inventory looks healthy"
                description="No items are below their reorder thresholds."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Product</th>
                      <th className="pb-2 font-medium">Location</th>
                      <th className="pb-2 font-medium">On Hand</th>
                      <th className="pb-2 font-medium">Reorder Level</th>
                      <th className="pb-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.stock_alerts.map((item) => (
                      <tr key={item.item_id} className="transition hover:bg-muted/50">
                        <td className="py-3">
                          <div className="font-medium text-foreground">{item.product_name}</div>
                          {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {item.default_stock_location_name || "—"}
                        </td>
                        <td className="py-3 font-medium text-rose-600">
                          {item.on_hand_qty}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {item.reorder_level_qty}
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/admin/inventory/items?item=${item.item_id}`}
                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-muted"
                          >
                            View Item
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section icon={Undo2} title="Returns in Flight" count={data.returns_in_flight_count}>
            {data.returns_in_flight.length === 0 ? (
              <ERPEmptyState
                icon={<Undo2 className="h-5 w-5 text-muted-foreground" />}
                title="No returns pending"
                description="There are no active returns or exchanges to collect."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Case No</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 font-medium">Case Status</th>
                      <th className="pb-2 font-medium">Stock Status</th>
                      <th className="pb-2 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.returns_in_flight.map((item) => (
                      <tr key={item.id} className="transition hover:bg-muted/50">
                        <td className="py-3 font-medium">{item.case_no}</td>
                        <td className="py-3">
                          <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border">
                            {item.case_type.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-3 font-medium">{item.customer_name}</td>
                        <td className="py-3">
                          <StatusChip value={item.status} />
                        </td>
                        <td className="py-3">
                          <StatusChip value={item.stock_status} />
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/admin/service-desk/returns?case=${item.id}`}
                            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition hover:bg-muted"
                          >
                            View Return
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}
    </ERPPageShell>
  );
}
