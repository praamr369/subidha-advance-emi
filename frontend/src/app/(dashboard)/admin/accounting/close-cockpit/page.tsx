"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  getAccountingCloseCockpit,
  type CloseCockpitPayload,
  type CloseCockpitBlocker,
  type CloseCockpitActionItem,
} from "@/services/accounting";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function statusTone(s: string): string {
  if (s === "CRITICAL") return "text-red-600 font-semibold";
  if (s === "WARNING") return "text-amber-600 font-semibold";
  if (s === "OK") return "text-green-700 font-semibold";
  return "text-muted-foreground";
}

function statusBadge(s: string) {
  if (s === "CRITICAL") return "bg-red-100 text-red-700 border border-red-200";
  if (s === "WARNING") return "bg-amber-100 text-amber-700 border border-amber-200";
  if (s === "OK") return "bg-green-100 text-green-800 border border-green-200";
  return "bg-muted text-muted-foreground border border-border";
}

function canBadge(val: boolean) {
  return val
    ? "bg-green-100 text-green-800 border border-green-200"
    : "bg-red-100 text-red-700 border border-red-200";
}

function SeverityDot({ severity }: { severity: string }) {
  if (severity === "CRITICAL") return <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-2" />;
  if (severity === "WARNING") return <span className="inline-block h-2 w-2 rounded-full bg-amber-500 mr-2" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-blue-400 mr-2" />;
}

