"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch, toArray } from "@/lib/api";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import type { AdminCommissionSummaryResponse } from "@/types/commission";

type PayoutBatchRow = {
  id: number;
  status: string;
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
  return "Failed to load finance dashboard.";
}

function normalizePayoutBatch(row: Record<string, unknown>): PayoutBatchRow {
  return {
    id: toNumber(row.id),
    status:
      (typeof row.status === "string" && row.status) ||
      (typeof row.batch_status === "string" && row.batch_status) ||
      "DRAFT",
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
    created_at:
      typeof row.created_at === "string" ? row.created_at : undefined,
    finalized_at:
      typeof row.finalized_at === "string" || row.finalized_at === null
        ? (row.finalized_at as string | null)
        : undefined,
    cancelled_at:
      typeof row.cancelled_at === "string" || row.cancelled_at === null
        ? (row.cancelled_at as string | null)
        : undefined,
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FinanceLaneCard({
  eyebrow,
  title,
  description,
  value,
  secondaryValue,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  tone = "default",
}: {
  eyebrow: string;
  title: string;
  description: string;
  value: string;
  secondaryValue?: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  tone?: "default" | "warning" | "success" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : tone === "success"
      ? "border-emerald-200 bg-emerald-50"
      : "border-slate-200 bg-white";

  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">{description}</p>

      <div className="mt-4 space-y-1">
        <div className="text-2xl font-semibold text-slate-900">{value}</div>
        {secondaryValue ? (
          <div className="text-sm text-slate-600">{secondaryValue}</div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={primaryHref}
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
        >
          {primaryLabel}
        </Link>

        {secondaryHref && secondaryLabel ? (
          <Link
            href={secondaryHref}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
          >
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export default function AdminFinancePage() {
  const [summary, setSummary] = useState<AdminCommissionSummaryResponse | null>(null);
  const [batches, setBatches] = useState<PayoutBatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [summaryPayload, batchesPayload] = await Promise.all([
        apiFetch<AdminCommissionSummaryResponse>("/admin/commissions/summary/"),
        apiFetch<unknown>("/admin/commission-payout-batches/list/"),
      ]);

      setSummary(summaryPayload);
      setBatches(
        toArray<Record<string, unknown>>(batchesPayload).map(normalizePayoutBatch)
      );
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setSummary(null);
        setBatches([]);
      }
    } finally {
      if (mode === "initial") {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const draftBatchCount = useMemo(
    () => batches.filter((row) => row.status.toUpperCase() === "DRAFT").length,
    [batches]
  );

  const finalizedBatchCount = useMemo(
    () => batches.filter((row) => row.status.toUpperCase() === "FINALIZED").length,
    [batches]
  );

  const cancelledBatchCount = useMemo(
    () => batches.filter((row) => row.status.toUpperCase() === "CANCELLED").length,
    [batches]
  );

  const recentBatches = useMemo(() => batches.slice(0, 5), [batches]);

  return (
    <PortalPage
      title="Finance Control Center"
      subtitle="Monitor commission exposure, settled payout preparation, and payout batch lifecycle from one finance workspace."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Partner Finance", href: ROUTES.admin.financeCommissions },
        { label: "Finance" },
      ]}
      actions={[
        {
          href: ROUTES.admin.financeCommissions,
          label: "Open Commissions",
          variant: "primary",
        },
        {
          href: ROUTES.admin.financePayoutBatches,
          label: "Open Payout Batches",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Pending Commission",
          value: money(summary?.summary?.pending_commission),
          tone: "warning",
        },
        {
          label: "Settled Commission",
          value: money(summary?.summary?.settled_commission),
          tone: "success",
        },
        {
          label: "Unsettled Rows",
          value: String(summary?.summary?.pending_count ?? 0),
        },
        {
          label: "Payout Batches",
          value: String(batches.length),
        },
      ]}
      statusBadge={{
        label: "Finance Operations",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading finance control center..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load finance control center"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <section className="grid gap-4 xl:grid-cols-4">
              <FinanceLaneCard
                eyebrow="Commissions"
                title="Commission Register"
                description="Review total commission exposure, unsettled rows, and finance status."
                value={money(summary?.summary?.total_commission)}
                secondaryValue={`${String(
                  summary?.summary?.pending_count ?? 0
                )} unsettled · ${String(summary?.summary?.settled_count ?? 0)} settled`}
                primaryHref="/admin/finance/commissions"
                primaryLabel="Open Commissions"
                secondaryHref="/admin/partners"
                secondaryLabel="Partner Directory"
                tone="warning"
              />

              <FinanceLaneCard
                eyebrow="Settlement"
                title="Payout Queue"
                description="Prepare eligible commission rows for payout batches. Pending rows settle on batch finalize, while legacy settled rows remain batchable."
                value={money(summary?.summary?.pending_commission)}
                secondaryValue={`${String(
                  Number(summary?.summary?.pending_count ?? 0) +
                    Number(summary?.summary?.settled_count ?? 0)
                )} eligible rows across pending and legacy settled states`}
                primaryHref="/admin/finance/commissions/settled"
                primaryLabel="Open Payout Queue"
                secondaryHref="/admin/finance/commissions"
                secondaryLabel="Back to Register"
                tone="success"
              />

              <FinanceLaneCard
                eyebrow="Payouts"
                title="Payout Batches"
                description="Review draft, finalized, and cancelled payout batches."
                value={String(batches.length)}
                secondaryValue={`${draftBatchCount} draft · ${finalizedBatchCount} finalized · ${cancelledBatchCount} cancelled`}
                primaryHref="/admin/finance/payout-batches"
                primaryLabel="Open Payout Batches"
                tone="default"
              />

              <FinanceLaneCard
                eyebrow="Risk"
                title="Reversed Commission Value"
                description="Track reversed commission impact separately from settled and pending values."
                value={money(summary?.summary?.reversed_commission)}
                secondaryValue={`${String(summary?.summary?.reversed_count ?? 0)} reversed rows`}
                primaryHref="/admin/finance/commissions"
                primaryLabel="Review Commission Risk"
                secondaryHref={buildAdminReconciliationRoute({ view: "payments" })}
                secondaryLabel="Payment Reconciliation"
                tone={
                  Number(summary?.summary?.reversed_commission ?? 0) > 0 ? "danger" : "default"
                }
              />
            </section>

            <SectionCard
              title="Finance workflow note"
              description="Use the commission register for row-level review, the payout queue for batch preparation, reconciliation for mismatch cleanup, and payout batches for controlled finalize/cancel lifecycle."
            >
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/finance/commissions"
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Open Commission Register
                </Link>

                <Link
                  href="/admin/finance/commissions/settled"
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Open Payout Queue
                </Link>

                <Link
                  href="/admin/finance/reconciliation"
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Open Commission Reconciliation
                </Link>

                <Link
                  href="/admin/finance/payout-batches"
                  className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Open Payout Batches
                </Link>
              </div>
            </SectionCard>

            <SectionCard
              title="Recent payout batches"
              description="Recent payout batch records for finance visibility and downstream detail review."
            >
              {recentBatches.length === 0 ? (
                <EmptyState
                  title="No payout batches"
                  description="No payout batches are currently available."
                />
              ) : (
                <div className="space-y-3">
                  {recentBatches.map((row) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="font-medium text-foreground">
                            Batch #{row.id}
                          </div>
                          <div className="mt-1 text-sm text-slate-600">
                            {row.status} · {row.commission_count} commission rows
                          </div>
                          <div className="mt-1 text-xs text-slate-600">
                            Created {formatDateTime(row.created_at)} · Finalized{" "}
                            {formatDateTime(row.finalized_at)} · Cancelled{" "}
                            {formatDateTime(row.cancelled_at)}
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-semibold text-foreground">
                              {money(row.total_amount)}
                            </div>
                            <div className="text-xs text-slate-600">
                              Batch total
                            </div>
                          </div>

                          <Link
                            href={`/admin/finance/payout-batches/${row.id}`}
                            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                          >
                            Open Batch
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
