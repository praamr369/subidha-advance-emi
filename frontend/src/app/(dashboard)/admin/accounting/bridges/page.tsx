"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  getAccountingBridgeReadiness,
  type AccountingBridgeReadinessAccount,
  type AccountingBridgeReadinessEvent,
  type AccountingBridgeReadinessPayload,
} from "@/services/accounting-bridge-readiness";

const PURCHASE_VENDOR_EVENT_KEYS = new Set([
  "vendor_purchase_bill",
  "vendor_payment",
  "purchase_inventory_receive",
  "vendor_return",
  "purchase_expense",
]);

const INVENTORY_EVENT_KEYS = new Set([
  "inventory_purchase_receive",
  "inventory_adjustment_gain",
  "inventory_adjustment_loss",
  "inventory_delivery_out",
]);

const MANUFACTURING_EVENT_KEYS = new Set([
  "manufacturing_consumption",
  "manufacturing_output",
  "manufacturing_wastage",
]);

const PAYROLL_EVENT_KEYS = new Set([
  "salary_expense",
  "salary_payable",
  "salary_payment",
  "staff_advance",
  "expense_claim_payment",
]);

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function bridgeGroupName(event: AccountingBridgeReadinessEvent): string {
  if (INVENTORY_EVENT_KEYS.has(event.event_key)) return "Inventory";
  if (MANUFACTURING_EVENT_KEYS.has(event.event_key)) return "Manufacturing";
  if (PURCHASE_VENDOR_EVENT_KEYS.has(event.event_key)) return "Purchase & Vendors";
  if (PAYROLL_EVENT_KEYS.has(event.event_key)) return "HR & Payroll";
  return event.event_group || event.source_module || "Other";
}

function statusClass(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (normalized === "INFO") return "border-blue-200 bg-blue-50 text-blue-900";
  if (normalized === "WARNING") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-red-200 bg-red-50 text-red-900";
}

function accountLabel(account: AccountingBridgeReadinessAccount): string {
  const code = account.code ? `${account.code} · ` : "";
  const name = account.name ?? account.kind ?? "Configured account";
  const type = account.account_type ? ` (${account.account_type})` : "";
  const purpose = account.purpose ? ` · ${account.purpose}` : account.requirement ? ` · ${account.requirement}` : "";
  return `${code}${name}${type}${purpose}`;
}

function AccountList({ accounts, emptyLabel }: { accounts: AccountingBridgeReadinessAccount[]; emptyLabel: string }) {
  if (!accounts.length) return <span className="text-muted-foreground">{emptyLabel}</span>;
  return (
    <ul className="space-y-1">
      {accounts.map((account, index) => (
        <li key={`${account.id ?? account.name ?? account.kind ?? "account"}-${account.purpose ?? account.requirement ?? index}`}>
          {accountLabel(account)}
        </li>
      ))}
    </ul>
  );
}

