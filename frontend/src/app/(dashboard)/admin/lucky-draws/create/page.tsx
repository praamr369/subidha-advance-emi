"use client";
import { formatRupee } from "@/lib/utils/currency";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { apiFetch, toArray } from "@/lib/api";

type BatchStatus =
  | "DRAFT"
  | "OPEN"
  | "FULL"
  | "DRAW_IN_PROGRESS"
  | "CLOSED"
  | "COMPLETED"
  | "UNKNOWN";

type BatchOption = {
  id: number;
  batch_code: string;
  status: BatchStatus;
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

type CreateCommitResponse = {
  id: number;
  batch: number;
  draw_month: number | null;
  committed_hash: string | null;
  admin_seed_store_securely: string | null;
  is_revealed: boolean;
};

type PersistedCommitRecord = {
  id: number;
  batch: number;
  draw_month: number | null;
  committed_hash: string | null;
  admin_seed_store_securely: string | null;
  is_revealed: boolean;
  saved_at: string;
};

const LATEST_COMMIT_STORAGE_KEY = "subidha:lucky-draw:latest-commit";

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : value === null ? null : null;
}

function normalizeBatchStatus(value: unknown): BatchStatus {
  const status = String(value ?? "").toUpperCase();

  if (
    status === "DRAFT" ||
    status === "OPEN" ||
    status === "FULL" ||
    status === "DRAW_IN_PROGRESS" ||
    status === "CLOSED" ||
    status === "COMPLETED"
  ) {
    return status;
  }

  return "UNKNOWN";
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

function formatDrawMonth(value: number | null | undefined): string {
  if (value == null) return "—";
  return `Month ${value}`;
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to create draw commitment.";

  const raw = error.message.trim();
  if (!raw) return "Failed to create draw commitment.";

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

function normalizeBatchOption(raw: Record<string, unknown>): BatchOption {
  return {
    id: toNumber(raw.id),
    batch_code:
      toStringValue(raw.batch_code).trim() ||
      toStringValue(raw.code).trim() ||
      `BATCH-${String(raw.id ?? "")}`,
    status: normalizeBatchStatus(raw.status),
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
    monthly_booked_value: String(raw.monthly_booked_value ?? "0.00"),
    draw_count: toNumber(raw.draw_count),
  };
}

function normalizeCreateCommitResponse(
  raw: Record<string, unknown>
): CreateCommitResponse {
  return {
    id: toNumber(raw.id),
    batch: toNumber(raw.batch),
    draw_month:
      toNullableNumber(raw.draw_month) ??
      toNullableNumber(raw.month),
    committed_hash:
      toNullableString(raw.committed_hash) ??
      toNullableString(raw.commit_hash) ??
      null,
    admin_seed_store_securely:
      toNullableString(raw.admin_seed_store_securely) ??
      toNullableString(raw.secret_seed) ??
      null,
    is_revealed:
      raw.is_revealed === true ||
      String(raw.is_revealed ?? "").toLowerCase() === "true",
  };
}

function batchToneClass(status: BatchStatus): string {
  switch (status) {
    case "OPEN":
    case "FULL":
    case "DRAW_IN_PROGRESS":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "DRAFT":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "CLOSED":
    case "COMPLETED":
      return "border-slate-200 bg-slate-100 text-muted-foreground";
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
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
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

function storageKeyForDraw(drawId: number): string {
  return `subidha:lucky-draw:commit:${drawId}`;
}

function persistCommit(result: CreateCommitResponse) {
  if (typeof window === "undefined") return;

  const payload: PersistedCommitRecord = {
    ...result,
    saved_at: new Date().toISOString(),
  };

  const serialized = JSON.stringify(payload);
  window.sessionStorage.setItem(LATEST_COMMIT_STORAGE_KEY, serialized);
  window.sessionStorage.setItem(storageKeyForDraw(result.id), serialized);
}

function loadPersistedLatestCommit(): PersistedCommitRecord | null {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(LATEST_COMMIT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PersistedCommitRecord;
    if (
      typeof parsed.id === "number" &&
      typeof parsed.batch === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function clearPersistedLatestCommit() {
  if (typeof window === "undefined") return;

  const existing = loadPersistedLatestCommit();
  if (existing?.id) {
    window.sessionStorage.removeItem(storageKeyForDraw(existing.id));
  }
  window.sessionStorage.removeItem(LATEST_COMMIT_STORAGE_KEY);
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export default function AdminLuckyDrawCreatePage() {
  const [batchOptions, setBatchOptions] = useState<BatchOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [selectedBatchSummary, setSelectedBatchSummary] =
    useState<BatchSummaryRecord | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateCommitResponse | null>(null);
  const [persistedCommit, setPersistedCommit] = useState<PersistedCommitRecord | null>(null);

  const [seedCopied, setSeedCopied] = useState(false);
  const [hashCopied, setHashCopied] = useState(false);

  async function loadBatches(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await apiFetch<unknown>("/admin/batches/");
      const rows = toArray<Record<string, unknown>>(payload)
        .map(normalizeBatchOption)
        .sort((a, b) => a.batch_code.localeCompare(b.batch_code));

      setBatchOptions(rows);
      setError(null);
    } catch (err) {
      setError(parseErrorMessage(err));
      if (mode === "initial") {
        setBatchOptions([]);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadBatches("initial");
    setPersistedCommit(loadPersistedLatestCommit());
  }, []);

  useEffect(() => {
    async function loadSummary() {
      if (!selectedBatchId) {
        setSelectedBatchSummary(null);
        return;
      }

      setSummaryLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const payload = await apiFetch<Record<string, unknown>>(
          `/admin/batches/${selectedBatchId}/summary/`
        );
        setSelectedBatchSummary(normalizeBatchSummary(payload));
      } catch (err) {
        setSelectedBatchSummary(null);
        setError(parseErrorMessage(err));
      } finally {
        setSummaryLoading(false);
      }
    }

    void loadSummary();
  }, [selectedBatchId]);

  const luckyIdsCreated = useMemo(() => {
    if (!selectedBatchSummary) return 0;
    return (
      selectedBatchSummary.available_lucky_ids +
      selectedBatchSummary.assigned_lucky_ids +
      selectedBatchSummary.won_lucky_ids
    );
  }, [selectedBatchSummary]);

  const likelyReadyForCommit = useMemo(() => {
    if (!selectedBatchSummary) return false;
    return (
      selectedBatchSummary.total_slots > 0 &&
      luckyIdsCreated === selectedBatchSummary.total_slots &&
      selectedBatchSummary.draw_count < selectedBatchSummary.duration_months
    );
  }, [selectedBatchSummary, luckyIdsCreated]);

  async function handleCreateCommit() {
    if (!selectedBatchId) return;

    setCreating(true);
    setError(null);
    setSuccess(null);
    setSeedCopied(false);
    setHashCopied(false);

    try {
      const payload = await apiFetch<Record<string, unknown>>(
        `/admin/batches/${selectedBatchId}/create-commit/`,
        {
          method: "POST",
        }
      );

      const normalized = normalizeCreateCommitResponse(payload);
      setSuccess(normalized);
      persistCommit(normalized);
      setPersistedCommit(loadPersistedLatestCommit());
    } catch (err) {
      setError(parseErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleCopySeed(value: string | null) {
    if (!value) return;
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setSeedCopied(true);
      window.setTimeout(() => setSeedCopied(false), 1800);
    }
  }

  async function handleCopyHash(value: string | null) {
    if (!value) return;
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setHashCopied(true);
      window.setTimeout(() => setHashCopied(false), 1800);
    }
  }

  function handleClearSavedSeed() {
    clearPersistedLatestCommit();
    setPersistedCommit(null);
  }

  const displayedCommit = success ?? persistedCommit;

  return (
    <PortalPage
      title="Create Draw Commitment"
      subtitle="Create a Lucky Draw commitment from a selected batch using the existing backend commit workflow."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Lucky Draws", href: "/admin/lucky-draws" },
        { label: "Create" },
      ]}
      actions={[
        {
          href: "/admin/lucky-draws",
          label: "Back to Register",
          variant: "secondary",
        },
        {
          href: "/admin/batches",
          label: "Batch Register",
          variant: "secondary",
        },
      ]}
      stats={[
        {
          label: "Selected Batch",
          value: selectedBatchSummary?.batch_code || "—",
        },
        {
          label: "Lucky IDs Created",
          value: String(luckyIdsCreated),
        },
        {
          label: "Existing Draws",
          value: String(selectedBatchSummary?.draw_count ?? 0),
        },
        {
          label: "Likely Ready",
          value: likelyReadyForCommit ? "Yes" : "Check",
          tone: likelyReadyForCommit ? "success" : "warning",
        },
      ]}
      statusBadge={{
        label: "Draw Commitment",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadBatches("refresh")}
            disabled={refreshing || loading || creating}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading draw creation workspace..." /> : null}

        {!loading && error && batchOptions.length === 0 ? (
          <ErrorState
            title="Unable to load draw creation page"
            description={error}
            onRetry={() => void loadBatches("initial")}
          />
        ) : null}

        {!loading && !error && batchOptions.length === 0 ? (
          <EmptyState
            title="No batches available"
            description="No batches were returned for draw commitment selection."
          />
        ) : null}

        {!loading && batchOptions.length > 0 ? (
          <>
            <SectionCard
              title="Commitment workflow note"
              description="This page uses the existing batch-scoped backend action to create a draw commitment and return the commitment hash and admin seed."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue label="Action Type" value="Batch-scoped commit" />
                <DetailValue label="Backend Endpoint" value="POST /admin/batches/{id}/create-commit/" />
                <DetailValue label="Sensitive Output" value="Admin seed must be stored securely" />
                <DetailValue label="Reveal Path" value="Use the exact saved seed later" />
              </div>
            </SectionCard>

            {persistedCommit && !success ? (
              <SectionCard
                title="Recovered browser-session commitment"
                description="This commitment was recovered from the current browser session. It remains available only temporarily."
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <DetailValue label="Draw ID" value={`#${persistedCommit.id}`} />
                  <DetailValue label="Batch ID" value={`#${persistedCommit.batch}`} />
                  <DetailValue label="Draw Month" value={formatDrawMonth(persistedCommit.draw_month)} />
                  <DetailValue label="Saved At" value={formatDateTime(persistedCommit.saved_at)} />
                </div>

                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-red-800">
                    Recovered Reveal Seed
                  </div>
                  <div className="mt-2 break-all text-sm text-red-900">
                    {persistedCommit.admin_seed_store_securely || "No seed stored"}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopySeed(persistedCommit.admin_seed_store_securely)}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    {seedCopied ? "Seed Copied" : "Copy Seed"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyHash(persistedCommit.committed_hash)}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    {hashCopied ? "Hash Copied" : "Copy Hash"}
                  </button>

                  <button
                    type="button"
                    onClick={handleClearSavedSeed}
                    className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 shadow-sm transition hover:bg-red-100"
                  >
                    Clear Saved Seed
                  </button>

                  <Link
                    href={`/admin/lucky-draws/${persistedCommit.id}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Draw Detail
                  </Link>
                </div>
              </SectionCard>
            ) : null}

            <SectionCard
              title="Select batch"
              description="Choose the batch for which the Lucky Draw commitment should be created."
            >
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div>
                  <label
                    htmlFor="batch-id"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Batch
                  </label>
                  <select
                    id="batch-id"
                    value={selectedBatchId}
                    onChange={(event) => {
                      setSelectedBatchId(event.target.value);
                      setError(null);
                      setSuccess(null);
                      setSeedCopied(false);
                      setHashCopied(false);
                    }}
                    disabled={creating}
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">Select batch</option>
                    {batchOptions.map((option) => (
                      <option key={option.id} value={String(option.id)}>
                        {option.batch_code} · {option.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleCreateCommit}
                    disabled={!selectedBatchId || creating || summaryLoading}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creating ? "Creating..." : "Create Commitment"}
                  </button>
                </div>
              </div>
            </SectionCard>

            {summaryLoading ? (
              <LoadingBlock label="Loading selected batch summary..." />
            ) : null}

            {selectedBatchSummary ? (
              <SectionCard
                title="Selected batch summary"
                description="Review the current batch state before creating the commitment."
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <DetailValue label="Batch Code" value={selectedBatchSummary.batch_code} />
                  <DetailValue
                    label="Status"
                    value={
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                          batchToneClass(selectedBatchSummary.status),
                        ].join(" ")}
                      >
                        {selectedBatchSummary.status}
                      </span>
                    }
                  />
                  <DetailValue label="Next Draw Basis" value={formatDate(selectedBatchSummary.start_date)} />
                  <DetailValue label="Draw Day" value={selectedBatchSummary.draw_day != null ? String(selectedBatchSummary.draw_day) : "—"} />
                  <DetailValue label="Total Slots" value={String(selectedBatchSummary.total_slots)} />
                  <DetailValue label="Lucky IDs Created" value={String(luckyIdsCreated)} />
                  <DetailValue label="Assigned Lucky IDs" value={String(selectedBatchSummary.assigned_lucky_ids)} />
                  <DetailValue label="Won Lucky IDs" value={String(selectedBatchSummary.won_lucky_ids)} />
                  <DetailValue label="Subscriptions" value={String(selectedBatchSummary.subscription_count)} />
                  <DetailValue label="Existing Draws" value={String(selectedBatchSummary.draw_count)} />
                  <DetailValue label="Monthly Booked Value" value={formatRupee(selectedBatchSummary.monthly_booked_value)} />
                  <DetailValue label="Start Date" value={formatDate(selectedBatchSummary.start_date)} />
                </div>

                {!likelyReadyForCommit ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    This batch does not look fully ready from the UI perspective. Backend validation remains the source of truth and may still allow or reject commitment creation.
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    This batch looks structurally ready for a draw commitment: Lucky IDs appear to match slot count and draw capacity is still available.
                  </div>
                )}
              </SectionCard>
            ) : null}

            {error ? (
              <ErrorState
                title="Unable to create draw commitment"
                description={error}
              />
            ) : null}

            {displayedCommit ? (
              <SectionCard
                title={success ? "Commitment created" : "Stored commitment available"}
                description="The reveal seed below is required later. Keep it secure and copy it now."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <DetailValue label="Draw ID" value={`#${displayedCommit.id}`} />
                  <DetailValue label="Batch ID" value={`#${displayedCommit.batch}`} />
                  <DetailValue label="Draw Month" value={formatDrawMonth(displayedCommit.draw_month)} />
                  <DetailValue label="Revealed" value={displayedCommit.is_revealed ? "Yes" : "No"} />
                </div>

                <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Committed Hash
                  </div>
                  <div className="mt-2 break-all text-sm text-foreground">
                    {displayedCommit.committed_hash || "No committed hash returned"}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-red-800">
                    Reveal Seed — Required Later
                  </div>
                  <div className="mt-2 break-all text-sm text-red-900">
                    {displayedCommit.admin_seed_store_securely || "No admin seed returned"}
                  </div>
                  <p className="mt-3 text-sm text-red-800">
                    This exact seed must be entered later on the reveal page. The committed hash is not enough.
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopySeed(displayedCommit.admin_seed_store_securely)}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    {seedCopied ? "Seed Copied" : "Copy Seed"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyHash(displayedCommit.committed_hash)}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    {hashCopied ? "Hash Copied" : "Copy Hash"}
                  </button>

                  <Link
                    href={`/admin/lucky-draws/${displayedCommit.id}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Draw Detail
                  </Link>

                  <Link
                    href={`/admin/lucky-draws/${displayedCommit.id}/reveal`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Reveal Page
                  </Link>

                  <button
                    type="button"
                    onClick={handleClearSavedSeed}
                    className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 shadow-sm transition hover:bg-red-100"
                  >
                    Clear Saved Seed
                  </button>
                </div>

                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Browser-session preservation is temporary. Once the browser session is cleared, this saved seed may be lost.
                </div>
              </SectionCard>
            ) : null}
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}