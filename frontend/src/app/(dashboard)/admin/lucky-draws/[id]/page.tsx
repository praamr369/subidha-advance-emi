"use client";
import { formatRupee } from "@/lib/utils/currency";

import Link from "next/link";
import { useParams } from "next/navigation";
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
  | "FULL"
  | "DRAW_IN_PROGRESS"
  | "CLOSED"
  | "COMPLETED"
  | "UNKNOWN";

type SubscriptionStatus =
  | "ACTIVE"
  | "WON"
  | "COMPLETED"
  | "DEFAULTED"
  | "UNKNOWN";

type LuckyDrawDetailRecord = {
  id: number;
  batch_id: number | null;
  batch_code: string;
  draw_month: number | null;
  committed_hash: string | null;
  is_revealed: boolean;
  revealed_seed: string | null;
  winner_lucky_id: number | null;
  winner_lucky_number: number | null;
  winner_customer_name?: string;
  winner_subscription_id: number | null;
  winner_subscription_number?: string;
  created_at: string | null;
  draw_date: string | null;
  revealed_at: string | null;
  waived_emi_count: number | null;
  waived_amount: string | null;
  waiver_scope: string | null;
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

function storageKeyForDraw(drawId: number): string {
  return `subidha:lucky-draw:commit:${drawId}`;
}

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

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "y"].includes(normalized);
  }
  return false;
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

function formatDrawMonth(value: number | null | undefined): string {
  if (value == null) return "—";
  return `Month ${value}`;
}

function shortenHash(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 20) return value;
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
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

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
  const status = String(value ?? "").toUpperCase();

  if (
    status === "ACTIVE" ||
    status === "WON" ||
    status === "COMPLETED" ||
    status === "DEFAULTED"
  ) {
    return status;
  }

  return "UNKNOWN";
}

