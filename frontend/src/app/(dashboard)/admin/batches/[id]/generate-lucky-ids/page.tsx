"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch } from "@/lib/api";

type BatchStatus =
  | "DRAFT"
  | "OPEN"
  | "ACTIVE"
  | "CLOSED"
  | "COMPLETED"
  | "CANCELLED"
  | "UNKNOWN";

type BatchDetailRecord = {
  id: number;
  batch_code: string;
  total_slots: number;
  duration_months: number;
  draw_day: number | null;
  start_date: string | null;
  status: BatchStatus;
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

type GenerateLuckyIdsResponse = {
  batch_id: number;
  batch_code: string;
  created_count: number;
  skipped_count: number;
  existing_count: number;
  total_slots: number;
  message: string;
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

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : value === null ? null : null;
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

function normalizeBatchDetail(raw: Record<string, unknown>): BatchDetailRecord {
  return {
    id: toNumber(raw.id),
    batch_code: String(raw.batch_code ?? raw.code ?? `BATCH-${raw.id ?? "?"}`),
    total_slots: toNumber(raw.total_slots),
    duration_months: toNumber(raw.duration_months),
    draw_day: toNullableNumber(raw.draw_day),
    start_date: toNullableString(raw.start_date),
    status: normalizeBatchStatus(raw.status),
    created_at: toNullableString(raw.created_at),
  };
}

function normalizeBatchSummary(raw: Record<string, unknown>): BatchSummaryRecord {
  return {
    id: toNumber(raw.id),
    batch_code: String(raw.batch_code ?? raw.code ?? `BATCH-${raw.id ?? "?"}`),
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
    monthly_booked_value: String(raw.monthly_booked_value ?? "0.00"),
    draw_count: toNumber(raw.draw_count),
  };
}

function normalizeGenerateLuckyIdsResponse(
  raw: Record<string, unknown>,
  batch: BatchDetailRecord | null,
  existingCount: number
): GenerateLuckyIdsResponse {
  const batchId = toNumber(raw.batch_id ?? raw.batch ?? batch?.id);
  const batchCode =
    String(raw.batch_code ?? batch?.batch_code ?? `BATCH-${batchId || "?"}`) || "";
  const createdCount = toNumber(
    raw.created_count ?? raw.created ?? raw.generated_count,
    0
  );
  const skippedCount = toNumber(
    raw.skipped_count ?? raw.skipped ?? raw.existing_skipped,
    0
  );
  const totalSlots = toNumber(raw.total_slots ?? batch?.total_slots, 0);
  const computedExistingCount =
    toNumber(raw.existing_count ?? raw.current_count, existingCount) || existingCount;

  const message =
    typeof raw.message === "string" && raw.message.trim()
      ? raw.message
      : createdCount > 0
      ? `${createdCount} Lucky IDs generated successfully.`
      : "No new Lucky IDs were generated.";

  return {
    batch_id: batchId,
    batch_code: batchCode,
    created_count: createdCount,
    skipped_count: skippedCount,
    existing_count: computedExistingCount,
    total_slots: totalSlots,
    message,
  };
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to process Lucky ID generation.";

  const raw = error.message.trim();
  if (!raw) return "Failed to process Lucky ID generation.";

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

export default function AdminBatchGenerateLuckyIdsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const batchId = params?.id;

  const [batch, setBatch] = useState<BatchDetailRecord | null>(null);
  const [summary, setSummary] = useState<BatchSummaryRecord | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<GenerateLuckyIdsResponse | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!batchId) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [detailPayload, summaryPayload] = await Promise.all([
          apiFetch<Record<string, unknown>>(`/admin/batches/${batchId}/`),
          apiFetch<Record<string, unknown>>(`/admin/batches/${batchId}/summary/`),
        ]);

        setBatch(normalizeBatchDetail(detailPayload));
        setSummary(normalizeBatchSummary(summaryPayload));
        setError(null);
      } catch (err) {
        setError(parseErrorMessage(err));
        setBatch(null);
        setSummary(null);
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

  const luckyIdsCreated = useMemo(() => {
    if (!summary) return 0;
    return (
      summary.available_lucky_ids +
      summary.assigned_lucky_ids +
      summary.won_lucky_ids
    );
  }, [summary]);

  const missingLuckyIds = useMemo(() => {
    if (!batch) return 0;
    return Math.max(batch.total_slots - luckyIdsCreated, 0);
  }, [batch, luckyIdsCreated]);

  const overAllocatedCount = useMemo(() => {
    if (!batch) return 0;
    return Math.max(luckyIdsCreated - batch.total_slots, 0);
  }, [batch, luckyIdsCreated]);

  const canGenerate = useMemo(() => {
    if (!batch || !summary) return false;

    const statusOk = batch.status === "DRAFT" || batch.status === "OPEN";
    const notOverAllocated = overAllocatedCount === 0;
    const hasMissing = missingLuckyIds > 0;
    const noWonIds = summary.won_lucky_ids === 0;

    return statusOk && notOverAllocated && hasMissing && noWonIds;
  }, [batch, summary, missingLuckyIds, overAllocatedCount]);

  async function handleGenerateLuckyIds() {
    if (!batchId || !batch) return;

    setGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = await apiFetch<Record<string, unknown>>(
        `/admin/batches/${batchId}/generate-lucky-ids/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: "fill_missing",
          }),
        }
      );

      const normalized = normalizeGenerateLuckyIdsResponse(
        payload,
        batch,
        luckyIdsCreated
      );

      setSuccess(normalized);
      await loadPage("refresh");
    } catch (err) {
      setError(parseErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <PortalPage
      title={
        batch?.batch_code
          ? `Generate Lucky IDs · ${batch.batch_code}`
          : `Generate Lucky IDs · Batch #${batchId ?? "—"}`
      }
      subtitle="Prepare missing Lucky IDs for one batch only. This page is batch-scoped and should never generate cross-batch records."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Batches", href: "/admin/batches" },
        {
          label: batch?.batch_code || `Batch #${batchId ?? "—"}`,
          href: batchId ? `/admin/batches/${batchId}` : "/admin/batches",
        },
        { label: "Generate Lucky IDs" },
      ]}
      actions={[
        {
          href: batchId ? `/admin/batches/${batchId}` : "/admin/batches",
          label: "Back to Batch",
          variant: "secondary",
        },
        {
          href: batchId ? `/admin/batches/${batchId}/edit` : "/admin/batches",
          label: "Edit Batch",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Total Slots",
          value: batch ? String(batch.total_slots) : "—",
        },
        {
          label: "Lucky IDs Created",
          value: String(luckyIdsCreated),
        },
        {
          label: "Missing Lucky IDs",
          value: String(missingLuckyIds),
          tone: missingLuckyIds > 0 ? "warning" : "success",
        },
        {
          label: "Assigned Lucky IDs",
          value: summary ? String(summary.assigned_lucky_ids) : "—",
        },
      ]}
      statusBadge={{
        label: batch?.status || "Lucky ID Preparation",
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
            disabled={refreshing || loading || generating}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading batch Lucky ID preparation..." /> : null}

        {!loading && error && !batch ? (
          <ErrorState
            title="Unable to load generation workspace"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !batch ? (
          <EmptyState
            title="Batch not available"
            description="The requested batch could not be loaded."
          />
        ) : null}

        {!loading && batch && summary ? (
          <>
            <SectionCard
              title="Batch preparation summary"
              description="Lucky ID generation must remain batch-scoped, duplicate-safe, and aligned to total slot capacity."
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <DetailValue label="Batch Code" value={batch.batch_code} />
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
                <DetailValue label="Start Date" value={formatDate(batch.start_date)} />
                <DetailValue label="Created At" value={formatDateTime(batch.created_at)} />
                <DetailValue label="Total Slots" value={String(batch.total_slots)} />
                <DetailValue label="Duration" value={`${batch.duration_months} months`} />
                <DetailValue
                  label="Draw Day"
                  value={batch.draw_day != null ? String(batch.draw_day) : "—"}
                />
                <DetailValue
                  label="Monthly Booked Value"
                  value={money(summary.monthly_booked_value)}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Lucky ID generation state"
              description="Review current coverage before generating missing Lucky IDs."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue
                  label="Available Lucky IDs"
                  value={String(summary.available_lucky_ids)}
                />
                <DetailValue
                  label="Assigned Lucky IDs"
                  value={String(summary.assigned_lucky_ids)}
                />
                <DetailValue label="Won Lucky IDs" value={String(summary.won_lucky_ids)} />
                <DetailValue label="Draw Records" value={String(summary.draw_count)} />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue label="Lucky IDs Created" value={String(luckyIdsCreated)} />
                <DetailValue label="Missing Lucky IDs" value={String(missingLuckyIds)} />
                <DetailValue
                  label="Over Allocation"
                  value={String(overAllocatedCount)}
                />
                <DetailValue
                  label="Subscriptions"
                  value={String(summary.subscription_count)}
                />
              </div>

              {overAllocatedCount > 0 ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  This batch is over-allocated by {overAllocatedCount} Lucky IDs.
                  Do not generate new Lucky IDs until the data inconsistency is
                  corrected.
                </div>
              ) : null}

              {summary.won_lucky_ids > 0 ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  This batch already contains won Lucky IDs. Additional generation
                  should be avoided unless your backend explicitly supports a
                  controlled correction workflow.
                </div>
              ) : null}

              {missingLuckyIds === 0 && overAllocatedCount === 0 ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  This batch already has full Lucky ID coverage. No further
                  generation is needed.
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Generate missing Lucky IDs"
              description="This action should create only the missing Lucky IDs for this batch and skip existing numbers safely."
            >
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                Recommended backend behavior: generate only missing Lucky IDs up to
                batch `total_slots`, skip duplicates, and return created/skipped
                counts.
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleGenerateLuckyIds}
                  disabled={!canGenerate || generating}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generating ? "Generating..." : "Generate Missing Lucky IDs"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    router.push(batchId ? `/admin/batches/${batchId}` : "/admin/batches")
                  }
                  disabled={generating}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Back to Batch
                </button>
              </div>

              {!canGenerate ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Generation is currently blocked. Batch must be DRAFT or OPEN,
                  missing Lucky IDs must exist, over-allocation must be zero, and
                  won IDs should not already exist.
                </div>
              ) : null}
            </SectionCard>

            {error ? (
              <ErrorState
                title="Lucky ID generation failed"
                description={error}
              />
            ) : null}

            {success ? (
              <SectionCard
                title="Generation result"
                description="Backend confirmed the Lucky ID generation attempt for this batch."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <DetailValue label="Batch Code" value={success.batch_code} />
                  <DetailValue label="Created" value={String(success.created_count)} />
                  <DetailValue label="Skipped" value={String(success.skipped_count)} />
                  <DetailValue
                    label="Existing Count"
                    value={String(success.existing_count)}
                  />
                </div>

                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {success.message}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/batches/${success.batch_id}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Batch Detail
                  </Link>

                  <Link
                    href="/admin/lucky-ids"
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Lucky ID Register
                  </Link>
                </div>
              </SectionCard>
            ) : null}
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}