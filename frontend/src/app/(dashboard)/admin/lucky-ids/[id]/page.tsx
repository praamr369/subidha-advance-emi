"use client";
import { formatRupee } from "@/lib/utils/currency";

import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPStatusBadge,
} from "@/components/erp";
import { DetailPanel } from "@/components/ui/operations";
import { apiFetch } from "@/lib/api";

type LuckyIdStatus =
  | "AVAILABLE"
  | "ASSIGNED"
  | "WON"
  | "DRAWN"
  | "WINNER"
  | "BLOCKED"
  | "CANCELLED"
  | "UNKNOWN";

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

type LuckyIdDetailRecord = {
  id: number;
  batch_id: number | null;
  batch_code: string;
  lucky_number: number | null;
  status: LuckyIdStatus;
  customer_name?: string;
  subscription_id?: number | null;
  subscription_number?: string;
  created_at: string | null;
};

type BatchPreview = {
  id: number;
  batch_code: string;
  total_slots: number;
  duration_months: number;
  draw_day: number | null;
  start_date: string | null;
  status: BatchStatus;
};

type SubscriptionPreview = {
  id: number;
  subscription_number: string;
  customer_name?: string;
  product_name?: string;
  batch_code?: string;
  lucky_number: number | null;
  status: SubscriptionStatus;
  total_amount: string;
  monthly_amount: string;
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
  return typeof value === "string" ? value : value === null ? null : null;
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
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

function formatLuckyNumber(value: number | null): string {
  if (value == null) return "—";
  return `#${String(value).padStart(2, "0")}`;
}

function normalizeLuckyIdStatus(value: unknown): LuckyIdStatus {
  const status = String(value ?? "").toUpperCase();

  if (
    status === "AVAILABLE" ||
    status === "ASSIGNED" ||
    status === "WON" ||
    status === "DRAWN" ||
    status === "WINNER" ||
    status === "BLOCKED" ||
    status === "CANCELLED"
  ) {
    return status;
  }

  return "UNKNOWN";
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

function normalizeLuckyIdDetail(raw: Record<string, unknown>): LuckyIdDetailRecord {
  return {
    id: toNumber(raw.id),
    batch_id: toNullableNumber(raw.batch) ?? toNullableNumber(raw.batch_id),
    batch_code:
      toStringValue(raw.batch_code).trim() ||
      toStringValue(raw.batch_name).trim() ||
      "Unknown batch",
    lucky_number:
      toNullableNumber(raw.lucky_number) ??
      toNullableNumber(raw.lucky_no) ??
      toNullableNumber(raw.number),
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
    created_at: toNullableString(raw.created_at),
  };
}

function normalizeBatchPreview(raw: Record<string, unknown>): BatchPreview {
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
  };
}

function normalizeSubscriptionPreview(
  raw: Record<string, unknown>
): SubscriptionPreview {
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
    batch_code:
      toStringValue(raw.batch_code).trim() ||
      undefined,
    lucky_number:
      toNullableNumber(raw.lucky_number) ??
      toNullableNumber(raw.lucky_no),
    status: normalizeSubscriptionStatus(raw.status ?? raw.subscription_status),
    total_amount: toMoneyString(
      raw.total_amount ?? raw.contract_value ?? raw.amount
    ),
    monthly_amount: toMoneyString(
      raw.monthly_amount ?? raw.emi_amount ?? raw.installment_amount
    ),
    start_date:
      toNullableString(raw.start_date) ??
      toNullableString(raw.created_date),
  };
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to load Lucky ID detail.";

  const raw = error.message.trim();
  if (!raw) return "Failed to load Lucky ID detail.";

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

export default function AdminLuckyIdDetailPage() {
  const params = useParams<{ id: string }>();
  const luckyIdId = params?.id;

  const [luckyId, setLuckyId] = useState<LuckyIdDetailRecord | null>(null);
  const [batchPreview, setBatchPreview] = useState<BatchPreview | null>(null);
  const [subscriptionPreview, setSubscriptionPreview] =
    useState<SubscriptionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!luckyIdId) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const luckyIdPayload = await apiFetch<Record<string, unknown>>(
          `/admin/lucky-ids/${luckyIdId}/`
        );
        const normalizedLuckyId = normalizeLuckyIdDetail(luckyIdPayload);

        let nextBatchPreview: BatchPreview | null = null;
        let nextSubscriptionPreview: SubscriptionPreview | null = null;

        if (normalizedLuckyId.batch_id != null) {
          try {
            const batchPayload = await apiFetch<Record<string, unknown>>(
              `/admin/batches/${normalizedLuckyId.batch_id}/`
            );
            nextBatchPreview = normalizeBatchPreview(batchPayload);
          } catch {
            nextBatchPreview = null;
          }
        }

        if (normalizedLuckyId.subscription_id != null) {
          try {
            const subscriptionPayload = await apiFetch<Record<string, unknown>>(
              `/admin/subscriptions/${normalizedLuckyId.subscription_id}/`
            );
            nextSubscriptionPreview = normalizeSubscriptionPreview(subscriptionPayload);
          } catch {
            nextSubscriptionPreview = null;
          }
        }

        setLuckyId(normalizedLuckyId);
        setBatchPreview(nextBatchPreview);
        setSubscriptionPreview(nextSubscriptionPreview);
        setError(null);
      } catch (err) {
        setError(parseErrorMessage(err));
        setLuckyId(null);
        setBatchPreview(null);
        setSubscriptionPreview(null);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [luckyIdId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const isAssignedState = useMemo(() => {
    if (!luckyId) return false;
    return (
      luckyId.status === "ASSIGNED" ||
      luckyId.status === "WON" ||
      luckyId.status === "DRAWN" ||
      luckyId.status === "WINNER"
    );
  }, [luckyId]);

  const hasVisibleLinkage = useMemo(() => {
    if (!luckyId) return false;
    return Boolean(luckyId.customer_name || luckyId.subscription_number);
  }, [luckyId]);

  return (
    <ERPPageShell
      title={
        luckyId
          ? `Lucky ID ${formatLuckyNumber(luckyId.lucky_number)}`
          : `Lucky ID #${luckyIdId ?? "—"}`
      }
      subtitle="Inspect one Lucky ID with batch ownership, assignment integrity, and linked contract context."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Lucky IDs", href: "/admin/lucky-ids" },
        { label: luckyId ? formatLuckyNumber(luckyId.lucky_number) : `Lucky ID #${luckyIdId ?? "—"}` },
      ]}
      actions={[
        {
          href: "/admin/lucky-ids",
          label: "Back to Register",
          variant: "secondary",
        },
        ...(luckyId?.batch_id != null
          ? [
              {
                href: `/admin/batches/${luckyId.batch_id}`,
                label: "Open Batch",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(luckyId?.subscription_id != null
          ? [
              {
                href: `/admin/subscriptions/${luckyId.subscription_id}`,
                label: "Open Contract",
                variant: "primary" as const,
              },
            ]
          : []),
      ]}
      stats={[
        {
          label: "Lucky Number",
          value: luckyId ? formatLuckyNumber(luckyId.lucky_number) : "—",
        },
        {
          label: "Status",
          value: luckyId?.status || "—",
          tone: luckyId?.status === "ASSIGNED" ? "success" : undefined,
        },
        {
          label: "Batch",
          value: luckyId?.batch_code || "—",
        },
        {
          label: "Linkage",
          value: hasVisibleLinkage ? "Linked" : isAssignedState ? "Integrity alert" : "Unassigned",
          tone: hasVisibleLinkage ? "success" : isAssignedState ? "danger" : undefined,
        },
      ]}
      statusBadge={{
        label: luckyId?.status || "Lucky ID Detail",
        tone:
          luckyId?.status === "ASSIGNED"
            ? "success"
            : luckyId?.status === "WON" || luckyId?.status === "DRAWN" || luckyId?.status === "WINNER"
            ? "info"
            : luckyId?.status === "BLOCKED" || luckyId?.status === "CANCELLED"
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

        {loading ? <ERPLoadingState label="Loading Lucky ID detail..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load Lucky ID detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !luckyId ? (
          <ERPEmptyState
            title="Lucky ID not available"
            description="The requested Lucky ID could not be loaded."
          />
        ) : null}

        {!loading && !error && luckyId ? (
          <>
            {isAssignedState && !hasVisibleLinkage ? (
              <DetailPanel
                title="Integrity alert"
                description="This Lucky ID is in an assigned-state status but visible customer or contract linkage is missing."
              >
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  Investigate the subscription assignment flow for this Lucky ID. Assigned statuses should resolve to a linked customer and subscription.
                </div>
              </DetailPanel>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-2">
              <DetailPanel
                title="Lucky ID overview"
                description="Primary Lucky ID record used in batch allocation and contract linkage."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue label="Row ID" value={`#${luckyId.id}`} />
                  <DetailValue
                    label="Lucky Number"
                    value={formatLuckyNumber(luckyId.lucky_number)}
                  />
                  <DetailValue label="Batch Code" value={luckyId.batch_code} />
                  <DetailValue
                    label="Status"
                    value={<ERPStatusBadge status={luckyId.status} />}
                  />
                  <DetailValue
                    label="Customer"
                    value={
                      luckyId.customer_name ||
                      (isAssignedState ? "Missing customer link" : "Unassigned")
                    }
                  />
                  <DetailValue
                    label="Contract"
                    value={
                      luckyId.subscription_number ||
                      (isAssignedState ? "Missing subscription link" : "No contract")
                    }
                  />
                  <DetailValue
                    label="Created At"
                    value={formatDateTime(luckyId.created_at)}
                  />
                  <DetailValue
                    label="Batch ID"
                    value={luckyId.batch_id != null ? `#${luckyId.batch_id}` : "—"}
                  />
                </div>
              </DetailPanel>

              <DetailPanel
                title="Operational meaning"
                description="Interpret the current Lucky ID state before making any downstream operational decision."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue
                    label="Assignment State"
                    value={isAssignedState ? "Assigned-state" : "Not assigned-state"}
                  />
                  <DetailValue
                    label="Visible Linkage"
                    value={hasVisibleLinkage ? "Present" : "Missing"}
                  />
                  <DetailValue
                    label="Safe for New Intake"
                    value={luckyId.status === "AVAILABLE" ? "Yes" : "No"}
                  />
                  <DetailValue
                    label="Requires Audit Review"
                    value={isAssignedState && !hasVisibleLinkage ? "Yes" : "No"}
                  />
                </div>
              </DetailPanel>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <DetailPanel
                title="Batch context"
                description="The batch that owns this Lucky ID."
              >
                {batchPreview ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailValue label="Batch Code" value={batchPreview.batch_code} />
                    <DetailValue
                      label="Status"
                      value={<ERPStatusBadge status={batchPreview.status} />}
                    />
                    <DetailValue
                      label="Total Slots"
                      value={String(batchPreview.total_slots)}
                    />
                    <DetailValue
                      label="Duration"
                      value={`${batchPreview.duration_months} months`}
                    />
                    <DetailValue
                      label="Start Date"
                      value={formatDate(batchPreview.start_date)}
                    />
                    <DetailValue
                      label="Draw Day"
                      value={
                        batchPreview.draw_day != null
                          ? String(batchPreview.draw_day)
                          : "—"
                      }
                    />
                  </div>
                ) : (
                  <ERPEmptyState
                    title="Batch preview unavailable"
                    description="Batch preview could not be loaded for this Lucky ID."
                  />
                )}
              </DetailPanel>

              <DetailPanel
                title="Linked contract context"
                description="The subscription currently linked to this Lucky ID, when available."
              >
                {subscriptionPreview ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailValue
                      label="Contract"
                      value={subscriptionPreview.subscription_number}
                    />
                    <DetailValue
                      label="Customer"
                      value={subscriptionPreview.customer_name || "Unknown customer"}
                    />
                    <DetailValue
                      label="Product"
                      value={subscriptionPreview.product_name || "Unknown product"}
                    />
                    <DetailValue
                      label="Batch"
                      value={subscriptionPreview.batch_code || "—"}
                    />
                    <DetailValue
                      label="Lucky Number"
                      value={formatLuckyNumber(subscriptionPreview.lucky_number)}
                    />
                    <DetailValue
                      label="Status"
                      value={<ERPStatusBadge status={subscriptionPreview.status} />}
                    />
                    <DetailValue
                      label="Total Amount"
                      value={formatRupee(subscriptionPreview.total_amount)}
                    />
                    <DetailValue
                      label="Monthly Amount"
                      value={formatRupee(subscriptionPreview.monthly_amount)}
                    />
                    <DetailValue
                      label="Start Date"
                      value={formatDate(subscriptionPreview.start_date)}
                    />
                  </div>
                ) : (
                  <ERPEmptyState
                    title="No linked contract preview"
                    description={
                      isAssignedState
                        ? "This Lucky ID appears assigned, but no linked contract preview could be loaded."
                        : "This Lucky ID does not currently have a linked contract."
                    }
                  />
                )}
              </DetailPanel>
            </section>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
