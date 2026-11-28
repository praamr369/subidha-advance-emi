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
import {
  createTransportFare,
  fetchLogisticsCockpit,
  listTransportFares,
  updateTransportFare,
  type LogisticsCockpit,
  type TransportFareEntry,
  type TransportFareListResponse,
  type TransportFareSettlementStatus,
} from "@/services/logistics";
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
  const [transportData, setTransportData] = useState<TransportFareListResponse | null>(null);
  const [transportFilterStatus, setTransportFilterStatus] = useState<string>("");
  const [transportQuery, setTransportQuery] = useState<string>("");
  const [savingFare, setSavingFare] = useState(false);
  const [updatingFareId, setUpdatingFareId] = useState<number | null>(null);
  const [fareForm, setFareForm] = useState({
    reference_no: "",
    customer_name: "",
    van_number: "",
    transport_boy_name: "",
    transport_boy_phone: "",
    van_fare: "",
    notes: "",
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [res, tfRes] = await Promise.all([
        fetchLogisticsCockpit(),
        listTransportFares({
          settlement_status: transportFilterStatus || undefined,
          q: transportQuery.trim() || undefined,
        }),
      ]);
      setData(res);
      setTransportData(tfRes);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [transportFilterStatus, transportQuery]);

  async function handleCreateManualFare(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSavingFare(true);
      await createTransportFare({
        source_type: "MANUAL",
        reference_no: fareForm.reference_no.trim() || undefined,
        customer_name: fareForm.customer_name.trim() || undefined,
        van_number: fareForm.van_number.trim().toUpperCase(),
        transport_boy_name: fareForm.transport_boy_name.trim(),
        transport_boy_phone: fareForm.transport_boy_phone.trim(),
        van_fare: fareForm.van_fare.trim() || "0.00",
        notes: fareForm.notes.trim(),
      });
      setFareForm({
        reference_no: "",
        customer_name: "",
        van_number: "",
        transport_boy_name: "",
        transport_boy_phone: "",
        van_fare: "",
        notes: "",
      });
      await loadData();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setSavingFare(false);
    }
  }

  async function handleFareSettlement(entry: TransportFareEntry, nextStatus: TransportFareSettlementStatus) {
    try {
      setUpdatingFareId(entry.id);
      await updateTransportFare(entry.id, { settlement_status: nextStatus });
      await loadData();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setUpdatingFareId(null);
    }
  }

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

          <Section
            icon={Truck}
            title="Transport-Only Finance Register (Off-Ledger · Separate from Company Accounts)"
            count={transportData?.summary.count ?? 0}
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 px-4 py-2.5 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                Transport &amp; van fare records from Direct Sales, Contracts (SFEMI / Rent / Lease), Delivery Challans, and manual trips are tracked here for transport settlement only. <strong>Nothing here is posted to company ledgers or financial accounts.</strong>
              </div>

              {transportData?.summary ? (
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-[11px] uppercase text-muted-foreground">Total Van Fare</div>
                    <div className="mt-1 text-lg font-bold text-foreground">₹{transportData.summary.total_fare}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-[11px] uppercase text-muted-foreground">Pending Transport Payout</div>
                    <div className="mt-1 text-lg font-bold text-amber-600">₹{transportData.summary.pending_fare}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-[11px] uppercase text-muted-foreground">Paid to Transport</div>
                    <div className="mt-1 text-lg font-bold text-emerald-600">₹{transportData.summary.paid_to_transport_fare}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-[11px] uppercase text-muted-foreground">Customer Paid Direct</div>
                    <div className="mt-1 text-lg font-bold text-sky-600">₹{transportData.summary.customer_paid_direct_fare}</div>
                  </div>
                </div>
              ) : null}

              <form onSubmit={handleCreateManualFare} className="grid gap-2.5 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-7">
                <input
                  value={fareForm.reference_no}
                  onChange={(e) => setFareForm((c) => ({ ...c, reference_no: e.target.value }))}
                  placeholder="Ref / Challan No"
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                />
                <input
                  value={fareForm.customer_name}
                  onChange={(e) => setFareForm((c) => ({ ...c, customer_name: e.target.value }))}
                  placeholder="Customer / Route"
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                />
                <input
                  value={fareForm.van_number}
                  onChange={(e) => setFareForm((c) => ({ ...c, van_number: e.target.value.toUpperCase() }))}
                  placeholder="Van Number"
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                />
                <input
                  value={fareForm.transport_boy_name}
                  onChange={(e) => setFareForm((c) => ({ ...c, transport_boy_name: e.target.value }))}
                  placeholder="Transport Boy"
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                />
                <input
                  value={fareForm.transport_boy_phone}
                  onChange={(e) => setFareForm((c) => ({ ...c, transport_boy_phone: e.target.value }))}
                  placeholder="Boy Phone"
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fareForm.van_fare}
                  onChange={(e) => setFareForm((c) => ({ ...c, van_fare: e.target.value }))}
                  placeholder="Fare ₹"
                  required
                  className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                />
                <button
                  type="submit"
                  disabled={savingFare}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {savingFare ? "Adding..." : "+ Record Van Fare"}
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={transportQuery}
                  onChange={(e) => setTransportQuery(e.target.value)}
                  placeholder="Search van no, boy, customer, ref..."
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
                />
                <select
                  value={transportFilterStatus}
                  onChange={(e) => setTransportFilterStatus(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs"
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="PAID_TO_TRANSPORT">Paid to Transport</option>
                  <option value="CUSTOMER_PAID_DIRECT">Customer Paid Direct</option>
                  <option value="WAIVED">Waived</option>
                </select>
              </div>

              {!transportData || transportData.results.length === 0 ? (
                <ERPEmptyState
                  icon={<Truck className="h-5 w-5 text-muted-foreground" />}
                  title="No transport fare entries yet"
                  description="Van fare details entered on Direct Sales, Contracts, or Delivery Challans appear here automatically."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="pb-2 font-medium">Date</th>
                        <th className="pb-2 font-medium">Source &amp; Ref</th>
                        <th className="pb-2 font-medium">Customer</th>
                        <th className="pb-2 font-medium">Van / Transport Boy</th>
                        <th className="pb-2 font-medium text-right">Fare (₹)</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium text-right">Transport Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {transportData.results.map((entry) => (
                        <tr key={entry.id} className="hover:bg-muted/40">
                          <td className="py-2.5 text-muted-foreground">{entry.entry_date || "—"}</td>
                          <td className="py-2.5">
                            <div className="font-medium text-foreground">{entry.reference_no || `#${entry.id}`}</div>
                            <div className="text-[11px] text-muted-foreground">{entry.source_type.replace(/_/g, " ")}</div>
                          </td>
                          <td className="py-2.5">{entry.customer_name || "—"}</td>
                          <td className="py-2.5">
                            <div className="font-mono font-medium">{entry.van_number || "—"}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {entry.transport_boy_name || "—"} {entry.transport_boy_phone ? `· ${entry.transport_boy_phone}` : ""}
                            </div>
                          </td>
                          <td className="py-2.5 text-right font-semibold tabular-nums">₹{entry.van_fare}</td>
                          <td className="py-2.5">
                            <StatusChip value={entry.settlement_status} />
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="inline-flex flex-wrap gap-1.5 justify-end">
                              {entry.settlement_status !== "PAID_TO_TRANSPORT" ? (
                                <button
                                  type="button"
                                  disabled={updatingFareId === entry.id}
                                  onClick={() => void handleFareSettlement(entry, "PAID_TO_TRANSPORT")}
                                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                  Mark Paid
                                </button>
                              ) : null}
                              {entry.settlement_status === "PENDING" ? (
                                <button
                                  type="button"
                                  disabled={updatingFareId === entry.id}
                                  onClick={() => void handleFareSettlement(entry, "CUSTOMER_PAID_DIRECT")}
                                  className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
                                >
                                  Customer Paid
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Section>
        </div>
      )}
    </ERPPageShell>
  );
}
