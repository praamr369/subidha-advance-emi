"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import FinanceAccountMappingPanel from "@/components/admin/accounting/FinanceAccountMappingPanel";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import { SetupChecklistPageShell } from "@/components/layout/page-shells";
import { ROUTES } from "@/lib/routes";
import {
  getAccountingSetupReadiness,
  getFinanceAccountMappings,
  patchFinanceAccountMapping,
  updateFinanceAccountMapping,
  type AccountingSetupReadinessFinanceAccount,
  type AccountingSetupReadinessPayload,
} from "@/services/accounting-setup";
import {
  applyAccountingSetupDefaults,
  getAccountingSetupHealth,
  previewAccountingSetupDefaults,
  type AccountingSetupDefaultsPreviewResponse,
  type AccountingSetupHealthResponse,
} from "@/services/accounting";

type MappingRow = {
  id: number;
  finance_account_kind?: string;
  finance_account_is_real_settlement_account?: boolean;
  finance_account_name?: string;
  purpose?: string;
  chart_account_code?: string;
  chart_account_name?: string;
  chart_account_type?: string;
  is_active?: boolean;
  is_default?: boolean;
  notes?: string;
};

const PURPOSE_LABELS: Record<string, string> = {
  CASH_COLLECTION: "Cash Desk Collection",
  UPI_COLLECTION: "UPI Collection",
  BANK_COLLECTION: "Bank Collection",
  PAYMENT_GATEWAY_COLLECTION: "Gateway Settlement Collection",
  CUSTOMER_RECEIVABLE: "Customer Receivable",
  SECURITY_DEPOSIT_LIABILITY: "Security Deposit Liability",
  CUSTOMER_ADVANCE_UNEARNED_REVENUE: "Customer Advance / Unearned Revenue",
  EMI_INCOME: "Advance EMI Collection",
  RENT_INCOME: "Rent Income",
  LEASE_INCOME: "Lease Income",
  DIRECT_SALE_INCOME: "Direct Sale Income",
  DELIVERY_CHARGES_INCOME: "Delivery Charges Income",
  WAIVER_LOSS: "Waiver / Loss",
  COMMISSION_PAYABLE: "Partner Commission Payable",
  COMMISSION_EXPENSE: "Commission Expense",
  DAMAGE_RECOVERY: "Damage Recovery",
  DELIVERY_EXPENSE: "Delivery Expense",
  SALARY_EXPENSE: "Salary Expense",
  INVENTORY_ASSET: "Inventory Asset",
};

