"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPStatusBadge,
} from "@/components/erp";
import { DataTableShell, DetailPanel, KpiCard, QuickActionGrid } from "@/components/ui/operations";
import {
  type BatchStatus,
  isLiveBatchStatus,
  normalizeBatchStatus,
} from "@/domains/batches/status";
import { DetailItem as DetailValue } from "@/components/ui/workspace";
import { apiFetch, toArray } from "@/lib/api";

type SubscriptionStatus =
  | "ACTIVE"
  | "APPROVED"
  | "PAYMENT_PENDING"
  | "DELIVERY_PENDING"
  | "PENDING"
  | "WON"
  | "COMPLETED"
  | "CANCELLED"
  | "CLOSED"
  | "DEFAULTED"
  | "UNKNOWN";

type BatchDetailRecord = {
  id: number;
  batch_code: string;
  total_slots: number;
  duration_months: number;
  draw_day: number | null;
  start_date: string | null;
  status: BatchStatus;
  description: string | null;
  created_at: string | null;
};

type BatchSummaryRecord = {
  id: number;
  batch_code: string;
  status: BatchStatus;
  duration_months: number;
  total_slots: number;
  draw_day: number | null;
  start_date: string | null;
  subscription_count: number;
  active_subscription_count: number;
  won_subscription_count: number;
  available_lucky_ids: number;
  assigned_lucky_ids: number;
  won_lucky_ids: number;
  monthly_booked_value: string;
  active_monthly_booked_value: string;
  active_contract_value: string;
  draw_eligible_count: number;
  historical_subscription_count: number;
  cancelled_subscription_count: number;
  archived_subscription_count: number;
  historical_monthly_booked_value: string;
  draw_count: number;
};

type LuckyIdRow = {
  id: number;
  lucky_number: number | null;
  status:
    | "AVAILABLE"
    | "ASSIGNED"
    | "WON"
    | "BLOCKED"
    | "CANCELLED"
    | "RELEASED"
    | "FROZEN"
    | "FROZEN_CANCELLED_HOLDER"
    | "UNKNOWN";
  customer_name?: string;
  subscription_id?: number | null;
  subscription_number?: string;
  assignable?: boolean;
  assignment_note?: string;
  current_customer_name?: string;
  current_subscription_id?: number | null;
  current_subscription_code?: string;
  current_assignment_status?: string;
  is_currently_assigned?: boolean;
  is_available?: boolean;
  has_historical_assignment?: boolean;
  historical_subscription_status?: string;
  historical_subscription_code?: string;
  history_label?: string;
};

