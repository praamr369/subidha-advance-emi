"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { FormSection, KpiCard, QuickActionGrid, WorkflowCard } from "@/components/ui/operations";
import {
  getAdminCollectionControlCenter,
  getCashierCollectionControlCenter,
  type CollectionControlCenterRole,
  type CollectionControlFinanceAccount,
  type CollectionControlPayload,
  type CollectionControlRecentPayment,
} from "@/services/collection-control-center";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function accountBlocker(account: CollectionControlFinanceAccount): string {
  return (
    account.collection_blocker_reason ||
    "This account cannot receive payments because it is mapped to a non-posting Chart of Account."
  );
}

function FinanceReadinessBanner({ payload }: { payload: CollectionControlPayload }) {
  const counts = payload.finance_account_readiness.counts;
  const blocked = counts.blocked_count > 0;
  return (
    <section
      className={[
        "rounded-2xl border p-5 shadow-sm",
        blocked ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950",
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">Collection readiness</div>
          <h2 className="mt-1 text-xl font-semibold">
            {blocked ? "Finance account blockers need attention" : "Finance accounts ready for collection"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm opacity-90">
            Collection still uses existing approved endpoints. Blocked accounts are shown as operational blockers and cannot be used to bypass posting-readiness rules.
          </p>
        </div>
        {payload.role === "admin" && payload.route_hints.accounting_setup ? (
          <Link
            href={payload.route_hints.accounting_setup}
            className="inline-flex rounded-xl border border-current/25 bg-white px-3 py-2 text-sm font-semibold shadow-sm transition hover:bg-white/80"
          >
            Open Accounting Setup
          </Link>
        ) : (
          <div className="rounded-xl border border-current/20 bg-white/60 px-3 py-2 text-sm font-medium">
            Ask admin to fix accounting setup
          </div>
        )}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-current/20 bg-white/60 p-4">
          <div className="text-xs font-medium uppercase tracking-wide">Ready accounts</div>
          <div className="mt-1 text-2xl font-semibold">{counts.ready_count}</div>
        </div>
        <div className="rounded-xl border border-current/20 bg-white/60 p-4">
          <div className="text-xs font-medium uppercase tracking-wide">Blocked accounts</div>
          <div className="mt-1 text-2xl font-semibold">{counts.blocked_count}</div>
        </div>
        <div className="rounded-xl border border-current/20 bg-white/60 p-4">
          <div className="text-xs font-medium uppercase tracking-wide">Cash ready</div>
          <div className="mt-1 text-2xl font-semibold">{counts.cash_ready_count}</div>
        </div>
        <div className="rounded-xl border border-current/20 bg-white/60 p-4">
          <div className="text-xs font-medium uppercase tracking-wide">Bank / UPI ready</div>
          <div className="mt-1 text-2xl font-semibold">{counts.bank_ready_count + counts.upi_ready_count}</div>
        </div>
      </div>
    </section>
  );
}

function FinanceAccountTable({ payload }: { payload: CollectionControlPayload }) {
  const accounts = payload.finance_account_readiness.accounts;
  return (
    <FormSection
      title="Finance account selector readiness"
      description="Blocked rows remain visible for diagnosis but should be disabled in collection selectors."
    >
      {accounts.length === 0 ? (
        <EmptyState title="No active finance accounts" description="No active cash, bank, or UPI finance accounts are available for collection." />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Account</th>
                <th className="px-3 py-3">Kind</th>
                <th className="px-3 py-3">Mapped COA</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Blocker / guidance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((account) => (
                <tr key={account.id} className={account.collection_ready ? "" : "bg-amber-50/40"}>
                  <td className="px-3 py-3 font-medium text-foreground">{account.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{account.kind}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {account.mapped_chart_account
                      ? `${account.mapped_chart_account.code} — ${account.mapped_chart_account.name}`
                      : "Not mapped"}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={account.collection_ready ? "READY" : "BLOCKED"} label={account.collection_ready ? "Ready" : "Blocked"} />
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {account.collection_ready ? "Can receive payments." : accountBlocker(account)}
                    {!account.collection_ready && account.recommended_action ? (
                      <div className="mt-1 text-xs">{account.recommended_action}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </FormSection>
  );
}

function RecentCollections({ rows }: { rows: CollectionControlRecentPayment[] }) {
  return (
    <FormSection title="Recent collections" description="Read-only recent subscription payment records returned by the backend.">
      {rows.length === 0 ? (
        <EmptyState title="No recent collections" description="No recent payment rows were returned for this role scope." />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">Payment #{row.id} · {money(row.amount)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {row.customer_name || "Unknown customer"} · {row.subscription_number || (row.subscription_id ? `SUB-${row.subscription_id}` : "No subscription")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    EMI {row.emi_month_no ?? row.emi_id ?? "—"} · {row.finance_account_name || "No finance account"} · Ref {row.reference_no || "—"}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">{formatDate(row.payment_date)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </FormSection>
  );
}

export default function CollectionControlCenterView({ role }: { role: CollectionControlCenterRole }) {
  const [payload, setPayload] = useState<CollectionControlPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPayload(role === "cashier" ? await getCashierCollectionControlCenter() : await getAdminCollectionControlCenter());
      setError(null);
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : "Unable to load collection control center.");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = role === "cashier" ? "Cashier Collection Control Center" : "Collection Control Center";
  const breadcrumbs = role === "cashier"
    ? [{ label: "Cashier", href: "/cashier" }, { label: "Collection Control Center" }]
    : [{ label: "Admin", href: "/admin" }, { label: "Finance", href: "/admin/finance" }, { label: "Collection Control Center" }];

  const summary = payload?.summary;
  const lanes = useMemo(() => payload?.collection_lanes ?? [], [payload?.collection_lanes]);

  return (
    <PortalPage
      eyebrow="Collections"
      title={title}
      subtitle="One operational view for collection readiness, receivable lanes, finance account blockers, recent collections, and receipt/reconciliation posture exposed by existing services."
      breadcrumbs={breadcrumbs}
      actions={[
        { href: role === "cashier" ? "/cashier/collect" : "/admin/finance/collect?workflow=advance-emi", label: "Open EMI Collection", variant: "primary" },
        { href: role === "cashier" ? "/cashier/collect?workflow=direct-sale" : "/admin/finance/collect?workflow=direct-sale", label: "Open Direct Sale", variant: "secondary" },
        { href: role === "cashier" ? "/cashier/payments" : "/admin/payments", label: "Payment History", variant: "secondary" },
      ]}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading collection control center..." /> : null}
        {!loading && error ? <ErrorState title="Unable to load collection control center" description={error} onRetry={() => void load()} /> : null}
        {!loading && !error && !payload ? <EmptyState title="No collection control data" description="The backend returned no collection control payload." /> : null}

        {payload && summary ? (
          <>
            <FinanceReadinessBanner payload={payload} />

            <QuickActionGrid>
              <KpiCard label="Due today" value={summary.due_today_count} helper="Pending EMI rows due today" />
              <KpiCard label="Overdue" value={summary.overdue_count} helper="Pending EMI rows past due date" />
              <KpiCard label="Pending EMI amount" value={money(summary.pending_emi_amount)} helper={`${summary.pending_emi_count} pending rows`} />
              <KpiCard label="Direct-sale outstanding" value={money(summary.direct_sale_outstanding_amount)} helper={`${summary.direct_sale_outstanding_count} invoiced balances`} />
              <KpiCard label="Rent/lease due" value={money(summary.rent_lease_due_amount)} helper={`${summary.rent_lease_due_count} demand rows`} />
              <KpiCard label="Blocked accounts" value={summary.blocked_finance_account_count} helper="Finance accounts not collection-ready" />
            </QuickActionGrid>

            <FormSection title="Collection lanes" description="Buttons only navigate to real implemented collection routes. Deferred lanes do not expose fake actions.">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {lanes.map((lane) => (
                  <WorkflowCard
                    key={lane.key}
                    title={lane.label}
                    description={lane.description || ""}
                    action={
                      lane.enabled && lane.route ? (
                        <Link href={lane.route} className="inline-flex rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold">
                          Open lane
                        </Link>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                          Deferred — endpoint not exposed for collection action yet.
                        </div>
                      )
                    }
                  />
                ))}
              </div>
            </FormSection>

            <FormSection title="Receipt and reconciliation posture" description="Only backend-exposed fields are shown; unknown values are not invented.">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pending receipts</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{summary.pending_receipt_count ?? "Not exposed"}</div>
                  <p className="mt-1 text-sm text-muted-foreground">Shown only when receipt status is available from backend.</p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unreconciled collections</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{summary.unreconciled_collection_count ?? "Not exposed"}</div>
                  <p className="mt-1 text-sm text-muted-foreground">Shown only when reconciliation status is available from backend.</p>
                </div>
              </div>
            </FormSection>

            <FinanceAccountTable payload={payload} />
            <RecentCollections rows={payload.recent_collections} />
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