export default function AdminAccountingSetupPage() {
  const [health, setHealth] = useState<AccountingSetupHealthResponse | null>(null);
  const [readiness, setReadiness] = useState<AccountingSetupReadinessPayload | null>(null);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [defaultsPreview, setDefaultsPreview] = useState<AccountingSetupDefaultsPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MappingRow | null>(null);
  const [editingFinanceAccount, setEditingFinanceAccount] =
    useState<AccountingSetupReadinessFinanceAccount | null>(null);
  const [selectedChartAccountId, setSelectedChartAccountId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editDefault, setEditDefault] = useState(false);
  const [editActive, setEditActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, mappingRes, readinessRes] = await Promise.all([
        getAccountingSetupHealth(),
        getFinanceAccountMappings() as Promise<{ results?: MappingRow[] }>,
        getAccountingSetupReadiness(),
      ]);
      setHealth(healthRes);
      setMappings(mappingRes.results ?? []);
      setReadiness(readinessRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounting setup.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const blockers = health?.blockers ?? [];
  const warnings = health?.warnings ?? [];
  const displayStatus = health?.status ?? "BLOCKED";

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

  const applyDefaults = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      if (!defaultsPreview) {
        await previewDefaults();
      }
      const confirmed = window.confirm(
        "Apply suggested defaults?\n\nThis creates/claims canonical Chart of Accounts, seeds default Finance Accounts, and updates posting profiles.\nIt will not delete anything and will not rewrite historical journals or payments."
      );
      if (!confirmed) return;
      await applyAccountingSetupDefaults({ confirm: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply suggested defaults.");
    } finally {
      setSaving(false);
    }
  }, [defaultsPreview, load, previewDefaults]);
  const steps = useMemo(
    () => [
      "Step 1: Business finance accounts",
      "Step 2: Chart of Accounts",
      "Step 3: Canonical mapping and profiles",
      "Step 4: Review blockers and warnings",
      "Step 5: Confirm go-live readiness",
    ],
    []
  );
  const openEdit = useCallback((row: MappingRow) => {
    setEditing(row);
    setEditNotes(row.notes ?? "");
    setEditDefault(Boolean(row.is_default));
    setEditActive(Boolean(row.is_active));
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await patchFinanceAccountMapping(editing.id, {
        notes: editNotes,
        is_default: editDefault,
        is_active: editActive,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update mapping.");
    } finally {
      setSaving(false);
    }
  }, [editActive, editDefault, editNotes, editing, load]);

  const openFinanceMappingEdit = useCallback((row: AccountingSetupReadinessFinanceAccount) => {
    setEditingFinanceAccount(row);
    setSelectedChartAccountId(row.mapped_chart_account ? String(row.mapped_chart_account.id) : "");
  }, []);

  const submitFinanceMappingEdit = useCallback(async () => {
    if (!editingFinanceAccount || !selectedChartAccountId) return;
    setSaving(true);
    setError(null);
    try {
      await updateFinanceAccountMapping(editingFinanceAccount.id, {
        chart_account_id: Number(selectedChartAccountId),
      });
      setEditingFinanceAccount(null);
      setSelectedChartAccountId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update finance account mapping.");
    } finally {
      setSaving(false);
    }
  }, [editingFinanceAccount, load, selectedChartAccountId]);

  if (loading) {
    return (
      <PortalPage title="Accounting Setup" subtitle="Simple finance-account to chart-account mapping setup for day-one operations.">
        <LoadingBlock label="Loading accounting setup..." />
      </PortalPage>
    );
  }

  return (
    <PortalPage
      title="Accounting Setup"
      subtitle="Business-friendly setup flow for Finance Accounts and Chart of Accounts mapping."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Setup" },
      ]}
    >
      <SetupChecklistPageShell
        readiness={
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground sm:text-sm">
              <span className="font-semibold text-foreground">Setup posture</span>
              {": "}
              Status {displayStatus}
              {" · "}
              Canonical missing {health?.canonical_accounts?.missing?.length ?? 0}
              {" · "}
              Conflicts {health?.canonical_accounts?.conflicts?.length ?? 0}
              {" · "}
              Blockers {blockers.length}
              {" · "}
              Warnings {warnings.length}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                <div className="text-sm font-semibold text-foreground">Finance readiness</div>
                <div className="mt-2 space-y-1">
                  <div>CASH active: {health?.finance_accounts?.CASH?.active_count ?? 0}</div>
                  <div>BANK active: {health?.finance_accounts?.BANK?.active_count ?? 0}</div>
                  <div>UPI active: {health?.finance_accounts?.UPI?.active_count ?? 0}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
                <div className="text-sm font-semibold text-foreground">Journal integrity</div>
                <div className="mt-2 space-y-1">
                  <div>Posted unbalanced: {health?.journals?.posted_unbalanced_count ?? 0}</div>
                  <div>Posted zero-line: {health?.journals?.posted_zero_line_count ?? 0}</div>
                  <div>Lines to inactive COA: {health?.journals?.lines_to_inactive_accounts ?? 0}</div>
                </div>
              </div>
            </div>
            {readiness ? (
              <div
                className={[
                  "rounded-lg border px-3 py-2 text-xs sm:text-sm",
                  readiness.summary.blockers_count > 0
                    ? "border-red-200 bg-red-50 text-red-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900",
                ].join(" ")}
              >
                <span className="font-semibold">Finance Readiness Banner</span>
                {": "}
                Cash ready {readiness.summary.cash_accounts_ready_count}
                {" · "}Bank ready {readiness.summary.bank_accounts_ready_count}
                {" · "}UPI ready {readiness.summary.upi_accounts_ready_count}
                {" · "}Blocked {readiness.summary.blockers_count}
              </div>
            ) : null}
          </div>
        }
        blockers={
          error ? (
            <ErrorState title="Accounting setup failed" description={error} onRetry={() => void load()} />
          ) : blockers.length > 0 ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              <div className="font-semibold">Go-live blockers</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : null
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="secondary" onClick={previewDefaults} disabled={previewing}>
              {previewing ? "Previewing..." : "Preview Suggested Default"}
            </ActionButton>
            <ActionButton variant="primary" onClick={applyDefaults} disabled={saving}>
              {saving ? "Applying..." : "Apply Suggested Default"}
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => void load()}>
              Refresh
            </ActionButton>
          </div>
        }
        checklist={
          <>
            {warnings.length > 0 ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {warnings.length} warning{warnings.length === 1 ? "" : "s"} detected.
              </div>
            ) : null}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-sm font-semibold text-foreground">Guided setup (business-first)</div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {steps.map((step) => (
                  <div
                    key={step}
                    className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </>
        }
        evidence={
          <>
        {readiness ? (
          <>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-sm font-semibold text-foreground">Why blocked?</div>
              <div className="mt-2 text-xs text-muted-foreground">
                Payment collection can only post into active Finance Accounts mapped to active, posting-enabled leaf ASSET chart accounts.
                Group/control Chart of Accounts remain visible for setup review but cannot receive collections.
              </div>
              <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                Suggested Default Setup preview is review-only here. It does not silently apply mappings or rewrite historical payments, receipts, journals, settlements, reconciliations, or day-close records.
              </div>
            </div>
            <FinanceAccountMappingPanel
              financeAccounts={readiness.finance_accounts}
              chartAccounts={readiness.chart_accounts}
              saving={saving}
              editingId={editingFinanceAccount?.id ?? null}
              selectedChartAccountId={selectedChartAccountId}
              onEdit={openFinanceMappingEdit}
              onCancelEdit={() => {
                setEditingFinanceAccount(null);
                setSelectedChartAccountId("");
              }}
              onChartAccountChange={setSelectedChartAccountId}
              onSave={() => void submitFinanceMappingEdit()}
            />
          </>
        ) : null}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-foreground">Finance Account Mapping Table</div>
            <div className="text-xs text-muted-foreground">Manual collection + system-only profiles</div>
          </div>
          {defaultsPreview ? (
            <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">Preview (latest)</div>
              <div className="mt-1">
                Canonical create: {defaultsPreview.canonical_accounts.create.length}
                {" · "}Claim: {defaultsPreview.canonical_accounts.claim.length}
                {" · "}Conflicts: {defaultsPreview.canonical_accounts.conflicts.length}
              </div>
            </div>
          ) : null}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Finance account / profile</th>
                  <th className="px-2 py-2">Used For</th>
                  <th className="px-2 py-2">Mapped Chart Account</th>
                  <th className="px-2 py-2">Account Type</th>
                  <th className="px-2 py-2">Manual vs System-only</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Warning</th>
                  <th className="px-2 py-2">Edit</th>
                </tr>
              </thead>
              <tbody>
                {mappings.length === 0 && (health?.posting_profiles?.mapped?.length ?? 0) === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-muted-foreground" colSpan={7}>
                      No mappings found yet.
                    </td>
                  </tr>
                ) : (
                  <>
                    {mappings.map((row) => {
                      const manualPurposes = new Set([
                        "CASH_COLLECTION",
                        "BANK_COLLECTION",
                        "UPI_COLLECTION",
                        "PAYMENT_GATEWAY_COLLECTION",
                      ]);
                      const isSystemOnly = !manualPurposes.has(row.purpose || "");
                      const statusLabel = row.is_active ? (row.is_default ? "Default" : "Active") : "Inactive";
                      const kind = (row.finance_account_kind || "").toUpperCase();
                      const financeActiveCount =
                        kind === "CASH" || kind === "BANK" || kind === "UPI"
                          ? health?.finance_accounts?.[kind as "CASH" | "BANK" | "UPI"]?.active_count ?? 0
                          : 0;
                      const warningText = isSystemOnly
                        ? "System-only mapping (do not use for receipts/cash counters)."
                        : financeActiveCount !== 1
                          ? "Ambiguous or missing active finance account for this kind."
                          : row.chart_account_type && row.chart_account_type !== "ASSET"
                            ? "Manual collection must map to an ASSET chart account."
                            : "—";

                      return (
                        <tr key={`map-${row.id}`} className="border-t border-border">
                          <td className="px-2 py-2">
                            <div className="font-medium text-foreground">{row.finance_account_name || "—"}</div>
                            <div className="text-[11px] text-muted-foreground">{row.finance_account_kind || "—"}</div>
                          </td>
                          <td className="px-2 py-2">{PURPOSE_LABELS[row.purpose || ""] || row.purpose || "—"}</td>
                          <td className="px-2 py-2">
                            <div className="font-medium text-foreground">
                              {row.chart_account_code ? `${row.chart_account_code} · ` : ""}
                              {row.chart_account_name || "—"}
                            </div>
                          </td>
                          <td className="px-2 py-2">{row.chart_account_type || "—"}</td>
                          <td className="px-2 py-2">{isSystemOnly ? "System-only" : "Manual"}</td>
                          <td className="px-2 py-2">{statusLabel}</td>
                          <td className="px-2 py-2 text-amber-700">{warningText}</td>
                          <td className="px-2 py-2">
                            <ActionButton size="sm" variant="ghost" onClick={() => openEdit(row)}>
                              Advanced Edit
                            </ActionButton>
                          </td>
                        </tr>
                      );
                    })}

                    {(health?.posting_profiles?.mapped ?? []).map((row) => (
                      <tr key={`prof-${row.id ?? row.key}`} className="border-t border-border">
                        <td className="px-2 py-2">
                          <div className="font-medium text-foreground">{row.label || row.key}</div>
                          <div className="text-[11px] text-muted-foreground">{row.key}</div>
                        </td>
                        <td className="px-2 py-2">System posting profile</td>
                        <td className="px-2 py-2">
                          <div className="font-medium text-foreground">
                            {row.chart_account_code ? `${row.chart_account_code} · ` : ""}
                            {row.chart_account_name || "—"}
                          </div>
                        </td>
                        <td className="px-2 py-2">—</td>
                        <td className="px-2 py-2">System-only</td>
                        <td className="px-2 py-2">Active</td>
                        <td className="px-2 py-2 text-amber-700">
                          {row.chart_account_is_legacy ? "Profile mapped to a legacy COA row." : "—"}
                        </td>
                        <td className="px-2 py-2">
                          <span className="text-[11px] text-muted-foreground">Managed by defaults</span>
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="text-sm font-semibold text-foreground">Warnings</div>
          {warnings.length === 0 ? (
            <div className="mt-2 text-xs text-emerald-700">No warnings. Accounting setup is ready.</div>
          ) : (
            <ul className="mt-2 space-y-2 text-xs text-amber-700">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
        {editing ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl">
              <div className="text-base font-semibold text-foreground">Advanced Edit (Accountant / Agency)</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Update default status, active status, and notes without changing financial posting logic.
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs">
                  <div className="font-semibold text-foreground">{editing.finance_account_name || "Finance Account"}</div>
                  <div className="text-muted-foreground">{PURPOSE_LABELS[editing.purpose || ""] || editing.purpose || "Purpose"}</div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editDefault} onChange={(e) => setEditDefault(e.target.checked)} />
                  Default mapping for this purpose
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                  Mapping active
                </label>
                <label className="block text-sm">
                  Notes
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    rows={3}
                  />
                </label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <ActionButton variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </ActionButton>
                <ActionButton variant="primary" onClick={submitEdit} disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </ActionButton>
              </div>
            </div>
          </div>
        ) : null}
          </>
        }
      />
    </PortalPage>
  );
}
