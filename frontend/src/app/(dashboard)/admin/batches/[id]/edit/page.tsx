"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import FormActions from "@/components/ui/FormActions";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { DetailPanel, FormSection } from "@/components/ui/operations";
import { DetailItem as DetailValue } from "@/components/ui/workspace";
import {
  BATCH_LIFECYCLE_TRANSITION_NOTE,
  type BatchStatus,
  type CanonicalBatchStatus,
  isLiveBatchStatus,
  nextAllowedBatchStatuses,
  normalizeBatchStatus,
} from "@/domains/batches/status";
import { apiFetch } from "@/lib/api";

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

type BatchSummary = {
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

type FieldErrors = Partial<Record<"draw_day" | "start_date" | "status", string>>;

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

function normalizeBatchSummary(raw: Record<string, unknown>): BatchSummary {
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

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed.";

  const raw = error.message.trim();
  if (!raw) return "Request failed.";

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

function parseFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof Error)) return {};

  const raw = error.message.trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: FieldErrors = {};

    const setField = (key: keyof FieldErrors) => {
      const value = parsed[key];
      if (Array.isArray(value) && value.length > 0) {
        next[key] = String(value[0]);
      } else if (typeof value === "string" && value.trim()) {
        next[key] = value;
      }
    };

    setField("draw_day");
    setField("start_date");
    setField("status");

    return next;
  } catch {
    return {};
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

export default function AdminBatchEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const batchId = params?.id;

  const [batch, setBatch] = useState<BatchDetailRecord | null>(null);
  const [summary, setSummary] = useState<BatchSummary | null>(null);

  const [drawDay, setDrawDay] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetStatus, setTargetStatus] = useState<CanonicalBatchStatus | "">("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingFields, setSavingFields] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

        const normalizedBatch = normalizeBatchDetail(detailPayload);
        const normalizedSummary = normalizeBatchSummary(summaryPayload);

        setBatch(normalizedBatch);
        setSummary(normalizedSummary);
        setDrawDay(
          normalizedBatch.draw_day != null ? String(normalizedBatch.draw_day) : ""
        );
        setStartDate(normalizedBatch.start_date ?? "");
        setTargetStatus("");
        setError(null);
        setFieldErrors({});
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

  const allowedStatuses = useMemo(
    () => (batch ? nextAllowedBatchStatuses(batch.status) : []),
    [batch]
  );

  const luckyCreatedCount = useMemo(() => {
    if (!summary) return 0;
    return (
      summary.available_lucky_ids +
      summary.assigned_lucky_ids +
      summary.won_lucky_ids
    );
  }, [summary]);

  const canEditCoreFields = useMemo(() => {
    if (!batch || !summary) return false;
    return (
      batch.status === "DRAFT" &&
      summary.subscription_count === 0 &&
      summary.assigned_lucky_ids === 0 &&
      summary.draw_count === 0
    );
  }, [batch, summary]);

  function resetForm() {
    if (!batch) return;
    setDrawDay(batch.draw_day != null ? String(batch.draw_day) : "");
    setStartDate(batch.start_date ?? "");
    setTargetStatus("");
    setFieldErrors({});
    setError(null);
    setSuccessMessage(null);
  }

  async function handleSaveFields() {
    if (!batchId || !batch) return;

    setError(null);
    setSuccessMessage(null);

    const nextFieldErrors: FieldErrors = {};
    const numericDrawDay = Number(drawDay);

    if (!drawDay.trim()) {
      nextFieldErrors.draw_day = "Draw day is required.";
    } else if (
      !Number.isFinite(numericDrawDay) ||
      numericDrawDay < 1 ||
      numericDrawDay > 28
    ) {
      nextFieldErrors.draw_day = "Draw day must be between 1 and 28.";
    }

    if (!startDate.trim()) {
      nextFieldErrors.start_date = "Start date is required.";
    }

    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setSavingFields(true);

    try {
      const updated = await apiFetch<Record<string, unknown>>(
        `/admin/batches/${batchId}/`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draw_day: numericDrawDay,
            start_date: startDate,
          }),
        }
      );

      const normalized = normalizeBatchDetail(updated);
      setBatch(normalized);
      setDrawDay(normalized.draw_day != null ? String(normalized.draw_day) : "");
      setStartDate(normalized.start_date ?? "");
      setFieldErrors({});
      setSuccessMessage("Batch operational fields updated successfully.");
      await loadPage("refresh");
    } catch (err) {
      setFieldErrors(parseFieldErrors(err));
      setError(parseErrorMessage(err));
    } finally {
      setSavingFields(false);
    }
  }

  async function handleTransitionStatus() {
    if (!batchId || !targetStatus) return;

    setError(null);
    setSuccessMessage(null);
    setFieldErrors({});

    setSavingStatus(true);

    try {
      await apiFetch<Record<string, unknown>>(
        `/admin/batches/${batchId}/transition-status/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: targetStatus }),
        }
      );

      setSuccessMessage(`Batch status changed to ${targetStatus}.`);
      setTargetStatus("");
      await loadPage("refresh");
    } catch (err) {
      setFieldErrors(parseFieldErrors(err));
      setError(parseErrorMessage(err));
    } finally {
      setSavingStatus(false);
    }
  }

  return (
    <PortalPage
      title={
        batch?.batch_code
          ? `Edit ${batch.batch_code}`
          : `Edit Batch #${batchId ?? "—"}`
      }
      subtitle="Controlled batch edit workspace for safe operational field changes and guarded status transitions."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Batches", href: "/admin/batches" },
        {
          label: batch?.batch_code || `Batch #${batchId ?? "—"}`,
          href: batchId ? `/admin/batches/${batchId}` : "/admin/batches",
        },
        { label: "Edit" },
      ]}
      actions={[
        {
          href: batchId ? `/admin/batches/${batchId}` : "/admin/batches",
          label: "Back to Batch",
          variant: "secondary",
        },
        {
          href: "/admin/batches",
          label: "Back to Register",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Total Slots",
          value: summary ? String(summary.total_slots) : "—",
        },
        {
          label: "Lucky IDs Created",
          value: String(luckyCreatedCount),
        },
        {
          label: "Assigned Lucky IDs",
          value: summary ? String(summary.assigned_lucky_ids) : "—",
          tone: summary && summary.assigned_lucky_ids > 0 ? "success" : undefined,
        },
        {
          label: "Subscriptions",
          value: summary ? String(summary.subscription_count) : "—",
        },
      ]}
      statusBadge={{
        label: batch?.status || "Batch Edit",
        tone: batch?.status && isLiveBatchStatus(batch.status) ? "success" : "info",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading || savingFields || savingStatus}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading batch edit workspace..." /> : null}

        {!loading && error && !batch ? (
          <ErrorState
            title="Unable to load batch edit page"
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
            <DetailPanel
              title="Transition rules"
              description="Status cannot be edited freely. Backend rules protect live Lucky Plan operations and prevent unsafe lifecycle jumps."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue
                  label="Current Status"
                  value={<StatusBadge status={String(batch.status)} />}
                />
                <DetailValue
                  label="Allowed Next Statuses"
                  value={
                    allowedStatuses.length > 0
                      ? allowedStatuses.join(", ")
                      : "No further transition"
                  }
                />
                <DetailValue
                  label="Lucky IDs Created"
                  value={String(luckyCreatedCount)}
                />
                <DetailValue
                  label="Lifecycle Rule"
                  value="Use the enum-backed transition sequence only"
                />
              </div>
            </DetailPanel>

            <section className="grid gap-6 xl:grid-cols-2">
              <DetailPanel
                title="Batch summary"
                description="Read-only live metrics used to decide whether status change or field update is safe."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                <DetailValue label="Batch Code" value={batch.batch_code} />
                <DetailValue
                  label="Status"
                  value={<StatusBadge status={batch.status} />}
                />
                  <DetailValue label="Total Slots" value={String(summary.total_slots)} />
                  <DetailValue
                    label="Duration"
                    value={`${summary.duration_months} months`}
                  />
                  <DetailValue
                    label="Start Date"
                    value={formatDate(summary.start_date)}
                  />
                  <DetailValue
                    label="Draw Day"
                    value={summary.draw_day != null ? String(summary.draw_day) : "—"}
                  />
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
                    label="Monthly Booked Value"
                    value={money(summary.monthly_booked_value)}
                  />
                  <DetailValue
                    label="Draw Records"
                    value={String(summary.draw_count)}
                  />
                  <DetailValue
                    label="Created At"
                    value={formatDateTime(batch.created_at)}
                  />
                </div>
              </DetailPanel>

              <FormSection
                title="Operational field update"
                description="Only limited batch fields should be edited. This page locks core edits once the batch is no longer in a safe pre-live state."
              >
                {canEditCoreFields ? (
                  <div className="grid gap-4">
                    <div>
                      <label
                        htmlFor="start-date"
                        className="mb-2 block text-sm font-medium text-foreground"
                      >
                        Start Date
                      </label>
                      <input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(event) => {
                          setStartDate(event.target.value);
                          setError(null);
                          setSuccessMessage(null);
                        }}
                        disabled={savingFields}
                        className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <FieldError message={fieldErrors.start_date} />
                    </div>

                    <div>
                      <label
                        htmlFor="draw-day"
                        className="mb-2 block text-sm font-medium text-foreground"
                      >
                        Draw Day
                      </label>
                      <input
                        id="draw-day"
                        type="number"
                        min="1"
                        max="28"
                        step="1"
                        value={drawDay}
                        onChange={(event) => {
                          setDrawDay(event.target.value);
                          setError(null);
                          setSuccessMessage(null);
                        }}
                        disabled={savingFields}
                        className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <FieldError message={fieldErrors.draw_day} />
                    </div>

                    <FormActions
                      align="between"
                      submitLabel="Save Batch Fields"
                      submitLoadingLabel="Saving Batch Fields..."
                      onSubmitClick={handleSaveFields}
                      submitting={savingFields}
                      extraActions={
                        <button
                          type="button"
                          onClick={resetForm}
                          disabled={savingFields}
                          className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Reset
                        </button>
                      }
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Core batch field editing is locked because this batch is no
                    longer in a safe pre-live state. Use status transition only.
                  </div>
                )}
              </FormSection>
            </section>

            <FormSection
              title="Status transition"
              description="Use the guarded transition endpoint instead of direct free-form status patching."
            >
              {allowedStatuses.length === 0 ? (
                <EmptyState
                  title="No further transition"
                  description="This batch currently has no allowed next status."
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                  <div>
                    <label
                      htmlFor="target-status"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Target Status
                    </label>
                    <select
                      id="target-status"
                      value={targetStatus}
                      onChange={(event) => {
                        setTargetStatus(event.target.value as CanonicalBatchStatus);
                        setError(null);
                        setSuccessMessage(null);
                      }}
                      disabled={savingStatus}
                      className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">Select next status</option>
                      {allowedStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <FieldError message={fieldErrors.status} />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleTransitionStatus}
                      disabled={!targetStatus || savingStatus}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {savingStatus ? "Changing..." : "Change Status"}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                {BATCH_LIFECYCLE_TRANSITION_NOTE}
              </div>
            </FormSection>

            {error ? (
              <ErrorState title="Unable to update batch" description={error} />
            ) : null}

            {successMessage ? (
              <DetailPanel
                title="Update successful"
                description="Batch operations were updated successfully."
              >
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {successMessage}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/batches/${batch.id}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Batch Detail
                  </Link>

                  <Link
                    href="/admin/batches"
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Back to Register
                  </Link>
                </div>
              </DetailPanel>
            ) : null}

            <DetailPanel
              title="Batch edit workflow"
              description="This page completes the batch operations module by adding safe mutation control on top of register, create, and detail pages."
            >
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    router.push(batchId ? `/admin/batches/${batchId}` : "/admin/batches")
                  }
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Back to Detail
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Reset Workspace
                </button>
              </div>
            </DetailPanel>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
