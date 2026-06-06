"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import {
  ensureFreshStartSetup,
  getSetupReadiness,
  previewFreshStartSetup,
  type EnsureFreshStartSetupResult,
  type SetupLaunchChecklistItem,
  type SetupReadinessFinanceAccount,
  type SetupReadinessPayload,
  type SetupReadinessSection,
} from "@/services/business-setup";

const sectionOrder = [
  "business_profile",
  "branch_cash_counter",
  "finance_accounts",
  "payment_collection",
  "chart_of_accounts",
  "accounting_reconciliation",
  "document_templates",
  "print_branding",
  "product_catalog",
  "staff_roles",
  "inventory_onboarding",
  "business_compliance",
  "policy_governance",
  "batch_lucky_ids",
  "amendment_recontract",
  "staff_advance_future",
];

const categoryOrder = [
  "REQUIRED_FOR_COLLECTION",
  "REQUIRED_FOR_ACCOUNTING_POSTING",
  "REQUIRED_FOR_DOCUMENTS",
  "REQUIRED_FOR_OPERATIONS",
  "RECOMMENDED_FOR_GO_LIVE",
  "OPTIONAL_OR_FUTURE",
];

function statusToneClass(status?: string) {
  if (status === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "BLOCKED") return "border-red-200 bg-red-50 text-red-900";
  if (status === "INFO" || status === "OPTIONAL" || status === "FUTURE") return "border-blue-200 bg-blue-50 text-blue-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function safeList(values: string[]) {
  if (values.length === 0) return null;
  return <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{values.map((value) => <li key={value}>{value}</li>)}</ul>;
}

function numericMetadata(metadata: Record<string, unknown> | undefined, key: string): number | null {
  const value = metadata?.[key];
  return typeof value === "number" ? value : null;
}

