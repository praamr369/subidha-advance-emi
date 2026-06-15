"use client";
import { formatRupee } from "@/lib/utils/currency";

import { RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ERPAuditNote,
  ERPDataToolbar,
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
  ERPStatusBadge,
} from "@/components/erp";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { DataTableShell, MobileSafeTable } from "@/components/ui/operations";
import { formatPlanTypeLabel } from "@/lib/plan-labels";
import { listCustomerPayments, type CustomerPayment } from "@/services/customer";
import { listCustomerReceipts, type FinanceReceiptRow } from "@/services/phase4-finance";


function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Failed to load customer payment history.";
}

function paymentStatus(payment: CustomerPayment): "RECORDED" | "REVERSED" {
  return payment.is_reversed ? "REVERSED" : "RECORDED";
}

function downloadReceiptHref(receiptId: number | string) {
  return `/api/v1/customer/receipts/${receiptId}/pdf/`;
}

function splitCustomerReceipts(receipts: FinanceReceiptRow[]) {
  const directSaleReceipts = receipts.filter(
    (row) => row.direct_sale_id !== null && row.direct_sale_id !== undefined
  );
  const rentLeaseReceipts = receipts.filter(
    (row) =>
      (row.direct_sale_id === null || row.direct_sale_id === undefined) &&
      (row.plan_type === "RENT" || row.plan_type === "LEASE")
  );
  const emiReceipts = receipts.filter(
    (row) =>
      (row.direct_sale_id === null || row.direct_sale_id === undefined) &&
      row.plan_type !== "RENT" &&
      row.plan_type !== "LEASE"
  );

  return { directSaleReceipts, rentLeaseReceipts, emiReceipts };
}

