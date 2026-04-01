"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { DetailItem as DetailValue, WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import { apiFetch, toArray } from "@/lib/api";

type BatchStatus =
  | "DRAFT"
  | "OPEN"
  | "ACTIVE"
  | "CLOSED"
  | "COMPLETED"
  | "CANCELLED"
  | "UNKNOWN";

type SubscriptionStatus =
  | "ACTIVE"
  | "PENDING"
  | "WON"
  | "COMPLETED"
  | "CANCELLED"
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
  draw_count: number;
};

type LuckyIdRow = {
  id: number;
  lucky_number: number | null;
  status: "AVAILABLE" | "ASSIGNED" | "WON" | "BLOCKED" | "CANCELLED" | "UNKNOWN";
  customer_name?: string;
  subscription_id?: number | null;
  subscription_number?: string;
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
  return `₹${Number(value || 0).toFixed(2)}`;
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

function normalizeBatchStatus(value: unknown): BatchStatus {
  const status = String(value ?? "").toUpperCase();
  if (
    status === "DRAFT" ||
    status === "OPEN" ||
    status === "ACTIVE" ||
    status === "CLOSED" ||
    status === "COMPLETED" ||
    status === "CANCELLED"
  ) {
    return status;
  }
  return "UNKNOWN";
}

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  const status = String(value ?? "").toUpperCase();
  if (
    status === "ACTIVE" ||
    status === "PENDING" ||
    status === "WON" ||
    status === "COMPLETED" ||
    status === "CANCELLED" ||
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
    normalized === "CANCELLED"
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
    draw_count: toNumber(raw.draw_count),
  };
}

function normalizeLuckyIdRow(raw: Record<string, unknown>): LuckyIdRow {
  return {
    id: toNumber(raw.id),
    lucky_number:
      toNullableNumber(raw.lucky_number) ??
      toNullableNumber(raw.number) ??
      toNullableNumber(raw.lucky_no),
    status: normalizeLuckyIdStatus(raw.status),
    customer_name:
      toStringValue(raw.customer_name).trim() ||
      toStringValue(raw.customer_display_name).trim() ||
      undefined,
    subscription_id: toNullableNumber(raw.subscription_id),
    subscription_number:
      toStringValue(raw.subscription_number).trim() ||
      toStringValue(raw.subscription_code).trim() ||
      undefined,
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

function batchStatusToneClass(status: BatchStatus): string {
  switch (status) {
    case "OPEN":
    case "ACTIVE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "DRAFT":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "CLOSED":
    case "COMPLETED":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "CANCELLED":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function subscriptionToneClass(status: SubscriptionStatus): string {
  switch (status) {
    case "ACTIVE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "PENDING":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "WON":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "COMPLETED":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "CANCELLED":
    case "DEFAULTED":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function luckyIdToneClass(status: string): string {
  if (status === "AVAILABLE") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }
  if (status === "ASSIGNED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "WON") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (status === "CANCELLED" || status === "BLOCKED") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-border bg-muted text-foreground";
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
    <PortalPage
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
          href: "/admin/subscriptions/create",
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
        tone:
          batch?.status === "OPEN" || batch?.status === "ACTIVE"
            ? "success"
            : batch?.status === "CANCELLED"
              ? "danger"
              : "info",
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

        {loading ? <LoadingBlock label="Loading batch detail..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load batch detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !batch ? (
          <EmptyState
            title="Batch not found"
            description="The requested batch could not be loaded."
          />
        ) : null}

        {!loading && !error && batch && summary ? (
          <>
            <section className="grid gap-6 xl:grid-cols-2">
              <SectionCard
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
                    value={
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                          batchStatusToneClass(batch.status),
                        ].join(" ")}
                      >
                        {batch.status}
                      </span>
                    }
                  />
                  <DetailValue
                    label="Created At"
                    value={formatDateTime(batch.created_at)}
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Live batch summary"
                description="This section uses live summary data from backend, not static placeholders."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue
                    label="Subscriptions"
                    value={String(summary.subscription_count)}
                  />
                  <DetailValue
                    label="Active Subscriptions"
                    value={String(summary.active_subscription_count)}
                  />
                  <DetailValue
                    label="Won Subscriptions"
                    value={String(summary.won_subscription_count)}
                  />
                  <DetailValue
                    label="Monthly Booked Value"
                    value={money(summary.monthly_booked_value)}
                  />
                  <DetailValue
                    label="Available Lucky IDs"
                    value={String(summary.available_lucky_ids)}
                  />
                  <DetailValue
                    label="Assigned Lucky IDs"
                    value={String(summary.assigned_lucky_ids)}
                  />
                  <DetailValue
                    label="Won Lucky IDs"
                    value={String(summary.won_lucky_ids)}
                  />
                  <DetailValue
                    label="Draw Records"
                    value={String(summary.draw_count)}
                  />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    href={batchId ? `/admin/batches/${batchId}/edit` : "/admin/batches"}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Edit Batch
                  </Link>

                  <Link
                    href="/admin/subscriptions/create"
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
              </SectionCard>
            </section>

            <SectionCard
              title="Lucky ID register"
              description="All Lucky IDs for this batch, including assignment state and linked contract context."
            >
              {luckyIds.length === 0 ? (
                <EmptyState
                  title="No Lucky IDs"
                  description="No Lucky IDs were returned for this batch."
                />
              ) : (
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
                                {row.customer_name
                                  ? row.customer_name
                                  : row.status === "AVAILABLE"
                                    ? "Unassigned"
                                    : row.status === "WON"
                                      ? "Winner without customer link"
                                      : "Assigned without customer link"}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {row.subscription_number
                                  ? row.subscription_number
                                  : row.status === "AVAILABLE"
                                    ? "No subscription"
                                    : row.status === "WON"
                                      ? "Missing winner subscription link"
                                      : "Missing subscription link"}
                              </div>
                            </td>

                            <td className="border-b border-border px-4 py-3 text-sm text-foreground">
                              <span
                                className={[
                                  "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                                  luckyIdToneClass(row.status),
                                ].join(" ")}
                              >
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Linked subscriptions"
              description="All subscriptions filtered to this batch, with real product, customer, and contract value visibility."
            >
              {subscriptions.length === 0 ? (
                <EmptyState
                  title="No subscriptions"
                  description="No subscriptions were returned for this batch."
                />
              ) : (
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
                      {subscriptions.map((row) => (
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
                            <span
                              className={[
                                "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                                subscriptionToneClass(row.status),
                              ].join(" ")}
                            >
                              {row.status}
                            </span>
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
              )}
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