function textMetadata(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function coverageSummary(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  const value = metadata?.coverage_summary;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function SectionMetadataPanel({ section }: { section: SetupReadinessSection }) {
  if (section.key === "inventory_onboarding") {
    const statusCode = textMetadata(section.metadata, "status_code") ?? "ONBOARDING_PENDING";
    return <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><div className="text-xs font-semibold uppercase tracking-wide">Inventory onboarding</div><div className="mt-2 grid gap-2 md:grid-cols-2"><div>Status: {statusCode}</div><div>Inventory profiles: {numericMetadata(section.metadata, "inventory_profiles") ?? 0}</div><div>Opening stock ledger entries: {numericMetadata(section.metadata, "opening_stock_ledger_entries") ?? 0}</div><div>CSV required for initial start: No</div></div><p className="mt-2 text-xs">Stock upload is not required for initial system setup. Opening stock remains a controlled future onboarding workflow.</p></div>;
  }
  if (section.key !== "policy_governance" && section.key !== "business_compliance") return null;
  const summary = coverageSummary(section.metadata);
  if (section.key === "policy_governance") {
    return <div className="mt-4 rounded-xl border border-current/20 bg-white/60 p-3 text-sm"><div className="text-xs font-semibold uppercase tracking-wide">Governance metadata</div><div className="mt-3 grid gap-2 md:grid-cols-2"><div>Public published: {numericMetadata(summary, "public_published_count") ?? 0}/{numericMetadata(summary, "public_required_count") ?? 0}</div><div>Internal ready: {numericMetadata(summary, "internal_ready_count") ?? 0}/{numericMetadata(summary, "internal_required_count") ?? 0}</div><div>Route: <Link href={ROUTES.admin.settingsPolicies} className="underline">Policy Governance</Link></div></div></div>;
  }
  return <div className="mt-4 rounded-xl border border-current/20 bg-white/60 p-3 text-sm"><div className="text-xs font-semibold uppercase tracking-wide">Compliance metadata</div><div className="mt-3 grid gap-2 md:grid-cols-2"><div>Missing required: {numericMetadata(section.metadata, "missing_required_count") ?? 0}</div><div>Missing file: {numericMetadata(section.metadata, "missing_file_count") ?? 0}</div><div>Pending review: {numericMetadata(section.metadata, "pending_review_count") ?? 0}</div><div>Public summary pending: {numericMetadata(section.metadata, "public_summary_pending_count") ?? 0}</div></div></div>;
}

function SectionCard({ section }: { section: SetupReadinessSection }) {
  return <article className={`rounded-2xl border p-4 shadow-sm ${statusToneClass(section.status)}`}><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide opacity-80">{section.category_label ?? section.category?.replace(/_/g, " ") ?? "Setup"}</div><h2 className="mt-1 text-base font-semibold">{section.title}</h2><p className="mt-1 text-sm opacity-90">{section.why_this_matters}</p></div><ERPStatusBadge status={section.status === "INFO" ? "NEEDS_SETUP" : section.status} label={section.status.replace(/_/g, " ")} /></div>{section.blockers.length > 0 ? <div className="mt-4 rounded-xl border border-current/20 bg-white/60 p-3"><div className="text-xs font-semibold uppercase tracking-wide">Blockers</div>{safeList(section.blockers)}</div> : null}{section.warnings.length > 0 ? <div className="mt-4 rounded-xl border border-current/20 bg-white/60 p-3"><div className="text-xs font-semibold uppercase tracking-wide">Notes / warnings</div>{safeList(section.warnings)}</div> : null}<SectionMetadataPanel section={section} /><div className="mt-4 rounded-xl border border-current/20 bg-white/60 p-3 text-sm"><div className="font-semibold">Recommended action</div><p className="mt-1 opacity-90">{section.recommended_action}</p><div className="mt-2 flex flex-wrap gap-2 text-xs"><span>Repairable: {section.repairable ? "Yes" : "No"}</span><span>Initial start blocker: {section.optional_for_initial_start ? "No" : section.status === "BLOCKED" ? "Yes" : "No"}</span></div></div><div className="mt-4"><Link href={section.target_route || ROUTES.admin.settingsBusinessSetup} className="inline-flex rounded-xl border border-current/30 bg-white px-3 py-2 text-sm font-semibold shadow-sm transition hover:bg-white/80">Open setup area</Link></div></article>;
}

function FinanceReadinessPanel({ accounts }: { accounts: SetupReadinessFinanceAccount[] }) {
  if (accounts.length === 0) return <div className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-foreground">Finance Account Readiness</h2><p className="mt-1 text-sm text-muted-foreground">No finance accounts are configured yet.</p></div><ERPStatusBadge status="BLOCKED" label="Blocked" /></div><div className="mt-4"><Link href={ROUTES.admin.accountingSetup} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">Open Accounting Setup</Link></div></div>;
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><div><h2 className="text-base font-semibold text-foreground">Finance Account Readiness</h2><p className="mt-1 text-sm text-muted-foreground">Read-only posting-readiness check for cash, bank, and UPI accounts. No remapping happens here.</p></div><Link href={ROUTES.admin.accountingSetup} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold">Open Accounting Setup</Link></div><div className="mt-4 overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-3">Account</th><th className="px-3 py-3">Kind</th><th className="px-3 py-3">Mapped COA</th><th className="px-3 py-3">Posting ready</th><th className="px-3 py-3">Blocker / action</th></tr></thead><tbody className="divide-y divide-border">{accounts.map((account) => <tr key={account.id}><td className="px-3 py-3 font-medium text-foreground">{account.name}</td><td className="px-3 py-3 text-muted-foreground">{account.kind}</td><td className="px-3 py-3 text-muted-foreground">{account.mapped_chart_account ? `${account.mapped_chart_account.code} — ${account.mapped_chart_account.name}` : "Not mapped"}</td><td className="px-3 py-3"><ERPStatusBadge status={account.posting_ready ? "READY" : "BLOCKED"} label={account.posting_ready ? "Ready" : "Blocked"} /></td><td className="px-3 py-3 text-muted-foreground">{account.blocker_reason || account.recommended_action || "No blocker."}</td></tr>)}</tbody></table></div></section>;
}

function LaunchChecklist({ items }: { items: SetupLaunchChecklistItem[] }) {
  return <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h2 className="text-base font-semibold text-foreground">Start from Zero Checklist</h2><p className="mt-1 text-sm text-muted-foreground">Core collection can become ready without stock CSV. Inventory opening stock remains an onboarding item, not fake readiness.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <div key={item.key} className="rounded-xl border border-border bg-background px-3 py-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-foreground">{item.label}</span><ERPStatusBadge status={item.ready ? "READY" : "BLOCKED"} label={item.ready ? "Ready" : "Blocked"} /></div><div className="mt-1 text-xs text-muted-foreground">Source: {item.source_section.replace(/_/g, " ")}</div></div>)}</div></section>;
}

