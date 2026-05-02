"use client";

import { RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import { DataTableShell, DetailPanel } from "@/components/ui/operations";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { formatPlanTypeLabel } from "@/lib/plan-labels";
import {
  listCustomerPayments,
  type CustomerPayment,
} from "@/services/customer";
import { listCustomerReceipts, type FinanceReceiptRow } from "@/services/phase4-finance";

function money(value: string | number | null | undefined): string {
  const parsed = Number(value);
  return `₹${(Number.isFinite(parsed) ? parsed : 0).toFixed(2)}`;
}

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
        setDirectSaleReceipts(
          (receiptPayload.results || []).filter(
            (row) => row.direct_sale_id !== null && row.direct_sale_id !== undefined
          )
        );
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setRows([]);
          setCount(0);
          setTotalPaidAmount("0.00");
          setDirectSaleReceipts([]);
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
        key: "id",
        title: "Payment",
        render: (row) => (
          <div>
            <div className="font-medium text-foreground">#{row.id}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Ref {row.reference_no || `AUTO-${row.id}`}
            </div>
          </div>
        ),
      },
      {
        key: "subscription_number",
        title: "Subscription",
        render: (row) => (
          <div>
            <div className="font-medium text-foreground">
              {row.subscription_number || `SUB-${row.subscription}`}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.product_name ||
                formatPlanTypeLabel(row.subscription_plan_type) ||
                "Lucky Plan"}
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
              {row.emi_id
                ? `EMI #${row.emi_id} · Due ${formatDate(row.emi_due_date)}`
                : row.batch_code || "No EMI row linked"}
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
        render: (row) => money(row.amount),
      },
      {
        key: "status",
        title: "Status",
        render: (row) => (
          <StatusBadge status={paymentStatus(row)} label={paymentStatus(row)} />
        ),
      },
    ],
    []
  );

  const applyFilters = () => {
    const next = new URLSearchParams();

    if (subscriptionInput.trim()) {
      next.set("subscription", subscriptionInput.trim());
    }

    if (methodInput.trim()) {
      next.set("method", methodInput.trim());
    }

    const query = next.toString();
    router.replace(query ? `/customer/payments?${query}` : "/customer/payments");
  };

  const clearFilters = () => {
    setSubscriptionInput("");
    setMethodInput("");
    router.replace("/customer/payments");
  };

  return (
    <PortalPage
      eyebrow="Customer Payments"
      title="My Payments"
      subtitle="Customer-scoped recorded payment history with direct receipt access and no exposure to internal finance-only controls."
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
        { label: "Payment records", value: count },
        { label: "Total paid", value: money(totalPaidAmount), tone: "success" },
        { label: "Subscriptions", value: uniqueSubscriptionCount },
        {
          label: "Reversed",
          value: reversedCount,
          tone: reversedCount > 0 ? "warning" : "default",
        },
        {
          label: "Latest payment",
          value: latestPayment
            ? formatDateTime(latestPayment.created_at || latestPayment.payment_date)
            : "—",
        },
      ]}
      statusBadge={{ label: "Customer payment truth", tone: "info" }}
    >
      <div className="space-y-6">
        <DetailPanel
          title="Payment filters"
          description="Narrow customer-visible payment history by subscription or collection method."
        >
          <div className="mb-4 flex justify-end">
            <ActionButton
              variant="outline"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
              leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          </div>
          <TableToolbar
            footer={
              subscriptionFilter || methodFilter ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-[0.14em]">
                    Active filters
                  </span>
                  {subscriptionFilter ? (
                    <StatusBadge
                      status="OPEN"
                      label={`Subscription ${subscriptionFilter}`}
                      hideIcon
                    />
                  ) : null}
                  {methodFilter ? (
                    <StatusBadge
                      status="VERIFIED"
                      label={`Method ${methodFilter}`}
                      hideIcon
                    />
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Open a receipt to see transaction proof, then move into support from the receipt itself if something looks incorrect.
                </div>
              )
            }
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
              <input
                id="customer-payment-subscription"
                type="text"
                value={subscriptionInput}
                onChange={(event) => setSubscriptionInput(event.target.value)}
                placeholder="Filter by subscription id"
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />

              <select
                id="customer-payment-method"
                value={methodInput}
                onChange={(event) => setMethodInput(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All methods</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK">Bank</option>
                <option value="CARD">Card</option>
              </select>

              <div className="flex flex-wrap gap-2">
                <ActionButton type="button" onClick={applyFilters}>
                  Apply
                </ActionButton>
                <ActionButton type="button" variant="outline" onClick={clearFilters}>
                  Clear
                </ActionButton>
              </div>
            </div>
          </TableToolbar>
        </DetailPanel>

        {loading ? <LoadingBlock label="Loading payment history..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load payments"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
          <DetailPanel
            title="EMI payment records"
            description="Subscription-linked customer payment rows."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No payment records"
                description={
                  subscriptionFilter || methodFilter
                    ? "No recorded customer payments matched the current filters."
                    : "No recorded customer payments are currently available."
                }
              />
            ) : (
              <DataTableShell>
                <DataTable<CustomerPayment>
                  rows={rows}
                  columns={columns}
                  onRowClick={(row) => router.push(`/customer/payments/${row.id}`)}
                  rowActions={(row) => (
                    <ActionButton href={`/customer/payments/${row.id}`} variant="outline">
                      View receipt
                    </ActionButton>
                  )}
                />
              </DataTableShell>
            )}

            <div className="mt-5">
              <WorkspaceNotice tone="info" title="Source-of-truth boundary">
                Payment rows on this page come directly from the customer payments API. Subscription outstanding or waiver figures stay on the related subscription detail page so receipt history is not overloaded with contract-state assumptions.
              </WorkspaceNotice>
            </div>
          </DetailPanel>
          <DetailPanel
            title="Direct-sale receipts"
            description="Direct-sale receipt documents, kept separate from EMI payment rows."
          >
            {directSaleReceipts.length === 0 ? (
              <EmptyState
                title="No direct-sale receipts"
                description="No direct-sale receipt is currently linked to your profile."
              />
            ) : (
              <DataTableShell>
                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
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
                          <td className="px-3 py-2">{receipt.receipt_no || `RCT-${receipt.id}`}</td>
                          <td className="px-3 py-2">{formatDate(receipt.receipt_date)}</td>
                          <td className="px-3 py-2">{receipt.payment_method || "—"}</td>
                          <td className="px-3 py-2 text-right">{money(receipt.amount)}</td>
                          <td className="px-3 py-2">
                            <a
                              href={`/api/v1/customer/receipts/${receipt.id}/pdf/`}
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
                </div>
              </DataTableShell>
            )}
          </DetailPanel>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
