"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch, toArray } from "@/lib/api";
import { downloadCsv } from "@/lib/export/csv";

type BatchStatus = "DRAFT" | "FINALIZED" | "CANCELLED";

type PayoutBatchMeta = {
  id: number;
  status: BatchStatus;
  total_amount: string;
  commission_count: number;
  created_at?: string;
  finalized_at?: string | null;
  cancelled_at?: string | null;
  created_by_username?: string | null;
  finalized_by_username?: string | null;
  cancelled_by_username?: string | null;
  note?: string | null;
};

type BatchCommissionRow = {
  id: number;
  amount: string;
  partner_name?: string;
  customer_name?: string;
  subscription_id?: number | null;
  subscription_number?: string;
  batch_code?: string | null;
  lucky_number?: number | null;
  settled_at?: string | null;
  created_at?: string;
  note?: string | null;
};

type BatchActionResponse = {
  id?: number;
  detail?: string;
  message?: string;
  status?: string;
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

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNullableString(value: unknown): string | null | undefined {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
}

function toNullableNumber(value: unknown): number | null | undefined {
  if (typeof value === "number") return value;
  if (value === null) return null;
  return undefined;
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeStatus(raw: unknown): BatchStatus {
  const status = String(raw ?? "DRAFT").toUpperCase();
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
  return "Failed to load payout batch detail.";
}

function normalizeBatchMeta(source: Record<string, unknown>): PayoutBatchMeta {
  return {
    id: toNumber(source.id),
    status: normalizeStatus(source.status ?? source.batch_status),
    total_amount: toMoneyString(
      source.total_amount ??
        source.total_commission_amount ??
        source.amount_total ??
        source.payout_total
    ),
    commission_count: toNumber(
      source.commission_count ??
        source.item_count ??
        source.total_items ??
        source.row_count
    ),
    created_at: toStringValue(source.created_at) || undefined,
    finalized_at: toNullableString(source.finalized_at),
    cancelled_at: toNullableString(source.cancelled_at),
    created_by_username:
      toNullableString(source.created_by_username) ??
      toNullableString(source.created_by_name),
    finalized_by_username:
      toNullableString(source.finalized_by_username) ??
      toNullableString(source.finalized_by_name),
    cancelled_by_username:
      toNullableString(source.cancelled_by_username) ??
      toNullableString(source.cancelled_by_name),
    note: toNullableString(source.note) ?? toNullableString(source.notes),
  };
}

function normalizeCommissionRow(raw: Record<string, unknown>): BatchCommissionRow {
  const subscriptionId =
    toNullableNumber(raw.subscription_id) ??
    toNullableNumber(raw.subscription) ??
    null;

  return {
    id: toNumber(raw.id),
    amount: toMoneyString(
      raw.amount ?? raw.commission_amount ?? raw.total_amount ?? 0
    ),
    partner_name:
      toStringValue(raw.partner_name) ||
      toStringValue(raw.partner_username) ||
      undefined,
    customer_name: toStringValue(raw.customer_name) || undefined,
    subscription_id: subscriptionId,
    subscription_number:
      toStringValue(raw.subscription_number) ||
      (subscriptionId ? `SUB-${subscriptionId}` : undefined),
    batch_code: toNullableString(raw.batch_code),
    lucky_number: toNullableNumber(raw.lucky_number),
    settled_at:
      toNullableString(raw.settled_at) ??
      toNullableString(raw.settlement_date),
    created_at: toStringValue(raw.created_at) || undefined,
    note: toNullableString(raw.note) ?? toNullableString(raw.notes),
  };
}

function extractBatchMeta(payload: Record<string, unknown>): PayoutBatchMeta {
  const nestedBatch = toObject(payload.batch);
  if (nestedBatch) {
    return normalizeBatchMeta(nestedBatch);
  }
  return normalizeBatchMeta(payload);
}

function extractCommissionRows(payload: Record<string, unknown>): BatchCommissionRow[] {
  const candidates = [
    payload.lines,
    payload.commissions,
    payload.items,
    payload.rows,
    payload.results,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return toArray<Record<string, unknown>>(candidate).map(normalizeCommissionRow);
    }
  }

  return [];
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
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

function DetailValue({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}

export default function AdminPayoutBatchDetailPage() {
  const params = useParams<{ id: string }>();
  const batchId = params?.id;

  const [batch, setBatch] = useState<PayoutBatchMeta | null>(null);
  const [rows, setRows] = useState<BatchCommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState("");

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!batchId) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await apiFetch<Record<string, unknown>>(
          `/admin/commission-payout-batches/${batchId}/`
        );

        setBatch(extractBatchMeta(payload));
        setRows(extractCommissionRows(payload));
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setBatch(null);
          setRows([]);
        }
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [batchId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  async function runAction(action: "finalize" | "cancel") {
    if (!batchId || !batch) return;

    const verb = action === "finalize" ? "finalize" : "cancel";
    const confirmed = window.confirm(
      `Are you sure you want to ${verb} payout batch #${batchId}?`
    );
    if (!confirmed) return;

    setActing(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const body =
        actionNote.trim().length > 0
          ? { note: actionNote.trim(), reason: actionNote.trim() }
          : {};

      const payload = await apiFetch<BatchActionResponse>(
        `/admin/commission-payout-batches/${batchId}/${action}/`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );

      setActionSuccess(
        payload.detail ||
          payload.message ||
          `Payout batch ${verb}d successfully.`
      );
      setActionNote("");
      await loadPage("refresh");
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setActing(false);
    }
  }

  function handleActionSubmit(
    event: FormEvent<HTMLFormElement>,
    action: "finalize" | "cancel"
  ) {
    event.preventDefault();
    void runAction(action);
  }

  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        amount: row.amount,
        partner_name: row.partner_name ?? "",
        customer_name: row.customer_name ?? "",
        subscription_number: row.subscription_number ?? "",
        batch_code: row.batch_code ?? "",
        lucky_number:
          typeof row.lucky_number === "number" ? String(row.lucky_number) : "",
        settled_at: row.settled_at ?? "",
        created_at: row.created_at ?? "",
        note: row.note ?? "",
      })),
    [rows]
  );

  const totalVisibleAmount = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    [rows]
  );

  const isDraft = batch?.status === "DRAFT";
  const isFinalized = batch?.status === "FINALIZED";
  const isCancelled = batch?.status === "CANCELLED";

  return (
    <PortalPage
      title={`Payout Batch #${batchId ?? "—"}`}
      subtitle="Inspect payout batch composition, review included commission rows, and execute controlled finalize or cancel actions."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Finance", href: "/admin/finance" },
        { label: "Payout Batches", href: "/admin/finance/payout-batches" },
        { label: `Batch #${batchId ?? "—"}` },
      ]}
      actions={[
        {
          href: "/admin/finance/payout-batches",
          label: "Back to Register",
          variant: "secondary",
        },
        {
          href: "/admin/finance/commissions/settled",
          label: "Back to Payout Queue",
          variant: "primary",
        },
      ]}
      stats={[
        {
          label: "Batch Total",
          value: money(batch?.total_amount),
          tone: "success",
        },
        {
          label: "Commission Rows",
          value: String(batch?.commission_count ?? rows.length),
        },
        {
          label: "Visible Amount",
          value: money(totalVisibleAmount),
        },
        {
          label: "Status",
          value: batch?.status || "—",
          tone:
            batch?.status === "DRAFT"
              ? "warning"
              : batch?.status === "FINALIZED"
              ? "success"
              : batch?.status === "CANCELLED"
              ? "danger"
              : undefined,
        },
      ]}
      statusBadge={{
        label: batch?.status || "Batch Detail",
        tone:
          batch?.status === "DRAFT"
            ? "warning"
            : batch?.status === "FINALIZED"
            ? "success"
            : batch?.status === "CANCELLED"
            ? "danger"
            : "info",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end gap-3">
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
                `payout-batch-${batchId}-current-view.csv`,
                [
                  { key: "id", header: "id" },
                  { key: "amount", header: "amount" },
                  { key: "partner_name", header: "partner_name" },
                  { key: "customer_name", header: "customer_name" },
                  { key: "subscription_number", header: "subscription_number" },
                  { key: "batch_code", header: "batch_code" },
                  { key: "lucky_number", header: "lucky_number" },
                  { key: "settled_at", header: "settled_at" },
                  { key: "created_at", header: "created_at" },
                  { key: "note", header: "note" },
                ],
                exportRows
              )
            }
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export Current View
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading payout batch detail..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load payout batch detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !batch ? (
          <EmptyState
            title="Batch not available"
            description="The requested payout batch could not be loaded."
          />
        ) : null}

        {!loading && !error && batch ? (
          <>
            <section className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="Batch overview"
                description="Primary batch metadata used for finance review and lifecycle control."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue label="Batch ID" value={`#${batch.id}`} />
                  <DetailValue label="Status" value={batch.status} />
                  <DetailValue
                    label="Total Amount"
                    value={money(batch.total_amount)}
                  />
                  <DetailValue
                    label="Commission Rows"
                    value={String(batch.commission_count)}
                  />
                  <DetailValue
                    label="Created At"
                    value={formatDateTime(batch.created_at)}
                  />
                  <DetailValue
                    label="Created By"
                    value={batch.created_by_username || "—"}
                  />
                  <DetailValue
                    label="Finalized At"
                    value={formatDateTime(batch.finalized_at)}
                  />
                  <DetailValue
                    label="Finalized By"
                    value={batch.finalized_by_username || "—"}
                  />
                  <DetailValue
                    label="Cancelled At"
                    value={formatDateTime(batch.cancelled_at)}
                  />
                  <DetailValue
                    label="Cancelled By"
                    value={batch.cancelled_by_username || "—"}
                  />
                </div>

                {batch.note ? (
                  <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Batch Note
                    </div>
                    <div className="mt-2 text-sm text-foreground">{batch.note}</div>
                  </div>
                ) : null}
              </SectionCard>

              <SectionCard
                title="Lifecycle control"
                description="Finalize or cancel only while the batch remains in draft state. Finalized and cancelled batches stay immutable for audit safety."
              >
                {actionError ? (
                  <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {actionError}
                  </div>
                ) : null}

                {actionSuccess ? (
                  <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {actionSuccess}
                  </div>
                ) : null}

                {isDraft ? (
                  <div className="space-y-5">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      Draft batches may still be finalized or cancelled. Both actions are explicit and audited.
                    </div>

                    <div>
                      <label
                        htmlFor="batch-action-note"
                        className="mb-2 block text-sm font-medium text-foreground"
                      >
                        Action note
                      </label>
                      <textarea
                        id="batch-action-note"
                        value={actionNote}
                        onChange={(event) => setActionNote(event.target.value)}
                        rows={4}
                        placeholder="Optional finance note for finalize or cancel actions."
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
                        disabled={acting}
                      />
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <form
                        onSubmit={(event) => handleActionSubmit(event, "finalize")}
                      >
                        <button
                          type="submit"
                          disabled={acting}
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {acting ? "Processing..." : "Finalize Batch"}
                        </button>
                      </form>

                      <form
                        onSubmit={(event) => handleActionSubmit(event, "cancel")}
                      >
                        <button
                          type="submit"
                          disabled={acting}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-destructive/30 bg-destructive px-4 text-sm font-medium text-destructive-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {acting ? "Processing..." : "Cancel Batch"}
                        </button>
                      </form>
                    </div>
                  </div>
                ) : isFinalized ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    This batch is finalized and should now be treated as read-only.
                  </div>
                ) : isCancelled ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    This batch is cancelled and remains visible for auditability only.
                  </div>
                ) : (
                  <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    No lifecycle action is available for this batch state.
                  </div>
                )}
              </SectionCard>
            </section>

            <SectionCard
              title="Included commission rows"
              description="All commission rows currently included in this payout batch."
            >
              {rows.length === 0 ? (
                <EmptyState
                  title="No commission rows in batch"
                  description="This payout batch detail returned no included commission rows."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Row
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Partner / Customer
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Contract
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Amount
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Timing
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
                            <div className="font-medium">#{row.id}</div>
                            {row.note ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {row.note}
                              </div>
                            ) : null}
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.partner_name || "Unknown partner"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.customer_name || "No customer linked"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.subscription_number || "—"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.batch_code || "No batch"}
                              {typeof row.lucky_number === "number"
                                ? ` · Lucky #${row.lucky_number}`
                                : ""}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-right text-sm font-semibold text-foreground">
                            {money(row.amount)}
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="text-xs text-muted-foreground">
                              Settled {formatDateTime(row.settled_at)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Created {formatDateTime(row.created_at)}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="flex flex-col items-start gap-2">
                              {typeof row.subscription_id === "number" ? (
                                <Link
                                  href={`/admin/subscriptions/${row.subscription_id}`}
                                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                                >
                                  Subscription
                                </Link>
                              ) : null}

                              <Link
                                href="/admin/finance/commissions"
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Commission Register
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
