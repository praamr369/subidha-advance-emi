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
  | "FULL"
  | "DRAW_IN_PROGRESS"
  | "CLOSED"
  | "COMPLETED"
  | "UNKNOWN";

type LuckyDrawDetailRecord = {
  id: number;
  batch_id: number | null;
  batch_code: string;
  draw_month: number | null;
  committed_hash: string | null;
  is_revealed: boolean;
  winner_lucky_id: number | null;
  winner_lucky_number: number | null;
  winner_customer_name?: string;
  winner_subscription_id: number | null;
  winner_subscription_number?: string;
  created_at: string | null;
  revealed_at: string | null;
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

type RevealResult = {
  id: number;
  batch_id: number | null;
  batch_code: string;
  draw_month: number | null;
  committed_hash: string | null;
  is_revealed: boolean;
  revealed_at: string | null;
  winner_lucky_id: number | null;
  winner_lucky_number: number | null;
  winner_customer_name?: string;
  winner_subscription_id: number | null;
  winner_subscription_number?: string;
  waiver_applied?: boolean;
  waiver_scope?: string | null;
  waived_emi_count?: number | null;
  waived_amount?: string | null;
};

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
      toNullableNumber(raw.subscription_id),
    winner_subscription_number:
      toStringValue(raw.winner_subscription_number).trim() ||
      toStringValue(raw.subscription_number).trim() ||
      undefined,
    created_at:
      toNullableString(raw.created_at) ??
      toNullableString(raw.created_date),
    revealed_at:
      toNullableString(raw.revealed_at) ??
      toNullableString(raw.reveal_date),
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

function normalizeRevealResult(
  raw: Record<string, unknown>,
  fallback: LuckyDrawDetailRecord | null
): RevealResult {
  const winnerLuckyNumber =
    toNullableNumber(raw.winner_lucky_number) ??
    toNullableNumber(raw.winning_lucky_number) ??
    toNullableNumber(raw.lucky_number) ??
    toNullableNumber(raw.winner_number) ??
    toNullableNumber(raw.winning_number) ??
    fallback?.winner_lucky_number ??
    null;

  return {
    id: toNumber(raw.id ?? fallback?.id),
    batch_id:
      toNullableNumber(raw.batch_id) ??
      toNullableNumber(raw.batch) ??
      fallback?.batch_id ??
      null,
    batch_code:
      toStringValue(raw.batch_code).trim() ||
      toStringValue(raw.batch_name).trim() ||
      fallback?.batch_code ||
      "Unknown batch",
    draw_month:
      toNullableNumber(raw.draw_month) ??
      toNullableNumber(raw.month) ??
      fallback?.draw_month ??
      null,
    committed_hash:
      toNullableString(raw.committed_hash) ??
      toNullableString(raw.commit_hash) ??
      toNullableString(raw.hash_commit) ??
      fallback?.committed_hash ??
      null,
    is_revealed:
      normalizeBoolean(raw.is_revealed ?? raw.revealed) ||
      fallback?.is_revealed ||
      false,
    revealed_at:
      toNullableString(raw.revealed_at) ??
      toNullableString(raw.reveal_date) ??
      fallback?.revealed_at ??
      null,
    winner_lucky_id:
      toNullableNumber(raw.winner_lucky_id) ??
      toNullableNumber(raw.winning_lucky_id) ??
      fallback?.winner_lucky_id ??
      null,
    winner_lucky_number: winnerLuckyNumber,
    winner_customer_name:
      toStringValue(raw.winner_customer_name).trim() ||
      toStringValue(raw.customer_name).trim() ||
      fallback?.winner_customer_name ||
      undefined,
    winner_subscription_id:
      toNullableNumber(raw.winner_subscription_id) ??
      toNullableNumber(raw.subscription_id) ??
      fallback?.winner_subscription_id ??
      null,
    winner_subscription_number:
      toStringValue(raw.winner_subscription_number).trim() ||
      toStringValue(raw.subscription_number).trim() ||
      fallback?.winner_subscription_number ||
      undefined,
    waiver_applied:
      raw.waiver_applied === undefined
        ? undefined
        : normalizeBoolean(raw.waiver_applied),
    waiver_scope:
      toNullableString(raw.waiver_scope) ??
      toNullableString(raw.waiver_type) ??
      null,
    waived_emi_count: toNullableNumber(raw.waived_emi_count),
    waived_amount:
      toNullableString(raw.waived_amount) ??
      (raw.waived_amount != null ? String(raw.waived_amount) : null),
  };
}

function parseErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Failed to process draw reveal.";

  const raw = error.message.trim();
  if (!raw) return "Failed to process draw reveal.";

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

export default function AdminLuckyDrawRevealPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const drawId = params?.id;

  const [draw, setDraw] = useState<LuckyDrawDetailRecord | null>(null);
  const [batchPreview, setBatchPreview] = useState<BatchPreview | null>(null);
  const [revealedSeed, setRevealedSeed] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [revealResult, setRevealResult] = useState<RevealResult | null>(null);

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

        setDraw(normalizedDraw);
        setBatchPreview(nextBatchPreview);
        setError(null);
      } catch (err) {
        setError(parseErrorMessage(err));
        setDraw(null);
        setBatchPreview(null);
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

  const revealBlockedReason = useMemo(() => {
    if (!draw) return null;
    if (draw.is_revealed) return "This draw has already been revealed.";
    if (!draw.committed_hash) return "Committed hash is missing for this draw.";
    return null;
  }, [draw]);

  const canReveal = useMemo(() => {
    return !revealBlockedReason && revealedSeed.trim().length > 0;
  }, [revealBlockedReason, revealedSeed]);

  async function handleReveal() {
    if (!drawId || !draw || !canReveal) return;

    setRevealing(true);
    setError(null);
    setRevealResult(null);

    try {
      const payload = await apiFetch<Record<string, unknown>>(
        `/admin/lucky-draws/${drawId}/reveal/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            revealed_seed: revealedSeed.trim(),
          }),
        }
      );

      const normalized = normalizeRevealResult(payload, draw);
      setRevealResult(normalized);

      setDraw((current) => {
        if (!current) return current;
        return {
          ...current,
          is_revealed: normalized.is_revealed,
          revealed_at: normalized.revealed_at,
          winner_lucky_id: normalized.winner_lucky_id,
          winner_lucky_number: normalized.winner_lucky_number,
          winner_customer_name: normalized.winner_customer_name,
          winner_subscription_id: normalized.winner_subscription_id,
          winner_subscription_number: normalized.winner_subscription_number,
        };
      });
    } catch (err) {
      setError(parseErrorMessage(err));
    } finally {
      setRevealing(false);
    }
  }

  return (
    <PortalPage
      title={draw ? `Reveal Draw #${draw.id}` : `Reveal Lucky Draw #${drawId ?? "—"}`}
      subtitle="Dedicated confirmation page for the final Lucky Draw reveal action."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Lucky Draws", href: "/admin/lucky-draws" },
        {
          label: draw ? `Draw #${draw.id}` : `Lucky Draw #${drawId ?? "—"}`,
          href: drawId ? `/admin/lucky-draws/${drawId}` : "/admin/lucky-draws",
        },
        { label: "Reveal" },
      ]}
      actions={[
        {
          href: drawId ? `/admin/lucky-draws/${drawId}` : "/admin/lucky-draws",
          label: "Back to Detail",
          variant: "secondary",
        },
        {
          href: "/admin/lucky-draws",
          label: "Back to Register",
          variant: "secondary",
        },
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
          label: "Batch",
          value: draw?.batch_code || "—",
        },
      ]}
      statusBadge={{
        label: draw?.is_revealed ? "Revealed" : "Ready for Reveal",
        tone: draw?.is_revealed ? "success" : "warning",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading || revealing}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <LoadingBlock label="Loading draw reveal workspace..." /> : null}

        {!loading && error && !draw ? (
          <ErrorState
            title="Unable to load reveal page"
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

        {!loading && draw ? (
          <>
            <SectionCard
              title="Reveal confirmation"
              description="Reveal is a sensitive operation and should be performed only once for a valid committed draw."
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              </div>

              <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Committed Hash
                </div>
                <div className="mt-2 break-all text-sm text-foreground">
                  {draw.committed_hash || "No committed hash visible"}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Preview: {shortenHash(draw.committed_hash)}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                This action is operationally sensitive. Reveal should not be repeated, and winner consequences must remain audit-safe.
              </div>
            </SectionCard>

            <section className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="Batch context"
                description="Review the source batch before confirming reveal."
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
                title="Current winner visibility"
                description="If the draw is already revealed, winner fields should already be visible here."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue
                    label="Winner Lucky ID Row"
                    value={draw.winner_lucky_id != null ? `#${draw.winner_lucky_id}` : "—"}
                  />
                  <DetailValue
                    label="Winner Lucky Number"
                    value={formatLuckyNumber(draw.winner_lucky_number)}
                  />
                  <DetailValue
                    label="Winner Customer"
                    value={draw.winner_customer_name || "Not visible"}
                  />
                  <DetailValue
                    label="Winner Contract"
                    value={draw.winner_subscription_number || "Not visible"}
                  />
                  <DetailValue label="Created At" value={formatDateTime(draw.created_at)} />
                  <DetailValue label="Revealed At" value={formatDateTime(draw.revealed_at)} />
                </div>
              </SectionCard>
            </section>

            {revealBlockedReason ? (
              <SectionCard
                title="Reveal blocked"
                description="This draw cannot be revealed from this page right now."
              >
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {revealBlockedReason}
                </div>
              </SectionCard>
            ) : (
              <SectionCard
                title="Run reveal"
                description="Trigger backend reveal action for this draw."
              >
                <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Expected backend action: <code>POST /admin/lucky-draws/{drawId}/reveal/</code>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="revealed-seed"
                    className="mb-2 block text-sm font-medium text-foreground"
                  >
                    Reveal Seed
                  </label>
                  <input
                    id="revealed-seed"
                    type="text"
                    value={revealedSeed}
                    onChange={(event) => {
                      setRevealedSeed(event.target.value);
                      setError(null);
                    }}
                    disabled={revealing}
                    placeholder="Enter the exact reveal seed used for this draw"
                    className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <p className="mt-2 text-xs text-muted-foreground">
                    This must match the seed used to generate the committed hash.
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleReveal}
                    disabled={revealing || !canReveal}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {revealing ? "Revealing..." : "Confirm Reveal"}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      router.push(drawId ? `/admin/lucky-draws/${drawId}` : "/admin/lucky-draws")
                    }
                    disabled={revealing}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </SectionCard>
            )}

            {error ? (
              <ErrorState
                title="Reveal failed"
                description={error}
              />
            ) : null}

            {revealResult ? (
              <SectionCard
                title="Reveal result"
                description="Backend returned the revealed winner information."
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <DetailValue label="Revealed" value={revealResult.is_revealed ? "Yes" : "No"} />
                  <DetailValue label="Revealed At" value={formatDateTime(revealResult.revealed_at)} />
                  <DetailValue label="Winner Lucky Number" value={formatLuckyNumber(revealResult.winner_lucky_number)} />
                  <DetailValue label="Winner Customer" value={revealResult.winner_customer_name || "Not visible"} />
                  <DetailValue label="Winner Contract" value={revealResult.winner_subscription_number || "Not visible"} />
                  <DetailValue label="Hash Preview" value={shortenHash(revealResult.committed_hash)} />
                  <DetailValue
                    label="Waiver Applied"
                    value={
                      revealResult.waiver_applied === undefined
                        ? "Unknown"
                        : revealResult.waiver_applied
                          ? "Yes"
                          : "No"
                    }
                  />
                  <DetailValue
                    label="Waiver Scope"
                    value={revealResult.waiver_scope || "Future EMI waiver only"}
                  />
                  <DetailValue
                    label="Waived EMI Count"
                    value={
                      revealResult.waived_emi_count != null
                        ? String(revealResult.waived_emi_count)
                        : "—"
                    }
                  />
                  <DetailValue
                    label="Waived Amount"
                    value={revealResult.waived_amount || "—"}
                  />
                </div>

                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Reveal completed. Business rule reminder: winner benefit should apply to future EMI waiver only.
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/admin/lucky-draws/${revealResult.id}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Draw Detail
                  </Link>

                  {revealResult.winner_subscription_id != null ? (
                    <Link
                      href={`/admin/subscriptions/${revealResult.winner_subscription_id}`}
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    >
                      Open Winner Contract
                    </Link>
                  ) : null}
                </div>
              </SectionCard>
            ) : null}
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}