type SubscriptionRow = {
  id: number;
  subscription_number: string;
  customer_name?: string;
  product_name?: string;
  lucky_number: number | null;
  total_amount: string;
  monthly_amount: string;
  status: SubscriptionStatus;
  start_date: string | null;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  if (typeof value === "string") return value;
  return value === null ? null : null;
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function money(value: string | number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  const status = String(value ?? "").toUpperCase();
  if (
    status === "ACTIVE" ||
    status === "APPROVED" ||
    status === "PAYMENT_PENDING" ||
    status === "DELIVERY_PENDING" ||
    status === "PENDING" ||
    status === "WON" ||
    status === "COMPLETED" ||
    status === "CANCELLED" ||
    status === "CLOSED" ||
    status === "DEFAULTED"
  ) {
    return status;
  }
  return "UNKNOWN";
}

function normalizeLuckyIdStatus(
  value: unknown
): LuckyIdRow["status"] {
  const normalized = String(value ?? "").trim().toUpperCase();

  if (normalized === "WON" || normalized === "DRAWN" || normalized === "WINNER") {
    return "WON";
  }

  if (
    normalized === "AVAILABLE" ||
    normalized === "ASSIGNED" ||
    normalized === "BLOCKED" ||
    normalized === "CANCELLED" ||
    normalized === "RELEASED" ||
    normalized === "FROZEN" ||
    normalized === "FROZEN_CANCELLED_HOLDER"
  ) {
    return normalized;
  }

  return "UNKNOWN";
}

function normalizeBatchDetail(raw: Record<string, unknown>): BatchDetailRecord {
  return {
    id: toNumber(raw.id),
    batch_code:
      toStringValue(raw.batch_code).trim() ||
      toStringValue(raw.code).trim() ||
      `BATCH-${String(raw.id ?? "")}`,
    total_slots: toNumber(raw.total_slots),
    duration_months: toNumber(raw.duration_months),
    draw_day: toNullableNumber(raw.draw_day),
    start_date: toNullableString(raw.start_date),
    status: normalizeBatchStatus(raw.status),
    description: toNullableString(raw.description),
    created_at: toNullableString(raw.created_at),
  };
}

function normalizeBatchSummary(raw: Record<string, unknown>): BatchSummaryRecord {
  return {
    id: toNumber(raw.id),
    batch_code:
      toStringValue(raw.batch_code).trim() ||
      toStringValue(raw.code).trim() ||
      `BATCH-${String(raw.id ?? "")}`,
    status: normalizeBatchStatus(raw.status),
    duration_months: toNumber(raw.duration_months),
    total_slots: toNumber(raw.total_slots),
    draw_day: toNullableNumber(raw.draw_day),
    start_date: toNullableString(raw.start_date),
    subscription_count: toNumber(raw.subscription_count),
    active_subscription_count: toNumber(raw.active_subscription_count),
    won_subscription_count: toNumber(raw.won_subscription_count),
    available_lucky_ids: toNumber(raw.available_lucky_ids),
    assigned_lucky_ids: toNumber(raw.assigned_lucky_ids),
    won_lucky_ids: toNumber(raw.won_lucky_ids),
    monthly_booked_value: toMoneyString(raw.monthly_booked_value),
    active_monthly_booked_value: toMoneyString(
      raw.active_monthly_booked_value ?? raw.monthly_booked_value
    ),
    active_contract_value: toMoneyString(raw.active_contract_value),
    draw_eligible_count: toNumber(raw.draw_eligible_count),
    historical_subscription_count: toNumber(raw.historical_subscription_count),
    cancelled_subscription_count: toNumber(raw.cancelled_subscription_count),
    archived_subscription_count: toNumber(raw.archived_subscription_count),
    historical_monthly_booked_value: toMoneyString(raw.historical_monthly_booked_value),
    draw_count: toNumber(raw.draw_count),
  };
}

function normalizeLuckyIdRow(raw: Record<string, unknown>): LuckyIdRow {
  const state = toStringValue(raw.assignment_state).trim().toUpperCase();
  return {
    id: toNumber(raw.id),
    lucky_number:
      toNullableNumber(raw.lucky_number) ??
      toNullableNumber(raw.number) ??
      toNullableNumber(raw.lucky_no),
    status: normalizeLuckyIdStatus(state || raw.status),
    customer_name:
      toStringValue(raw.customer_name).trim() ||
      toStringValue(raw.customer_display_name).trim() ||
      undefined,
    subscription_id: toNullableNumber(raw.subscription_id),
    subscription_number:
      toStringValue(raw.subscription_number).trim() ||
      toStringValue(raw.subscription_code).trim() ||
      undefined,
    assignable: typeof raw.assignable === "boolean" ? raw.assignable : undefined,
    assignment_note: toStringValue(raw.assignment_note).trim() || undefined,
    current_customer_name: toStringValue(raw.current_customer_name).trim() || undefined,
    current_subscription_id: toNullableNumber(raw.current_subscription_id),
    current_subscription_code: toStringValue(raw.current_subscription_code).trim() || undefined,
    current_assignment_status:
      toStringValue(raw.current_assignment_status).trim() || undefined,
    is_currently_assigned:
      typeof raw.is_currently_assigned === "boolean" ? raw.is_currently_assigned : undefined,
    is_available: typeof raw.is_available === "boolean" ? raw.is_available : undefined,
    has_historical_assignment:
      typeof raw.has_historical_assignment === "boolean"
        ? raw.has_historical_assignment
        : undefined,
    historical_subscription_status:
      toStringValue(raw.historical_subscription_status).trim() || undefined,
    historical_subscription_code:
      toStringValue(raw.historical_subscription_code).trim() || undefined,
    history_label: toStringValue(raw.history_label).trim() || undefined,
  };
}

function normalizeSubscriptionRow(raw: Record<string, unknown>): SubscriptionRow {
  const id = toNumber(raw.id);

  return {
    id,
    subscription_number:
      toStringValue(raw.subscription_number).trim() ||
      toStringValue(raw.subscription_code).trim() ||
      `SUB-${id}`,
    customer_name:
      toStringValue(raw.customer_name).trim() ||
      toStringValue(raw.customer_display_name).trim() ||
      undefined,
    product_name:
      toStringValue(raw.product_name).trim() ||
      toStringValue(raw.product_title).trim() ||
      undefined,
    lucky_number: toNullableNumber(raw.lucky_number) ?? toNullableNumber(raw.lucky_no),
    total_amount: toMoneyString(raw.total_amount ?? raw.contract_value ?? raw.amount),
    monthly_amount: toMoneyString(
      raw.monthly_amount ?? raw.emi_amount ?? raw.installment_amount
    ),
    status: normalizeSubscriptionStatus(raw.status ?? raw.subscription_status),
    start_date: toNullableString(raw.start_date) ?? toNullableString(raw.created_date),
  };
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function extractRowsAndNext(payload: unknown): {
  rows: Record<string, unknown>[];
  nextPath: string | null;
} {
  const objectPayload = toObject(payload);

  if (objectPayload && Array.isArray(objectPayload.results)) {
    const nextRaw = objectPayload.next;
    return {
      rows: toArray<Record<string, unknown>>(objectPayload.results),
      nextPath: typeof nextRaw === "string" && nextRaw.trim() ? nextRaw : null,
    };
  }

  return {
    rows: toArray<Record<string, unknown>>(payload),
    nextPath: null,
  };
}

function normalizeApiPath(nextPath: string): string {
  const trimmed = nextPath.trim();

  if (!trimmed) return "";

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const parsed = new URL(trimmed);
    const combined = `${parsed.pathname}${parsed.search}`;
    if (combined.startsWith("/api/v1/")) {
      return combined.replace(/^\/api\/v1/, "");
    }
    return combined;
  }

  if (trimmed.startsWith("/api/v1/")) {
    return trimmed.replace(/^\/api\/v1/, "");
  }

  return trimmed;
}

async function fetchAllPagedRows(path: string): Promise<Record<string, unknown>[]> {
  let nextPath: string | null = path;
  const collected: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (let guard = 0; nextPath && guard < 100; guard += 1) {
    const payload = await apiFetch<unknown>(nextPath, { cache: "no-store" });
    const { rows, nextPath: rawNext } = extractRowsAndNext(payload);

    for (const row of rows) {
      const key =
        typeof row.id !== "undefined" ? String(row.id) : JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        collected.push(row);
      }
    }

    const normalizedNext = rawNext ? normalizeApiPath(rawNext) : "";
    nextPath = normalizedNext || null;
  }

  return collected;
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to load batch detail.";

  const raw = error.message.trim();
  if (!raw) return "Failed to load batch detail.";

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }

    for (const [field, value] of Object.entries(parsed)) {
      if (Array.isArray(value) && value.length > 0) {
        return `${field}: ${String(value[0])}`;
      }
      if (typeof value === "string" && value.trim()) {
        return `${field}: ${value}`;
      }
    }

    return raw;
  } catch {
    return raw;
  }
}