function normalizeLuckyDrawDetail(raw: Record<string, unknown>): LuckyDrawDetailRecord {
  const winnerLuckyNumber =
    toNullableNumber(raw.winner_lucky_number) ??
    toNullableNumber(raw.winning_lucky_number) ??
    toNullableNumber(raw.lucky_number) ??
    toNullableNumber(raw.winner_number) ??
    toNullableNumber(raw.winning_number);

  return {
    id: toNumber(raw.id),
    batch_id: toNullableNumber(raw.batch) ?? toNullableNumber(raw.batch_id),
    batch_code:
      toStringValue(raw.batch_code).trim() ||
      toStringValue(raw.batch_name).trim() ||
      "Unknown batch",
    draw_month:
      toNullableNumber(raw.draw_month) ??
      toNullableNumber(raw.month),
    committed_hash:
      toNullableString(raw.committed_hash) ??
      toNullableString(raw.commit_hash) ??
      toNullableString(raw.hash_commit),
    is_revealed: normalizeBoolean(raw.is_revealed ?? raw.revealed),
    revealed_seed:
      toNullableString(raw.revealed_seed) ??
      toNullableString(raw.seed),
    winner_lucky_id:
      toNullableNumber(raw.winner_lucky_id) ??
      toNullableNumber(raw.winning_lucky_id),
    winner_lucky_number: winnerLuckyNumber,
    winner_customer_name:
      toStringValue(raw.winner_customer_name).trim() ||
      toStringValue(raw.customer_name).trim() ||
      undefined,
    winner_subscription_id:
      toNullableNumber(raw.winner_subscription_id) ??
      toNullableNumber(raw.winner_subscription) ??
      toNullableNumber(raw.subscription_id),
    winner_subscription_number:
      toStringValue(raw.winner_subscription_number).trim() ||
      toStringValue(raw.subscription_number).trim() ||
      undefined,
    created_at:
      toNullableString(raw.created_at) ??
      toNullableString(raw.created_date),
    draw_date:
      toNullableString(raw.draw_date) ??
      toNullableString(raw.created_at),
    revealed_at:
      toNullableString(raw.revealed_at) ??
      toNullableString(raw.reveal_date),
    waived_emi_count: toNullableNumber(raw.waived_emi_count),
    waived_amount:
      toNullableString(raw.waived_amount) ??
      (raw.waived_amount != null ? String(raw.waived_amount) : null),
    waiver_scope:
      toNullableString(raw.waiver_scope) ??
      toNullableString(raw.waiver_type),
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
      toStringValue(raw.contract_reference).trim() ||
      `SUB-${id}`,
    customer_name:
      toStringValue(raw.customer_name).trim() || undefined,
    product_name:
      toStringValue(raw.product_name).trim() || undefined,
    batch_code:
      toStringValue(raw.batch_code).trim() || undefined,
    lucky_number:
      toNullableNumber(raw.lucky_number) ??
      toNullableNumber(raw.lucky_no),
    status: normalizeSubscriptionStatus(raw.status ?? raw.subscription_status),
    total_amount: String(raw.total_amount ?? "0.00"),
    monthly_amount: String(raw.monthly_amount ?? "0.00"),
    start_date:
      toNullableString(raw.start_date) ??
      toNullableString(raw.created_at),
  };
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to load Lucky Draw detail.";

  const raw = error.message.trim();
  if (!raw) return "Failed to load Lucky Draw detail.";

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

function revealToneClass(isRevealed: boolean): string {
  return isRevealed
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
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
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function subscriptionToneClass(status: SubscriptionStatus): string {
  switch (status) {
    case "ACTIVE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "WON":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "COMPLETED":
      return "border-slate-200 bg-slate-100 text-slate-700";
    case "DEFAULTED":
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

function loadPersistedCommitForDraw(drawId: number): PersistedCommitRecord | null {
  if (typeof window === "undefined") return null;

  const exact = window.sessionStorage.getItem(storageKeyForDraw(drawId));
  if (exact) {
    try {
      const parsed = JSON.parse(exact) as PersistedCommitRecord;
      if (parsed.id === drawId) return parsed;
    } catch {
      // ignore
    }
  }

  const latest = window.sessionStorage.getItem(LATEST_COMMIT_STORAGE_KEY);
  if (latest) {
    try {
      const parsed = JSON.parse(latest) as PersistedCommitRecord;
      if (parsed.id === drawId) return parsed;
    } catch {
      // ignore
    }
  }

  return null;
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export default function AdminLuckyDrawDetailPage() {
  const params = useParams<{ id: string }>();
  const drawId = params?.id;

  const [draw, setDraw] = useState<LuckyDrawDetailRecord | null>(null);
  const [batchPreview, setBatchPreview] = useState<BatchPreview | null>(null);
  const [subscriptionPreview, setSubscriptionPreview] =
    useState<SubscriptionPreview | null>(null);
  const [persistedCommit, setPersistedCommit] =
    useState<PersistedCommitRecord | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seedCopied, setSeedCopied] = useState(false);
  const [hashCopied, setHashCopied] = useState(false);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!drawId) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const drawPayload = await apiFetch<Record<string, unknown>>(
          `/admin/lucky-draws/${drawId}/`
        );
        const normalizedDraw = normalizeLuckyDrawDetail(drawPayload);

        let nextBatchPreview: BatchPreview | null = null;
        let nextSubscriptionPreview: SubscriptionPreview | null = null;

        if (normalizedDraw.batch_id != null) {
          try {
            const batchPayload = await apiFetch<Record<string, unknown>>(
              `/admin/batches/${normalizedDraw.batch_id}/`
            );
            nextBatchPreview = normalizeBatchPreview(batchPayload);
          } catch {
            nextBatchPreview = null;
          }
        }

        if (normalizedDraw.winner_subscription_id != null) {
          try {
            const subscriptionPayload = await apiFetch<Record<string, unknown>>(
              `/admin/subscriptions/${normalizedDraw.winner_subscription_id}/`
            );
            nextSubscriptionPreview = normalizeSubscriptionPreview(subscriptionPayload);
          } catch {
            nextSubscriptionPreview = null;
          }
        }

        setDraw(normalizedDraw);
        setBatchPreview(nextBatchPreview);
        setSubscriptionPreview(nextSubscriptionPreview);
        setPersistedCommit(loadPersistedCommitForDraw(normalizedDraw.id));
        setError(null);
      } catch (err) {
        setError(parseErrorMessage(err));
        setDraw(null);
        setBatchPreview(null);
        setSubscriptionPreview(null);
        setPersistedCommit(null);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [drawId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const hasWinnerVisible = useMemo(() => {
    if (!draw) return false;
    return (
      draw.winner_lucky_number != null ||
      Boolean(draw.winner_customer_name) ||
      Boolean(draw.winner_subscription_number)
    );
  }, [draw]);

  const revealSeedAvailable = useMemo(() => {
    if (draw?.revealed_seed) return true;
    return Boolean(persistedCommit?.admin_seed_store_securely);
  }, [draw, persistedCommit]);

  async function handleCopySeed(value: string | null | undefined) {
    if (!value) return;
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setSeedCopied(true);
      window.setTimeout(() => setSeedCopied(false), 1800);
    }
  }

  async function handleCopyHash(value: string | null | undefined) {
    if (!value) return;
    const ok = await copyTextToClipboard(value);
    if (ok) {
      setHashCopied(true);
      window.setTimeout(() => setHashCopied(false), 1800);
    }
  }

  return (
    <PortalPage
      title={draw ? `Draw #${draw.id}` : `Lucky Draw #${drawId ?? "—"}`}
      subtitle="Detailed Lucky Draw audit view for commitment, reveal state, winner visibility, and seed-custody status."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Lucky Draws", href: "/admin/lucky-draws" },
        { label: draw ? `Draw #${draw.id}` : `Lucky Draw #${drawId ?? "—"}` },
      ]}
      actions={[
        {
          href: "/admin/lucky-draws",
          label: "Back to Register",
          variant: "secondary",
        },
        ...(draw?.batch_id != null
          ? [
              {
                href: `/admin/batches/${draw.batch_id}`,
                label: "Open Batch",
                variant: "secondary" as const,
              },
            ]
          : []),
        ...(draw?.winner_subscription_id != null
          ? [
              {
                href: `/admin/subscriptions/${draw.winner_subscription_id}`,
                label: "Open Winner Contract",
                variant: "primary" as const,
              },
            ]
          : []),
      ]}
      stats={[
        {
          label: "Draw Month",
          value: draw ? formatDrawMonth(draw.draw_month) : "—",
        },
        {
          label: "Reveal State",
          value: draw?.is_revealed ? "Revealed" : "Unrevealed",
          tone: draw?.is_revealed ? "success" : "warning",
        },
        {
          label: "Winner",
          value: draw ? formatLuckyNumber(draw.winner_lucky_number) : "—",
        },
        {
          label: "Seed Status",
          value: revealSeedAvailable ? "Recoverable" : "Not recoverable",
          tone: revealSeedAvailable ? "success" : "danger",
        },
      ]}
      statusBadge={{
        label: draw?.is_revealed ? "Revealed" : "Unrevealed",
        tone: draw?.is_revealed ? "success" : "warning",
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

        {loading ? <LoadingBlock label="Loading Lucky Draw detail..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load Lucky Draw detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !draw ? (
          <EmptyState
            title="Lucky Draw not available"
            description="The requested draw could not be loaded."
          />
        ) : null}

        {!loading && !error && draw ? (
          <>
            {!draw.is_revealed && revealSeedAvailable ? (
              <SectionCard
                title="Reveal seed is available"
                description="This unrevealed draw still has a recoverable reveal seed in the current browser session or draw record."
              >
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  This draw can proceed to reveal. Copy the seed first, then open the reveal page.
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <DetailValue label="Saved At" value={formatDateTime(persistedCommit?.saved_at)} />
                  <DetailValue
                    label="Seed Source"
                    value={draw.revealed_seed ? "Draw record" : persistedCommit ? "Browser session" : "—"}
                  />
                  <DetailValue label="Hash Preview" value={shortenHash(draw.committed_hash)} />
                  <DetailValue label="Draw Month" value={formatDrawMonth(draw.draw_month)} />
                </div>

                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-red-800">
                    Recoverable Reveal Seed
                  </div>
                  <div className="mt-2 break-all text-sm text-red-900">
                    {draw.revealed_seed || persistedCommit?.admin_seed_store_securely || "No seed available"}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopySeed(draw.revealed_seed || persistedCommit?.admin_seed_store_securely)
                    }
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    {seedCopied ? "Seed Copied" : "Copy Seed"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyHash(draw.committed_hash)}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    {hashCopied ? "Hash Copied" : "Copy Hash"}
                  </button>

                  <Link
                    href={`/admin/lucky-draws/${draw.id}/reveal`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Reveal Page
                  </Link>
                </div>
              </SectionCard>
            ) : null}

            {!draw.is_revealed && !revealSeedAvailable ? (
              <SectionCard
                title="Critical operator warning"
                description="This draw is unrevealed, but no recoverable reveal seed is currently available in the draw record or browser session."
              >
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  The committed hash alone is not enough to reveal this draw. Staff must use the exact original reveal seed captured at commitment creation time.
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <DetailValue label="Draw ID" value={`#${draw.id}`} />
                  <DetailValue label="Batch Code" value={draw.batch_code} />
                  <DetailValue label="Draw Month" value={formatDrawMonth(draw.draw_month)} />
                  <DetailValue label="Hash Preview" value={shortenHash(draw.committed_hash)} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyHash(draw.committed_hash)}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    {hashCopied ? "Hash Copied" : "Copy Hash"}
                  </button>

                  <Link
                    href={`/admin/lucky-draws/${draw.id}/reveal`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Reveal Page
                  </Link>
                </div>
              </SectionCard>
            ) : null}

            <section className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="Draw overview"
                description="Primary draw record used for commitment and reveal audit."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue label="Draw ID" value={`#${draw.id}`} />
                  <DetailValue label="Batch Code" value={draw.batch_code} />
                  <DetailValue label="Draw Month" value={formatDrawMonth(draw.draw_month)} />
                  <DetailValue
                    label="Reveal State"
                    value={
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                          revealToneClass(draw.is_revealed),
                        ].join(" ")}
                      >
                        {draw.is_revealed ? "Revealed" : "Unrevealed"}
                      </span>
                    }
                  />
                  <DetailValue label="Created At" value={formatDateTime(draw.created_at)} />
                  <DetailValue label="Draw Date" value={formatDateTime(draw.draw_date)} />
                  <DetailValue label="Revealed At" value={formatDateTime(draw.revealed_at)} />
                  <DetailValue label="Waiver Scope" value={draw.waiver_scope || "Future EMI waiver only"} />
                </div>
              </SectionCard>

              <SectionCard
                title="Commitment record"
                description="Commit hash is the public commitment artifact. It cannot be used alone to reveal the draw."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue label="Hash Preview" value={shortenHash(draw.committed_hash)} />
                  <DetailValue label="Full Hash Available" value={draw.committed_hash ? "Yes" : "No"} />
                </div>

                <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Full Committed Hash
                  </div>
                  <div className="mt-2 break-all text-sm text-foreground">
                    {draw.committed_hash || "No committed hash returned by backend"}
                  </div>
                </div>
              </SectionCard>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="Batch context"
                description="The batch from which this draw was created."
              >
                {batchPreview ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailValue label="Batch Code" value={batchPreview.batch_code} />
                    <DetailValue
                      label="Status"
                      value={
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                            batchToneClass(batchPreview.status),
                          ].join(" ")}
                        >
                          {batchPreview.status}
                        </span>
                      }
                    />
                    <DetailValue label="Total Slots" value={String(batchPreview.total_slots)} />
                    <DetailValue label="Duration" value={`${batchPreview.duration_months} months`} />
                    <DetailValue label="Start Date" value={formatDate(batchPreview.start_date)} />
                    <DetailValue label="Draw Day" value={batchPreview.draw_day != null ? String(batchPreview.draw_day) : "—"} />
                  </div>
                ) : (
                  <EmptyState
                    title="Batch preview unavailable"
                    description="Batch preview could not be loaded for this draw."
                  />
                )}
              </SectionCard>

              <SectionCard
                title="Winner context"
                description="Winner linkage should resolve to Lucky ID, customer, and contract context after reveal."
              >
                {hasWinnerVisible ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DetailValue label="Winner Lucky ID Row" value={draw.winner_lucky_id != null ? `#${draw.winner_lucky_id}` : "—"} />
                    <DetailValue label="Winner Lucky Number" value={formatLuckyNumber(draw.winner_lucky_number)} />
                    <DetailValue label="Winner Customer" value={draw.winner_customer_name || "Not visible"} />
                    <DetailValue label="Winner Contract" value={draw.winner_subscription_number || "Not visible"} />
                    <DetailValue
                      label="Waived EMI Count"
                      value={draw.waived_emi_count != null ? String(draw.waived_emi_count) : "—"}
                    />
                    <DetailValue
                      label="Waived Amount"
                      value={draw.waived_amount ? formatRupee(draw.waived_amount) : "—"}
                    />
                  </div>
                ) : (
                  <EmptyState
                    title="Winner not visible"
                    description={
                      draw.is_revealed
                        ? "The draw is marked revealed, but winner fields are not visible in the current backend payload."
                        : "Winner details are expected after reveal."
                    }
                  />
                )}
              </SectionCard>
            </section>

            <SectionCard
              title="Linked winner contract"
              description="This contract preview is shown only when the draw payload resolves to a visible winner subscription."
            >
              {subscriptionPreview ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <DetailValue label="Contract" value={subscriptionPreview.subscription_number} />
                  <DetailValue label="Customer" value={subscriptionPreview.customer_name || "Unknown customer"} />
                  <DetailValue label="Product" value={subscriptionPreview.product_name || "Unknown product"} />
                  <DetailValue label="Batch" value={subscriptionPreview.batch_code || "—"} />
                  <DetailValue label="Lucky Number" value={formatLuckyNumber(subscriptionPreview.lucky_number)} />
                  <DetailValue
                    label="Status"
                    value={
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                          subscriptionToneClass(subscriptionPreview.status),
                        ].join(" ")}
                      >
                        {subscriptionPreview.status}
                      </span>
                    }
                  />
                  <DetailValue label="Total Amount" value={formatRupee(subscriptionPreview.total_amount)} />
                  <DetailValue label="Monthly Amount" value={formatRupee(subscriptionPreview.monthly_amount)} />
                  <DetailValue label="Start Date" value={formatDate(subscriptionPreview.start_date)} />
                </div>
              ) : (
                <EmptyState
                  title="No winner contract preview"
                  description="Winner contract preview could not be resolved from the current draw payload."
                />
              )}
            </SectionCard>

            <SectionCard
              title="Operational interpretation"
              description="This page is for audit and operational visibility. Seed custody status determines whether reveal can proceed cleanly."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailValue label="Commitment Present" value={draw.committed_hash ? "Yes" : "No"} />
                <DetailValue label="Reveal Completed" value={draw.is_revealed ? "Yes" : "No"} />
                <DetailValue label="Recoverable Seed" value={revealSeedAvailable ? "Yes" : "No"} />
                <DetailValue label="Waiver Rule" value="Future EMI waiver only" />
              </div>
            </SectionCard>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}