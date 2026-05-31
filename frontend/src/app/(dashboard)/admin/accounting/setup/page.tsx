"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import FinanceAccountMappingPanel from "@/components/admin/accounting/FinanceAccountMappingPanel";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import {
  executeCollectionMappingRepair,
  getAccountingSetupMatrix,
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
import {
  applyAccountingSetupDefaults,
  getAccountingSetupHealth,
  previewAccountingSetupDefaults,
  type AccountingSetupDefaultsPreviewResponse,
  type AccountingSetupHealthResponse,
} from "@/services/accounting";

const REPAIR_CONFIRMATION_TEXT = "REPAIR COLLECTION MAPPINGS";
const HISTORICAL_REPAIR_NOTE = "This will not post payments, create receipts, rewrite journals, settlements, reconciliations, or day-close records.";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusClass(status: string | undefined | null): string {
  const normalized = (status || "").toUpperCase();
  if (normalized === "READY" || normalized === "OK") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (normalized === "PARTIAL" || normalized === "WARNING") return "border-amber-200 bg-amber-50 text-amber-950";
  if (normalized === "DEFERRED") return "border-blue-200 bg-blue-50 text-blue-900";
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
  return item.blockers?.[0] || item.recommended_action || "Ready.";
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
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div id="repair-mapping-title" className="text-lg font-semibold text-foreground">Repair blocked collection mappings?</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Repair creates or reuses a posting leaf account and remaps this finance account only.
        </p>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950">
          {HISTORICAL_REPAIR_NOTE}
        </div>
        <div className="mt-4 max-h-[45vh] overflow-y-auto rounded-xl border border-border bg-muted/20 p-3">
          {targets.length === 0 ? (
            <div className="text-sm text-muted-foreground">No repairable accounts selected.</div>
          ) : (
            <div className="space-y-3">
              {targets.map((account) => {
                const previewRow = previewRows.find((row) => Number(row.finance_account_id) === account.id);
                const suggested = (previewRow?.suggested_posting_chart_account as Record<string, unknown> | undefined) ?? account.suggested_chart_account;
                const suggestedLabel = suggested
                  ? `${String(suggested.code ?? "")}${suggested.code ? " · " : ""}${String(suggested.name ?? "Posting leaf account")}`
                  : accountLabel(account.suggested_chart_account);
                return (
                  <div key={account.id} className="rounded-xl border border-border bg-background p-3 text-sm">
                    <div className="font-semibold text-foreground">{account.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Current: {accountLabel(account.mapped_chart_account)}</div>
                    <div className="mt-1 text-xs text-muted-foreground">Suggested: {suggestedLabel || "Posting leaf account"}</div>
                    <div className="mt-1 text-xs text-amber-800">
                      {account.collection_blocker_reason || account.blocker_reason || "Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account."}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-4 rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
          Confirmation phrase used by backend: <span className="font-semibold text-foreground">{REPAIR_CONFIRMATION_TEXT}</span>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <ActionButton variant="ghost" onClick={onClose} disabled={repairing}>Cancel</ActionButton>
          <ActionButton variant="primary" onClick={onConfirm} disabled={repairing || targets.length === 0}>
            {repairing ? "Repairing..." : "Repair mappings"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

export default function AdminAccountingSetupPage() {
  const [health, setHealth] = useState<AccountingSetupHealthResponse | null>(null);
  const [readiness, setReadiness] = useState<AccountingSetupReadinessPayload | null>(null);
  const [matrix, setMatrix] = useState<AccountingSetupMatrixPayload | null>(null);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, readinessRes, matrixRes] = await Promise.all([
        getAccountingSetupHealth(),
        getAccountingSetupReadiness(),
        getAccountingSetupMatrix(),
      ]);
      setHealth(healthRes);
      setReadiness(readinessRes);
      setMatrix(matrixRes);
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
  const postingProfileReadiness = matrix?.posting_profile_readiness ?? [];
  const diagnosticAccounts = matrix?.diagnostic_system_accounts ?? [];
  const coaHealth = matrix?.chart_of_accounts_health;
  const repairableAccounts = businessFinanceAccounts.filter((account) => !isSelectable(account) && account.can_auto_create_posting_account);

  const blockers = health?.blockers ?? [];
  const warnings = health?.warnings ?? [];
  const displayStatus = health?.status ?? (matrix ? "READY" : "BLOCKED");

  const previewDefaults = useCallback(async () => {
    setPreviewing(true);
    setError(null);
    try {
      const preview = await previewAccountingSetupDefaults();
      setDefaultsPreview(preview);
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
      const note = typeof result.collection_account_repair_note === "string"
        ? result.collection_account_repair_note
        : "Suggested defaults applied. Review blocked collection mappings and run guided repair separately if needed.";
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
      subtitle="Separate money destinations, ledger posting rules, and Chart of Accounts health so operators cannot confuse system profiles with collection accounts."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Setup" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingChartOfAccounts, label: "Chart of Accounts", variant: "secondary" },
        { href: ROUTES.admin.collectionControlCenter, label: "Collection Control", variant: "secondary" },
      ]}
    >
      <RepairDialog
        open={repairDialogOpen}
        targets={repairTargets}
        preview={repairPreview}
        repairing={repairing}
        onClose={() => {
          if (repairing) return;
          setRepairDialogOpen(false);
          setRepairTargets([]);
        }}
        onConfirm={() => void confirmRepair()}
      />

      {applyDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="apply-defaults-title">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-xl">
            <div id="apply-defaults-title" className="text-base font-semibold text-foreground">Apply suggested accounting defaults?</div>
            <div className="mt-1 text-sm text-muted-foreground">
              This creates or claims canonical Chart of Accounts, seeds default Finance Accounts, and updates setup defaults only.
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              {HISTORICAL_REPAIR_NOTE}
            </div>
            <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              Blocked collection mappings are not silently repaired here. Use guided repair after reviewing affected accounts.
            </div>
            {defaultsPreview ? (
              <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="font-semibold text-foreground">Canonical create</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{defaultsPreview.canonical_accounts.create.length}</div>
                </div>
                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="font-semibold text-foreground">Claim existing</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{defaultsPreview.canonical_accounts.claim.length}</div>
                </div>
                <div className="rounded-xl border border-border bg-background p-3">
                  <div className="font-semibold text-foreground">Conflicts</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{defaultsPreview.canonical_accounts.conflicts.length}</div>
                </div>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <ActionButton variant="ghost" onClick={() => setApplyDialogOpen(false)} disabled={saving}>Cancel</ActionButton>
              <ActionButton variant="primary" onClick={confirmApplyDefaults} disabled={saving}>{saving ? "Applying..." : "Apply suggested defaults"}</ActionButton>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-6">
        {error ? <ErrorState title="Accounting setup failed" description={error} onRetry={() => void load()} /> : null}

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operator-proof accounting setup</div>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Status {displayStatus}</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                Finance Accounts are where money is received or paid. Posting Profiles decide which ledger accounts are debited and credited. Chart of Accounts is the ledger structure.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="secondary" onClick={previewDefaults} disabled={previewing}>{previewing ? "Previewing..." : "Preview Suggested Default"}</ActionButton>
              <ActionButton variant="primary" onClick={openApplyDefaultsDialog} disabled={saving || previewing}>{saving ? "Applying..." : "Apply Suggested Default"}</ActionButton>
              <ActionButton variant="secondary" onClick={() => void openRepairDialog(repairableAccounts)} disabled={repairableAccounts.length === 0 || repairing}>Repair blocked collection mappings</ActionButton>
              <ActionButton variant="ghost" onClick={() => void load()}>Refresh</ActionButton>
            </div>
          </div>
          {applyResultNote ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{applyResultNote}</div> : null}
          {blockers.length > 0 ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <div className="font-semibold">Go-live blockers</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            </div>
          ) : null}
          {warnings.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {warnings.length} warning{warnings.length === 1 ? "" : "s"} detected. Review before go-live.
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">1. Business Finance Accounts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cash desks, bank accounts, UPI accounts, and payment gateway accounts are operational money destinations. Ledger posting profiles are excluded from this section.
            </p>
          </div>
          <FinanceAccountMappingPanel
            financeAccounts={businessFinanceAccounts}
            chartAccounts={chartAccounts}
            saving={saving || repairing}
            editingId={editingFinanceAccount?.id ?? null}
            repairId={repairing && repairTargets.length === 1 ? repairTargets[0].id : null}
            selectedChartAccountId={selectedChartAccountId}
            onEdit={openFinanceMappingEdit}
            onCancelEdit={() => {
              setEditingFinanceAccount(null);
              setSelectedChartAccountId("");
            }}
            onChartAccountChange={setSelectedChartAccountId}
            onSave={() => void submitFinanceMappingEdit()}
            onRepair={(account) => void openRepairDialog([account])}
            onRepairAll={(accounts) => void openRepairDialog(accounts)}
          />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">2. System Posting Profiles</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              System posting profiles are diagnostic only and cannot receive customer collections. They decide which ledger accounts are debited and credited.
            </p>
          </div>
          {diagnosticAccounts.length > 0 ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
              <div className="font-semibold">Ledger posting profiles (system)</div>
              <div className="mt-1">Diagnostic only. Not selectable for customer collections.</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {diagnosticAccounts.map((account) => <span key={account.id} className="rounded-full border border-blue-200 bg-white px-2 py-1">{account.name}</span>)}
              </div>
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            {postingProfileReadiness.map((item) => (
              <article key={item.key} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{item.label}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{item.key}</p>
                  </div>
                  <span className={cx("rounded-full border px-2 py-1 text-xs font-semibold", statusClass(item.status))}>{item.status}</span>
                </div>
                <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-muted/20 p-3">
                    <div className="font-semibold text-foreground">Debit account</div>
                    <div className="mt-1 text-muted-foreground">Required: {item.required_debit_account.join(", ") || "Not configured"}</div>
                    <div className="mt-1 text-foreground">{item.configured_debit_account.map(accountLabel).join(", ") || "Not configured"}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/20 p-3">
                    <div className="font-semibold text-foreground">Credit account</div>
                    <div className="mt-1 text-muted-foreground">Required: {item.required_credit_account.join(", ") || "Not configured"}</div>
                    <div className="mt-1 text-foreground">{item.configured_credit_account.map(accountLabel).join(", ") || "Not configured"}</div>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
                  {firstBlocker(item)}
                </div>
                {!item.implemented ? <div className="mt-2 text-xs font-medium text-blue-800">Deferred workflow. Do not create fake collection action.</div> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">3. Chart of Accounts Health</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Chart of Accounts is the ledger structure. Collection accounts must point to active posting-enabled leaf ASSET accounts, not group/control accounts.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group/control accounts</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{coaHealth?.counts?.group_control_count ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Posting leaf accounts</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{coaHealth?.counts?.posting_leaf_count ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Missing leaf assets</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{coaHealth?.counts?.missing_posting_leaf_count ?? 0}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inactive/non-posting</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{coaHealth?.counts?.inactive_or_non_posting_count ?? 0}</div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-sm font-semibold text-foreground">COA blockers</div>
            {(coaHealth?.inactive_or_non_posting_blockers ?? []).length === 0 ? (
              <div className="mt-2 text-sm text-emerald-700">No inactive/non-posting blockers exposed.</div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Code</th>
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Type</th>
                      <th className="px-2 py-2">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(coaHealth?.inactive_or_non_posting_blockers ?? []).slice(0, 12).map((account) => (
                      <tr key={`${account.id}-${account.code}`} className="border-t border-border">
                        <td className="px-2 py-2 font-medium text-foreground">{account.code}</td>
                        <td className="px-2 py-2">{account.name}</td>
                        <td className="px-2 py-2">{account.account_type || account.type}</td>
                        <td className="px-2 py-2 text-amber-700">
                          {!account.is_active ? "Inactive" : account.is_group_control ? "Group/control or non-posting" : "Not collection-ready"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </PortalPage>
  );
}
