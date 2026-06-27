"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import BusinessSetupLinks from "@/components/admin/business-setup/BusinessSetupLinks";
import PageHeader from "@/components/ui/PageHeader";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ROUTES } from "@/lib/routes";
import { clearSession } from "@/lib/auth/session";
import { businessSetupKeys } from "@/lib/query-keys";
import {
  ensureFreshStartSetup,
  executeBusinessReset,
  getResetPreview,
  getSetupChecklist,
  getSetupReadiness,
  previewFreshStartSetup,
  seedAndPublishPolicyGovernance,
  type BusinessResetExecuteRequest,
  type EnsureFreshStartSetupResult,
  type PolicyGovernanceSeedResult,
  type SetupReadinessPayload,
  type SetupReadinessSection,
} from "@/services/business-setup";

const RESET_CONFIRM_PHRASE = "RESET_SUBIDHA_CORE";

const categoryOrder = [
  "CORE_REQUIRED",
  "FINANCE_ACCOUNTING_REQUIRED",
  "RENT_LEASE_REQUIRED",
  "DIRECT_SALE_REQUIRED",
  "SUBSCRIPTION_EMI_REQUIRED",
  "INVENTORY_REQUIRED",
  "STAFF_HR_PAYROLL_REQUIRED",
  "CRM_REQUIRED",
  "RESET_DRY_RUN_REQUIRED",
  "OPTIONAL_OR_FUTURE",
  "REQUIRED_FOR_COLLECTION",
  "REQUIRED_FOR_ACCOUNTING_POSTING",
  "REQUIRED_FOR_DOCUMENTS",
  "REQUIRED_FOR_OPERATIONS",
  "RECOMMENDED_FOR_GO_LIVE",
];

const primaryActions = [
  { label: "Business Profile", href: ROUTES.admin.settingsBusinessSetupProfile },
  { label: "Dry Runs & Reset", href: ROUTES.admin.settingsBusinessSetupReset },
  { label: "Branch Setup", href: ROUTES.admin.settingsBusinessSetupBranches },
  { label: "Cash Counter Setup", href: ROUTES.admin.settingsBusinessSetupCashDesks },
  { label: "Finance Accounts", href: ROUTES.admin.settingsBusinessSetupFinanceAccounts },
  { label: "Accounting Setup", href: ROUTES.admin.accountingSetup },
  { label: "Accounting Bridges", href: ROUTES.admin.accountingBridges },
  { label: "Bridge Reconciliation", href: ROUTES.admin.accountingBridgeReconciliation },
  { label: "Rent / Lease", href: ROUTES.admin.rentLease },
  { label: "Direct Sale", href: ROUTES.admin.billingDirectSaleWorkspace },
  { label: "Subscription EMI", href: ROUTES.admin.subscriptions },
  { label: "Inventory Readiness", href: ROUTES.admin.inventoryReadiness },
  { label: "Opening Stock", href: ROUTES.admin.inventoryOpeningStock },
  { label: "Products", href: ROUTES.admin.products },
  { label: "Product Import", href: ROUTES.admin.productsImport },
  { label: "Inventory Items", href: ROUTES.admin.inventoryItems },
  { label: "Stock Ledger", href: ROUTES.admin.inventoryLedger },
  { label: "Staff Setup", href: ROUTES.admin.hrStaff },
  { label: "Attendance", href: ROUTES.admin.hrAttendance },
  { label: "Payroll", href: ROUTES.admin.hrPayroll },
  { label: "CRM", href: ROUTES.admin.crm },
  { label: "CRM Parties", href: ROUTES.admin.crmParties },
  { label: "Document Numbering", href: ROUTES.admin.settingsBusinessSetupDocumentNumbering },
  { label: "Print Branding", href: ROUTES.admin.settingsBusinessSetupPrintBranding },
];

