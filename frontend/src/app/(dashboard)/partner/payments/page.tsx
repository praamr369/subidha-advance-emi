"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";

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
import { getPartnerDashboard, listPartnerPayments, type PartnerPayment } from "@/services/partner";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner payment history.";
}

export default function PartnerPaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = (searchParams.get("q") || "").trim();
  const method = (searchParams.get("method") || "").trim();
  const customer = (searchParams.get("customer") || "").trim();
  const subscription = (searchParams.get("subscription") || "").trim();

  const [searchInput, setSearchInput] = useState(q);
  const [methodInput, setMethodInput] = useState(method);
  const [rows, setRows] = useState<PartnerPayment[]>([]);
  const [count, setCount] = useState(0);
  const [totalCollected, setTotalCollected] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(q);
    setMethodInput(method);
  }, [q, method]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await listPartnerPayments({
          q: q || undefined,
          method: method || undefined,
          customer: customer || undefined,
          subscription: subscription || undefined,
        });

        setRows(Array.isArray(payload.results) ? payload.results : []);
        setCount(Number(payload.count || 0));
        setTotalCollected(String(payload.total_collected || "0.00"));
        setError(null);
      } catch (err) {
        if (mode === "initial") {
          try {
            const fallback = await getPartnerDashboard();
            const fallbackRows = Array.isArray(fallback.recent_verified_payments) ? fallback.recent_verified_payments : [];
            const fallbackTotal = Number(
              fallback.summary?.total_paid_amount ?? fallback.summary?.total_revenue_collected ?? 0
            );

            setRows(fallbackRows);
            setCount(fallbackRows.length);
            setTotalCollected(Number.isFinite(fallbackTotal) ? fallbackTotal.toFixed(2) : "0.00");
            setError(null);
          } catch {
            setError(toErrorMessage(err));
            setRows([]);
            setCount(0);
            setTotalCollected("0.00");
          }
        } else {
          setError(toErrorMessage(err));
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [customer, method, q, subscription]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const uniqueCustomers = useMemo(() => {
    return new Set(rows.map((row) => row.customer).filter(Boolean)).size;
  }, [rows]);

  const latestPayment = useMemo(() => rows[0] ?? null, [rows]);
  const currentQuery = searchParams.toString();

  const columns = useMemo<Column<PartnerPayment>[]>(
    () => [
      {
        key: "id",
        title: "Payment",
        sortable: true,
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">#{row.id}</div>
            <div className="text-xs text-muted-foreground">Ref {row.reference_no || `AUTO-${row.id}`}</div>
          </div>
        ),
      },
      {
        key: "customer_name",
        title: "Customer",
        sortable: true,
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.customer_name || "—"}</div>
            <div className="text-xs text-muted-foreground">{row.customer_phone || "—"}</div>
          </div>
        ),
      },
      {
        key: "subscription_number",
        title: "Subscription",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.subscription_number || `SUB-${row.subscription}`}</div>
            <div className="text-xs text-muted-foreground">
              {row.batch_code || "No batch"}
              {typeof row.lucky_number === "number" ? ` · Lucky #${row.lucky_number}` : ""}
            </div>
          </div>
        ),
      },
      {
        key: "emi_month_no",
        title: "EMI",
        render: (row) =>
          row.emi ? (
            <div className="space-y-1">
              <div className="text-sm text-foreground">Month {row.emi_month_no ?? "—"}</div>
              <div className="text-xs text-muted-foreground">
                {row.emi_due_date ? `Due ${formatDateTime(row.emi_due_date)}` : "No due date"}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "method",
        title: "Method",
        sortable: true,
        render: (row) =>
          row.method ? <ERPStatusBadge status={row.method} hideIcon /> : <span className="text-muted-foreground">—</span>,
      },
      {
        key: "payment_date",
        title: "Recorded",
        sortable: true,
        sortAccessor: (row) => Date.parse(row.created_at || row.payment_date || "") || 0,
        render: (row) => formatDateTime(row.created_at || row.payment_date),
      },
      {
        key: "amount",
        title: "Amount",
        align: "right",
        sortable: true,
        sortAccessor: (row) => Number(row.amount || 0),
        render: (row) => money(row.amount),
      },
    ],
    []
  );

  function applyFilters() {
    const next = new URLSearchParams();

    if (searchInput.trim()) {
      next.set("q", searchInput.trim());
    }

    if (methodInput.trim()) {
      next.set("method", methodInput.trim());
    }

    if (customer) {
      next.set("customer", customer);
    }

    if (subscription) {
      next.set("subscription", subscription);
    }

    const queryString = next.toString();
    router.replace(queryString ? `/partner/payments?${queryString}` : "/partner/payments");
  }

  function clearFilters() {
    setSearchInput("");
    setMethodInput("");
    const next = new URLSearchParams();
    if (customer) next.set("customer", customer);
    if (subscription) next.set("subscription", subscription);
    const queryString = next.toString();
    router.replace(queryString ? `/partner/payments?${queryString}` : "/partner/payments");
  }

  return (
    <ERPPageShell
      eyebrow="Partner Portal"
      title="Partner Payments"
      subtitle="Verified partner-scoped payment history without admin-wide finance leakage, with filters aligned to the shared operational list pattern."
      helperNote="This register shows partner-visible verified payment truth only. Reversal, payout, and reconciliation controls remain outside partner scope."
      helperTone="info"
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Payments" },
      ]}
      actions={[
        {
          href: "/partner/collections",
          label: "Collections",
          variant: "secondary",
        },
        {
          href: "/partner/reports",
          label: "Reports",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Visible rows", value: String(count) },
        { label: "Total collected", value: money(totalCollected), tone: "success" },
        { label: "Customers", value: String(uniqueCustomers) },
        { label: "Latest payment", value: latestPayment ? formatDateTime(latestPayment.created_at || latestPayment.payment_date) : "—" },
      ]}
      statusBadge={{ label: "Partner payment truth", tone: "info" }}
    >
      <div className="space-y-6">
        <ERPSectionShell
          title="Payment filters"
          description="Use search, method, and handoff scope filters to review partner-visible verified payments."
        >
          <ERPDataToolbar
            left={
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="partner-payment-search"
                    type="text"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Reference, customer, phone, product, batch"
                    className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm outline-none transition focus:border-ring"
                    disabled={loading || refreshing}
                  />
                </label>

                <select
                  id="partner-payment-method"
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

          {q || method || customer || subscription ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-[0.14em]">Active filters</span>
              {q ? <ERPStatusBadge status="OPEN" label={`Search: ${q}`} hideIcon /> : null}
              {method ? <ERPStatusBadge status="VERIFIED" label={`Method: ${method}`} hideIcon /> : null}
              {customer ? <ERPStatusBadge status="ASSIGNED" label={`Customer scope: ${customer}`} hideIcon /> : null}
              {subscription ? <ERPStatusBadge status="ASSIGNED" label={`Subscription scope: ${subscription}`} hideIcon /> : null}
            </div>
          ) : (
            <ERPAuditNote tone="info" title="Partner scope boundary">
              This register shows partner-visible verified payment truth only. Commission settlement, reversals, and broader reconciliation remain in admin-only workflows.
            </ERPAuditNote>
          )}
        </ERPSectionShell>

        <ERPSectionShell
          title="Partner-visible payments"
          description={
            q || method || customer || subscription
              ? "Showing verified partner-visible payments for the current filter set."
              : "Showing the most recent partner-visible verified payments."
          }
        >
          {loading ? <ERPLoadingState label="Loading partner payments..." /> : null}

          {!loading && error ? (
            <ERPErrorState
              title="Unable to load partner payments"
              description={error}
              onRetry={() => void loadPage("initial")}
            />
          ) : null}

          {!loading && !error ? (
            <>
              {rows.length === 0 ? (
                <ERPEmptyState title="No partner payment rows" description="No verified partner-scoped payment rows matched the current filters." />
              ) : (
                <DataTableShell>
                  <MobileSafeTable className="border-none bg-transparent shadow-none">
                    <DataTable<PartnerPayment>
                      rows={rows}
                      columns={columns}
                      rowActions={(row) => (
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/partner/payments/${row.id}${currentQuery ? `?${currentQuery}` : ""}`}
                            className="inline-flex min-h-11 items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                          >
                            View detail
                          </Link>
                          {row.customer ? (
                            <Link
                              href={`/partner/customers/${row.customer}`}
                              className="inline-flex min-h-11 items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                            >
                              Customer
                            </Link>
                          ) : null}
                          {row.customer ? (
                            <Link
                              href={`/partner/subscriptions?customer=${row.customer}`}
                              className="inline-flex min-h-11 items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                            >
                              Subscriptions
                            </Link>
                          ) : null}
                        </div>
                      )}
                    />
                  </MobileSafeTable>
                </DataTableShell>
              )}
            </>
          ) : null}
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
