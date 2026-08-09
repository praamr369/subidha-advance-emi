"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleAlert, Clock3, Download, ExternalLink, Filter, RefreshCw, ShieldAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { ROUTES } from "@/lib/routes";
import {
  getInventoryReadiness,
  dismissInventoryWarning,
  restoreInventoryWarning,
  type InventoryReadinessIssue,
  type InventoryReadinessResponse,
  type InventoryReadinessSection,
  type InventoryReadinessStatus,
} from "@/services/inventory-ops";

const ALLOWED_SHORTCUTS = new Set<string>([
  ROUTES.admin.inventory,
  ROUTES.admin.inventoryItems,
  ROUTES.admin.inventoryLocations,
  ROUTES.admin.inventoryLedger,
  ROUTES.admin.inventoryAdjustments,
  ROUTES.admin.inventoryOpeningStock,
  ROUTES.admin.inventoryStockNeeds,
  ROUTES.admin.inventoryProfiles,
  ROUTES.admin.deliveries,
  ROUTES.admin.billingDirectSaleWorkspace,
  ROUTES.admin.accountingSetup,
  ROUTES.admin.accountingControlCenter,
  ROUTES.admin.paymentReconciliation,
  ROUTES.admin.purchaseBills,
  ROUTES.admin.purchaseOrders,
  ROUTES.admin.purchaseReceipts,
  ROUTES.admin.purchaseRequests,
]);

const STATUS_COPY: Record<InventoryReadinessStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  READY: { label: "Ready", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-950", icon: CheckCircle2 },
  WARNINGS: { label: "Warnings", className: "border-amber-500/40 bg-amber-500/10 text-amber-950", icon: AlertTriangle },
  BLOCKED: { label: "Blocked", className: "border-red-500/40 bg-red-500/10 text-red-950", icon: ShieldAlert },
};

type FilterCategory = "ALL" | "BLOCKERS" | "WARNINGS" | "INFO";

function formatTimestamp(value: string): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusBadgeClass(status: string): string {
  if (status === "BLOCKED") return "border-red-500/40 bg-red-500/10 text-red-800";
  if (status === "WARNING" || status === "WARNINGS") return "border-amber-500/40 bg-amber-500/10 text-amber-800";
  if (status === "INFO" || status === "ONBOARDING_PENDING") return "border-blue-500/40 bg-blue-500/10 text-blue-800";
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800";
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-border bg-card p-4"><div className="text-xs font-medium uppercase text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold text-foreground">{value}</div></div>;
}

function SectionCard({ section }: { section: InventoryReadinessSection }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-foreground">{section.label}</h2><p className="mt-1 text-sm text-muted-foreground">{section.blockers} blocker(s), {section.warnings} warning(s)</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(section.status)}`}>{section.status}</span></div>
      <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-border text-xs uppercase text-muted-foreground"><tr><th className="py-2 pr-4 font-medium">Check</th><th className="py-2 pr-4 font-medium">Status</th><th className="py-2 pr-4 font-medium">Count</th><th className="py-2 pr-4 font-medium">Detail</th><th className="py-2 font-medium">Action</th></tr></thead><tbody className="divide-y divide-border">{section.checks.map((check) => <tr key={check.key} className="align-top"><td className="py-3 pr-4 font-medium text-foreground">{check.label}</td><td className="py-3 pr-4"><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(check.status)}`}>{check.status}</span></td><td className="py-3 pr-4 tabular-nums text-muted-foreground">{check.count === null ? "-" : check.count}</td><td className="max-w-xl py-3 pr-4 text-muted-foreground">{check.detail}</td><td className="py-3">{check.action_href && ALLOWED_SHORTCUTS.has(check.action_href) ? <Link className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline" href={check.action_href}>{check.action_label || "Open"}<ExternalLink className="size-3.5" /></Link> : <span className="text-sm text-muted-foreground">Review</span>}</td></tr>)}</tbody></table></div>
    </section>
  );
}