export default function AdminBatchDetailPage() {
  const params = useParams<{ id: string }>();
  const batchId = params?.id;

  const [batch, setBatch] = useState<BatchDetailRecord | null>(null);
  const [summary, setSummary] = useState<BatchSummaryRecord | null>(null);
  const [luckyIds, setLuckyIds] = useState<LuckyIdRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSubscriptions = subscriptions.filter((row) =>
    ["ACTIVE", "APPROVED", "PAYMENT_PENDING", "DELIVERY_PENDING"].includes(row.status)
  );
  const historicalSubscriptions = subscriptions.filter(
    (row) => !["ACTIVE", "APPROVED", "PAYMENT_PENDING", "DELIVERY_PENDING"].includes(row.status)
  );

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!batchId) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [detailPayload, summaryPayload, luckyRows, subscriptionRows] =
          await Promise.all([
            apiFetch<Record<string, unknown>>(`/admin/batches/${batchId}/`, {
              cache: "no-store",
            }),
            apiFetch<Record<string, unknown>>(`/admin/batches/${batchId}/summary/`, {
              cache: "no-store",
            }),
            fetchAllPagedRows(`/admin/lucky-ids/?batch_id=${batchId}`),
            fetchAllPagedRows(`/admin/subscriptions/?batch_id=${batchId}`),
          ]);

        setBatch(normalizeBatchDetail(detailPayload));
        setSummary(normalizeBatchSummary(summaryPayload));
        setLuckyIds(
          luckyRows
            .map(normalizeLuckyIdRow)
            .sort((a, b) => (a.lucky_number ?? 9999) - (b.lucky_number ?? 9999))
        );
        setSubscriptions(
          subscriptionRows
            .map(normalizeSubscriptionRow)
            .sort((a, b) => {
              const aDate = Date.parse(a.start_date || "") || 0;
              const bDate = Date.parse(b.start_date || "") || 0;
              return bDate - aDate;
            })
        );
        setError(null);
      } catch (err) {
        setError(parseErrorMessage(err));
        setBatch(null);
        setSummary(null);
        setLuckyIds([]);
        setSubscriptions([]);
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

  return (
    <ERPPageShell
      title={batch?.batch_code || `Batch #${batchId ?? "—"}`}
      subtitle="Operational batch detail workspace for slot readiness, Lucky IDs, subscriptions, and lifecycle visibility."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Batches", href: "/admin/batches" },
        { label: batch?.batch_code || `Batch #${batchId ?? "—"}` },
      ]}
      actions={[
        {
          href: "/admin/batches",
          label: "Back to Register",
          variant: "secondary",
        },
        {
          href: batchId ? `/admin/batches/${batchId}/edit` : "/admin/batches",
          label: "Edit Batch",
          variant: "primary",
        },
        {
          href: batchId ? `/admin/batches/${batchId}/control-center` : "/admin/batches",
          label: "Control Center",
          variant: "secondary",
        },
        {
          href: "/admin/subscriptions/advance-emi/create",
          label: "Create Subscription",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Total Slots",
          value: summary ? String(summary.total_slots) : "—",
        },
        {
          label: "Available Lucky IDs",
          value: summary ? String(summary.available_lucky_ids) : "—",
        },
        {
          label: "Assigned Lucky IDs",
          value: summary ? String(summary.assigned_lucky_ids) : "—",
          tone: (summary?.assigned_lucky_ids ?? 0) > 0 ? "success" : undefined,
        },
        {
          label: "Won Lucky IDs",
          value: summary ? String(summary.won_lucky_ids) : "—",
          tone: (summary?.won_lucky_ids ?? 0) > 0 ? "success" : undefined,
        },
      ]}
      statusBadge={{
        label: batch?.status || "Batch Detail",
        tone: batch?.status && isLiveBatchStatus(batch.status) ? "success" : "info",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <ERPLoadingState label="Loading batch detail..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load batch detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !batch ? (
          <ERPEmptyState
            title="Batch not found"
            description="The requested batch could not be loaded."
          />
        ) : null}

        {!loading && !error && batch && summary ? (
          <>
            {/* Phase 9B-NF7D — Object detail cockpit: Lucky Plan Control batch
                source ownership. Additive copy only. Lucky IDs, draw readiness,
                and winner state are read from real backend rows below; no grid,
                draw result, or winner state is fabricated here. */}
            <section className="rounded-2xl border border-border bg-muted/30 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Lucky Plan Control — Batch source
              </p>
              <h2 className="mt-2 text-base font-semibold text-foreground">
                This batch is the Lucky Plan Control — Batch source. Lucky IDs, draw state, and winner truth are batch-scoped and read from real backend rows; money and accounting stay in their owning modules.
              </h2>
              <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Lucky IDs 00–99 are batch-scoped and shown below from the live Lucky ID register, not a fabricated grid.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Draw readiness must come from real backend state — this page does not fake draw readiness, a draw result, or winner state.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Winner waiver means future EMI waiver only.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Subscriptions filtered by batch appear below from live subscription rows.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Payment/receipt belongs to Collections & Cashier.
                </li>
                <li className="rounded-xl border border-border bg-background px-3 py-2">
                  Accounting bridge/reconciliation belongs to Accounting & Reconciliation.
                </li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/admin/lucky-ids"
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Lucky IDs (Lucky Plan Control)
                </Link>
                <Link
                  href="/admin/lucky-draws"
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Lucky Draws (Lucky Plan Control)
                </Link>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <DetailPanel
                title="Batch overview"
                description="Master batch data used for grouping Lucky IDs, subscriptions, and lifecycle transitions."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue label="Batch ID" value={`#${batch.id}`} />
                  <DetailValue label="Batch Code" value={batch.batch_code} />
                  <DetailValue label="Total Slots" value={String(batch.total_slots)} />
                  <DetailValue
                    label="Duration"
                    value={`${batch.duration_months} months`}
                  />
                  <DetailValue
                    label="Draw Day"
                    value={batch.draw_day != null ? String(batch.draw_day) : "—"}
                  />
                  <DetailValue
                    label="Start Date"
                    value={formatDate(batch.start_date)}
                  />
                  <DetailValue
                    label="Status"
                    value={<ERPStatusBadge status={batch.status} />}
                  />
                  <DetailValue
                    label="Created At"
                    value={formatDateTime(batch.created_at)}
                  />
                </div>
              </DetailPanel>

              <DetailPanel
                title="Live batch summary"
                description="This section uses live summary data from backend, not static placeholders."
              >
                <QuickActionGrid className="md:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label="Subscriptions" value={String(summary.subscription_count)} />
                  <KpiCard label="Active Subscriptions" value={String(summary.active_subscription_count)} />
                  <KpiCard
                    label="Historical Subscriptions"
                    value={String(summary.historical_subscription_count)}
                  />
                  <KpiCard label="Won Subscriptions" value={String(summary.won_subscription_count)} />
                  <KpiCard
                    label="Active Monthly Booked Value"
                    value={money(summary.active_monthly_booked_value)}
                    helper="Excludes cancelled/archived subscriptions."
                  />
                  <KpiCard label="Active Contract Value" value={money(summary.active_contract_value)} />
                  <KpiCard label="Available Lucky IDs" value={String(summary.available_lucky_ids)} />
                  <KpiCard label="Assigned Lucky IDs" value={String(summary.assigned_lucky_ids)} />
                  <KpiCard label="Won Lucky IDs" value={String(summary.won_lucky_ids)} />
                  <KpiCard label="Draw Eligible" value={String(summary.draw_eligible_count)} />
                  <KpiCard label="Draw Records" value={String(summary.draw_count)} />
                </QuickActionGrid>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href={batchId ? `/admin/batches/${batchId}/edit` : "/admin/batches"}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Edit Batch
                  </Link>
                  <Link
                    href={batchId ? `/admin/batches/${batchId}/control-center` : "/admin/batches"}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Control Center
                  </Link>

                  <Link
                    href="/admin/subscriptions/advance-emi/create"
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Create Subscription
                  </Link>

                  <Link
                    href="/admin/batches"
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Batch Register
                  </Link>
                </div>
              </DetailPanel>
            </section>

            <DetailPanel
              title="Lucky ID register"
              description="All Lucky IDs for this batch, including assignment state and linked contract context."
            >
              {luckyIds.length === 0 ? (
                <ERPEmptyState
                  title="No Lucky IDs"
                  description="No Lucky IDs were returned for this batch."
                />
              ) : (
                <DataTableShell>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Lucky ID
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Customer / Contract
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {luckyIds.map((row) => {
                        return (
                          <tr key={row.id} className="align-top">
                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <div className="font-medium">
                                {row.lucky_number != null
                                  ? `#${String(row.lucky_number).padStart(2, "0")}`
                                  : `Lucky ID #${row.id}`}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Row #{row.id}
                              </div>
                            </td>

                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <div>
                                {row.current_customer_name || row.customer_name
                                  ? row.current_customer_name || row.customer_name
                                  : row.is_available || row.status === "AVAILABLE"
                                    ? "Unassigned"
                                    : row.status === "WON"
                                      ? "Winner without customer link"
                                      : "Assigned without customer link"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {row.current_subscription_code || row.subscription_number
                                  ? row.current_subscription_code || row.subscription_number
                                  : row.is_available || row.status === "AVAILABLE"
                                    ? "No subscription"
                                    : row.status === "RELEASED"
                                      ? "Released from cancelled contract"
                                    : row.status === "WON"
                                      ? "Missing winner subscription link"
                                      : "Missing subscription link"}
                              </div>
                              {row.assignment_note ? (
                                <div className="mt-1 text-xs text-muted-foreground">{row.assignment_note}</div>
                              ) : null}
                              {row.has_historical_assignment ? (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {row.history_label ||
                                    `History: ${row.historical_subscription_code || "subscription"} (${row.historical_subscription_status || "historical"})`}
                                </div>
                              ) : null}
                            </td>

                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <ERPStatusBadge status={row.status} hideIcon />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </DataTableShell>
              )}
            </DetailPanel>

            <DetailPanel
              title="Active linked subscriptions"
              description="Operationally active subscriptions only. Cancelled/archived records are shown separately in history."
            >
              {activeSubscriptions.length === 0 ? (
                <ERPEmptyState
                  title="No active subscriptions are linked to this batch."
                  description="Cancelled subscriptions are preserved below for audit history."
                />
              ) : (
                <DataTableShell>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                    <thead>
                      <tr className="text-left">
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Subscription
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Customer / Product
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                          Financials
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Status
                        </th>
                        <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {activeSubscriptions.map((row) => (
                        <tr key={row.id} className="align-top">
                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">{row.subscription_number}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Start {formatDate(row.start_date)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.lucky_number != null
                                ? `Lucky #${String(row.lucky_number).padStart(2, "0")}`
                                : "No Lucky ID"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <div className="font-medium">
                              {row.customer_name || "Unknown customer"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {row.product_name || "Unknown product"}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                            <div className="font-semibold">{money(row.total_amount)}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              EMI {money(row.monthly_amount)}
                            </div>
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <ERPStatusBadge status={row.status} hideIcon />
                          </td>

                          <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                            <Link
                              href={`/admin/subscriptions/${row.id}`}
                              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                            >
                              Open Subscription
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </DataTableShell>
              )}
            </DetailPanel>

            <DetailPanel
              title="Archived / cancelled subscription history"
              description="History-only records retained for auditability. These do not contribute to active KPIs, draw eligibility, or collection queues."
            >
              {historicalSubscriptions.length === 0 ? (
                <ERPEmptyState
                  title="No archived/cancelled subscription history."
                  description="No historical subscriptions were returned for this batch."
                />
              ) : (
                <DataTableShell>
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0">
                      <thead>
                        <tr className="text-left">
                          <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Subscription
                          </th>
                          <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Customer / Product
                          </th>
                          <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">
                            Financials
                          </th>
                          <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Status
                          </th>
                          <th className="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicalSubscriptions.map((row) => (
                          <tr key={row.id} className="align-top">
                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <div className="font-medium">{row.subscription_number}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                Start {formatDate(row.start_date)}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {row.lucky_number != null
                                  ? `Lucky #${String(row.lucky_number).padStart(2, "0")}`
                                  : "No Lucky ID"}
                              </div>
                            </td>
                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <div className="font-medium">
                                {row.customer_name || "Unknown customer"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {row.product_name || "Unknown product"}
                              </div>
                            </td>
                            <td className="border-b border-border px-4 py-3 text-right text-sm text-foreground">
                              <div className="font-semibold">{money(row.total_amount)}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                EMI {money(row.monthly_amount)}
                              </div>
                            </td>
                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <ERPStatusBadge status={row.status} hideIcon />
                              <div className="mt-1 text-xs text-muted-foreground">
                                History only
                              </div>
                            </td>
                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <Link
                                href={`/admin/subscriptions/${row.id}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Open Subscription
                              </Link>
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
    </ERPPageShell>
  );
}