export default function AdminSetupReadinessPage() {
  const [payload, setPayload] = useState<SetupReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<EnsureFreshStartSetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadReadiness() {
    setLoading(true);
    try {
      setPayload(await getSetupReadiness());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load setup readiness.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadReadiness(); }, []);

  async function runFreshStart(dryRun: boolean) {
    setActionBusy(dryRun ? "dry" : "ensure");
    setError(null);
    try {
      const result = dryRun ? await ensureFreshStartSetup({ dry_run: true }) : await ensureFreshStartSetup({ confirm: true });
      setActionResult(result);
      await loadReadiness();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fresh-start setup action failed.");
    } finally {
      setActionBusy(null);
    }
  }

  async function runPreview() {
    setActionBusy("preview");
    setError(null);
    try {
      setActionResult(await previewFreshStartSetup());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fresh-start preview failed.");
    } finally {
      setActionBusy(null);
    }
  }

  const orderedSections = useMemo(() => {
    if (!payload) return [];
    const byKey = new Map(payload.sections.map((section) => [section.key, section]));
    return [...sectionOrder.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : [])), ...payload.sections.filter((section) => !sectionOrder.includes(section.key))];
  }, [payload]);

  const sectionsByCategory = useMemo(() => {
    const groups = new Map<string, SetupReadinessSection[]>();
    for (const section of orderedSections) {
      const key = section.category ?? "RECOMMENDED_FOR_GO_LIVE";
      groups.set(key, [...(groups.get(key) ?? []), section]);
    }
    return categoryOrder.map((key) => ({ key, label: payload?.categories?.find((category) => category.key === key)?.label ?? key.replace(/_/g, " "), rows: groups.get(key) ?? [] })).filter((group) => group.rows.length > 0);
  }, [orderedSections, payload?.categories]);

  return <ERPPageShell title="Setup Readiness" subtitle="Admin-only Start from Zero setup path for live shop operations. Checks are read-only unless you explicitly run the safe setup action." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Business Setup", href: ROUTES.admin.settingsBusinessSetup }, { label: "Setup Readiness" }]}><div className="space-y-6"><BusinessSetupLinks />{loading ? <ERPLoadingState label="Loading setup readiness..." /> : null}{!loading && error ? <ERPErrorState title="Unable to load setup readiness" description={error} onRetry={() => void loadReadiness()} /> : null}{!loading && !error && !payload ? <ERPEmptyState title="No readiness payload available" description="The backend returned no setup readiness data." /> : null}{payload ? <><section className={`rounded-2xl border p-5 shadow-sm ${statusToneClass(payload.summary.overall_status)}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-sm font-medium uppercase tracking-wide opacity-80">Fresh Start Setup</div><h1 className="mt-2 text-3xl font-semibold">{payload.summary.overall_status.replace(/_/g, " ")}</h1><p className="mt-2 max-w-3xl text-sm opacity-90">{payload.summary.next_recommended_action || "Review setup sections before live operations."}</p><p className="mt-2 text-xs opacity-80">{payload.mutation_policy}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void runPreview()} disabled={Boolean(actionBusy)} className="rounded-xl border border-current/30 bg-white px-3 py-2 text-sm font-semibold shadow-sm">Preview Fresh Start Setup</button><button type="button" onClick={() => void runFreshStart(true)} disabled={Boolean(actionBusy)} className="rounded-xl border border-current/30 bg-white px-3 py-2 text-sm font-semibold shadow-sm">Dry-run Safe Setup</button><button type="button" onClick={() => void runFreshStart(false)} disabled={Boolean(actionBusy)} className="rounded-xl border border-current/30 bg-white px-3 py-2 text-sm font-semibold shadow-sm">Ensure Fresh Start Setup</button><Link href={payload.summary.next_target_route || ROUTES.admin.settingsBusinessSetup} className="rounded-xl border border-current/30 bg-white px-3 py-2 text-sm font-semibold shadow-sm">Open next setup action</Link></div></div><div className="mt-5 grid gap-3 md:grid-cols-4"><div className="rounded-xl border border-current/20 bg-white/60 p-4"><div className="text-xs font-medium uppercase tracking-wide">Ready</div><div className="mt-1 text-2xl font-semibold">{payload.summary.ready_count}</div></div><div className="rounded-xl border border-current/20 bg-white/60 p-4"><div className="text-xs font-medium uppercase tracking-wide">Info / recommended</div><div className="mt-1 text-2xl font-semibold">{payload.summary.warning_count}</div></div><div className="rounded-xl border border-current/20 bg-white/60 p-4"><div className="text-xs font-medium uppercase tracking-wide">Core blockers</div><div className="mt-1 text-2xl font-semibold">{payload.summary.blocker_count}</div></div><div className="rounded-xl border border-current/20 bg-white/60 p-4"><div className="text-xs font-medium uppercase tracking-wide">Core operational</div><div className="mt-1 text-lg font-semibold">{payload.summary.core_operational_ready ? "Ready" : "Blocked"}</div></div></div></section>{actionResult ? <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h2 className="text-base font-semibold text-foreground">Fresh-start action result</h2><p className="mt-1 text-sm text-muted-foreground">{actionResult.safety_contract || "Setup action completed."}</p><div className="mt-3 grid gap-3 md:grid-cols-5"><div>Journals: {actionResult.journal_entries_created ?? 0}</div><div>Doc numbers allocated: {actionResult.document_numbers_allocated ?? 0}</div><div>Stock ledger: {actionResult.stock_ledger_created ?? 0}</div><div>Reconciliation rows: {actionResult.reconciliation_items_created ?? 0}</div><div>Mode: {actionResult.mode}</div></div></section> : null}<section><div className="mb-3"><h2 className="text-lg font-semibold text-foreground">Guided Start from Zero Setup</h2><p className="text-sm text-muted-foreground">Each card links to a real implemented route. Inventory stock upload is not required for initial collection readiness.</p></div><div className="space-y-6">{sectionsByCategory.map((group) => <div key={group.key}><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3><div className="grid gap-4 xl:grid-cols-2">{group.rows.map((section) => <SectionCard key={section.key} section={section} />)}</div></div>)}</div></section><FinanceReadinessPanel accounts={payload.finance_accounts} /><LaunchChecklist items={payload.launch_checklist} /></> : null}</div></ERPPageShell>;
}
