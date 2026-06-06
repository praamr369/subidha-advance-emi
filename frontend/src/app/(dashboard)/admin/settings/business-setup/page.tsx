"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { ROUTES } from "@/lib/routes";
import {
  ensureFreshStartSetup,
  getSetupReadiness,
  previewFreshStartSetup,
  type EnsureFreshStartSetupResult,
  type SetupReadinessPayload,
  type SetupReadinessSection,
} from "@/services/business-setup";

const categoryOrder = [
  "REQUIRED_FOR_COLLECTION",
  "REQUIRED_FOR_ACCOUNTING_POSTING",
  "REQUIRED_FOR_DOCUMENTS",
  "REQUIRED_FOR_OPERATIONS",
  "RECOMMENDED_FOR_GO_LIVE",
  "OPTIONAL_OR_FUTURE",
];

const primaryActions = [
  { label: "Open Business Profile", href: ROUTES.admin.settingsBusinessSetupProfile },
  { label: "Open Checklist", href: ROUTES.admin.settingsBusinessSetupChecklist },
  { label: "Open Dry-runs", href: ROUTES.admin.settingsBusinessSetupDryRuns },
  { label: "Open Reset / Restore", href: ROUTES.admin.settingsBusinessSetupReset },
  { label: "Open Branch Setup", href: "/admin/settings/business-setup/branches" },
  { label: "Open Cash Counter Setup", href: "/admin/settings/business-setup/cash-desks" },
  { label: "Open Finance Accounts", href: "/admin/settings/business-setup/finance-accounts" },
  { label: "Open Accounting Setup", href: ROUTES.admin.accountingSetup },
  { label: "Open Accounting Bridges", href: ROUTES.admin.accountingBridges },
  { label: "Open Bridge Reconciliation", href: ROUTES.admin.accountingBridgeReconciliation },
  { label: "Open Inventory Readiness", href: ROUTES.admin.inventoryReadiness },
  { label: "Open Inventory Opening Stock", href: ROUTES.admin.inventoryOpeningStock },
  { label: "Open Staff Setup", href: "/admin/settings/business-setup/staff" },
  { label: "Open Document Numbering", href: ROUTES.admin.settingsBusinessSetupDocumentNumbering },
  { label: "Open Print Branding", href: "/admin/settings/business-setup/print-branding" },
];

function statusClass(status: string) {
  if (status === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "BLOCKED") return "border-red-200 bg-red-50 text-red-900";
  if (status === "INFO" || status === "FUTURE" || status === "OPTIONAL") return "border-blue-200 bg-blue-50 text-blue-900";
  return "border-amber-200 bg-amber-50 text-amber-950";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to load business setup readiness.";
}

function metadataNumber(section: SetupReadinessSection, key: string) {
  const value = section.metadata?.[key];
  return typeof value === "number" ? value : 0;
}

