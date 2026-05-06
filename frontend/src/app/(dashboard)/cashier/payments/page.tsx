"use client";

import { RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { CustomerIntelligenceTrigger } from "@/components/customer-intelligence/CustomerIntelligenceTrigger";
import {
  DataTableShell,
  DetailPanel,
  FormSection,
  KpiCard,
  QuickActionGrid,
} from "@/components/ui/operations";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import {
  getCashierPaymentHistory,
  type CashierTransaction,
} from "@/services/cashier";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load cashier payment history.";
}

export default function CashierPaymentsPage() {
  const [rows, setRows] = useState<CashierTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial", nextQuery = "") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await getCashierPaymentHistory({
          q: nextQuery || undefined,
          limit: 100,
        });
        setRows(payload.results);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setRows([]);
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  function handleApplySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = searchInput.trim();
    setQuery(nextQuery);
    void loadPage("refresh", nextQuery);
  }

  function handleResetSearch() {
    setSearchInput("");
    setQuery("");
    void loadPage("refresh", "");
  }

  const visibleAmount = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [rows]
  );

  const reversedCount = useMemo(
    () => rows.filter((row) => Boolean(row.is_reversed)).length,
    [rows]
  );

  const latestVisiblePayment = rows[0] ?? null;

  const columns = useMemo<Column<CashierTransaction>[]>(
    () => [
      {
        key: "id",
        title: "Payment",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">#{row.id}</div>
            <div className="text-xs text-muted-foreground">
              Ref {row.reference_no || `AUTO-${row.id}`}
            </div>
          </div>
        ),
      },
      {
        key: "customer_name",
        title: "Customer",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              <CustomerIntelligenceTrigger
                customerId={row.customer}
                customerName={row.customer_name || "—"}
                scope="cashier"
              />
            </div>
            <div className="text-xs text-muted-foreground">{row.customer_phone || "—"}</div>
          </div>
        ),
      },
      {
        key: "subscription_number",
        title: "Subscription",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              {row.subscription_number || `SUB-${row.subscription}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.batch_code || "No batch"}
              {typeof row.lucky_number === "number" ? ` · Lucky #${row.lucky_number}` : ""}
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
        key: "recorded_at",
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
          <StatusBadge
            status={row.is_reversed ? "REVERSED" : row.status_label || "RECORDED"}
            label={row.status_label || (row.is_reversed ? "REVERSED" : "RECORDED")}
          />
        ),
      },
    ],
    []
  );

  return (
    <PortalPage
      eyebrow="Cashier Desk"
      title="Payment History"
      subtitle="Counter-safe payment lookup for receipt proof, dispute follow-up, and recent posted transaction review."
      helperNote="New collection must still begin from the cashier collect flow, where assigned counter and finance-account controls remain enforced. This page never bypasses those controls."
      helperTone="info"
      breadcrumbs={[
        { label: "Cashier", href: "/cashier" },
        { label: "Payment History" },
      ]}
      actions={[
        {
          href: "/cashier/collect",
          label: "Collect Payment",
          variant: "primary",
        },
        {
          href: "/cashier",
          label: "Back to Dashboard",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Visible payments",
          value: String(rows.length),
        },
        {
          label: "Visible amount",
          value: money(visibleAmount),
          tone: "success",
        },
        {
          label: "Reversed",
          value: String(reversedCount),
          tone: reversedCount > 0 ? "warning" : "default",
        },
        {
          label: "Latest visible",
          value: latestVisiblePayment
            ? formatDateTime(
                latestVisiblePayment.created_at || latestVisiblePayment.payment_date
              )
            : "—",
        },
      ]}
      statusBadge={{
        label: "Cashier lookup",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <FormSection
          title="Counter lookup"
          description="Search by payment ID, reference, customer phone, customer name, subscription number, EMI ID, or lucky number."
        >
          <div className="mb-4 flex justify-end">
            <ActionButton
              variant="outline"
              onClick={() => void loadPage("refresh", query)}
              disabled={loading || refreshing}
              leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          </div>
          <TableToolbar
            footer={
              query ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-[0.14em]">
                    Active search
                  </span>
                  <StatusBadge status="OPEN" label={query} hideIcon />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Use this register for cashier-visible history only. Counter collection, counter assignment, and finance-account routing remain on the cashier collection surface.
                </div>
              )
            }
          >
            <form
              onSubmit={handleApplySearch}
              className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"
            >
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="cashier-payment-search"
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Payment ID, reference, phone, SUB-123, EMI id"
                  className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm outline-none transition focus:border-ring"
                  disabled={loading || refreshing}
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <ActionButton type="submit" disabled={loading || refreshing}>
                  Search
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="outline"
                  onClick={handleResetSearch}
                  disabled={loading || refreshing}
                >
                  Reset
                </ActionButton>
              </div>
            </form>
          </TableToolbar>
        </FormSection>

        <QuickActionGrid>
          <KpiCard label="Visible payments" value={String(rows.length)} helper="Current cashier search result set" />
          <KpiCard label="Visible amount" value={money(visibleAmount)} helper="Total for listed rows" />
          <KpiCard
            label="Reversed"
            value={String(reversedCount)}
            helper="Rows marked reversed in cashier view"
          />
          <KpiCard
            label="Latest visible"
            value={
              latestVisiblePayment
                ? formatDateTime(latestVisiblePayment.created_at || latestVisiblePayment.payment_date)
                : "—"
            }
            helper="Most recent record in this list"
          />
        </QuickActionGrid>

        {loading ? <LoadingBlock label="Loading cashier payment history..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load payment history"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <DetailPanel
            title="Posted cashier-visible payments"
            description={
              query
                ? `Showing cashier-visible results for "${query}".`
                : "Showing the most recent posted payments visible in cashier scope."
            }
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No matching payments"
                description="No cashier-visible payments matched the current search."
                action={
                  <ActionButton href="/cashier/collect" variant="outline">
                    Open collect flow
                  </ActionButton>
                }
              />
            ) : (
              <DataTableShell>
                <DataTable<CashierTransaction>
                  rows={rows}
                  columns={columns}
                  rowActions={(row) => (
                    <ActionButton href={`/cashier/payments/${row.id}`} variant="outline">
                      Receipt
                    </ActionButton>
                  )}
                />
              </DataTableShell>
            )}
          </DetailPanel>
        ) : null}
      </div>
    </PortalPage>
  );
}
