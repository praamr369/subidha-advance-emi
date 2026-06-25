"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import StatusBadge from "@/components/ui/status-badge";
import {
  getAdminCollectionControlCenter,
  getCashierCollectionControlCenter,
  type CollectionControlCenterRole,
  type CollectionControlFinanceAccount,
  type CollectionControlPayload,
} from "@/services/collection-control-center";

function hasMetricValue(value: string | number | null | undefined): value is string | number {
  return value !== null && value !== undefined && value !== "";
}

function money(value: string | number | null | undefined): string {
  if (!hasMetricValue(value)) return "Not exposed";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `₹${parsed.toFixed(2)}` : "Not exposed";
}

function accountBlocker(account: CollectionControlFinanceAccount): string {
  return (
    account.collection_blocker_reason ||
    "Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account."
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Could not load collection readiness.";
}

function controlCenterFallback(role: CollectionControlCenterRole): string {
  return role === "cashier" ? "/cashier/collections/control-center" : "/admin/collections/control-center";
}

type InlineCollectionWorkflow = "advance-emi" | "direct-sale" | "unified" | "subscription";

function normalizeWorkflow(value: string | null | undefined): InlineCollectionWorkflow {
  const token = String(value || "").trim().toLowerCase();
  if (token === "direct-sale") return "direct-sale";
  if (token === "unified") return "unified";
  if (token === "subscription") return "subscription";
  return "advance-emi";
}

function workflowTitle(workflow: InlineCollectionWorkflow): string {
  if (workflow === "direct-sale") return "Direct-sale collection readiness";
  if (workflow === "unified") return "Unified collection readiness";
  return "Advance EMI collection readiness";
}

export default function CollectionInlineReadinessBanner({
  role,
  workflow,
}: {
  role: CollectionControlCenterRole;
  workflow?: InlineCollectionWorkflow;
}) {
  const searchParams = useSearchParams();
  const [payload, setPayload] = useState<CollectionControlPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = role === "cashier"
        ? await getCashierCollectionControlCenter()
        : await getAdminCollectionControlCenter();
      setPayload(next);
      setError(null);
    } catch (err) {
      setPayload(null);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  const operationalAccounts = useMemo(
    () => payload?.finance_account_readiness.operational_collection_accounts ?? payload?.finance_account_readiness.accounts ?? [],
    [payload?.finance_account_readiness.accounts, payload?.finance_account_readiness.operational_collection_accounts],
  );
  const blockedAccounts = useMemo(
    () => operationalAccounts.filter((account) => !(account.selectable_for_collection || account.is_selectable_collection_account || account.collection_ready)),
    [operationalAccounts],
  );
  const counts = payload?.finance_account_readiness.counts;
  const summary = payload?.summary;
  const hasBlockers = blockedAccounts.length > 0;
  const controlCenterHref = payload?.route_hints.collection_center || controlCenterFallback(role);
  const activeWorkflow = workflow ?? normalizeWorkflow(searchParams.get("workflow"));
  const workflowLabel = workflowTitle(activeWorkflow);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm" aria-label="Collection readiness">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {hasBlockers ? (
              <AlertTriangle className="h-4 w-4 text-amber-700" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            )}
            {workflowLabel}
          </div>
          <p className="text-sm text-muted-foreground">
            Read-only posture from the Collection Control Center. Posting still uses the existing collection endpoints and finance-account readiness validation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={controlCenterHref}
            className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
          >
            Open control center
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          {role === "admin" && payload?.route_hints.accounting_setup ? (
            <Link
              href={payload.route_hints.accounting_setup}
              className="inline-flex items-center rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
            >
              Accounting setup
            </Link>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-4">
          <LoadingBlock label="Checking collection readiness..." />
        </div>
      ) : null}

      {!loading && error ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div className="font-semibold">Could not load collection readiness.</div>
          <div className="mt-1">{error} Collection form remains available; backend posting validation still applies.</div>
        </div>
      ) : null}

      {!loading && !error && !payload ? (
        <div className="mt-4">
          <EmptyState title="No readiness payload" description="The read-only collection readiness API returned no data." />
        </div>
      ) : null}

      {payload && summary && counts ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-6">
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ready accounts</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{counts.selectable_count ?? counts.ready_count}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Blocked accounts</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-foreground">
                {counts.blocked_count}
                {counts.blocked_count > 0 ? <StatusBadge status="BLOCKED" label="Blocked" hideIcon /> : null}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Overdue EMI</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{summary.overdue_count}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pending EMI</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{money(summary.pending_emi_amount)}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Direct sale due</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{money(summary.direct_sale_outstanding_amount)}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rent / lease due</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{money(summary.rent_lease_due_amount)}</div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            Receipt posture: {summary.pending_receipt_count ?? "Not exposed"} · Reconciliation posture: {summary.unreconciled_collection_count ?? "Not exposed"}. Unknown values are not inferred in the collection page.
          </div>

          {blockedAccounts.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="font-semibold">Finance account blocker guidance</div>
              <div className="mt-1 text-amber-900">
                Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account. System posting profiles are diagnostic only and cannot receive customer collections.
              </div>
              <div className="mt-3 space-y-2">
                {blockedAccounts.slice(0, 3).map((account) => (
                  <div key={account.id} className="rounded-lg border border-amber-200 bg-card px-3 py-2">
                    <div className="font-medium text-amber-950">{account.name} · {account.kind}</div>
                    <div className="mt-1 text-xs text-amber-900">{accountBlocker(account)}</div>
                    {account.recommended_action ? (
                      <div className="mt-1 text-xs text-amber-800">{account.recommended_action}</div>
                    ) : null}
                  </div>
                ))}
              </div>
              {role === "cashier" ? (
                <div className="mt-3 rounded-lg border border-amber-300 bg-card px-3 py-2 text-xs font-medium text-amber-950">
                  Ask admin to fix accounting setup.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
              Finance accounts currently exposed by the control-center API are collection-ready. Posting still remains server-validated.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