export default function CustomerPaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const subscriptionFilter = (searchParams.get("subscription") || "").trim();
  const methodFilter = (searchParams.get("method") || "").trim();

  const [subscriptionInput, setSubscriptionInput] = useState(subscriptionFilter);
  const [methodInput, setMethodInput] = useState(methodFilter);
  const [rows, setRows] = useState<CustomerPayment[]>([]);
  const [count, setCount] = useState(0);
  const [totalPaidAmount, setTotalPaidAmount] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directSaleReceipts, setDirectSaleReceipts] = useState<FinanceReceiptRow[]>([]);
  const [rentLeaseReceipts, setRentLeaseReceipts] = useState<FinanceReceiptRow[]>([]);
  const [emiReceipts, setEmiReceipts] = useState<FinanceReceiptRow[]>([]);

  useEffect(() => {
    setSubscriptionInput(subscriptionFilter);
    setMethodInput(methodFilter);
  }, [subscriptionFilter, methodFilter]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const [payload, receiptPayload] = await Promise.all([
          listCustomerPayments({
            subscription: subscriptionFilter || undefined,
            method: methodFilter || undefined,
          }),
          listCustomerReceipts(),
        ]);

        setRows(payload.results);
        setCount(payload.count);
        setTotalPaidAmount(String(payload.total_paid_amount || "0.00"));

        const receiptRows = receiptPayload.results || [];
        const split = splitCustomerReceipts(receiptRows);
        setDirectSaleReceipts(split.directSaleReceipts);
        setRentLeaseReceipts(split.rentLeaseReceipts);
        setEmiReceipts(split.emiReceipts);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setRows([]);
          setCount(0);
          setTotalPaidAmount("0.00");
          setDirectSaleReceipts([]);
          setRentLeaseReceipts([]);
          setEmiReceipts([]);
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [methodFilter, subscriptionFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const uniqueSubscriptionCount = useMemo(() => {
    return new Set(rows.map((row) => row.subscription_id ?? row.subscription)).size;
  }, [rows]);

  const reversedCount = useMemo(() => {
    return rows.filter((row) => row.is_reversed).length;
  }, [rows]);

  const latestPayment = rows[0] ?? null;

  const columns = useMemo<Column<CustomerPayment>[]>(
    () => [
      {
        key: "plan_type",
        title: "Type",
        render: (row) => (
          <ERPStatusBadge
            status={row.subscription_plan_type || "EMI"}
            label={row.subscription_plan_type ? formatPlanTypeLabel(row.subscription_plan_type) : "EMI"}
            hideIcon
          />
        ),
      },
      {
        key: "id",
        title: "Payment",
        render: (row) => (
          <div>
            <div className="font-medium text-foreground">#{row.id}</div>
            <div className="mt-1 text-xs text-muted-foreground">Ref {row.reference_no || `AUTO-${row.id}`}</div>
          </div>
        ),
      },
      {
        key: "subscription_number",
        title: "Subscription",
        render: (row) => (
          <div>
            <div className="font-medium text-foreground">{row.subscription_number || `SUB-${row.subscription}`}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.product_name || formatPlanTypeLabel(row.subscription_plan_type) || "Lucky Plan"}
            </div>
          </div>
        ),
      },
      {
        key: "emi_id",
        title: "EMI",
        render: (row) => (
          <div>
            <div className="font-medium text-foreground">
              {row.emi_id ? `Month ${row.emi_month_no ?? "—"}` : "Subscription-level payment"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.emi_id ? `EMI #${row.emi_id} · Due ${formatDate(row.emi_due_date)}` : row.batch_code || "No EMI row linked"}
            </div>
          </div>
        ),
      },
      {
        key: "method",
        title: "Method",
        render: (row) => row.method || "—",
      },
      {
        key: "payment_date",
        title: "Recorded",
        render: (row) => formatDateTime(row.created_at || row.payment_date),
      },
      {
        key: "amount",
        title: "Amount",
        align: "right",
        render: (row) => formatRupee(row.amount),
      },
      {
        key: "status",
        title: "Status",
        render: (row) => <ERPStatusBadge status={paymentStatus(row)} label={paymentStatus(row)} />,
      },
    ],
    []
  );

  function applyFilters() {
    const next = new URLSearchParams();

    if (subscriptionInput.trim()) {
      next.set("subscription", subscriptionInput.trim());
    }

    if (methodInput.trim()) {
      next.set("method", methodInput.trim());
    }

    const query = next.toString();
    router.replace(query ? `/customer/payments?${query}` : "/customer/payments");
  }

  function clearFilters() {
    setSubscriptionInput("");
    setMethodInput("");
    router.replace("/customer/payments");
  }

  return (
    <ERPPageShell
      eyebrow="Customer Portal"
      title="My Payments"
      subtitle="Customer-scoped recorded payment history with receipt access and no exposure to internal finance-only controls."
      helperNote="This route shows posted customer payment records only. Outstanding balance, waiver posture, and contract lifecycle remain anchored to the subscription workspace."
      helperTone="info"
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Payments" },
      ]}
      actions={[
        {
          href: "/customer/subscriptions",
          label: "My Subscriptions",
          variant: "secondary",
        },
        {
          href: "/customer/support",
          label: "Support",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Payment records", value: String(count) },
        { label: "Total paid", value: formatRupee(totalPaidAmount), tone: "success" },
        { label: "Subscriptions", value: String(uniqueSubscriptionCount) },
        { label: "Reversed", value: String(reversedCount), tone: reversedCount > 0 ? "warning" : "default" },
        {
          label: "Latest payment",
          value: latestPayment ? formatDateTime(latestPayment.created_at || latestPayment.payment_date) : "—",
        },
      ]}
      statusBadge={{ label: "Customer payment truth", tone: "info" }}
    >
      <div className="space-y-6">
        <ERPSectionShell
          title="Payment filters"
          description="Narrow customer-visible payment history by subscription or collection method."
        >
          <ERPDataToolbar
            left={
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
                <input
                  id="customer-payment-subscription"
                  type="text"
                  value={subscriptionInput}
                  onChange={(event) => setSubscriptionInput(event.target.value)}
                  placeholder="Filter by subscription id"
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                  disabled={loading || refreshing}
                />

                <select
                  id="customer-payment-method"
                  value={methodInput}
                  onChange={(event) => setMethodInput(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                  disabled={loading || refreshing}
                >
                  <option value="">All methods</option>
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="BANK">Bank</option>
                  <option value="CARD">Card</option>
                </select>

                <div className="flex flex-wrap gap-2">
                  <ActionButton type="button" onClick={applyFilters} disabled={loading || refreshing}>
                    Apply
                  </ActionButton>
                  <ActionButton type="button" variant="outline" onClick={clearFilters} disabled={loading || refreshing}>
                    Clear
                  </ActionButton>
                </div>
              </div>
            }
            right={
              <ActionButton
                variant="outline"
                onClick={() => void loadPage("refresh")}
                disabled={loading || refreshing}
                leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </ActionButton>
            }
          />

          {subscriptionFilter || methodFilter ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-[0.14em]">Active filters</span>
              {subscriptionFilter ? (
                <ERPStatusBadge status="OPEN" label={`Subscription ${subscriptionFilter}`} hideIcon />
              ) : null}
              {methodFilter ? <ERPStatusBadge status="VERIFIED" label={`Method ${methodFilter}`} hideIcon /> : null}
            </div>
          ) : (
            <ERPAuditNote tone="info" title="Customer-safe payment truth">
              Payment rows here come from your customer payments API scope. Contract settlement, waiver state, and outstanding
              posture remain on the subscription workspace.
            </ERPAuditNote>
          )}
        </ERPSectionShell>

        <ERPSectionShell title="Recorded payments" description="Posted payment history visible within your customer account only.">
          {loading ? <ERPLoadingState label="Loading customer payments..." /> : null}

          {!loading && error ? (
            <ERPErrorState title="Unable to load payments" description={error} onRetry={() => void loadPage("initial")} />
          ) : null}

          {!loading && !error ? (
            <>
              {rows.length === 0 ? (
                <ERPEmptyState
                  title="No payment records"
                  description={
                    subscriptionFilter || methodFilter
                      ? "No recorded customer payments matched the current filters."
                      : "No recorded customer payments are currently available."
                  }
                />
              ) : (
                <DataTableShell>
                  <MobileSafeTable className="border-none bg-transparent shadow-none">
                    <DataTable<CustomerPayment>
                      rows={rows}
                      columns={columns}
                      onRowClick={(row) => router.push(`/customer/payments/${row.id}`)}
                      rowActions={(row) => (
                        <ActionButton href={`/customer/payments/${row.id}`} variant="outline" className="min-h-11">
                          View receipt
                        </ActionButton>
                      )}
                    />
                  </MobileSafeTable>
                </DataTableShell>
              )}
            </>
          ) : null}
        </ERPSectionShell>

        <ERPSectionShell
          title="Rent / lease receipts"
          description="Receipts linked to rent or lease subscriptions (excludes direct-sale receipt rows)."
        >
          {rentLeaseReceipts.length === 0 ? (
            <ERPEmptyState title="No rent or lease receipts" description="No rent/lease receipt is currently linked to your profile." />
          ) : (
            <DataTableShell>
              <MobileSafeTable className="rounded-2xl border-none bg-transparent shadow-none">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Receipt</th>
                      <th className="px-3 py-2">Subscription</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rentLeaseReceipts.map((receipt) => (
                      <tr key={receipt.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <ERPStatusBadge
                            status={receipt.plan_type || "RENT"}
                            label={
                              receipt.plan_type === "LEASE"
                                ? "Lease"
                                : receipt.plan_type === "RENT"
                                  ? "Rent"
                                  : formatPlanTypeLabel(receipt.plan_type)
                            }
                            hideIcon
                          />
                        </td>
                        <td className="px-3 py-2">{receipt.receipt_no || `RCT-${receipt.id}`}</td>
                        <td className="px-3 py-2">{receipt.subscription_number || "—"}</td>
                        <td className="px-3 py-2">{formatDate(receipt.receipt_date)}</td>
                        <td className="px-3 py-2">{receipt.payment_method || "—"}</td>
                        <td className="px-3 py-2 text-right">{formatRupee(receipt.amount)}</td>
                        <td className="px-3 py-2">
                          <a
                            href={downloadReceiptHref(receipt.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
                          >
                            Download
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </MobileSafeTable>
            </DataTableShell>
          )}
        </ERPSectionShell>

        <ERPSectionShell title="Direct-sale receipts" description="Direct-sale receipt documents, kept separate from EMI payment rows.">
          {directSaleReceipts.length === 0 ? (
            <ERPEmptyState title="No direct-sale receipts" description="No direct-sale receipt is currently linked to your profile." />
          ) : (
            <DataTableShell>
              <MobileSafeTable className="rounded-2xl border-none bg-transparent shadow-none">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Receipt</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {directSaleReceipts.map((receipt) => (
                      <tr key={receipt.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <ERPStatusBadge status="DIRECT_SALE" label="Direct sale" hideIcon />
                        </td>
                        <td className="px-3 py-2">{receipt.receipt_no || `RCT-${receipt.id}`}</td>
                        <td className="px-3 py-2">{formatDate(receipt.receipt_date)}</td>
                        <td className="px-3 py-2">{receipt.payment_method || "—"}</td>
                        <td className="px-3 py-2 text-right">{formatRupee(receipt.amount)}</td>
                        <td className="px-3 py-2">
                          <a
                            href={downloadReceiptHref(receipt.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
                          >
                            Download
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </MobileSafeTable>
            </DataTableShell>
          )}
        </ERPSectionShell>

        {emiReceipts.length > 0 ? (
          <ERPSectionShell title="EMI subscription receipts" description="Official receipt documents linked to EMI (Lucky Plan) subscriptions.">
            <DataTableShell>
              <MobileSafeTable className="rounded-2xl border-none bg-transparent shadow-none">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Receipt</th>
                      <th className="px-3 py-2">Subscription</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emiReceipts.map((receipt) => (
                      <tr key={receipt.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <ERPStatusBadge status="EMI" label="EMI" hideIcon />
                        </td>
                        <td className="px-3 py-2">{receipt.receipt_no || `RCT-${receipt.id}`}</td>
                        <td className="px-3 py-2">{receipt.subscription_number || "—"}</td>
                        <td className="px-3 py-2">{formatDate(receipt.receipt_date)}</td>
                        <td className="px-3 py-2">{receipt.payment_method || "—"}</td>
                        <td className="px-3 py-2 text-right">{formatRupee(receipt.amount)}</td>
                        <td className="px-3 py-2">
                          <a
                            href={downloadReceiptHref(receipt.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
                          >
                            Download
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </MobileSafeTable>
            </DataTableShell>
          </ERPSectionShell>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
