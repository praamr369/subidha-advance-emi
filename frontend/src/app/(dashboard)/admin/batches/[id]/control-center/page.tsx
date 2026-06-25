"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import {
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPStatusBadge,
} from "@/components/erp";
import {
  DataTableShell,
  DetailPanel,
  KpiCard,
  QuickActionGrid,
  Timeline,
  WorkflowCard,
} from "@/components/ui/operations";
import { apiFetch } from "@/lib/api";

type ControlCenterState = {
  batch_id: number;
  batch_code: string;
  target_size: number;
  active_subscriptions: number;
  minimum_threshold: number;
  minimum_threshold_met: boolean;
  recommended_threshold_status?: string | null;
  lock_status?: string | null;
  batch_status?: string | null;
  locked_at?: string | null;
  snapshot_status?: string | null;
  snapshot_version?: number | null;
  snapshot_row_count?: number | null;
  snapshot_hash?: string | null;
  commit_status?: string | null;
  public_commit_hash?: string | null;
  draw_status?: string | null;
  winner_lucky_number?: number | null;
  product_demand_status?: string | null;
  delivery_status?: string | null;
  finance_waiver_posting_status?: string | null;
  finance_waiver_posting_reason?: string | null;
  disabled_reasons?: {
    lock_batch?: string[];
    commit_draw?: string[];
    execute_draw?: string[];
  };
};

type CommitActionResponse = {
  public_commit_hash?: string | null;
  admin_seed_store_securely?: string | null;
  idempotent?: boolean;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function normalizeControlCenter(payload: unknown): ControlCenterState {
  const row = toRecord(payload);
  const disabled = toRecord(row.disabled_reasons);
  return {
    batch_id: toNumber(row.batch_id),
    batch_code: String(row.batch_code ?? `Batch #${String(row.batch_id ?? "")}`),
    target_size: toNumber(row.target_size),
    active_subscriptions: toNumber(row.active_subscriptions),
    minimum_threshold: toNumber(row.minimum_threshold),
    minimum_threshold_met: Boolean(row.minimum_threshold_met),
    recommended_threshold_status: toStringOrNull(row.recommended_threshold_status),
    lock_status: toStringOrNull(row.lock_status),
    batch_status: toStringOrNull(row.batch_status),
    locked_at: toStringOrNull(row.locked_at),
    snapshot_status: toStringOrNull(row.snapshot_status),
    snapshot_version: toNullableNumber(row.snapshot_version),
    snapshot_row_count: toNullableNumber(row.snapshot_row_count),
    snapshot_hash: toStringOrNull(row.snapshot_hash),
    commit_status: toStringOrNull(row.commit_status),
    public_commit_hash: toStringOrNull(row.public_commit_hash),
    draw_status: toStringOrNull(row.draw_status),
    winner_lucky_number: toNullableNumber(row.winner_lucky_number),
    product_demand_status: toStringOrNull(row.product_demand_status),
    delivery_status: toStringOrNull(row.delivery_status),
    finance_waiver_posting_status: toStringOrNull(row.finance_waiver_posting_status),
    finance_waiver_posting_reason: toStringOrNull(row.finance_waiver_posting_reason),
    disabled_reasons: {
      lock_batch: toStringArray(disabled.lock_batch),
      commit_draw: toStringArray(disabled.commit_draw),
      execute_draw: toStringArray(disabled.execute_draw),
    },
  };
}

function toErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed.";
  const raw = error.message.trim();
  if (!raw) return "Request failed.";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.detail === "string" && parsed.detail.trim()) return parsed.detail;
    return raw;
  } catch {
    return raw;
  }
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function reasonText(reasons: string[] | undefined): string {
  if (!reasons || reasons.length === 0) return "Action is currently available.";
  return reasons.join(", ");
}

