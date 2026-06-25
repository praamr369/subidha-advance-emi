"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { downloadCsv } from "@/lib/export/csv";
import {
  createPayoutBatch,
  getPayoutBatchPreview,
  type PayoutBatchPreviewQuery,
} from "@/services/payout-batches";
import type { PayoutBatchPreviewResponse } from "@/types/payout-batch";

function money(value: string | number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
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
  return "Failed to load payout queue.";
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
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function AdminCommissionPayoutQueuePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const partner = (searchParams.get("partner") || "").trim();
  const dateFrom = (searchParams.get("date_from") || "").trim();
  const dateTo = (searchParams.get("date_to") || "").trim();
  const q = (searchParams.get("q") || "").trim();

  const [partnerInput, setPartnerInput] = useState(partner);
  const [dateFromInput, setDateFromInput] = useState(dateFrom);
  const [dateToInput, setDateToInput] = useState(dateTo);
  const [searchInput, setSearchInput] = useState(q);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchNotes, setBatchNotes] = useState("");

  const [data, setData] = useState<PayoutBatchPreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setPartnerInput(partner);
    setDateFromInput(dateFrom);
    setDateToInput(dateTo);
    setSearchInput(q);
  }, [dateFrom, dateTo, partner, q]);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const query: PayoutBatchPreviewQuery = {};
      if (partner) query.partner = partner;
      if (dateFrom) query.date_from = dateFrom;
      if (dateTo) query.date_to = dateTo;

      const payload = await getPayoutBatchPreview(query);
      setData(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") setData(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [dateFrom, dateTo, partner]);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const rows = useMemo(() => {
    const search = searchInput.trim().toLowerCase();
    if (!data?.results) return [];
    return data.results.filter((row) => {
      if (!search) return true;
      const haystack = [
        row.id,
        row.partner_username,
        row.partner_phone,
        row.customer_name,
        row.customer_phone,
        row.subscription_number,
        row.batch_code,
        row.payment_reference_no,
        row.payment,
        row.payout_batch_code,
        row.status,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      return haystack.includes(search);
    });
  }, [data, searchInput]);

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );

  const selectedAmount = useMemo(
    () =>
      selectedRows.reduce(
        (sum, row) => sum + Number(row.commission_amount || 0),
        0
      ),
    [selectedRows]
  );

  const perPartnerSelection = useMemo(() => {
    const grouped = new Map<string, { partner: string; count: number; amount: number }>();
    selectedRows.forEach((row) => {
      const key = String(row.partner);
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
        existing.amount += Number(row.commission_amount || 0);
      } else {
        grouped.set(key, {
          partner: row.partner_username,
          count: 1,
          amount: Number(row.commission_amount || 0),
        });
      }
    });
    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount);
  }, [selectedRows]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (partnerInput.trim()) next.set("partner", partnerInput.trim());
    if (dateFromInput) next.set("date_from", dateFromInput);
    if (dateToInput) next.set("date_to", dateToInput);
    if (searchInput.trim()) next.set("q", searchInput.trim());
    router.replace(
      next.toString()
        ? `/admin/finance/commissions/settled?${next.toString()}`
        : "/admin/finance/commissions/settled"
    );
  }

  function handleResetFilters() {
    setPartnerInput("");
    setDateFromInput("");
    setDateToInput("");
    setSearchInput("");
    router.replace("/admin/finance/commissions/settled");
  }

  function toggleRow(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function selectVisible() {
    setSelectedIds(rows.map((row) => row.id));
  }

  async function handleCreateBatch() {
    if (selectedIds.length === 0) {
      setError("Select at least one commission row to create a payout batch.");
      return;
    }

    setCreating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await createPayoutBatch({
        commission_ids: selectedIds,
        notes: batchNotes.trim() || undefined,
      });

      setSuccessMessage(
        `${result.batch_code} created with ${result.line_count} commission row(s).`
      );
      setSelectedIds([]);
      setBatchNotes("");
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        partner_username: row.partner_username,
        customer_name: row.customer_name ?? "",
        subscription_number: row.subscription_number ?? "",
        payment_reference_no: row.payment_reference_no ?? "",
        payment_date: row.payment_date ?? "",
        commission_rate: row.commission_rate,
        commission_amount: row.commission_amount,
        status: row.status,
        settlement_date: row.settlement_date ?? "",
      })),
    [rows]
  );

  return (
    <ERPPageShell
      title="Commission Payout Queue"
      subtitle="Build draft payout batches from live eligible commission rows. Pending rows settle on batch finalization, while legacy-settled rows remain batchable for backward compatibility."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Finance", href: "/admin/finance" },
        { label: "Commissions", href: "/admin/finance/commissions" },
        { label: "Payout Queue" },
      ]}
      actions={[
        {
          href: "/admin/finance/payout-batches",
          label: "Open Payout Batches",
          variant: "primary",
        },
        {
          href: "/admin/finance/commissions",
          label: "Back to Commission Register",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Eligible Rows",
          value: String(data?.summary.eligible_count ?? 0),
        },
        {
          label: "Eligible Amount",
          value: money(data?.summary.eligible_amount),
          tone: "success",
        },
        {
          label: "Pending",
          value: String(data?.summary.pending_count ?? 0),
          tone: (data?.summary.pending_count ?? 0) > 0 ? "warning" : undefined,
        },
        {
          label: "Legacy Settled",
          value: String(data?.summary.settled_count ?? 0),
        },
      ]}
      statusBadge={{
        label: "Payout Preparation",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <SectionCard
          title="Queue filters"
          description="Filter payout candidates by partner or commission date. Search remains client-side over the visible eligible result set."
        >
          <form onSubmit={handleApplyFilters} className="grid gap-4 lg:grid-cols-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Partner ID
              </label>
              <input
                value={partnerInput}
                onChange={(event) => setPartnerInput(event.target.value)}
                placeholder="All partners"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                From
              </label>
              <input
                type="date"
                value={dateFromInput}
                onChange={(event) => setDateFromInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                To
              </label>
              <input
                type="date"
                value={dateToInput}
                onChange={(event) => setDateToInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-2 block text-sm font-medium text-foreground">
                Search
              </label>
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Partner, customer, subscription, payment ref"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2 lg:col-span-5">
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
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={loading || refreshing}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <button
                type="button"
                onClick={selectVisible}
                disabled={rows.length === 0 || loading}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Select Visible
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    "commission-payout-queue.csv",
                    [
                      { key: "id", header: "id" },
                      { key: "partner_username", header: "partner_username" },
                      { key: "customer_name", header: "customer_name" },
                      { key: "subscription_number", header: "subscription_number" },
                      { key: "payment_reference_no", header: "payment_reference_no" },
                      { key: "payment_date", header: "payment_date" },
                      { key: "commission_rate", header: "commission_rate" },
                      { key: "commission_amount", header: "commission_amount" },
                      { key: "status", header: "status" },
                      { key: "settlement_date", header: "settlement_date" },
                    ],
                    exportRows
                  )
                }
                disabled={rows.length === 0 || loading}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Export Current View
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Batch preparation"
          description="Create a draft payout batch from the selected queue rows. Draft creation reserves those rows; settlement completes when the batch is finalized."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Selected Rows
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {selectedIds.length}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Selected Amount
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {money(selectedAmount)}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Partner Groups
              </div>
              <div className="mt-2 text-xl font-semibold text-foreground">
                {perPartnerSelection.length}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-foreground">
              Batch Notes
            </label>
            <textarea
              value={batchNotes}
              onChange={(event) => setBatchNotes(event.target.value)}
              rows={3}
              placeholder="Optional operator note for this payout batch."
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
            />
          </div>

          {perPartnerSelection.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {perPartnerSelection.map((row) => (
                <div
                  key={`${row.partner}-${row.amount}`}
                  className="rounded-xl border border-border bg-background p-4"
                >
                  <div className="text-sm font-medium text-foreground">{row.partner}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {row.count} row(s) • {money(row.amount)}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCreateBatch()}
              disabled={creating || selectedIds.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "Creating..." : "Create Draft Batch"}
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              disabled={selectedIds.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear Selection
            </button>
          </div>

          {successMessage ? (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {successMessage}
            </p>
          ) : null}
        </SectionCard>

        {loading ? <LoadingBlock label="Loading payout queue..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load payout queue"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <SectionCard
            title="Eligible commission rows"
            description="Rows here are batch-eligible. Pending rows will settle on batch finalize. Legacy-settled rows remain batchable so earlier manual settlements can still move into payout batches."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No payout candidates"
                description="No eligible commission rows match the active filter scope."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="text-left">
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Select
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Commission
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Partner / Customer
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Subscription / Payment
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                        Amount
                      </th>
                      <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onChange={() => toggleRow(row.id)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                          />
                        </td>
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div className="font-medium">Commission #{row.id}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Created {formatDate(row.created_at)}
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div>{row.partner_username}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.customer_name || "—"} • {row.customer_phone || "—"}
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <div>{row.subscription_number || "—"}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {row.payment_reference_no || `PAY-${row.payment || "—"}`}
                          </div>
                        </td>
                        <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                          {money(row.commission_amount)}
                        </td>
                        <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                          <span
                            className={[
                              "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                              row.status === "PENDING"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-blue-200 bg-blue-50 text-blue-700",
                            ].join(" ")}
                          >
                            {row.status === "PENDING" ? "Pending Settlement" : "Legacy Settled"}
                          </span>
                          {row.settlement_date ? (
                            <div className="mt-1 text-xs text-muted-foreground">
                              Settled {formatDate(row.settlement_date)}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        ) : null}

        <SectionCard
          title="Next step"
          description="Once a draft batch is created, open payout batch detail to finalize the batch and complete settlement for pending rows."
        >
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/finance/payout-batches"
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
            >
              Open Payout Batch Register
            </Link>
            <Link
              href="/admin/finance/reconciliation"
              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
            >
              Review Commission Reconciliation
            </Link>
          </div>
        </SectionCard>
      </div>
    </ERPPageShell>
  );
}