function IssueGroup({
  title,
  issues,
  onDismiss,
  dismissing,
}: {
  title: string;
  issues: InventoryReadinessIssue[];
  onDismiss: (issue: InventoryReadinessIssue) => void;
  dismissing: Set<string>;
}) {
  if (issues.length === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Section</th>
              <th className="px-4 py-2 font-medium">Issue</th>
              <th className="px-4 py-2 font-medium">Object</th>
              <th className="px-4 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {issues.map((issue, index) => {
              const issueKey = `${issue.severity}-${issue.section}-${issue.title}-${index}`;
              const isDismissing = dismissing.has(issueKey);
              return (
                <tr key={issueKey} className="align-top">
                  <td className="px-4 py-3 text-muted-foreground">{issue.section || "General"}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{issue.title}</div>
                    <div className="mt-1 max-w-2xl text-muted-foreground">{issue.detail}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {issue.object_type && issue.object_id ? `${issue.object_type} #${issue.object_id}` : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {issue.action_href && ALLOWED_SHORTCUTS.has(issue.action_href) ? (
                        <Link
                          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          href={issue.action_href}
                        >
                          {issue.action_label || "Open"}
                          <ExternalLink className="size-3.5" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Review</span>
                      )}
                      {/* Dismiss button for non-blocker warnings */}
                      {issue.severity !== "BLOCKER" && (
                        <button
                          onClick={() => onDismiss(issue)}
                          disabled={isDismissing}
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Dismiss this warning"
                        >
                          {isDismissing ? "..." : <X className="size-4" />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function InventoryReadinessPage() {
  const [data, setData] = useState<InventoryReadinessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("ALL");
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());

  const loadReadiness = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const payload = await getInventoryReadiness();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory readiness.");
      setData(null);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

  const handleDismissWarning = async (issue: InventoryReadinessIssue) => {
    const issueKey = `${issue.severity}-${issue.section}-${issue.title}`;
    setDismissing(prev => new Set(prev).add(issueKey));

    try {
      await dismissInventoryWarning(
        issueKey,
        issue.severity === "WARNING" ? "CONFIGURATION" : "INFO",
        `Dismissed: ${issue.title}`
      );
      // Reload to refresh the view
      await loadReadiness(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss warning.");
    } finally {
      setDismissing(prev => {
        const newSet = new Set(prev);
        newSet.delete(issueKey);
        return newSet;
      });
    }
  };

  const handleExportReport = () => {
    if (!data) return;

    const issues = data.issues ?? [];
    const report = [
      "INVENTORY READINESS DIAGNOSTIC REPORT",
      `Generated: ${new Date().toLocaleString()}`,
      `Status: ${data.overall_status}`,
      "",
      "BLOCKERS:",
      ...issues
        .filter(i => i.severity === "BLOCKER")
        .map(i => `- [${i.section}] ${i.title}: ${i.detail}`),
      "",
      "WARNINGS:",
      ...issues
        .filter(i => i.severity === "WARNING")
        .map(i => `- [${i.section}] ${i.title}: ${i.detail}`),
    ].join("\n");

    const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `inventory-readiness-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const issueGroups = useMemo(() => {
    const issues = data?.issues ?? [];
    return {
      blockers: issues.filter(i => i.severity === "BLOCKER"),
      warnings: issues.filter(i => i.severity === "WARNING"),
      info: issues.filter(i => i.severity === "INFO"),
    };
  }, [data?.issues]);

  const filteredIssueGroups = useMemo(() => {
    if (filterCategory === "ALL") return issueGroups;
    if (filterCategory === "BLOCKERS") return { blockers: issueGroups.blockers, warnings: [], info: [] };
    if (filterCategory === "WARNINGS") return { blockers: [], warnings: issueGroups.warnings, info: [] };
    if (filterCategory === "INFO") return { blockers: [], warnings: [], info: issueGroups.info };
    return issueGroups;
  }, [issueGroups, filterCategory]);

  const shortcuts = useMemo(() => (data?.operator_shortcuts ?? []).filter(s => ALLOWED_SHORTCUTS.has(s.href)), [data?.operator_shortcuts]);
  const status = data?.overall_status ?? "WARNINGS";
  const statusCopy = STATUS_COPY[status];
  const StatusIcon = statusCopy.icon;

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Inventory Readiness"
      subtitle="Enterprise diagnostic center for stock, delivery, returns, finance mapping, and reconciliation readiness. Run diagnostics, filter issues, and acknowledge warnings."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Readiness" },
      ]}
      actions={[
        { label: "Inventory", href: ROUTES.admin.inventory, variant: "secondary" },
        { label: "Stock needs", href: ROUTES.admin.inventoryStockNeeds, variant: "secondary" },
        { label: "Opening stock", href: ROUTES.admin.inventoryOpeningStock, variant: "secondary" },
      ]}
      statusBadge={{ label: "Diagnostic", tone: "info" }}
    >
      <div className="space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => loadReadiness(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Running..." : "Run Diagnostics"}
          </button>

          <button
            onClick={handleExportReport}
            disabled={!data || loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Download className="h-4 w-4" />
            Export Report
          </button>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value as FilterCategory)}
              className="bg-transparent text-sm font-medium outline-none"
            >
              <option value="ALL">All Issues</option>
              <option value="BLOCKERS">Blockers Only</option>
              <option value="WARNINGS">Warnings Only</option>
              <option value="INFO">Info Only</option>
            </select>
          </div>
        </div>

        {loading ? (
          <ERPLoadingState label="Loading inventory readiness..." />
        ) : null}
        {!loading && error ? (
          <ERPErrorState
            title="Unable to load inventory readiness"
            description={`${error} Check API connectivity and retry this diagnostic.`}
          />
        ) : null}
        {!loading && !error && data?.module_not_configured ? (
          <WorkspaceNotice tone="warning" title="Inventory module not configured">
            Inventory evaluation module is not configured on this deployment. Verify migrations and API connectivity.
          </WorkspaceNotice>
        ) : null}
        {!loading && !error && data && !data.module_not_configured ? (
          <>
            <WorkspaceNotice tone="info" title="Inventory onboarding pending is allowed">
              Stock upload is not required for initial system setup. You can enter opening stock manually later. CSV import is optional. Inventory accounting readiness may remain onboarding-pending until opening stock is captured; this must not fake stock availability.
            </WorkspaceNotice>
            <section className={`rounded-lg border p-5 ${statusCopy.className}`} aria-label="Overall inventory readiness">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <StatusIcon className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium uppercase">Overall Readiness</div>
                    <h2 className="mt-1 text-2xl font-semibold">{statusCopy.label}</h2>
                    <p className="mt-2 max-w-3xl text-sm">
                      Enterprise diagnostic snapshot from persisted product, stock, delivery, purchase, and accounting setup records. Does not post stock, mutate delivery status, create accounting entries, or reconcile records.
                    </p>
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-current/20 px-3 py-1 text-sm whitespace-nowrap">
                  <Clock3 className="size-4" />
                  Last checked {formatTimestamp(data.last_checked_at)}
                </div>
              </div>
            </section>
            <ERPSectionShell title="Summary" description="Readiness counters from backend checks.">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard label="Blockers" value={data.summary.blockers} />
                <SummaryCard label="Warnings" value={data.summary.warnings} />
                <SummaryCard label="Ready Checks" value={data.summary.ready_checks} />
                <SummaryCard label="Total Checks" value={data.summary.total_checks} />
              </div>
            </ERPSectionShell>
            <ERPSectionShell title="Readiness Sections" description="Section-level status with route-backed operator actions.">
              <div className="space-y-4">
                {data.sections.map(section => (
                  <SectionCard key={section.key} section={section} />
                ))}
              </div>
            </ERPSectionShell>
            <ERPSectionShell title="Issues" description="Grouped readiness issues without customer PII. Dismiss non-blocking warnings to achieve 100% ready state.">
              {data.issues.length === 0 ? (
                <ERPEmptyState
                  title="No readiness issues"
                  description="All inventory readiness checks returned ready. System is 100% operational."
                />
              ) : (
                <div className="space-y-4">
                  <IssueGroup
                    title={`Blockers (${filteredIssueGroups.blockers.length})`}
                    issues={filteredIssueGroups.blockers}
                    onDismiss={handleDismissWarning}
                    dismissing={dismissing}
                  />
                  <IssueGroup
                    title={`Warnings (${filteredIssueGroups.warnings.length})`}
                    issues={filteredIssueGroups.warnings}
                    onDismiss={handleDismissWarning}
                    dismissing={dismissing}
                  />
                  <IssueGroup
                    title={`Info (${filteredIssueGroups.info.length})`}
                    issues={filteredIssueGroups.info}
                    onDismiss={handleDismissWarning}
                    dismissing={dismissing}
                  />
                </div>
              )}
            </ERPSectionShell>
            <ERPSectionShell title="Operator Shortcuts" description="Navigation only. All linked destinations are existing admin routes.">
              {shortcuts.length === 0 ? (
                <ERPEmptyState
                  title="No shortcut actions"
                  description="The readiness snapshot did not return route-backed shortcuts for this deployment."
                />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {shortcuts.map(shortcut => (
                    <Link
                      key={`${shortcut.href}-${shortcut.label}`}
                      className="rounded-lg border border-border bg-card p-4 transition hover:bg-muted/60"
                      href={shortcut.href}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">{shortcut.label}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{shortcut.description}</div>
                        </div>
                        <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </ERPSectionShell>
          </>
        ) : null}
        {!loading && !error && !data ? (
          <ERPEmptyState
            title="Readiness snapshot unavailable"
            description="The API returned no inventory readiness payload."
            icon={<CircleAlert className="h-5 w-5" />}
          />
        ) : null}
      </div>
    </ERPPageShell>
  );
}