function statusClass(status: string) {
  if (status === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "BLOCKED") return "border-red-200 bg-red-50 text-red-900";
  if (["REQUIRED_PENDING", "WARNING", "NEEDS_SETUP", "APPROVAL_GATED"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-blue-200 bg-blue-50 text-blue-900";
}

function toErr(e: unknown) {
  return e instanceof Error ? e.message : "Request failed.";
}

function metadataNumber(section: SetupReadinessSection, key: string) {
  const value = section.metadata?.[key];
  return typeof value === "number" ? value : 0;
}

function SectionCard({ section, onSeedPolicies, policyBusy, policyResult }: { section: SetupReadinessSection; onSeedPolicies?: () => void; policyBusy?: boolean; policyResult?: PolicyGovernanceSeedResult | null }) {
  const inventory = section.category === "INVENTORY_REQUIRED" || section.key === "inventory_onboarding";
  const rentLease = section.category === "RENT_LEASE_REQUIRED";
  const staff = section.category === "STAFF_HR_PAYROLL_REQUIRED";
  const crm = section.category === "CRM_REQUIRED";
  const finance = section.category === "FINANCE_ACCOUNTING_REQUIRED";
  return (
    <article className={`rounded-xl border p-4 shadow-sm ${statusClass(section.status)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide opacity-80">{section.category_label ?? section.category}</div>
          <h3 className="mt-1 text-base font-semibold">{section.title}</h3>
          <p className="mt-1 text-sm leading-6 opacity-90">{section.why_this_matters}</p>
        </div>
        <span className="rounded-full border border-current/20 px-2.5 py-1 text-xs font-semibold">{section.status}</span>
      </div>
      {section.blockers.length ? <div className="mt-3 rounded-xl border border-current/20 bg-card px-3 py-2 text-sm"><div className="font-semibold">Blocking reason</div><ul className="mt-1 list-disc space-y-1 pl-5">{section.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      {section.warnings.length ? <div className="mt-3 rounded-xl border border-current/20 bg-card px-3 py-2 text-sm"><div className="font-semibold">Notes</div><ul className="mt-1 list-disc space-y-1 pl-5">{section.warnings.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
      {section.key === "policy_governance" && onSeedPolicies ? (
        <div className="mt-3 rounded-xl border border-current/20 bg-card px-3 py-2 text-sm">
          <div className="font-semibold">Auto-seed &amp; publish policies</div>
          <p className="mt-1">Seeds all required policy templates, publishes all public policies, and accepts all internal policies in one step.</p>
          {policyResult ? <div className="mt-2 text-xs text-emerald-700">Done — published: {policyResult.public_published ?? 0}, accepted: {policyResult.internal_accepted ?? 0}, skipped: {policyResult.skipped ?? 0}</div> : null}
          <button type="button" onClick={onSeedPolicies} disabled={policyBusy} className="mt-2 rounded-xl bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60">{policyBusy ? "Publishing…" : "Seed & Publish All Policies"}</button>
        </div>
      ) : null}
      {inventory ? <div className="mt-3 rounded-xl border border-blue-200 bg-card px-3 py-2 text-sm text-blue-950"><div className="font-semibold">Inventory onboarding policy</div><p className="mt-1">CSV stock upload is a required admin workflow, but not required to start core collections. Opening stock can be entered manually later.</p><div className="mt-2 grid gap-2 text-xs md:grid-cols-3"><div>Profiles: {metadataNumber(section, "inventory_profiles")}</div><div>Opening ledgers: {metadataNumber(section, "opening_stock_ledger_entries")}</div><div>Status: {String(section.metadata?.status_code ?? section.status)}</div></div></div> : null}
      {rentLease ? <div className="mt-3 rounded-xl border border-current/20 bg-card px-3 py-2 text-sm"><div className="font-semibold">Rent/Lease is live</div><p className="mt-1">Deposit mapping, monthly demand workflow, collection workflow, and bridge readiness are production-required.</p></div> : null}
      {staff ? <div className="mt-3 rounded-xl border border-current/20 bg-card px-3 py-2 text-sm"><div className="font-semibold">Staff/payroll setup rule</div><p className="mt-1">Staff setup, attendance, payroll, payslip readiness, salary expense, and salary payable readiness are required admin workflows.</p></div> : null}
      {crm ? <div className="mt-3 rounded-xl border border-current/20 bg-card px-3 py-2 text-sm"><div className="font-semibold">CRM enrichment rule</div><p className="mt-1">PartyMaster, leads/followups, and customer/partner/staff linking must be visible as production setup work.</p></div> : null}
      {finance ? <div className="mt-3 rounded-xl border border-current/20 bg-card px-3 py-2 text-sm"><div className="font-semibold">Accounting safety rule</div><p className="mt-1">COA, Finance Accounts, and mappings can become ready here. Bridge posting may remain approval-gated. No journals are auto-posted by setup.</p></div> : null}
      <div className="mt-3 rounded-xl border border-current/20 bg-card px-3 py-2 text-sm"><div className="font-semibold">Next action</div><p className="mt-1">{section.recommended_action}</p><div className="mt-2 flex flex-wrap gap-2 text-xs"><span>Repairable: {section.repairable ? "Yes" : "No"}</span><span>Initial start blocker: {section.optional_for_initial_start ? "No" : section.status === "BLOCKED" ? "Yes" : "No"}</span></div></div>
      <Link href={section.target_route || ROUTES.admin.settingsBusinessSetup} className="mt-3 inline-flex rounded-xl border border-current/30 bg-card px-3 py-2 text-sm font-semibold">Open setup area</Link>
    </article>
  );
}

function FreshStartResult({ result }: { result: EnsureFreshStartSetupResult | null }) {
  if (!result) return null;
  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 shadow-sm">
      <div className="font-semibold">Fresh-start result: {result.mode}</div>
      <p className="mt-1">{result.safety_contract ?? "Setup action completed with the safe setup contract."}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <div>Journals created: {result.journal_entries_created ?? 0}</div>
        <div>Document numbers allocated: {result.document_numbers_allocated ?? 0}</div>
        <div>Stock ledger created: {result.stock_ledger_created ?? 0}</div>
        <div>Reconciliation items created: {result.reconciliation_items_created ?? 0}</div>
      </div>
    </section>
  );
}

function SetupChart({ sections }: { sections: SetupReadinessSection[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Production setup chart</h2>
      <p className="mt-1 text-sm text-muted-foreground">Every action link is a real route. Statuses are backend readiness states, not fake completion.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-3 py-2">Setup area</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Required</th><th className="px-3 py-2">Blocking reason</th><th className="px-3 py-2">Next action</th><th className="px-3 py-2">Notes</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sections.map((section) => (
              <tr key={section.key} className="align-top">
                <td className="px-3 py-3 font-medium text-foreground">{section.title}<div className="text-xs text-muted-foreground">{section.category_label ?? section.category}</div></td>
                <td className="px-3 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(section.status)}`}>{section.status}</span></td>
                <td className="px-3 py-3">{section.optional_for_initial_start ? "Workflow required / not initial blocker" : "Yes"}</td>
                <td className="px-3 py-3 text-muted-foreground">{section.blockers[0] ?? "—"}</td>
                <td className="px-3 py-3"><Link href={section.target_route || ROUTES.admin.settingsBusinessSetup} className="font-semibold text-primary underline-offset-4 hover:underline">{section.recommended_action}</Link></td>
                <td className="px-3 py-3 text-muted-foreground">{section.warnings[0] ?? section.why_this_matters}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function BusinessSetupPage() {
  // — Readiness (overview) state —
  const [payload, setPayload] = useState<SetupReadinessPayload | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<EnsureFreshStartSetupResult | null>(null);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyResult, setPolicyResult] = useState<PolicyGovernanceSeedResult | null>(null);

  // — Checklist state —
  const checklistQuery = useQuery({
    queryKey: businessSetupKeys.checklist(),
    queryFn: getSetupChecklist,
  });
  const checklistData = checklistQuery.data ?? null;
  const required = (checklistData?.items ?? []).filter((item) => item.level === "required");
  const recommended = (checklistData?.items ?? []).filter((item) => item.level === "recommended");
  const optional = (checklistData?.items ?? []).filter((item) => item.level === "optional");

  // — Go-live reset state —
  const [resetPreview, setResetPreview] = useState<Record<string, unknown> | null>(null);
  const [resetPreviewError, setResetPreviewError] = useState<string | null>(null);
  const [resetUsername, setResetUsername] = useState("subidhafurniture");
  const [confirm, setConfirm] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [resetRunning, setResetRunning] = useState(false);
  const [resetResult, setResetResult] = useState<Record<string, unknown> | null>(null);

  async function loadReadiness() {
    setReadinessLoading(true);
    try {
      setPayload(await getSetupReadiness());
      setReadinessError(null);
    } catch (err) {
      setReadinessError(toErr(err));
    } finally {
      setReadinessLoading(false);
    }
  }

  const refreshResetPreview = useCallback(async (username: string) => {
    try {
      setResetPreview(await getResetPreview(username));
      setResetPreviewError(null);
    } catch (err) {
      setResetPreviewError(toErr(err));
    }
  }, []);

  useEffect(() => { void loadReadiness(); }, []);
  useEffect(() => { void refreshResetPreview("subidhafurniture"); }, [refreshResetPreview]);

  async function runPreview() {
    setActionBusy("preview");
    setReadinessError(null);
    try { setActionResult(await previewFreshStartSetup()); }
    catch (err) { setReadinessError(toErr(err)); }
    finally { setActionBusy(null); }
  }

  async function runEnsure() {
    setActionBusy("ensure");
    setReadinessError(null);
    try { setActionResult(await ensureFreshStartSetup({ confirm: true })); await loadReadiness(); }
    catch (err) { setReadinessError(toErr(err)); }
    finally { setActionBusy(null); }
  }

  async function runSeedPolicies() {
    setPolicyBusy(true);
    setReadinessError(null);
    try { setPolicyResult(await seedAndPublishPolicyGovernance()); await loadReadiness(); }
    catch (err) { setReadinessError(toErr(err)); }
    finally { setPolicyBusy(false); }
  }

  async function runGoLiveReset() {
    if (confirm.trim() !== RESET_CONFIRM_PHRASE) {
      setResetPreviewError(`Type "${RESET_CONFIRM_PHRASE}" exactly.`);
      return;
    }
    const payload: BusinessResetExecuteRequest = {
      confirm: true,
      preserve_username: resetUsername,
      delete_non_preserved_users: true,
      clear_auth_artifacts: true,
      dry_run: dryRun,
    };
    setResetRunning(true);
    setResetPreviewError(null);
    try {
      const response = await executeBusinessReset(payload);
      setResetResult(response);
      await refreshResetPreview(resetUsername);
      if (!dryRun) { clearSession(); window.location.href = "/login"; }
      else { void checklistQuery.refetch(); }
    } catch (err) {
      setResetPreviewError(toErr(err));
    } finally {
      setResetRunning(false);
    }
  }

  const groups = useMemo(() => {
    const rows = payload?.sections ?? [];
    const grouped = new Map<string, SetupReadinessSection[]>();
    for (const section of rows) {
      const key = section.category ?? "OPTIONAL_OR_FUTURE";
      grouped.set(key, [...(grouped.get(key) ?? []), section]);
    }
    return categoryOrder
      .map((key) => ({ key, label: payload?.categories?.find((item) => item.key === key)?.label ?? key.replaceAll("_", " "), rows: grouped.get(key) ?? [] }))
      .filter((group) => group.rows.length);
  }, [payload]);

  const collectionReady = Boolean(payload?.summary.core_operational_ready);
  const nextHref = payload?.summary.next_target_route || ROUTES.admin.settingsBusinessSetup;

  return (
    <div className="space-y-6">
      <PageHeader title="Business Setup" description="Setup readiness, checklist, section cards, and controlled go-live reset — all in one place." />
      <BusinessSetupLinks />

      {/* ── Overall status banner ── */}
      {readinessError ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{readinessError}</div> : null}
      {readinessLoading ? <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">Loading production business setup…</div> : null}

      {payload ? (
        <>
          <section className={`rounded-xl border p-5 shadow-sm ${statusClass(payload.summary.overall_status)}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide opacity-80">Business Setup Readiness</div>
                <h2 className="mt-2 text-3xl font-semibold">{payload.summary.overall_status.replaceAll("_", " ")}</h2>
                <p className="mt-2 max-w-4xl text-sm leading-6">Mutation policy: {payload.mutation_policy}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void runPreview()} disabled={Boolean(actionBusy)} className="rounded-xl border border-current/30 bg-card px-3 py-2 text-sm font-semibold">{actionBusy === "preview" ? "Previewing…" : "Dry-run preview"}</button>
                <button type="button" onClick={() => void runEnsure()} disabled={Boolean(actionBusy)} className="rounded-xl bg-foreground px-3 py-2 text-sm font-semibold text-background">{actionBusy === "ensure" ? "Running…" : "Ensure Fresh Start Setup"}</button>
                <Link href={nextHref} className="rounded-xl border border-current/30 bg-card px-3 py-2 text-sm font-semibold">Next action</Link>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-xl border border-current/20 bg-card p-3"><div className="text-xs font-semibold uppercase tracking-wide">Core operational</div><div className="mt-1 text-2xl font-semibold">{collectionReady ? "READY" : "BLOCKED"}</div></div>
              <div className="rounded-xl border border-current/20 bg-card p-3"><div className="text-xs font-semibold uppercase tracking-wide">Ready</div><div className="mt-1 text-2xl font-semibold">{payload.summary.ready_count}</div></div>
              <div className="rounded-xl border border-current/20 bg-card p-3"><div className="text-xs font-semibold uppercase tracking-wide">Pending/info</div><div className="mt-1 text-2xl font-semibold">{payload.summary.warning_count}</div></div>
              <div className="rounded-xl border border-current/20 bg-card p-3"><div className="text-xs font-semibold uppercase tracking-wide">Core blockers</div><div className="mt-1 text-2xl font-semibold">{payload.summary.blocker_count}</div></div>
              <div className="rounded-xl border border-current/20 bg-card p-3"><div className="text-xs font-semibold uppercase tracking-wide">Read-only</div><div className="mt-1 text-2xl font-semibold">{payload.read_only ? "YES" : "NO"}</div></div>
            </div>
          </section>

          <FreshStartResult result={actionResult} />
        </>
      ) : null}

      {/* ── Checklist KPIs + Document Numbering ── */}
      {checklistData ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-medium text-muted-foreground">Completion</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{checklistData.percent_complete}%</div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-medium text-muted-foreground">Checklist items</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{checklistData.items.length}</div>
            </div>
            <div className="col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-muted-foreground">Go-live status</div>
                <Link href={ROUTES.admin.settingsBusinessSetupDocumentNumbering} className="text-xs font-semibold text-primary hover:underline">Document Numbering →</Link>
              </div>
              <div className="mt-2 text-lg font-semibold text-foreground">{checklistData.is_ready_for_go_live ? "Ready for go-live" : "Not ready yet"}</div>
              <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                {[
                  { label: "Invoice numbering", ready: Boolean(checklistData.counts?.invoice_numbering_configured) },
                  { label: "Receipt numbering", ready: Boolean(checklistData.counts?.receipt_numbering_configured) },
                  { label: "Direct-sale invoice numbering", ready: Boolean(checklistData.counts?.direct_sale_invoice_numbering_configured) },
                ].map((row) => (
                  <div key={row.label} className={`rounded-lg border px-3 py-2 ${row.ready ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
                    <div className="font-semibold">{row.ready ? "Ready" : "Needs setup"}</div>
                    <div className="mt-0.5 text-muted-foreground">{row.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Itemized checklist accordion ── */}
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
              Itemized checklist
            </div>
            {checklistQuery.error ? (
              <div className="px-5 py-4 text-sm text-destructive">
                {toErr(checklistQuery.error)} —{" "}
                <button type="button" className="underline" onClick={() => void checklistQuery.refetch()}>Retry</button>
              </div>
            ) : null}
            <Accordion type="multiple" defaultValue={["required"]} className="px-3 pb-2">
              {[
                { id: "required" as const, label: "Required", items: required },
                { id: "recommended" as const, label: "Recommended", items: recommended },
                { id: "optional" as const, label: "Optional", items: optional },
              ].map((group) => (
                <AccordionItem key={group.id} value={group.id} className="border-border">
                  <AccordionTrigger className="py-4 hover:no-underline">
                    <span className="flex w-full items-center gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</span>
                      <span className="ml-auto text-[11px] font-normal normal-case text-muted-foreground">{group.items.length} items</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3 pt-0 text-foreground">
                    <div className="divide-y divide-border rounded-xl border border-border">
                      {group.items.map((item) => (
                        <div key={item.key} className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{item.label}</div>
                            <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${item.status === "complete" ? "bg-emerald-500/10 text-emerald-600" : item.status === "warning" ? "bg-amber-500/10 text-amber-600" : "bg-rose-500/10 text-rose-600"}`}>{item.status}</span>
                            {item.route ? <Link href={item.route} className="text-sm font-medium text-primary hover:underline">Open</Link> : null}
                          </div>
                        </div>
                      ))}
                      {group.items.length === 0 ? <div className="px-4 py-3 text-sm text-muted-foreground">No items.</div> : null}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        </>
      ) : checklistQuery.isPending ? (
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">Loading checklist…</div>
      ) : null}

      {/* ── Primary admin actions ── */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold text-foreground">Quick navigation</h2>
        <p className="mt-1 text-sm text-muted-foreground">Real setup routes only — no placeholder links.</p>
        <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-5">
          {primaryActions.map((action) => (
            <Link key={action.href} href={action.href} className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:border-foreground/30">
              {action.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Setup chart ── */}
      {payload ? (
        <>
          <SetupChart sections={payload.sections} />

          {/* ── Section cards by category ── */}
          {groups.map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">{group.label}</h2>
                <span className="text-sm text-muted-foreground">{group.rows.length} item(s)</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {group.rows.map((section) => (
                  <SectionCard
                    key={section.key}
                    section={section}
                    onSeedPolicies={section.key === "policy_governance" ? () => void runSeedPolicies() : undefined}
                    policyBusy={section.key === "policy_governance" ? policyBusy : undefined}
                    policyResult={section.key === "policy_governance" ? policyResult : undefined}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* ── Launch checklist items ── */}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Launch checklist</h2>
            <p className="mt-1 text-sm text-muted-foreground">Inventory opening stock pending is visible and required as an admin workflow, but stock quantity is never faked.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {payload.launch_checklist.map((item) => (
                <div key={item.key} className="rounded-xl border border-border bg-background px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{item.label}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.ready ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{item.ready ? "READY" : "BLOCKED"}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">Source: {item.source_section.replaceAll("_", " ")}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {/* ── Go-live reset (controlled) ── */}
      <Collapsible defaultOpen={false} className="rounded-xl border border-border bg-card shadow-sm">
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left text-sm font-medium text-muted-foreground transition hover:bg-muted/40 [&[data-state=open]>svg]:rotate-180">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-foreground">Go-live reset (controlled)</span>
            <span className="text-xs font-normal text-muted-foreground">High-impact reset — expand only when you intend to run or review it. Your superuser account (ID + password) is always preserved.</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-5 border-t border-border px-5 pb-5 pt-4">
            {/* Superuser preservation notice */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <div className="font-semibold">Superuser account is always preserved</div>
              <p className="mt-1">After any reset, the admin user whose username you enter below keeps their account record intact — including their password hash. You will still be able to log in with the same password after reset. Only business data (customers, invoices, payments, stock, journals etc.) is deleted.</p>
            </div>

            <p className="text-sm text-muted-foreground">Deletes business data using the backend reset service while preserving only the chosen admin username and password. Run dry-run first.</p>

            {resetPreviewError ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                {resetPreviewError}
                <button type="button" className="ml-3 underline" onClick={() => void refreshResetPreview(resetUsername)}>Retry preview</button>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-muted-foreground">
                Preserve username (ID + password both kept)
                <input
                  value={resetUsername}
                  onChange={(e) => { setResetUsername(e.target.value); void refreshResetPreview(e.target.value); }}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
                  placeholder="subidhafurniture"
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Confirm string
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground"
                  placeholder={RESET_CONFIRM_PHRASE}
                />
              </label>
              <label className="flex items-center gap-3 text-sm text-muted-foreground">
                <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                Dry run (recommended — no data deleted)
              </label>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => void runGoLiveReset()}
                  disabled={resetRunning}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  {resetRunning ? "Running..." : dryRun ? "Run dry-run reset" : "Execute reset"}
                </button>
              </div>
            </div>

            {resetResult ? (
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <div className="font-semibold text-foreground">{resetResult.dry_run ? "Dry run complete — no data deleted" : "Reset executed"}</div>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-4 text-xs text-foreground">{JSON.stringify(resetResult, null, 2)}</pre>
              </div>
            ) : null}

            {resetPreview ? (
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="text-sm font-medium text-muted-foreground">Reset preview</div>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-muted p-4 text-xs text-foreground">{JSON.stringify(resetPreview, null, 2)}</pre>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
