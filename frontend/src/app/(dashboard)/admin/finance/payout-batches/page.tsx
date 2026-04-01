"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch, toArray } from "@/lib/api";
import { downloadCsv } from "@/lib/export/csv";

type PayoutBatchRow = {
  id: number;
  status: "DRAFT" | "FINALIZED" | "CANCELLED";
  total_amount: string;
  commission_count: number;
  created_at?: string;
  finalized_at?: string | null;
  cancelled_at?: string | null;
};

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableString(value: unknown): string | null | undefined {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
}

function normalizeStatus(raw: Record<string, unknown>): PayoutBatchRow["status"] {
  const status = String(raw.status ?? raw.batch_status ?? "DRAFT").toUpperCase();
  if (status === "FINALIZED") return "FINALIZED";
  if (status === "CANCELLED") return "CANCELLED";
  return "DRAFT";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load payout batch register.";
}

function normalizeBatch(row: Record<string, unknown>): PayoutBatchRow {
  return {
    id: toNumber(row.id),
    status: normalizeStatus(row),
    total_amount: toMoneyString(
      row.total_amount ??
        row.total_commission_amount ??
        row.amount_total ??
        row.payout_total
    ),
    commission_count: toNumber(
      row.commission_count ??
        row.item_count ??
        row.total_items ??
        row.row_count
    ),
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    finalized_at: toNullableString(row.finalized_at),
    cancelled_at: toNullableString(row.cancelled_at),
  };
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AdminPayoutBatchesPage() {
  const [allRows, setAllRows] = useState<PayoutBatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [statusInput, setStatusInput] = useState<
    "" | "DRAFT" | "FINALIZED" | "CANCELLED"
  >("");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "" | "DRAFT" | "FINALIZED" | "CANCELLED"
  >("");

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const payload = await apiFetch<unknown>(
        "/admin/commission-payout-batches/list/"
      );
      const normalized = toArray<Record<string, unknown>>(payload).map(
        normalizeBatch
      );

      setAllRows(normalized);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") setAllRows([]);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchQuery(searchInput.trim().toLowerCase());
    setStatusFilter(statusInput);
  }

  function handleResetFilters() {
    setSearchInput("");
    setStatusInput("");
    setSearchQuery("");
    setStatusFilter("");
  }

  const rows = useMemo(() => {
    return allRows.filter((row) => {
      const matchesStatus = statusFilter ? row.status === statusFilter : true;
      if (!matchesStatus) return false;
      if (!searchQuery) return true;

      const haystack = [
        row.id,
        row.status,
        row.total_amount,
        row.commission_count,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return haystack.includes(searchQuery);
    });
  }, [allRows, searchQuery, statusFilter]);

  const draftCount = useMemo(
    () => rows.filter((row) => row.status === "DRAFT").length,
    [rows]
  );

  const finalizedCount = useMemo(
    () => rows.filter((row) => row.status === "FINALIZED").length,
    [rows]
  );

  

  const totalVisibleAmount = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
    [rows]
  );

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        status: row.status,
        total_amount: row.total_amount,
        commission_count: row.commission_count,
        created_at: row.created_at ?? "",
        finalized_at: row.finalized_at ?? "",
        cancelled_at: row.cancelled_at ?? "",
      })),
    [rows]
  );

  return (
    <PortalPage
      title="Payout Batch Register"
      subtitle="Review draft, finalized, and cancelled payout batches, then open a batch for controlled finance actions."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Finance", href: "/admin/finance" },
        { label: "Payout Batches" },
      ]}
      actions={[
        {
          href: "/admin/finance/commissions/settled",
          label: "Open Payout Queue",
          variant: "primary",
        },
        {
          href: "/admin/finance/commissions",
          label: "Back to Commissions",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Visible Batches",
          value: String(rows.length),
        },
        {
          label: "Visible Amount",
          value: money(totalVisibleAmount),
          tone: "success",
        },
        {
          label: "Draft",
          value: String(draftCount),
          tone: draftCount > 0 ? "warning" : undefined,
        },
        {
          label: "Finalized",
          value: String(finalizedCount),
        },
      ]}
      statusBadge={{
        label: "Payout Lifecycle",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <SectionCard
          title="Register controls"
          description="Filter payout batches by status or quick search. Use batch detail for finalize, cancel, and export operations."
        >
          <form onSubmit={handleApplyFilters} className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <label
                htmlFor="payout-batch-search"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Search
              </label>
              <input
                id="payout-batch-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Batch id, status, amount"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div>
              <label
                htmlFor="payout-batch-status"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Status
              </label>
              <select
                id="payout-batch-status"
                value={statusInput}
                onChange={(event) =>
                  setStatusInput(
                    event.target.value as "" | "DRAFT" | "FINALIZED" | "CANCELLED"
                  )
                }
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All</option>
                <option value="DRAFT">Draft</option>
                <option value="FINALIZED">Finalized</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              >
                Apply
              </button>

              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Reset
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              disabled={exportRows.length === 0 || loading}
              onClick={() =>
                downloadCsv(
                  "payout-batch-register-current-view.csv",
                  [
                    { key: "id", header: "id" },
                    { key: "status", header: "status" },
                    { key: "total_amount", header: "total_amount" },
                    { key: "commission_count", header: "commission_count" },
                    { key: "created_at", header: "created_at" },
                    { key: "finalized_at", header: "finalized_at" },
                    { key: "cancelled_at", header: "cancelled_at" },
                  ],
                  exportRows
                )
              }
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export Current View
            </button>
          </div>
        </SectionCard>

        {loading ? <LoadingBlock label="Loading payout batch register..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load payout batch register"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <SectionCard
              title="Payout batch rows"
              description="Use this register to open a batch detail page. Finalize and cancel actions belong on the batch detail page, not here."
            >
              {rows.length === 0 ? (
                <EmptyState
                  title="No payout batches"
                  description="No payout batches match the current filter set."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Batch
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Status
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Amount
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Rows
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Lifecycle
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="align-top">
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">Batch #{row.id}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Created {formatDateTime(row.created_at)}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <span
                              className={[
                                "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                                row.status === "DRAFT"
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : row.status === "FINALIZED"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-red-200 bg-red-50 text-red-700",
                              ].join(" ")}
                            >
                              {row.status}
                            </span>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                            {money(row.total_amount)}
                          </td>

                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            {row.commission_count}
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="text-xs text-muted-foreground">
                              Finalized {formatDateTime(row.finalized_at)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Cancelled {formatDateTime(row.cancelled_at)}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="flex flex-col items-start gap-2">
                              <Link
                                href={`/admin/finance/payout-batches/${row.id}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Open Batch
                              </Link>

                              {row.status === "DRAFT" ? (
                                <span className="text-xs text-muted-foreground">
                                  Finalize or cancel from detail page
                                </span>
                              ) : row.status === "FINALIZED" ? (
                                <span className="text-xs text-muted-foreground">
                                  Finalized batch is read-only
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  Cancelled batch kept for audit visibility
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Lifecycle note"
              description="This page is the batch register only. Create batches from the payout queue, then use batch detail to finalize, cancel, or export."
            >
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/finance/commissions/settled"
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Back to Payout Queue
                </Link>

                <Link
                  href="/admin/finance/commissions"
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Commission Register
                </Link>
              </div>
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
