"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import FinanceAccountMappingPanel from "@/components/admin/accounting/FinanceAccountMappingPanel";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import {
  executeCollectionMappingRepair,
  getAccountingSetupReadiness,
  getCollectionRepairPreview,
  updateFinanceAccountMapping,
  type AccountingSetupMatrixPayload,
  type AccountingSetupReadinessChartAccount,
  type AccountingSetupReadinessFinanceAccount,
  type AccountingSetupReadinessPayload,
  type CollectionRepairPreviewPayload,
  type PostingProfileReadinessItem,
} from "@/services/accounting-setup";
import { getBackendAccountingSetupMatrix } from "@/services/accounting-setup-matrix";
import {
  applyAccountingSetupDefaults,
  getAccountingSetupHealth,
  previewAccountingSetupDefaults,
  type AccountingSetupDefaultsPreviewResponse,
  type AccountingSetupHealthIssue,
  type AccountingSetupHealthResponse,
} from "@/services/accounting";
import {
  disableRentLeasePostingBridge,
  enableRentLeasePostingBridge,
  getRentLeasePostingBridgeConfig,
  type RentLeasePostingBridgeConfigResponse,
} from "@/services/rent-lease-accounting-bridge";

const REPAIR_CONFIRMATION_TEXT = "REPAIR COLLECTION MAPPINGS";
const ENABLE_BRIDGE_CONFIRMATION_TEXT = "ENABLE RENT LEASE POSTING";
const DISABLE_BRIDGE_CONFIRMATION_TEXT = "DISABLE RENT LEASE POSTING";
const HISTORICAL_REPAIR_NOTE = "This action does not post payments, create receipts, rewrite journals, settlements, reconciliations, or day-close records.";
const RENT_LEASE_BRIDGE_KEYS = new Set(["rent_lease_collection", "security_deposit"]);

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusClass(status: string | undefined | null): string {
  const normalized = (status || "").toUpperCase();
  if (["READY", "OK", "POSTING_ENABLED"].includes(normalized)) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (["PARTIAL", "WARNING"].includes(normalized)) return "border-amber-200 bg-amber-50 text-amber-950";
  if (["DEFERRED", "AUDIT_DEFERRED", "MANUAL_APPROVAL_REQUIRED"].includes(normalized)) return "border-blue-200 bg-blue-50 text-blue-900";
  return "border-red-200 bg-red-50 text-red-900";
}

function accountLabel(account?: AccountingSetupReadinessChartAccount | null): string {
  if (!account) return "Not configured";
  return `${account.code} · ${account.name}`;
}

function isSelectable(account: AccountingSetupReadinessFinanceAccount): boolean {
  return Boolean(account.selectable_for_collection || account.is_selectable_collection_account || account.collection_ready);
}

function firstBlocker(item: PostingProfileReadinessItem): string {
  return item.blockers?.[0] || item.message || item.recommended_action || item.operator_note || "Ready.";
}

function setupFlagLabel(value: boolean | undefined): string {
  if (value === undefined) return "Not exposed";
  return value ? "Ready" : "Not ready";
}

function healthStatusClass(ready: boolean | undefined): string {
  if (ready === true) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (ready === false) return "border-red-200 bg-red-50 text-red-900";
  return "border-amber-200 bg-amber-50 text-amber-950";
}

function profileMatches(item: PostingProfileReadinessItem, keys: string[]) {
  const text = `${item.key} ${item.label}`.toLowerCase();
  return keys.some((key) => text.includes(key.toLowerCase()));
}

function isRentLeaseBridgeProfile(item: PostingProfileReadinessItem) {
  return RENT_LEASE_BRIDGE_KEYS.has(item.key);
}

function issueLevel(issue: unknown): string {
  if (issue && typeof issue === "object" && "level" in issue) {
    return String((issue as { level?: unknown }).level ?? "WARNING").toUpperCase();
  }
  return "WARNING";
}

function issueField(issue: unknown, field: "code" | "message" | "operator_action" | "affected_ids") {
  if (issue && typeof issue === "object" && field in issue) return (issue as Record<string, unknown>)[field];
  return null;
}

