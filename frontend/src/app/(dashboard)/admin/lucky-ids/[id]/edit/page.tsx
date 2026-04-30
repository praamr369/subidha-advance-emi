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
import StatusBadge from "@/components/ui/status-badge";
import { DetailPanel, FormSection } from "@/components/ui/operations";
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

type FieldErrors = Partial<Record<"status", string>>;

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

    const value = parsed.status;
    if (Array.isArray(value) && value.length > 0) {
      next.status = String(value[0]);
    } else if (typeof value === "string" && value.trim()) {
      next.status = value;
    }

    return next;
  } catch {
    return {};
  }
}

function nextAllowedCorrectionStatuses(
  luckyId: LuckyIdDetailRecord | null
): LuckyIdStatus[] {
  if (!luckyId) return [];

  const assignedLike =
    luckyId.status === "ASSIGNED" ||
    luckyId.status === "WON" ||
    luckyId.status === "DRAWN" ||
    luckyId.status === "WINNER";

  const hasLinkage = Boolean(luckyId.subscription_id || luckyId.customer_name);

  if (assignedLike && hasLinkage) {
    return [];
  }

  if (luckyId.status === "WON" || luckyId.status === "DRAWN" || luckyId.status === "WINNER") {
    return [];
  }

  const options: LuckyIdStatus[] = ["AVAILABLE", "BLOCKED", "CANCELLED"];

  if (luckyId.status === "ASSIGNED" && !hasLinkage) {
    options.unshift("ASSIGNED");
  }

  return Array.from(new Set(options.filter((value) => value !== "UNKNOWN")));
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

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

export default function AdminLuckyIdEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const luckyIdId = params?.id;

  const [luckyId, setLuckyId] = useState<LuckyIdDetailRecord | null>(null);
  const [batchPreview, setBatchPreview] = useState<BatchPreview | null>(null);
  const [subscriptionPreview, setSubscriptionPreview] =
    useState<SubscriptionPreview | null>(null);

  const [targetStatus, setTargetStatus] = useState<LuckyIdStatus | "">("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        setTargetStatus("");
        setFieldErrors({});
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

  const hasLinkage = useMemo(() => {
    if (!luckyId) return false;
    return Boolean(luckyId.subscription_id || luckyId.customer_name);
  }, [luckyId]);

  const allowedStatuses = useMemo(
    () => nextAllowedCorrectionStatuses(luckyId),
    [luckyId]
  );

  const canCorrectStatus = useMemo(
    () => Boolean(luckyId) && allowedStatuses.length > 0,
    [luckyId, allowedStatuses]
  );

  async function handleSaveStatus() {
    if (!luckyId || !luckyIdId || !targetStatus) return;

    setSaving(true);
    setFieldErrors({});
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedPayload = await apiFetch<Record<string, unknown>>(
        `/admin/lucky-ids/${luckyIdId}/`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: targetStatus,
          }),
        }
      );

      const normalized = normalizeLuckyIdDetail(updatedPayload);
      setLuckyId(normalized);
      setTargetStatus("");
      setSuccessMessage(`Lucky ID status updated to ${normalized.status}.`);
      await loadPage("refresh");
    } catch (err) {
      setFieldErrors(parseFieldErrors(err));
      setError(parseErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalPage
      title={
        luckyId
          ? `Edit Lucky ID ${formatLuckyNumber(luckyId.lucky_number)}`
          : `Edit Lucky ID #${luckyIdId ?? "—"}`
      }
      subtitle="Controlled correction page for Lucky ID administrative status adjustments and linkage review."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Lucky IDs", href: "/admin/lucky-ids" },
        {
          label: luckyId ? formatLuckyNumber(luckyId.lucky_number) : `Lucky ID #${luckyIdId ?? "—"}`,
          href: luckyIdId ? `/admin/lucky-ids/${luckyIdId}` : "/admin/lucky-ids",
        },
        { label: "Edit" },
      ]}
      actions={[
        {
          href: luckyIdId ? `/admin/lucky-ids/${luckyIdId}` : "/admin/lucky-ids",
          label: "Back to Detail",
          variant: "secondary",
        },
        {
          href: "/admin/lucky-ids",
          label: "Back to Register",
          variant: "secondary",
        },
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
          value: hasLinkage ? "Present" : isAssignedState ? "Missing" : "Not required",
          tone: hasLinkage ? "success" : isAssignedState ? "danger" : undefined,
        },
      ]}
      statusBadge={{
        label: luckyId?.status || "Lucky ID Edit",
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
            disabled={refreshing || loading || saving}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading Lucky ID edit workspace..." /> : null}

        {!loading && error && !luckyId ? (
          <ErrorState
            title="Unable to load Lucky ID edit page"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !luckyId ? (
          <EmptyState
            title="Lucky ID not available"
            description="The requested Lucky ID could not be loaded."
          />
        ) : null}

        {!loading && luckyId ? (
          <>
            <DetailPanel
              title="Correction rule"
              description="Lucky ID linkage is derived from the subscription workflow, not edited directly here. This page should be used only for controlled administrative status correction."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue label="Current Status" value={<StatusBadge status={luckyId.status} />} />
                <DetailValue
                  label="Allowed Corrections"
                  value={allowedStatuses.length > 0 ? allowedStatuses.join(", ") : "No direct correction allowed"}
                />
                <DetailValue
                  label="Assigned-State"
                  value={isAssignedState ? "Yes" : "No"}
                />
                <DetailValue
                  label="Visible Linkage"
                  value={hasLinkage ? "Present" : "Missing"}
                />
              </div>
            </DetailPanel>

            {isAssignedState && hasLinkage ? (
              <DetailPanel
                title="Status editing locked"
                description="This Lucky ID is already linked to a visible contract context."
              >
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Do not correct this Lucky ID directly. Fix assignment issues through the linked subscription workflow to preserve financial and audit integrity.
                </div>
              </DetailPanel>
            ) : null}

            {isAssignedState && !hasLinkage ? (
              <DetailPanel
                title="Integrity alert"
                description="This Lucky ID is assigned-like but visible linkage is missing."
              >
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  This row may need administrative correction. If no subscription truly exists, moving it back to AVAILABLE or blocking it may be appropriate after verification.
                </div>
              </DetailPanel>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-2">
              <DetailPanel
                title="Lucky ID overview"
                description="Primary record snapshot for this Lucky ID."
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
                    value={<StatusBadge status={luckyId.status} />}
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

              <FormSection
                title="Status correction"
                description="Use only for controlled administrative correction. Batch ownership and Lucky number are immutable and not editable here."
              >
                {canCorrectStatus ? (
                  <div className="grid gap-4">
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
                          setTargetStatus(event.target.value as LuckyIdStatus);
                          setError(null);
                          setSuccessMessage(null);
                        }}
                        disabled={saving}
                        className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="">Select corrected status</option>
                        {allowedStatuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <FieldError message={fieldErrors.status} />
                    </div>

                    <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                      Use AVAILABLE to reopen the Lucky ID for clean reassignment, BLOCKED to prevent intake on this number, or CANCELLED only if your current business process accepts that state.
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleSaveStatus}
                        disabled={!targetStatus || saving}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saving ? "Saving..." : "Save Status"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTargetStatus("");
                          setError(null);
                          setSuccessMessage(null);
                          setFieldErrors({});
                        }}
                        disabled={saving}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="No direct status correction available"
                    description="This Lucky ID should be reviewed through its linked subscription or winner workflow rather than corrected directly here."
                  />
                )}
              </FormSection>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <DetailPanel
                title="Batch context"
                description="Batch ownership for this Lucky ID."
              >
                {batchPreview ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailValue label="Batch Code" value={batchPreview.batch_code} />
                    <DetailValue
                      label="Status"
                      value={<StatusBadge status={batchPreview.status} />}
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
                  <EmptyState
                    title="Batch preview unavailable"
                    description="Batch preview could not be loaded for this Lucky ID."
                  />
                )}
              </DetailPanel>

              <DetailPanel
                title="Linked contract context"
                description="Subscription preview when this Lucky ID is attached to a contract."
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
                      value={<StatusBadge status={subscriptionPreview.status} />}
                    />
                    <DetailValue
                      label="Total Amount"
                      value={money(subscriptionPreview.total_amount)}
                    />
                    <DetailValue
                      label="Monthly Amount"
                      value={money(subscriptionPreview.monthly_amount)}
                    />
                    <DetailValue
                      label="Start Date"
                      value={formatDate(subscriptionPreview.start_date)}
                    />
                  </div>
                ) : (
                  <EmptyState
                    title="No linked contract preview"
                    description="This Lucky ID does not currently resolve to a visible subscription preview."
                  />
                )}
              </DetailPanel>
            </section>

            {error ? (
              <ErrorState
                title="Unable to update Lucky ID"
                description={error}
              />
            ) : null}

            {successMessage ? (
              <DetailPanel
                title="Update successful"
                description="Lucky ID status correction was saved successfully."
              >
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {successMessage}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/lucky-ids/${luckyId.id}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Lucky ID Detail
                  </Link>

                  <Link
                    href="/admin/lucky-ids"
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Back to Register
                  </Link>
                </div>
              </DetailPanel>
            ) : null}

            <DetailPanel
              title="Administrative correction note"
              description="Use this page sparingly. For linked contract issues, correct the subscription workflow instead of forcing Lucky ID state changes directly."
            >
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    router.push(luckyIdId ? `/admin/lucky-ids/${luckyIdId}` : "/admin/lucky-ids")
                  }
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Back to Detail
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTargetStatus("");
                    setError(null);
                    setSuccessMessage(null);
                    setFieldErrors({});
                  }}
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