function BlockingReasons({ event }: { event: AccountingBridgeReadinessEvent }) {
  if (!event.blocking_reasons.length) return <span className="text-emerald-700">No blocking reasons.</span>;
  return (
    <ul className="list-disc space-y-1 pl-4 text-red-800">
      {event.blocking_reasons.map((reason, index) => (
        <li key={`${event.event_key}-reason-${index}-${reason.slice(0, 24)}`}>{reason}</li>
      ))}
    </ul>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={cx("rounded-2xl border p-4 shadow-sm", tone)}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default function AccountingBridgeReadinessPage() {
  const [payload, setPayload] = useState<AccountingBridgeReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load({ silent = false }: { silent?: boolean } = {}) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setPayload(await getAccountingBridgeReadiness());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounting bridge readiness.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const groupedEvents = useMemo(() => {
    const groups = new Map<string, AccountingBridgeReadinessEvent[]>();
    for (const event of payload?.events ?? []) {
      const key = bridgeGroupName(event);
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [payload?.events]);

  if (loading) {
    return (
      <PortalPage title="Accounting Bridge Readiness" subtitle="Validating operational finance/accounting bridge mappings against real Chart of Accounts and FinanceAccount setup.">
        <LoadingBlock label="Loading accounting bridge readiness..." />
      </PortalPage>
    );
  }

  const summary = payload?.summary ?? {
    ready_count: 0,
    info_count: 0,
    warning_count: 0,
    error_count: 0,
    not_configured_count: 0,
  };

  return (
    <PortalPage
      title="Accounting Bridge Readiness"
      subtitle="Read-only readiness checks for future accounting bridge posting. This page does not post journals, create receipts, allocate settlements, or mutate source records."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Bridge Readiness" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingSetup, label: "Accounting Setup", variant: "secondary" },
        { href: ROUTES.admin.accountingChartOfAccounts, label: "Chart of Accounts", variant: "secondary" },
      ]}
      statusBadge={{ label: "Readiness Only", tone: "info" }}
    >
      <div className="space-y-6">
        {error ? <ErrorState title="Unable to load bridge readiness" description={error} onRetry={() => void load()} /> : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Universal readiness registry</div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Operational event mapping status</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                Each event below answers only whether its future accounting bridge would have safe debit, credit, and finance-account mappings. Posting remains disabled here by design.
              </p>
            </div>
            <ActionButton variant="secondary" onClick={() => void load({ silent: true })} disabled={refreshing}>
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard label="Ready" value={summary.ready_count} tone="border-emerald-200 bg-emerald-50 text-emerald-900" />
            <SummaryCard label="Info" value={summary.info_count} tone="border-blue-200 bg-blue-50 text-blue-900" />
            <SummaryCard label="Warning" value={summary.warning_count} tone="border-amber-200 bg-amber-50 text-amber-950" />
            <SummaryCard label="Error" value={summary.error_count} tone="border-red-200 bg-red-50 text-red-900" />
            <SummaryCard label="Not configured" value={summary.not_configured_count} tone="border-slate-200 bg-slate-50 text-slate-900" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={ROUTES.admin.accountingSetup} className="rounded-xl border px-3 py-2 text-sm font-semibold">Accounting Setup</Link>
            <Link href={ROUTES.admin.financeCollect} className="rounded-xl border px-3 py-2 text-sm font-semibold">Finance Collection</Link>
            <Link href={ROUTES.admin.billingDirectSales} className="rounded-xl border px-3 py-2 text-sm font-semibold">Direct Sale</Link>
            <Link href={ROUTES.admin.payments} className="rounded-xl border px-3 py-2 text-sm font-semibold">Payments</Link>
            <Link href={ROUTES.admin.rentLease} className="rounded-xl border px-3 py-2 text-sm font-semibold">Rent/Lease</Link>
            <Link href={ROUTES.admin.financeDeposits} className="rounded-xl border px-3 py-2 text-sm font-semibold">Deposits</Link>
          </div>
        </section>

        {groupedEvents.length === 0 ? (
          <WorkspaceSection title="No bridge events exposed" description="No operational source modules with bridge readiness registry entries were found in this repository state.">
            <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground shadow-sm">
              Confirm that source modules are installed before enabling any future accounting bridge work.
            </div>
          </WorkspaceSection>
        ) : null}

        {groupedEvents.map(([groupName, events]) => (
          <WorkspaceSection
            key={`bridge-group-${groupName}`}
            title={groupName}
            description="Readiness is based on active FinanceAccount, FinanceAccountCoaMapping, RentLeaseAccountingAccountMapping, and Chart of Accounts setup."
          >
            <div className="overflow-x-auto rounded-2xl border border-border bg-background shadow-sm">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Event</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Debit readiness</th>
                    <th className="px-4 py-3 font-semibold">Credit readiness</th>
                    <th className="px-4 py-3 font-semibold">Finance account readiness</th>
                    <th className="px-4 py-3 font-semibold">Posting mode</th>
                    <th className="px-4 py-3 font-semibold">Operator action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {events.map((event) => (
                    <tr key={event.event_key} className="align-top">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-foreground">{event.label}</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{event.event_key}</div>
                        {event.source_model ? <div className="mt-1 text-xs text-muted-foreground">Source: {event.source_model}</div> : null}
                      </td>
                      <td className="px-4 py-4">
                        <span className={cx("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", statusClass(event.status))}>
                          {event.status}
                        </span>
                        <div className="mt-2 text-xs text-muted-foreground">Can post: {event.can_post ? "Yes" : "No"}</div>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <div className="font-semibold text-foreground">Required</div>
                        <div className="mt-1 text-muted-foreground">{(event.debit_requirements ?? []).join(", ") || "Not specified"}</div>
                        <div className="mt-3 font-semibold text-foreground">Configured</div>
                        <div className="mt-1"><AccountList accounts={event.debit_accounts} emptyLabel="No debit account configured." /></div>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <div className="font-semibold text-foreground">Required</div>
                        <div className="mt-1 text-muted-foreground">{(event.credit_requirements ?? []).join(", ") || "Not specified"}</div>
                        <div className="mt-3 font-semibold text-foreground">Configured</div>
                        <div className="mt-1"><AccountList accounts={event.credit_accounts} emptyLabel="No credit account configured." /></div>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <AccountList accounts={event.finance_accounts} emptyLabel="No finance account required or configured." />
                        <div className="mt-3"><BlockingReasons event={event} /></div>
                      </td>
                      <td className="px-4 py-4 text-xs font-semibold text-foreground">{event.posting_mode}</td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">{event.operator_action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </WorkspaceSection>
        ))}
      </div>
    </PortalPage>
  );
}