function IssueList({ issues }: { issues: Array<string | AccountingSetupHealthIssue> }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
      {issues.map((issue, index) => {
        const code = String(issueField(issue, "code") ?? (typeof issue === "string" ? "WARNING" : "INFO"));
        const message = String(issueField(issue, "message") ?? issue ?? "");
        const action = String(issueField(issue, "operator_action") ?? "");
        const ids = issueField(issue, "affected_ids");
        const affected = Array.isArray(ids) && ids.length ? `Affected IDs: ${ids.join(", ")}` : "";
        return (
          <li key={`${code}-${message}-${index}`}>
            <span className="font-medium">{code}:</span> {message}
            {affected ? <span className="ml-1 text-muted-foreground">{affected}</span> : null}
            {action ? <div className="mt-0.5 text-muted-foreground">Action: {action}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

function scrollToBridgeApproval() {
  document.getElementById("rent-lease-posting-bridge")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SetupHealthCard({
  label,
  ready,
  detail,
  action,
}: {
  label: string;
  ready: boolean | undefined;
  detail: string;
  action?: { label: string; href?: string; onClick?: () => void } | null;
}) {
  return (
    <div className={cx("rounded-xl border p-3 text-sm", healthStatusClass(ready))}>
      <div className="font-semibold">{label}</div>
      <div className="mt-1 text-xs opacity-85">{detail}</div>
      {action ? (
        <div className="mt-3">
          {action.href ? (
            <Link href={action.href} className="inline-flex rounded-lg border border-current/20 bg-white/70 px-2.5 py-1 text-[11px] font-semibold">{action.label}</Link>
          ) : (
            <button type="button" onClick={action.onClick} className="inline-flex rounded-lg border border-current/20 bg-white/70 px-2.5 py-1 text-[11px] font-semibold">{action.label}</button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RepairDialog({
  open,
  targets,
  preview,
  repairing,
  onClose,
  onConfirm,
}: {
  open: boolean;
  targets: AccountingSetupReadinessFinanceAccount[];
  preview: CollectionRepairPreviewPayload | null;
  repairing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  const targetIds = new Set(targets.map((account) => account.id));
  const previewRows = (preview?.repairable_accounts ?? preview?.blocked_accounts ?? preview?.accounts ?? []).filter((row) =>
    targetIds.size === 0 ? true : targetIds.has(Number(row.finance_account_id)),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="repair-mapping-title">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card p-5 shadow-2xl">
        <div id="repair-mapping-title" className="text-lg font-semibold text-foreground">Repair blocked collection mappings?</div>
        <p className="mt-2 text-sm text-muted-foreground">Repair creates or reuses a posting leaf ASSET account and remaps selected finance accounts only.</p>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950">{HISTORICAL_REPAIR_NOTE}</div>
        <div className="mt-4 max-h-[45vh] overflow-y-auto rounded-xl border border-border bg-muted/20 p-3">
          {targets.length === 0 ? <div className="text-sm text-muted-foreground">No repairable accounts selected.</div> : (
            <div className="space-y-3">
              {targets.map((account) => {
                const previewRow = previewRows.find((row) => Number(row.finance_account_id) === account.id);
                const suggested = (previewRow?.suggested_posting_chart_account as Record<string, unknown> | undefined) ?? account.suggested_chart_account;
                const suggestedLabel = suggested ? `${String(suggested.code ?? "")}${suggested.code ? " · " : ""}${String(suggested.name ?? "Posting leaf account")}` : accountLabel(account.suggested_chart_account);
                return (
                  <div key={account.id} className="rounded-xl border border-border bg-background p-3 text-sm">
                    <div className="font-semibold text-foreground">{account.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Current: {accountLabel(account.mapped_chart_account)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Suggested: {suggestedLabel || "Posting leaf account"}</div>
                    <div className="mt-1 text-xs text-amber-800">{account.collection_blocker_reason || account.blocker_reason || "Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account."}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-4 rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">Confirmation phrase used by backend: <span className="font-semibold text-foreground">{REPAIR_CONFIRMATION_TEXT}</span></div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <ActionButton variant="ghost" onClick={onClose} disabled={repairing}>Cancel</ActionButton>
          <ActionButton variant="primary" onClick={onConfirm} disabled={repairing || targets.length === 0}>{repairing ? "Repairing..." : "Repair mappings"}</ActionButton>
        </div>
      </div>
    </div>
  );
}

export default function AdminAccountingSetupPage() {
  const [health, setHealth] = useState<AccountingSetupHealthResponse | null>(null);
  const [readiness, setReadiness] = useState<AccountingSetupReadinessPayload | null>(null);
  const [matrix, setMatrix] = useState<AccountingSetupMatrixPayload | null>(null);
  const [bridgeConfig, setBridgeConfig] = useState<RentLeasePostingBridgeConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultsPreview, setDefaultsPreview] = useState<AccountingSetupDefaultsPreviewResponse | null>(null);
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applyResultNote, setApplyResultNote] = useState<string | null>(null);
  const [editingFinanceAccount, setEditingFinanceAccount] = useState<AccountingSetupReadinessFinanceAccount | null>(null);
  const [selectedChartAccountId, setSelectedChartAccountId] = useState("");
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);
  const [repairTargets, setRepairTargets] = useState<AccountingSetupReadinessFinanceAccount[]>([]);
  const [repairPreview, setRepairPreview] = useState<CollectionRepairPreviewPayload | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [bridgeReason, setBridgeReason] = useState("");
  const [bridgeConfirmation, setBridgeConfirmation] = useState("");
  const [bridgeSaving, setBridgeSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, readinessRes, matrixRes, bridgeRes] = await Promise.all([
        getAccountingSetupHealth(),
        getAccountingSetupReadiness(),
        getBackendAccountingSetupMatrix(),
        getRentLeasePostingBridgeConfig(),
      ]);
      setHealth(healthRes);
      setReadiness(readinessRes);
      setMatrix(matrixRes);
      setBridgeConfig(bridgeRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounting setup.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const businessFinanceAccounts = useMemo(() => {
    if (matrix?.operational_collection_accounts) return matrix.operational_collection_accounts;
    return (readiness?.finance_accounts ?? []).filter((account) => !account.diagnostic_only && !account.system_posting_profile);
  }, [matrix?.operational_collection_accounts, readiness?.finance_accounts]);

  const chartAccounts = matrix?.chart_accounts ?? readiness?.chart_accounts ?? [];
  const bridgeReadiness = bridgeConfig?.readiness;
  const bridgeEnabled = Boolean(bridgeConfig?.config?.is_enabled);
  const bridgeMappingReady = Boolean(bridgeReadiness?.mapping_ready && bridgeReadiness?.status === "READY");
  const bridgePostingMode = bridgeReadiness?.posting_mode ?? (bridgeEnabled ? "POSTING_ENABLED" : "AUDIT_DEFERRED");
  const bridgeReadyForExecution = Boolean(bridgeReadiness?.posting_bridge_ready ?? (bridgeEnabled && bridgeMappingReady));
  const expectedBridgeConfirmation = bridgeEnabled ? DISABLE_BRIDGE_CONFIRMATION_TEXT : ENABLE_BRIDGE_CONFIRMATION_TEXT;
  const canSubmitBridge = Boolean(bridgeReason.trim() && bridgeConfirmation.trim() === expectedBridgeConfirmation && (bridgeEnabled || bridgeMappingReady));
  const diagnosticAccounts = matrix?.diagnostic_system_accounts ?? [];
  const coaHealth = matrix?.chart_of_accounts_health;
  const repairableAccounts = businessFinanceAccounts.filter((account) => !isSelectable(account) && account.can_auto_create_posting_account);

  const postingProfileReadiness = useMemo(() => {
    return (matrix?.posting_profile_readiness ?? []).map((item) => {
      if (!isRentLeaseBridgeProfile(item)) return item;
      const mappingReady = Boolean(item.mapping_ready ?? bridgeMappingReady);
      const approved = Boolean(bridgeReadiness?.posting_bridge_approved ?? bridgeEnabled);
      const executionReady = Boolean(bridgeReadiness?.posting_bridge_ready ?? (approved && mappingReady));
      const mode = bridgeReadiness?.posting_mode ?? (executionReady ? "POSTING_ENABLED" : "AUDIT_DEFERRED");
      const enabledMessage = "Operational source collection, mapping, and posting bridge approval are ready. Future explicit posting execution is enabled.";
      return {
        ...item,
        collection_ready: item.collection_ready ?? true,
        mapping_ready: mappingReady,
        posting_bridge_ready: executionReady,
        posting_bridge_approved: approved,
        posting_mode: mode,
        message: executionReady ? enabledMessage : item.message,
        recommended_action: executionReady ? enabledMessage : item.recommended_action,
        operator_action: executionReady || !mappingReady ? null : "Enable bridge posting through approved accounting bridge workflow.",
      };
    });
  }, [bridgeEnabled, bridgeMappingReady, bridgeReadiness?.posting_bridge_approved, bridgeReadiness?.posting_bridge_ready, bridgeReadiness?.posting_mode, matrix?.posting_profile_readiness]);

  const blockers = health?.blockers ?? [];
  const healthInfos = health?.infos ?? (health?.issues ?? []).filter((issue) => issueLevel(issue) === "INFO") as AccountingSetupHealthIssue[];
  const warnings = (health?.warnings ?? []).filter((issue) => issueLevel(issue) !== "INFO");
  const displayStatus = health?.status ?? (matrix ? "READY" : "BLOCKED");
  const setupReady = ["READY", "OK"].includes(String(displayStatus).toUpperCase()) && blockers.length === 0;
  const postingReady = postingProfileReadiness.length > 0 && postingProfileReadiness.every((item) => item.status === "READY" || item.status === "DEFERRED");
  const collectionReady = businessFinanceAccounts.some((account) => isSelectable(account));
  const periodCloseReady = Boolean(setupReady && postingReady && bridgeReadiness?.posting_controls_ready !== false);

  const previewDefaults = useCallback(async () => {
    setPreviewing(true);
    setError(null);
    try {
      setDefaultsPreview(await previewAccountingSetupDefaults());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview suggested defaults.");
    } finally {
      setPreviewing(false);
    }
  }, []);

  const openApplyDefaultsDialog = useCallback(async () => {
    setError(null);
    if (!defaultsPreview) await previewDefaults();
    setApplyDialogOpen(true);
  }, [defaultsPreview, previewDefaults]);

  const confirmApplyDefaults = useCallback(async () => {
    setSaving(true);
    setError(null);
    setApplyResultNote(null);
    try {
      const result = await applyAccountingSetupDefaults({ confirm: true });
      const note = typeof result.collection_account_repair_note === "string" ? result.collection_account_repair_note : "Suggested defaults applied. Review setup health and repair blocked collection mappings if needed.";
      setApplyResultNote(note);
      setApplyDialogOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply suggested defaults.");
    } finally {
      setSaving(false);
    }
  }, [load]);

  const openFinanceMappingEdit = useCallback((row: AccountingSetupReadinessFinanceAccount) => {
    setEditingFinanceAccount(row);
    setSelectedChartAccountId(row.mapped_chart_account ? String(row.mapped_chart_account.id) : "");
  }, []);

  const submitFinanceMappingEdit = useCallback(async () => {
    if (!editingFinanceAccount || !selectedChartAccountId) return;
    setSaving(true);
    setError(null);
    try {
      await updateFinanceAccountMapping(editingFinanceAccount.id, { chart_account_id: Number(selectedChartAccountId) });
      setEditingFinanceAccount(null);
      setSelectedChartAccountId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update finance account mapping.");
    } finally {
      setSaving(false);
    }
  }, [editingFinanceAccount, load, selectedChartAccountId]);

  const openRepairDialog = useCallback(async (targets: AccountingSetupReadinessFinanceAccount[]) => {
    setError(null);
    setRepairTargets(targets);
    setRepairDialogOpen(true);
    try {
      setRepairPreview(await getCollectionRepairPreview());
    } catch {
      setRepairPreview(null);
    }
  }, []);

  const confirmRepair = useCallback(async () => {
    if (repairTargets.length === 0) return;
    setRepairing(true);
    setError(null);
    try {
      const singleTargetId = repairTargets.length === 1 ? repairTargets[0].id : undefined;
      await executeCollectionMappingRepair(REPAIR_CONFIRMATION_TEXT, singleTargetId);
      setRepairDialogOpen(false);
      setRepairTargets([]);
      setRepairPreview(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to repair blocked collection mappings.");
    } finally {
      setRepairing(false);
    }
  }, [load, repairTargets]);

  const submitBridgeApproval = useCallback(async () => {
    if (!canSubmitBridge) return;
    setBridgeSaving(true);
    setError(null);
    try {
      const input = { reason: bridgeReason, confirmation: bridgeConfirmation };
      const response = bridgeEnabled ? await disableRentLeasePostingBridge(input) : await enableRentLeasePostingBridge(input);
      setBridgeConfig(response);
      setBridgeReason("");
      setBridgeConfirmation("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update rent/lease posting bridge approval.");
    } finally {
      setBridgeSaving(false);
    }
  }, [bridgeConfirmation, bridgeEnabled, bridgeReason, canSubmitBridge, load]);

  const setupHealth = [
    {
      label: "Ready for collection",
      ready: collectionReady,
      detail: `${businessFinanceAccounts.filter((account) => isSelectable(account)).length} selectable money account(s)`,
      action: collectionReady ? null : { label: "Repair mappings", onClick: () => void openRepairDialog(repairableAccounts) },
    },
    {
      label: "Ready for posting",
      ready: postingReady,
      detail: `${postingProfileReadiness.filter((item) => item.status !== "READY" && item.status !== "DEFERRED").length} posting profile blocker(s)`,
      action: postingReady ? null : { label: "Apply defaults", onClick: () => void openApplyDefaultsDialog() },
    },
    {
      label: "Ready for reconciliation",
      ready: bridgeMappingReady,
      detail: bridgeMappingReady ? "Rent/lease accounting bridge mapping is ready." : bridgeReadiness?.operator_action || bridgeReadiness?.reason || "Complete bridge mapping readiness.",
      action: bridgeMappingReady ? { label: "Bridge reconciliation", href: ROUTES.admin.accountingBridgeReconciliation } : { label: "Open bridge approval", onClick: scrollToBridgeApproval },
    },
    {
      label: "Ready for period close",
      ready: periodCloseReady,
      detail: periodCloseReady ? "Setup health and posting controls are ready." : blockers.length ? "Resolve setup blockers before close." : warnings.length ? "Review warnings before close." : "Complete posting controls before close.",
      action: { label: "Period controls", href: ROUTES.admin.accountingPeriods },
    },
  ];

  const guidedSections = [
    { title: "Money accounts", explanation: "Cash, bank, and UPI accounts are where staff receive or pay real money.", required: ["Cash Counter", "Bank Account", "UPI Account"], accounts: businessFinanceAccounts.filter((account) => ["CASH", "BANK", "UPI"].includes(String(account.kind).toUpperCase())), profiles: [] },
    { title: "Liability accounts", explanation: "Customer advance, security deposit, and refund payable balances must remain separate from income.", required: ["Customer Advance", "Security Deposit", "Refund Payable"], accounts: [], profiles: postingProfileReadiness.filter((item) => profileMatches(item, ["advance", "security_deposit", "refund"])) },
    { title: "Income accounts", explanation: "EMI, rent, lease, and direct sale income mappings affect future postings only.", required: ["EMI Collection", "Rent Income", "Lease Income", "Direct Sale Income"], accounts: [], profiles: postingProfileReadiness.filter((item) => profileMatches(item, ["emi", "rent_lease", "direct_sale"])) },
    { title: "Inventory/COGS", explanation: "Inventory asset, COGS, stock adjustment, and purchase clearing keep stock value auditable.", required: ["Inventory Asset", "COGS", "Stock Adjustment", "Purchase Clearing"], accounts: [], profiles: postingProfileReadiness.filter((item) => profileMatches(item, ["inventory", "purchase"])) },
    { title: "Commission/payout", explanation: "Commission expense and partner payable mappings keep payout liability traceable.", required: ["Commission Expense", "Partner Payable"], accounts: [], profiles: postingProfileReadiness.filter((item) => profileMatches(item, ["commission", "payout"])) },
    { title: "Reconciliation clearing", explanation: "Bank, UPI, and suspense clearing accounts help isolate settlement and exception differences.", required: ["Bank clearing", "UPI clearing", "Suspense/exception clearing"], accounts: businessFinanceAccounts.filter((account) => ["BANK", "UPI"].includes(String(account.kind).toUpperCase())), profiles: postingProfileReadiness.filter((item) => profileMatches(item, ["reconciliation", "clearing"])) },
  ];

  if (loading) {
    return (
      <PortalPage title="Accounting Setup" subtitle="Operator-proof setup for finance accounts, posting profiles, and Chart of Accounts health.">
        <LoadingBlock label="Loading accounting setup..." />
      </PortalPage>
    );
  }

  return (
    <PortalPage
      title="Accounting Setup"
      subtitle="Separate money destinations, ledger posting rules, bridge approval, and close readiness so operators cannot confuse system profiles with collection accounts."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Setup" }]}
      actions={[{ href: ROUTES.admin.accountingChartOfAccounts, label: "Chart of Accounts", variant: "secondary" }, { href: ROUTES.admin.collectionControlCenter, label: "Collection Control", variant: "secondary" }]}
    >
      <RepairDialog open={repairDialogOpen} targets={repairTargets} preview={repairPreview} repairing={repairing} onClose={() => { if (repairing) return; setRepairDialogOpen(false); setRepairTargets([]); }} onConfirm={() => void confirmRepair()} />

      {applyDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="apply-defaults-title">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-xl">
            <div id="apply-defaults-title" className="text-base font-semibold text-foreground">Apply suggested accounting defaults?</div>
            <p className="mt-1 text-sm text-muted-foreground">This creates or claims canonical Chart of Accounts, seeds default Finance Accounts, and updates setup defaults only.</p>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{HISTORICAL_REPAIR_NOTE}</div>
            {defaultsPreview ? (
              <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-background p-3"><div className="font-semibold text-foreground">Canonical create</div><div className="mt-1 text-lg font-semibold text-foreground">{defaultsPreview.canonical_accounts.create.length}</div></div>
                <div className="rounded-xl border border-border bg-background p-3"><div className="font-semibold text-foreground">Claim existing</div><div className="mt-1 text-lg font-semibold text-foreground">{defaultsPreview.canonical_accounts.claim.length}</div></div>
                <div className="rounded-xl border border-border bg-background p-3"><div className="font-semibold text-foreground">Conflicts</div><div className="mt-1 text-lg font-semibold text-foreground">{defaultsPreview.canonical_accounts.conflicts.length}</div></div>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2"><ActionButton variant="ghost" onClick={() => setApplyDialogOpen(false)} disabled={saving}>Cancel</ActionButton><ActionButton variant="primary" onClick={confirmApplyDefaults} disabled={saving}>{saving ? "Applying..." : "Apply suggested defaults"}</ActionButton></div>
          </div>
        </div>
      ) : null}

      <div className="space-y-6">
        {error ? <ErrorState title="Accounting setup failed" description={error} onRetry={() => void load()} /> : null}

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operator-proof accounting setup</div><h2 className="mt-1 text-xl font-semibold text-foreground">Status {displayStatus}</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Finance Accounts are where money is received or paid. Posting Profiles decide which ledger accounts are debited and credited. Chart of Accounts is the ledger structure. Rent/lease posting approval is separate and explicit.</p></div>
            <div className="flex flex-wrap gap-2"><ActionButton variant="secondary" onClick={previewDefaults} disabled={previewing}>{previewing ? "Previewing..." : "Preview Suggested Default"}</ActionButton><ActionButton variant="primary" onClick={openApplyDefaultsDialog} disabled={saving || previewing}>{saving ? "Applying..." : "Apply Suggested Default"}</ActionButton><ActionButton variant="secondary" onClick={() => void openRepairDialog(repairableAccounts)} disabled={repairableAccounts.length === 0 || repairing}>Repair blocked collection mappings</ActionButton>{!bridgeReadyForExecution && bridgeMappingReady ? <ActionButton variant="secondary" onClick={scrollToBridgeApproval}>Enable rent/lease bridge</ActionButton> : null}<Link href={ROUTES.admin.accountingBridgeReconciliation} className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground">Bridge reconciliation</Link><Link href={ROUTES.admin.accountingPeriods} className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground">Period controls</Link><ActionButton variant="ghost" onClick={() => void load()}>Refresh</ActionButton></div>
          </div>
          {applyResultNote ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{applyResultNote}</div> : null}
          {blockers.length > 0 ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-950"><div className="font-semibold">{blockers.length} blocker{blockers.length === 1 ? "" : "s"}</div><IssueList issues={blockers} /></div> : null}
          {warnings.length > 0 ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><div className="font-semibold">{warnings.length} warning{warnings.length === 1 ? "" : "s"}</div><IssueList issues={warnings} /></div> : null}
          {healthInfos.length > 0 ? <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><div className="font-semibold">{healthInfos.length} informational note{healthInfos.length === 1 ? "" : "s"}</div><IssueList issues={healthInfos} /></div> : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm"><div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Setup health</div><h2 className="mt-1 text-lg font-semibold text-foreground">Future postings use these mappings</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Changing mappings affects future postings only. Existing payments, receipts, journals, reconciliations, and document numbers are not rewritten from this page.</p></div><span className={cx("rounded-full border px-3 py-1 text-xs font-semibold", statusClass(displayStatus))}>{displayStatus}</span></div><div className="mt-4 grid gap-3 md:grid-cols-4">{setupHealth.map((item) => <SetupHealthCard key={item.label} {...item} />)}</div></section>

        <section className="space-y-3"><div><h2 className="text-lg font-semibold text-foreground">Guided setup</h2><p className="mt-1 text-sm text-muted-foreground">Review each required business bucket, then use the mapping editor below for explicit changes.</p></div><div className="grid gap-4 xl:grid-cols-2">{guidedSections.map((section) => {
          const rows = [...section.accounts.map((account) => ({ key: `account-${account.id}`, label: account.name, status: isSelectable(account) ? "READY" : "BLOCKED", linked: accountLabel(account.mapped_chart_account), action: account.collection_blocker_reason || account.blocker_reason || account.recommended_action || "Mapped and selectable.", bridgeAction: false })), ...section.profiles.map((profile) => ({ key: `profile-${profile.key}`, label: profile.label, status: profile.status, linked: [...profile.configured_debit_account.map(accountLabel), ...profile.configured_credit_account.map(accountLabel)].join(", ") || "Not configured", action: firstBlocker(profile), bridgeAction: Boolean(profile.operator_action && isRentLeaseBridgeProfile(profile)) }))];
          const sectionReady = rows.length > 0 && rows.every((row) => row.status === "READY" || row.status === "DEFERRED");
          const sectionMissing = rows.length === 0 || rows.some((row) => row.status === "BLOCKED");
          return <article key={section.title} className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-foreground">{section.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{section.explanation}</p></div><span className={cx("rounded-full border px-2.5 py-1 text-[11px] font-semibold", sectionReady ? statusClass("READY") : sectionMissing ? statusClass("BLOCKED") : statusClass("WARNING"))}>{sectionReady ? "Ready" : sectionMissing ? "Missing" : "Warning"}</span></div><div className="mt-3 flex flex-wrap gap-2">{section.required.map((item) => <span key={item} className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{item}</span>)}</div><div className="mt-3 space-y-2">{rows.length ? rows.map((row) => <div key={row.key} className="rounded-xl border border-border bg-background px-3 py-2 text-xs"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-foreground">{row.label}</div><div className="mt-1 text-muted-foreground">Linked: {row.linked}</div></div><span className={cx("rounded-full border px-2 py-0.5 font-semibold", statusClass(row.status))}>{row.status}</span></div><div className="mt-2 text-muted-foreground">{row.action}</div>{row.bridgeAction ? <button type="button" onClick={scrollToBridgeApproval} className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-900">Open bridge approval</button> : null}</div>) : <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">No matching setup row is exposed by the backend yet.</div>}</div><div className="mt-3"><ActionButton variant="secondary" onClick={() => window.location.hash = "business-finance-accounts"}>Edit mapping</ActionButton></div></article>;
        })}</div></section>

        <section id="rent-lease-posting-bridge" className="rounded-xl border border-border bg-card p-5 shadow-sm scroll-mt-24"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rent / lease posting bridge</div><h2 className="mt-1 text-lg font-semibold text-foreground">Current mode {bridgePostingMode}</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Enabling this bridge only allows future explicit backend posting preview/execute workflows to proceed. It does not create backdated journals, payments, receipts, settlement allocations, or reconciliation records.</p></div><span className={cx("rounded-full border px-3 py-1 text-xs font-semibold", statusClass(bridgeReadyForExecution ? "READY" : bridgeMappingReady ? "DEFERRED" : "BLOCKED"))}>{bridgeReadyForExecution ? "Posting enabled" : bridgeEnabled ? "Approved but blocked" : "Approval required"}</span></div><div className="mt-4 grid gap-3 text-sm md:grid-cols-3"><div className="rounded-xl border border-border bg-muted/20 p-3"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mapping readiness</div><div className="mt-1 font-semibold text-foreground">{bridgeReadiness?.status ?? "Not loaded"}</div><div className="mt-1 text-xs text-muted-foreground">{bridgeMappingReady ? "COA and Finance Account mapping are valid." : bridgeReadiness?.reason ?? "Complete mapping before enabling."}</div></div><div className="rounded-xl border border-border bg-muted/20 p-3"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Posting approval</div><div className="mt-1 font-semibold text-foreground">{bridgeEnabled ? "Enabled" : "Disabled"}</div><div className="mt-1 text-xs text-muted-foreground">{bridgeConfig?.config?.reason || "No approval reason recorded."}</div></div><div className="rounded-xl border border-border bg-muted/20 p-3"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Future execution</div><div className="mt-1 font-semibold text-foreground">{bridgeReadyForExecution ? "Allowed" : "Blocked"}</div><div className="mt-1 text-xs text-muted-foreground">{bridgeReadyForExecution ? "Future explicit posting execution is enabled." : bridgeReadiness?.operator_action || "Future explicit posting execution is blocked."}</div></div></div>{bridgeReadiness?.blockers?.length ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{bridgeReadiness.blockers[0]}</div> : null}<div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr]"><label className="text-sm"><div className="mb-1 text-xs font-semibold text-muted-foreground">Reason</div><textarea className="min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={bridgeReason} onChange={(event) => setBridgeReason(event.target.value)} placeholder={bridgeEnabled ? "Reason for disabling posting bridge" : "Reason for enabling posting bridge"} /></label><div className="space-y-3"><label className="block text-sm"><div className="mb-1 text-xs font-semibold text-muted-foreground">Typed confirmation</div><input className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={bridgeConfirmation} onChange={(event) => setBridgeConfirmation(event.target.value)} placeholder={expectedBridgeConfirmation} /></label><div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">Required phrase: <span className="font-semibold text-foreground">{expectedBridgeConfirmation}</span></div>{!bridgeEnabled && !bridgeMappingReady ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">Enable is disabled until rent/lease mapping readiness is valid.</div> : null}<ActionButton variant={bridgeEnabled ? "secondary" : "primary"} onClick={() => void submitBridgeApproval()} disabled={!canSubmitBridge || bridgeSaving}>{bridgeSaving ? "Saving..." : bridgeEnabled ? "Disable posting bridge" : "Enable posting bridge"}</ActionButton></div></div></section>

        <section id="business-finance-accounts" className="space-y-3"><div><h2 className="text-lg font-semibold text-foreground">1. Business Finance Accounts</h2><p className="mt-1 text-sm text-muted-foreground">Cash desks, bank accounts, UPI accounts, and payment gateway accounts are operational money destinations. Ledger posting profiles are excluded from this section.</p></div><FinanceAccountMappingPanel financeAccounts={businessFinanceAccounts} chartAccounts={chartAccounts} saving={saving || repairing} editingId={editingFinanceAccount?.id ?? null} repairId={repairing && repairTargets.length === 1 ? repairTargets[0].id : null} selectedChartAccountId={selectedChartAccountId} onEdit={openFinanceMappingEdit} onCancelEdit={() => { setEditingFinanceAccount(null); setSelectedChartAccountId(""); }} onChartAccountChange={setSelectedChartAccountId} onSave={() => void submitFinanceMappingEdit()} onRepair={(account) => void openRepairDialog([account])} onRepairAll={(accounts) => void openRepairDialog(accounts)} /></section>

        <section className="space-y-3"><div><h2 className="text-lg font-semibold text-foreground">2. System Posting Profiles</h2><p className="mt-1 text-sm text-muted-foreground">System posting profiles are diagnostic only and cannot receive customer collections. They decide which ledger accounts are debited and credited.</p></div>{diagnosticAccounts.length > 0 ? <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><div className="font-semibold">Ledger posting profiles (system)</div><div className="mt-1">Diagnostic only. Not selectable for customer collections.</div><div className="mt-2 flex flex-wrap gap-2 text-xs">{diagnosticAccounts.map((account) => <span key={account.id} className="rounded-full border border-blue-200 bg-white px-2 py-1">{account.name}</span>)}</div></div> : null}<div className="grid gap-4 lg:grid-cols-2">{postingProfileReadiness.map((item) => <article key={item.key} className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-foreground">{item.label}</h3><p className="mt-1 text-xs text-muted-foreground">{item.key}</p></div><span className={cx("rounded-full border px-2 py-1 text-xs font-semibold", statusClass(item.status))}>{item.status}</span></div><div className="mt-3 grid gap-3 text-xs md:grid-cols-2"><div className="rounded-xl border border-border bg-muted/20 p-3"><div className="font-semibold text-foreground">Debit account</div><div className="mt-1 text-muted-foreground">Required: {item.required_debit_account.join(", ") || "Not configured"}</div><div className="mt-1 text-foreground">{item.configured_debit_account.map(accountLabel).join(", ") || "Not configured"}</div></div><div className="rounded-xl border border-border bg-muted/20 p-3"><div className="font-semibold text-foreground">Credit account</div><div className="mt-1 text-muted-foreground">Required: {item.required_credit_account.join(", ") || "Not configured"}</div><div className="mt-1 text-foreground">{item.configured_credit_account.map(accountLabel).join(", ") || "Not configured"}</div></div></div><div className="mt-3 rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">{firstBlocker(item)}</div>{item.collection_ready !== undefined || item.mapping_ready !== undefined || item.posting_mode ? <div className="mt-3 grid gap-2 text-xs md:grid-cols-3"><div className="rounded-xl border border-border bg-muted/20 p-3"><div className="font-semibold text-foreground">Source collection</div><div className="mt-1 text-muted-foreground">{setupFlagLabel(item.collection_ready)}</div></div><div className="rounded-xl border border-border bg-muted/20 p-3"><div className="font-semibold text-foreground">COA / FA mapping</div><div className="mt-1 text-muted-foreground">{setupFlagLabel(item.mapping_ready)}</div></div><div className="rounded-xl border border-border bg-muted/20 p-3"><div className="font-semibold text-foreground">Posting mode</div><div className="mt-1 text-muted-foreground">{item.posting_mode || "Not exposed"}</div></div></div> : null}{item.operator_action ? <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950"><div>Action: {item.operator_action}</div>{isRentLeaseBridgeProfile(item) ? <button type="button" onClick={scrollToBridgeApproval} className="mt-2 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-900">Open bridge approval</button> : null}</div> : null}{!item.implemented ? <div className="mt-2 text-xs font-medium text-blue-800">Deferred workflow. Do not create fake collection action.</div> : null}</article>)}</div></section>

        <section className="space-y-3"><div><h2 className="text-lg font-semibold text-foreground">3. Chart of Accounts Health</h2><p className="mt-1 text-sm text-muted-foreground">Chart of Accounts is the ledger structure. Collection accounts must point to active posting-enabled leaf ASSET accounts, not group/control accounts.</p></div><div className="grid gap-3 md:grid-cols-4"><div className="rounded-xl border border-border bg-card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group/control accounts</div><div className="mt-2 text-2xl font-semibold text-foreground">{coaHealth?.counts?.group_control_count ?? 0}</div></div><div className="rounded-xl border border-border bg-card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Posting leaf accounts</div><div className="mt-2 text-2xl font-semibold text-foreground">{coaHealth?.counts?.posting_leaf_count ?? 0}</div></div><div className="rounded-xl border border-border bg-card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Missing leaf assets</div><div className="mt-2 text-2xl font-semibold text-foreground">{coaHealth?.counts?.missing_posting_leaf_count ?? 0}</div></div><div className="rounded-xl border border-border bg-card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inactive/non-posting</div><div className="mt-2 text-2xl font-semibold text-foreground">{coaHealth?.counts?.inactive_or_non_posting_count ?? 0}</div></div></div><div className="rounded-xl border border-border bg-card p-4"><div className="text-sm font-semibold text-foreground">COA blockers</div>{(coaHealth?.inactive_or_non_posting_blockers ?? []).length === 0 ? <div className="mt-2 text-sm text-emerald-700">No inactive/non-posting blockers exposed.</div> : <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="text-muted-foreground"><tr><th className="px-2 py-2">Code</th><th className="px-2 py-2">Name</th><th className="px-2 py-2">Type</th><th className="px-2 py-2">Issue</th></tr></thead><tbody>{(coaHealth?.inactive_or_non_posting_blockers ?? []).slice(0, 12).map((account) => <tr key={`${account.id}-${account.code}`} className="border-t border-border"><td className="px-2 py-2 font-medium text-foreground">{account.code}</td><td className="px-2 py-2">{account.name}</td><td className="px-2 py-2">{account.account_type || account.type}</td><td className="px-2 py-2 text-amber-700">{!account.is_active ? "Inactive" : account.is_group_control ? "Group/control or non-posting" : "Not collection-ready"}</td></tr>)}</tbody></table></div>}</div></section>
      </div>
    </PortalPage>
  );
}