function BlockerList({ items, emptyLabel }: { items?: CloseCockpitBlocker[] | null; emptyLabel: string }) {
  const safeItems = Array.isArray(items) ? items : [];

  if (safeItems.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-2">
      {safeItems.map((b) => (
        <li key={b.key} className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <SeverityDot severity={b.severity} />
          <div>
            <div className="font-medium">{b.title}</div>
            <div className="text-xs text-muted-foreground">{b.description}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ActionItemList({ items }: { items?: CloseCockpitActionItem[] | null }) {
  const safeItems = Array.isArray(items) ? items : [];

  if (safeItems.length === 0) {
    return <p className="text-sm text-muted-foreground">No action items.</p>;
  }
  return (
    <ul className="space-y-2">
      {safeItems.map((item) => (
        <li key={item.key} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
          <SeverityDot severity={item.severity} />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{item.title}</span>
              {item.deferred && (
                <span className="rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">deferred</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{item.description}</div>
            <div className="mt-0.5 text-xs text-muted-foreground/70">Source: {item.source_area}</div>
          </div>
          {item.count > 0 && (
            <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-mono">
              {item.count}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function SectionCard({ title, section }: { title: string; section: { status: string; deferred?: boolean; message?: string; [key: string]: unknown } }) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadge(section.status)}`}>
          {section.deferred ? "DEFERRED" : section.status}
        </span>
      </div>
      {section.deferred && section.message && (
        <p className="mt-1 text-xs text-muted-foreground">{section.message}</p>
      )}
    </div>
  );
}

export default function AccountingCloseCockpitPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cockpit, setCockpit] = useState<CloseCockpitPayload | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getAccountingCloseCockpit({ year, month });
      setCockpit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load close cockpit.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const yearOptions = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i);
  const blockers = Array.isArray(cockpit?.blockers) ? cockpit.blockers : [];
  const warnings = Array.isArray(cockpit?.warnings) ? cockpit.warnings : [];
  const actionItems = Array.isArray(cockpit?.action_items) ? cockpit.action_items : [];

  return (
    <ERPPageShell
      eyebrow="Accounting Governance"
      title="Period Close Cockpit"
      subtitle="Read-only period-close readiness dashboard. Combines P2C month-end, P4A financial intelligence, P4B trial balance, and P4C liability reconciliation. No financial records are mutated here."
      helperNote="Period lock is an explicit manual action on the Accounting Periods page. This cockpit shows readiness only."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Close Cockpit" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingPeriods, label: "Manage Periods", variant: "secondary" },
        { href: ROUTES.admin.accountingTrialBalance, label: "Trial Balance", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only — Read Only", tone: "info" }}
    >
      {/* Period selector */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Period:</label>
        <select
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {loading && <ERPLoadingState label="Loading close cockpit…" />}

      {!loading && error && (
        <ERPErrorState
          title="Unable to load close cockpit"
          description={error}
          onRetry={() => void load()}
        />
      )}

      {!loading && !error && !cockpit && (
        <ERPEmptyState title="No data" description="No cockpit data returned." />
      )}

      {!loading && !error && cockpit && (
        <div className="space-y-6">
          {/* Overall status card */}
          <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {MONTHS[(cockpit.period.month ?? 1) - 1]} {cockpit.period.year}
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <span className={`text-2xl font-bold ${statusTone(cockpit.overall_status)}`}>
                    {cockpit.overall_status}
                  </span>
                  <span className="text-sm text-muted-foreground">As of {cockpit.as_of}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex flex-col items-center rounded-xl border border-border px-4 py-2">
                  <span className="text-xs text-muted-foreground">Can Close</span>
                  <span className={`mt-1 rounded px-2 py-0.5 text-sm font-semibold ${canBadge(cockpit.can_close)}`}>
                    {cockpit.can_close ? "YES" : "NO"}
                  </span>
                </div>
                <div className="flex flex-col items-center rounded-xl border border-border px-4 py-2">
                  <span className="text-xs text-muted-foreground">Can Lock</span>
                  <span className={`mt-1 rounded px-2 py-0.5 text-sm font-semibold ${canBadge(cockpit.can_lock)}`}>
                    {cockpit.can_lock ? "YES" : "NO"}
                  </span>
                </div>
              </div>
            </div>
            {cockpit.can_lock && cockpit.sections.period_lock.period_id && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                Period lock is available. Use{" "}
                <Link href={ROUTES.admin.accountingPeriods} className="underline">
                  Accounting Periods
                </Link>{" "}
                to lock period <strong>{cockpit.period_state.period_code}</strong> with audit trail.
              </div>
            )}
          </div>

          {/* Section status cards */}
          <ERPSectionShell
            title="Section readiness"
            description="Status of each readiness layer. Expand individual sections for detail."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <SectionCard title="Month-End Close (P2C)" section={cockpit.sections.month_end} />
              <SectionCard title="Financial Intelligence (P4A)" section={cockpit.sections.financial_intelligence} />
              <SectionCard title="Trial Balance (P4B)" section={cockpit.sections.trial_balance} />
              <SectionCard title="Liability Reconciliation (P4C)" section={cockpit.sections.liability_reconciliation} />
              <SectionCard title="Period Lock" section={{ status: cockpit.sections.period_lock.period_exists ? (cockpit.sections.period_lock.is_closed ? "CLOSED" : cockpit.sections.period_lock.is_locked ? "LOCKED" : "OPEN") : "MISSING" }} />
            </div>
          </ERPSectionShell>

          {/* Period state */}
          <ERPSectionShell title="Period state" description="AccountingPeriod lock and close posture for this month.">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Period code: </span>
                <span className="font-mono">{cockpit.period_state.period_code ?? "—"}</span>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Status: </span>
                <span className={statusTone(cockpit.period_state.status ?? "INFO")}>
                  {cockpit.period_state.status ?? "—"}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Locked: </span>
                <span>{cockpit.period_state.is_locked ? "Yes" : "No"}</span>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-muted-foreground">Closed: </span>
                <span>{cockpit.period_state.is_closed ? "Yes" : "No"}</span>
              </div>
            </div>
            {cockpit.sections.period_lock.period_exists && (
              <div className="mt-3 text-xs text-muted-foreground">
                Lock endpoint:{" "}
                <span className="font-mono">{cockpit.sections.period_lock.existing_lock_endpoint}</span>
                {" — "} use via{" "}
                <Link href={ROUTES.admin.accountingPeriods} className="underline">
                  Accounting Periods
                </Link>
              </div>
            )}
          </ERPSectionShell>

          {/* Blockers */}
          <ERPSectionShell
            title={`Blockers (${blockers.length})`}
            description="Critical conditions that prevent period close. All must be resolved before can_close = true."
          >
            <BlockerList items={blockers} emptyLabel="No blockers — period is ready to close." />
          </ERPSectionShell>

          {/* Warnings */}
          <ERPSectionShell
            title={`Warnings (${warnings.length})`}
            description="Non-blocking conditions that should be reviewed before close."
          >
            <BlockerList items={warnings} emptyLabel="No warnings." />
          </ERPSectionShell>

          {/* Action items */}
          <ERPSectionShell
            title={`Action items (${actionItems.length})`}
            description="Prioritised items from all readiness layers. CRITICAL items must be resolved before close."
          >
            <ActionItemList items={actionItems} />
          </ERPSectionShell>

          {/* Quick navigation */}
          <ERPSectionShell title="Related pages" description="Navigate to the source pages to act on the items above.">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {[
                { label: "Accounting Periods", href: ROUTES.admin.accountingPeriods },
                { label: "Trial Balance (P4B)", href: ROUTES.admin.accountingTrialBalance },
                { label: "Journals", href: ROUTES.admin.accountingJournals },
                { label: "Bridge Reconciliation", href: ROUTES.admin.accountingBridgeReconciliation },
                { label: "Accounting Setup", href: ROUTES.admin.accountingSetup },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </ERPSectionShell>
        </div>
      )}
    </ERPPageShell>
  );
}