function SectionCard({ section }: { section: SetupReadinessSection }) {
  const inventory = section.key === "inventory_onboarding";
  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${statusClass(section.status)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{section.category_label ?? section.category}</div>
          <h3 className="mt-1 text-base font-semibold">{section.title}</h3>
          <p className="mt-1 text-sm leading-6 opacity-90">{section.why_this_matters}</p>
        </div>
        <span className="rounded-full border border-current/20 px-2.5 py-1 text-xs font-semibold">{section.status}</span>
      </div>
      {section.blockers.length ? <div className="mt-3 rounded-xl border border-current/20 bg-white/60 px-3 py-2 text-sm"><div className="font-semibold">Blocked because</div><ul className="mt-1 list-disc space-y-1 pl-5">{section.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      {section.warnings.length ? <div className="mt-3 rounded-xl border border-current/20 bg-white/60 px-3 py-2 text-sm"><div className="font-semibold">Notes</div><ul className="mt-1 list-disc space-y-1 pl-5">{section.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      {inventory ? <div className="mt-3 rounded-xl border border-blue-200 bg-white/70 px-3 py-2 text-sm text-blue-950"><div className="font-semibold">Inventory onboarding policy</div><p className="mt-1">Stock CSV upload is optional. Opening stock can be entered manually later. Missing stock does not block core business setup. Inventory readiness remains onboarding-pending until stock is captured.</p><div className="mt-2 grid gap-2 text-xs md:grid-cols-3"><div>Profiles: {metadataNumber(section, "inventory_profiles")}</div><div>Opening ledgers: {metadataNumber(section, "opening_stock_ledger_entries")}</div><div>CSV initial blocker: No</div></div></div> : null}
      <div className="mt-3 rounded-xl border border-current/20 bg-white/60 px-3 py-2 text-sm"><div className="font-semibold">Recommended action</div><p className="mt-1">{section.recommended_action}</p><div className="mt-2 flex flex-wrap gap-2 text-xs"><span>Repairable: {section.repairable ? "Yes" : "No"}</span><span>Initial start blocker: {section.optional_for_initial_start ? "No" : section.status === "BLOCKED" ? "Yes" : "No"}</span></div></div>
      <Link href={section.target_route || ROUTES.admin.settingsBusinessSetup} className="mt-3 inline-flex rounded-xl border border-current/30 bg-white px-3 py-2 text-sm font-semibold">Open setup area</Link>
    </article>
  );
}

function FreshStartResult({ result }: { result: EnsureFreshStartSetupResult | null }) {
  if (!result) return null;
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 shadow-sm">
      <div className="font-semibold">Fresh-start action result: {result.mode}</div>
      <p className="mt-1">{result.safety_contract ?? "Setup action completed with the safe setup contract."}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <div>Journals created: {result.journal_entries_created ?? 0}</div>
        <div>Document numbers allocated: {result.document_numbers_allocated ?? 0}</div>
        <div>Stock ledger created: {result.stock_ledger_created ?? 0}</div>
        <div>Reconciliation items created: {result.reconciliation_items_created ?? 0}</div>
      </div>
      {result.document_numbering ? <div className="mt-2 text-xs">Document numbering setup profiles created: {result.document_numbering.created_count ?? 0}; skipped existing: {result.document_numbering.skipped_count ?? 0}</div> : null}
    </section>
  );
}

export default function BusinessSetupOverviewPage() {
  const [payload, setPayload] = useState<SetupReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<EnsureFreshStartSetupResult | null>(null);

  async function load() {
    setLoading(true);
    try {
      setPayload(await getSetupReadiness());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function runPreview() {
    setActionBusy("preview");
    setError(null);
    try {
      setActionResult(await previewFreshStartSetup());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActionBusy(null);
    }
  }

  async function runEnsure() {
    setActionBusy("ensure");
    setError(null);
    try {
      setActionResult(await ensureFreshStartSetup({ confirm: true }));
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActionBusy(null);
    }
  }

  const groups = useMemo(() => {
    const rows = payload?.sections ?? [];
    const grouped = new Map<string, SetupReadinessSection[]>();
    for (const section of rows) {
      const key = section.category ?? "RECOMMENDED_FOR_GO_LIVE";
      grouped.set(key, [...(grouped.get(key) ?? []), section]);
    }
    return categoryOrder.map((key) => ({ key, label: payload?.categories?.find((item) => item.key === key)?.label ?? key.replaceAll("_", " "), rows: grouped.get(key) ?? [] })).filter((group) => group.rows.length);
  }, [payload]);

  const collectionReady = Boolean(payload?.summary.core_operational_ready);
  const nextHref = payload?.summary.next_target_route || ROUTES.admin.settingsBusinessSetup;

  return (
    <div className="space-y-6">
      <PageHeader title="Business Setup" description="Fresh-start readiness, finance setup, branch/counter setup, documents, inventory onboarding." />
      <BusinessSetupLinks />

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div> : null}
      {loading ? <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">Loading fresh-start business setup…</div> : null}

      {payload ? (
        <>
          <section className={`rounded-2xl border p-5 shadow-sm ${statusClass(payload.summary.overall_status)}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide opacity-80">Fresh Start Setup</div>
                <h2 className="mt-2 text-3xl font-semibold">{payload.summary.overall_status.replaceAll("_", " ")}</h2>
                <p className="mt-2 max-w-4xl text-sm leading-6">COA, Finance Accounts, and mapping can become ready here. Bridge posting may remain approval-gated. No journals are auto-posted by setup.</p>
                <p className="mt-2 max-w-4xl text-sm leading-6">Core collection readiness can become operational without stock CSV. Inventory opening stock remains onboarding-pending until manually captured or imported later.</p>
                <p className="mt-2 max-w-4xl text-sm leading-6">Mutation policy: {payload.mutation_policy}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void runPreview()} disabled={Boolean(actionBusy)} className="rounded-xl border border-current/30 bg-white px-3 py-2 text-sm font-semibold">{actionBusy === "preview" ? "Previewing…" : "Dry-run preview"}</button>
                <button type="button" onClick={() => void runEnsure()} disabled={Boolean(actionBusy)} className="rounded-xl bg-foreground px-3 py-2 text-sm font-semibold text-background">{actionBusy === "ensure" ? "Running…" : "Ensure Fresh Start Setup"}</button>
                <Link href={nextHref} className="rounded-xl border border-current/30 bg-white px-3 py-2 text-sm font-semibold">Next action</Link>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-current/20 bg-white/60 p-3"><div className="text-xs font-semibold uppercase tracking-wide">Core operational</div><div className="mt-1 text-2xl font-semibold">{collectionReady ? "READY" : "BLOCKED"}</div></div>
              <div className="rounded-xl border border-current/20 bg-white/60 p-3"><div className="text-xs font-semibold uppercase tracking-wide">Ready</div><div className="mt-1 text-2xl font-semibold">{payload.summary.ready_count}</div></div>
              <div className="rounded-xl border border-current/20 bg-white/60 p-3"><div className="text-xs font-semibold uppercase tracking-wide">Warnings/info</div><div className="mt-1 text-2xl font-semibold">{payload.summary.warning_count}</div></div>
              <div className="rounded-xl border border-current/20 bg-white/60 p-3"><div className="text-xs font-semibold uppercase tracking-wide">Core blockers</div><div className="mt-1 text-2xl font-semibold">{payload.summary.blocker_count}</div></div>
              <div className="rounded-xl border border-current/20 bg-white/60 p-3"><div className="text-xs font-semibold uppercase tracking-wide">Read-only</div><div className="mt-1 text-2xl font-semibold">{payload.read_only ? "YES" : "NO"}</div></div>
            </div>
          </section>

          <FreshStartResult result={actionResult} />

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Primary admin actions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Only real setup routes are shown. No fake buttons and no href placeholders.</p>
            <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-5">{primaryActions.map((action) => <Link key={action.href} href={action.href} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground">{action.label}</Link>)}</div>
          </section>

          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-blue-950 shadow-sm">
            <h2 className="text-base font-semibold">Inventory onboarding</h2>
            <div className="mt-2 grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4"><div>Stock CSV upload is optional</div><div>Opening stock can be entered manually later</div><div>Missing stock does not block core business setup</div><div>Inventory readiness remains onboarding-pending until stock is captured</div></div>
          </section>

          {groups.map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-foreground">{group.label}</h2><span className="text-sm text-muted-foreground">{group.rows.length} item(s)</span></div>
              <div className="grid gap-4 lg:grid-cols-2">{group.rows.map((section) => <SectionCard key={section.key} section={section} />)}</div>
            </section>
          ))}

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Launch checklist</h2>
            <p className="mt-1 text-sm text-muted-foreground">Inventory opening stock pending is allowed while core setup becomes operational.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{payload.launch_checklist.map((item) => <div key={item.key} className="rounded-xl border border-border bg-background px-3 py-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-foreground">{item.label}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.ready ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{item.ready ? "READY" : "BLOCKED"}</span></div><div className="mt-1 text-xs text-muted-foreground">Source: {item.source_section.replaceAll("_", " ")}</div></div>)}</div>
          </section>
        </>
      ) : null}
    </div>
  );
}