export default function AdminBatchControlCenterPage() {
  const params = useParams<{ id: string }>();
  const batchId = params?.id;

  const [state, setState] = useState<ControlCenterState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"lock" | "commit" | "execute" | null>(null);
  const [lockThreshold, setLockThreshold] = useState("");
  const [revealedSeed, setRevealedSeed] = useState("");
  const [lastCommitSeed, setLastCommitSeed] = useState<string | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!batchId) return;
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);
      try {
        const payload = await apiFetch<unknown>(`/admin/batches/${batchId}/control-center/`, {
          cache: "no-store",
        });
        setState(normalizeControlCenter(payload));
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        setState(null);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [batchId]
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const lockReasons = state?.disabled_reasons?.lock_batch ?? [];
  const commitReasons = state?.disabled_reasons?.commit_draw ?? [];
  const executeReasons = state?.disabled_reasons?.execute_draw ?? [];

  const canLock = lockReasons.length === 0;
  const canCommit = commitReasons.length === 0;
  const canExecute = executeReasons.length === 0;

  const workflowEvents = useMemo(
    () => [
      { label: "Locked At", value: fmtDateTime(state?.locked_at) },
      {
        label: "Snapshot",
        value:
          state?.snapshot_status === "present"
            ? `v${state.snapshot_version ?? "?"} (${state.snapshot_row_count ?? 0} rows)`
            : String(state?.snapshot_status || "absent"),
      },
      {
        label: "Commit",
        value: state?.public_commit_hash
          ? `Published (${state.public_commit_hash.slice(0, 16)}...)`
          : String(state?.commit_status || "absent"),
      },
      {
        label: "Draw Status",
        value: String(state?.draw_status || "none"),
      },
    ],
    [state]
  );

  async function runLock() {
    if (!batchId) return;
    setBusyAction("lock");
    setActionError(null);
    setActionSuccess(null);
    try {
      const payload: Record<string, unknown> = {};
      if (lockThreshold.trim()) payload.minimum_active = Number(lockThreshold.trim());
      await apiFetch(`/admin/batches/${batchId}/lock/`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setActionSuccess("Batch lock completed. Eligibility snapshot/state refreshed.");
      await load("refresh");
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  }

  async function runCommit() {
    if (!batchId) return;
    setBusyAction("commit");
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiFetch<CommitActionResponse>(`/admin/batches/${batchId}/commit-draw/`, {
        method: "POST",
      });
      const seed = toStringOrNull(res.admin_seed_store_securely);
      setLastCommitSeed(seed);
      setActionSuccess(
        seed
          ? "Draw commit published. Save the reveal seed securely before execution."
          : "Draw commit already exists. State refreshed."
      );
      await load("refresh");
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  }

  async function runExecute() {
    if (!batchId) return;
    setBusyAction("execute");
    setActionError(null);
    setActionSuccess(null);
    try {
      await apiFetch(`/admin/batches/${batchId}/execute-draw/`, {
        method: "POST",
        body: JSON.stringify({ revealed_seed: revealedSeed.trim() }),
      });
      setActionSuccess("Draw execution completed or already finalized. State refreshed.");
      await load("refresh");
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <ERPPageShell
      title={state?.batch_code || `Batch #${batchId ?? "—"} Control Center`}
      subtitle="Lock, commit, and execute draw actions using real backend guardrails and reasons only."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Batches", href: "/admin/batches" },
        {
          label: state?.batch_code || `Batch #${batchId ?? "—"}`,
          href: batchId ? `/admin/batches/${batchId}` : "/admin/batches",
        },
        { label: "Control Center" },
      ]}
      actions={[
        {
          href: batchId ? `/admin/batches/${batchId}` : "/admin/batches",
          label: "Batch Detail",
          variant: "secondary",
        },
        { href: "/admin/batches", label: "Batch Register", variant: "secondary" },
      ]}
      stats={[
        { label: "Target Size", value: String(state?.target_size ?? "—") },
        { label: "Active Subs", value: String(state?.active_subscriptions ?? "—") },
        {
          label: "Threshold",
          value: state ? `${state.minimum_threshold}` : "—",
          tone: state?.minimum_threshold_met ? "success" : "warning",
        },
        {
          label: "Batch Status",
          value: state?.batch_status || "—",
          tone: "info",
        },
      ]}
      statusBadge={{
        label: state?.draw_status || state?.batch_status || "Control Center",
        tone: "info",
      }}
    >
      <div className="space-y-6">
        <section className="flex justify-end">
          <button
            type="button"
            onClick={() => void load("refresh")}
            disabled={loading || refreshing}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </section>

        {loading ? <ERPLoadingState label="Loading batch control center..." /> : null}
        {!loading && error ? (
          <ERPErrorState
            title="Unable to load control center"
            description={error}
            onRetry={() => void load("initial")}
          />
        ) : null}
        {!loading && !error && !state ? (
          <ERPEmptyState
            title="Control center unavailable"
            description="The requested batch control state could not be loaded."
          />
        ) : null}

        {!loading && !error && state ? (
          <>
            {actionError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {actionError}
              </div>
            ) : null}
            {actionSuccess ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {actionSuccess}
              </div>
            ) : null}

            {lastCommitSeed ? (
              <DetailPanel
                title="Commit seed (save securely)"
                description="This seed is returned by backend at commit time for reveal/execute. It is not persisted as a visible value later."
              >
                <DataTableShell>
                  <code className="block break-all text-xs">{lastCommitSeed}</code>
                </DataTableShell>
              </DetailPanel>
            ) : null}

            <QuickActionGrid>
              <KpiCard label="Lock Status" value={<ERPStatusBadge status={state.lock_status || "UNKNOWN"} />} />
              <KpiCard label="Snapshot Status" value={<ERPStatusBadge status={state.snapshot_status || "ABSENT"} />} />
              <KpiCard label="Commit Status" value={<ERPStatusBadge status={state.commit_status || "ABSENT"} />} />
              <KpiCard label="Draw Status" value={<ERPStatusBadge status={state.draw_status || "NONE"} />} />
              <KpiCard
                label="Finance Waiver Posting"
                value={<ERPStatusBadge status={state.finance_waiver_posting_status || "UNKNOWN"} />}
                helper={state.finance_waiver_posting_reason || undefined}
              />
              <KpiCard
                label="Winner Lucky ID"
                value={
                  state.winner_lucky_number != null
                    ? `#${String(state.winner_lucky_number).padStart(2, "0")}`
                    : "—"
                }
              />
              <KpiCard label="Demand Status" value={state.product_demand_status || "not_configured"} />
              <KpiCard label="Delivery Status" value={state.delivery_status || "not_configured"} />
            </QuickActionGrid>

            <section className="grid gap-6 xl:grid-cols-3">
              <WorkflowCard
                title="Lock Batch"
                description={reasonText(lockReasons)}
                action={
                  <div className="space-y-3">
                    <label className="grid gap-1">
                      <span className="text-xs text-muted-foreground">
                        Minimum active threshold override (optional)
                      </span>
                      <input
                        value={lockThreshold}
                        onChange={(event) => setLockThreshold(event.target.value)}
                        inputMode="numeric"
                        className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                        placeholder="Leave empty to use backend default"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!canLock || busyAction !== null}
                      onClick={() => void runLock()}
                      className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyAction === "lock" ? "Locking..." : "Lock Batch"}
                    </button>
                  </div>
                }
              />
              <WorkflowCard
                title="Commit Draw"
                description={reasonText(commitReasons)}
                action={
                  <button
                    type="button"
                    disabled={!canCommit || busyAction !== null}
                    onClick={() => void runCommit()}
                    className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyAction === "commit" ? "Committing..." : "Commit Draw"}
                  </button>
                }
              />
              <WorkflowCard
                title="Execute Draw"
                description={reasonText(executeReasons)}
                action={
                  <div className="space-y-3">
                    <label className="grid gap-1">
                      <span className="text-xs text-muted-foreground">Reveal seed</span>
                      <input
                        value={revealedSeed}
                        onChange={(event) => setRevealedSeed(event.target.value)}
                        className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
                        placeholder="Paste the secure seed from commit response"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!canExecute || busyAction !== null || !revealedSeed.trim()}
                      onClick={() => void runExecute()}
                      className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyAction === "execute" ? "Executing..." : "Execute Draw"}
                    </button>
                  </div>
                }
              />
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <DetailPanel title="Verification snapshot" description="Real backend control-center state and hash publication fields.">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">Snapshot Version</p>
                    <p className="font-medium">{state.snapshot_version ?? "—"}</p>
                  </div>
                  <div className="text-sm">
                    <p className="text-xs text-muted-foreground">Snapshot Rows</p>
                    <p className="font-medium">{state.snapshot_row_count ?? "—"}</p>
                  </div>
                  <div className="text-sm md:col-span-2">
                    <p className="text-xs text-muted-foreground">Snapshot Hash</p>
                    <p className="font-mono text-xs break-all">{state.snapshot_hash || "—"}</p>
                  </div>
                  <div className="text-sm md:col-span-2">
                    <p className="text-xs text-muted-foreground">Public Commit Hash</p>
                    <p className="font-mono text-xs break-all">{state.public_commit_hash || "—"}</p>
                  </div>
                </div>
              </DetailPanel>
              <Timeline title="Coordination timeline">
                {workflowEvents.map((event) => (
                  <div key={event.label} className="rounded-xl border border-border bg-background px-3 py-2">
                    <p className="text-xs text-muted-foreground">{event.label}</p>
                    <p className="text-sm font-medium text-foreground">{event.value}</p>
                  </div>
                ))}
              </Timeline>
            </section>

            <DetailPanel title="Navigation" description="Move safely between register, detail, and control-center surfaces.">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/batches/${state.batch_id}`}
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Open Batch Detail
                </Link>
                <Link
                  href="/admin/batches"
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Open Batch Register
                </Link>
              </div>
            </DetailPanel>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
