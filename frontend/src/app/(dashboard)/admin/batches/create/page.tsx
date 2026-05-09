"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import FormActions from "@/components/ui/FormActions";
import PortalPage from "@/components/ui/PortalPage";
import { DetailItem as DetailValue, WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";

type BatchCreateStatus = "DRAFT" | "OPEN";

type CreatedBatchResponse = {
  id: number;
  batch_code?: string | null;
  total_slots?: number | string | null;
  duration_months?: number | string | null;
  draw_day?: number | string | null;
  start_date?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type FieldErrors = Partial<
  Record<
    "batch_code" | "total_slots" | "duration_months" | "draw_day" | "start_date" | "status",
    string
  >
>;

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to create batch.";

  const raw = error.message.trim();
  if (!raw) return "Failed to create batch.";

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

    setField("batch_code");
    setField("total_slots");
    setField("duration_months");
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

export default function AdminBatchCreatePage() {
  const [batchCode, setBatchCode] = useState("");
  const [totalSlots, setTotalSlots] = useState("100");
  const [durationMonths, setDurationMonths] = useState("15");
  const [drawDay, setDrawDay] = useState("5");
  const [startDate, setStartDate] = useState("");
  const [status, setStatus] = useState<BatchCreateStatus>("DRAFT");

  const [saving, setSaving] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [created, setCreated] = useState<CreatedBatchResponse | null>(null);

  const trimmedBatchCode = batchCode.trim().toUpperCase();
  const totalSlotsValue = useMemo(() => Number(totalSlots), [totalSlots]);
  const durationValue = useMemo(() => Number(durationMonths), [durationMonths]);
  const drawDayValue = useMemo(() => Number(drawDay), [drawDay]);
  const trimmedStartDate = startDate.trim();

  const canSave = useMemo(() => {
    return (
      trimmedBatchCode.length > 0 &&
      Number.isFinite(totalSlotsValue) &&
      totalSlotsValue > 0 &&
      Number.isFinite(durationValue) &&
      durationValue > 0 &&
      Number.isFinite(drawDayValue) &&
      drawDayValue >= 1 &&
      drawDayValue <= 28 &&
      trimmedStartDate.length > 0
    );
  }, [
    trimmedBatchCode,
    totalSlotsValue,
    durationValue,
    drawDayValue,
    trimmedStartDate,
  ]);

  function resetForm() {
    setBatchCode("");
    setTotalSlots("100");
    setDurationMonths("15");
    setDrawDay("5");
    setStartDate("");
    setStatus("DRAFT");
    setError(null);
    setFieldErrors({});
    setCreated(null);
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};

    if (!trimmedBatchCode) {
      next.batch_code = "Batch code is required.";
    }

    if (!totalSlots.trim()) {
      next.total_slots = "Total slots is required.";
    } else if (!Number.isFinite(totalSlotsValue) || totalSlotsValue <= 0) {
      next.total_slots = "Total slots must be greater than zero.";
    }

    if (!durationMonths.trim()) {
      next.duration_months = "Duration months is required.";
    } else if (!Number.isFinite(durationValue) || durationValue <= 0) {
      next.duration_months = "Duration months must be greater than zero.";
    }

    if (!drawDay.trim()) {
      next.draw_day = "Draw day is required.";
    } else if (!Number.isFinite(drawDayValue) || drawDayValue < 1 || drawDayValue > 28) {
      next.draw_day = "Draw day must be between 1 and 28.";
    }

    if (!trimmedStartDate) {
      next.start_date = "Start date is required.";
    }

    if (status === "OPEN" && totalSlotsValue !== 100) {
      next.status = "OPEN batch must have exactly 100 slots.";
      next.total_slots = "Open batch must have exactly 100 slots.";
    }

    return next;
  }

  async function handleSave() {
    setError(null);
    setCreated(null);

    const nextFieldErrors = validate();
    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) return;

    setSaving(true);
    setLoadingLabel("Creating batch and preparing Lucky Plan grouping...");

    try {
      const payload = await apiFetch<CreatedBatchResponse>("/admin/batches/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batch_code: trimmedBatchCode,
          total_slots: totalSlotsValue,
          duration_months: durationValue,
          draw_day: drawDayValue,
          start_date: trimmedStartDate,
          status,
        }),
      });

      setCreated(payload);
      setFieldErrors({});
    } catch (err) {
      setFieldErrors(parseFieldErrors(err));
      setError(parseErrorMessage(err));
    } finally {
      setSaving(false);
      setLoadingLabel(null);
    }
  }

  return (
    <PortalPage
      title="Create Batch"
      subtitle="Create a Lucky Plan batch with controlled slots, tenure, draw scheduling, and safe initial lifecycle state."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Batches", href: "/admin/batches" },
        { label: "Create" },
      ]}
      actions={[
        {
          href: "/admin/batches",
          label: "Back to Register",
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
          value: totalSlots || "—",
        },
        {
          label: "Duration",
          value: durationMonths || "—",
        },
        {
          label: "Draw Day",
          value: drawDay || "—",
        },
        {
          label: "Status",
          value: status,
        },
      ]}
      statusBadge={{
        label: "Batch Onboarding",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <SectionCard
          title="Batch rule"
          description="A batch is the operational container for Lucky IDs, subscriptions, draw scheduling, and lifecycle control."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailValue label="Core Role" value="Lucky Plan grouping" />
            <DetailValue label="Slots Rule" value="Use 100 for live Lucky Plan batches" />
            <DetailValue label="Draw Rule" value="Draw day must stay between 1 and 28" />
            <DetailValue label="Safe Default" value="Create as DRAFT first" />
          </div>
        </SectionCard>

        <section className="grid gap-6 xl:grid-cols-2">
          <SectionCard
            title="Batch fields"
            description="Define identity, slot capacity, tenure, draw day, and start date before subscriptions and Lucky IDs attach."
          >
            <div className="grid gap-4">
              <div>
                <label
                  htmlFor="batch-code"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Batch Code
                </label>
                <input
                  id="batch-code"
                  type="text"
                  value={batchCode}
                  onChange={(event) => {
                    setBatchCode(event.target.value.toUpperCase());
                    setError(null);
                  }}
                  placeholder="e.g. APRIL2026"
                  disabled={saving}
                  className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm uppercase outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
                <FieldError message={fieldErrors.batch_code} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    htmlFor="total-slots"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Total Slots
                  </label>
                  <input
                    id="total-slots"
                    type="number"
                    min="1"
                    step="1"
                    value={totalSlots}
                    onChange={(event) => {
                      setTotalSlots(event.target.value);
                      setError(null);
                    }}
                    placeholder="100"
                    disabled={saving}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <FieldError message={fieldErrors.total_slots} />
                </div>

                <div>
                  <label
                    htmlFor="duration-months"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Duration Months
                  </label>
                  <input
                    id="duration-months"
                    type="number"
                    min="1"
                    step="1"
                    value={durationMonths}
                    onChange={(event) => {
                      setDurationMonths(event.target.value);
                      setError(null);
                    }}
                    placeholder="15"
                    disabled={saving}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <FieldError message={fieldErrors.duration_months} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
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
                    }}
                    placeholder="5"
                    disabled={saving}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <FieldError message={fieldErrors.draw_day} />
                </div>

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
                    }}
                    disabled={saving}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <FieldError message={fieldErrors.start_date} />
                </div>
              </div>

              <div>
                <label
                  htmlFor="batch-status"
                  className="mb-2 block text-sm font-medium text-foreground"
                >
                  Initial Status
                </label>
                <select
                  id="batch-status"
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as BatchCreateStatus);
                    setError(null);
                  }}
                  disabled={saving}
                  className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="OPEN">OPEN</option>
                </select>
                <FieldError message={fieldErrors.status} />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Operational preview"
            description="Review the intended batch structure before saving it into daily Lucky Plan operations."
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailValue label="Batch Code" value={trimmedBatchCode || "—"} />
                  <DetailValue
                    label="Slots"
                    value={
                      Number.isFinite(totalSlotsValue) && totalSlotsValue > 0
                        ? String(totalSlotsValue)
                        : "—"
                    }
                  />
                  <DetailValue
                    label="Duration"
                    value={
                      Number.isFinite(durationValue) && durationValue > 0
                        ? `${durationValue} months`
                        : "—"
                    }
                  />
                  <DetailValue
                    label="Draw Day"
                    value={
                      Number.isFinite(drawDayValue) && drawDayValue >= 1 && drawDayValue <= 28
                        ? String(drawDayValue)
                        : "—"
                    }
                  />
                  <DetailValue label="Start Date" value={trimmedStartDate || "—"} />
                  <DetailValue label="Status" value={status} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recommended sequence
                </div>
                <div className="mt-2 text-sm text-foreground">
                  Create batch → generate or confirm Lucky IDs → move to OPEN if safe → activate when live intake begins.
                </div>
              </div>

              {!canSave ? (
                <EmptyState
                  title="Batch not ready"
                  description="Complete batch code, slots, duration, draw day, and start date before creating the batch."
                />
              ) : null}
            </div>
          </SectionCard>
        </section>

        {loadingLabel ? <LoadingBlock label={loadingLabel} /> : null}

        {error ? (
          <ErrorState
            title="Unable to create batch"
            description={error}
            onRetry={canSave ? handleSave : undefined}
          />
        ) : null}

        {created ? (
          <SectionCard
            title="Batch created"
            description="The batch was created successfully and is ready for detail review and downstream batch operations."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailValue label="Batch ID" value={`#${created.id}`} />
              <DetailValue
                label="Batch Code"
                value={created.batch_code || trimmedBatchCode}
              />
              <DetailValue
                label="Slots"
                value={String(toNumber(created.total_slots, totalSlotsValue))}
              />
              <DetailValue
                label="Status"
                value={String(created.status || status)}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/admin/batches/${created.id}`}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Open Batch
              </Link>

              <Link
                href="/admin/batches"
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Back to Register
              </Link>

              <Link
                href="/admin/subscriptions/advance-emi/create"
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Create Subscription
              </Link>

              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
              >
                Create Another
              </button>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard
          title="Create batch"
          description="Save only after confirming slot capacity, tenure, draw day, start date, and initial lifecycle state."
        >
          <FormActions
            align="between"
            submitLabel="Create Batch"
            submitLoadingLabel="Creating Batch..."
            onSubmitClick={handleSave}
            submitting={saving}
            submitDisabled={!canSave}
            cancel={{ label: "Cancel", href: "/admin/batches" }}
            extraActions={
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset Form
              </button>
            }
          />
        </SectionCard>
      </div>
    </PortalPage>
  );
}
