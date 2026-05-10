"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { ROUTES } from "@/lib/routes";
import {
  getAccountingMappingSuggestions,
  getAccountingSetupStatus,
  getFinanceAccountMappings,
  patchFinanceAccountMapping,
  postAccountingSetupBootstrap,
  repairSuggestedMappings,
  type AccountingSetupStatusPayload,
} from "@/services/accounting-setup";

type MappingRow = {
  id: number;
  finance_account_name?: string;
  purpose?: string;
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
  const [status, setStatus] = useState<AccountingSetupStatusPayload | null>(null);
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MappingRow | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editDefault, setEditDefault] = useState(false);
  const [editActive, setEditActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, mappingRes] = await Promise.all([
        getAccountingSetupStatus(),
        getFinanceAccountMappings() as Promise<{ results?: MappingRow[] }>,
      ]);
      setStatus(statusRes);
      setMappings(mappingRes.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load accounting setup.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const applyRecommended = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await postAccountingSetupBootstrap(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply recommended setup.");
    } finally {
      setSaving(false);
    }
  }, [load]);

  const warnings = status?.warnings ?? [];
  const warningCount = status?.warnings_count ?? warnings.length;
  const displayStatus = warningCount > 0 ? "NEEDS_ATTENTION" : status?.status ?? "UNKNOWN";
  const repairMappings = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await repairSuggestedMappings(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to repair suggested mappings.");
    } finally {
      setSaving(false);
    }
  }, [load]);
  const steps = useMemo(
    () => [
      "Step 1: Business finance accounts",
      "Step 2: Chart of Accounts",
      "Step 3: Auto mapping suggestions",
      "Step 4: Review warnings",
      "Step 5: Confirm accounting setup",
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
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="primary" onClick={applyRecommended} disabled={saving}>
            {saving ? "Applying..." : "Apply Recommended Mapping"}
          </ActionButton>
          <ActionButton variant="secondary" onClick={repairMappings} disabled={saving}>
            {saving ? "Repairing..." : "Repair suggested mappings"}
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => void load()}>
            Refresh
          </ActionButton>
        </div>
        {error ? <ErrorState title="Accounting setup failed" description={error} onRetry={() => void load()} /> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Setup status" value={displayStatus} tone={warningCount > 0 ? "warning" : "success"} />
          <StatCard label="COA ready" value={status?.coa_ready ? "Yes" : "No"} />
          <StatCard label="Finance accounts ready" value={status?.finance_accounts_ready ? "Yes" : "No"} />
          <StatCard label="Warnings" value={String(warningCount)} tone={warningCount > 0 ? "warning" : "success"} />
        </div>
        {warningCount > 0 ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {warningCount} blocking mapping warning{warningCount === 1 ? "" : "s"}.
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <div className="text-sm font-semibold text-foreground">Ledger anchor</div>
            <div className="mt-2">
              Present: {status?.ledger_anchor_present ? "yes" : "no"} · Settlement desks flagged:{" "}
              {status?.real_settlement_accounts_present ? "yes" : "no"}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 text-xs text-muted-foreground">
            <div className="text-sm font-semibold text-foreground">Missing mapping purposes</div>
            <div className="mt-2 max-h-32 overflow-y-auto">
              {(status?.missing_required_mappings?.length ?? 0) === 0 ? (
                <span>None detected.</span>
              ) : (
                <ul className="list-disc pl-4">
                  {(status?.missing_required_mappings ?? []).map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
              <div className="text-sm font-semibold text-foreground">Guided setup (business-first)</div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {steps.map((step) => (
              <div key={step} className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {step}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-foreground">Finance Account Mapping Table</div>
            <ActionButton
              variant="outline"
              onClick={async () => {
                const response = (await getAccountingMappingSuggestions()) as { suggestions?: { details?: { purpose?: string; status?: string }[] } };
                const target = response.suggestions?.details?.find((row) => row.status === "created");
                if (!target?.purpose) return;
                const match = mappings.find((row) => row.purpose === target.purpose);
                if (!match) return;
                await patchFinanceAccountMapping(match.id, { is_default: true, is_active: true });
                await load();
              }}
            >
              Apply Suggested Default
            </ActionButton>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-2 py-2">Finance Account</th>
                  <th className="px-2 py-2">Used For</th>
                  <th className="px-2 py-2">Mapped Chart Account</th>
                  <th className="px-2 py-2">Account Type</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Warning</th>
                  <th className="px-2 py-2">Edit</th>
                </tr>
              </thead>
              <tbody>
                {mappings.length === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-muted-foreground" colSpan={7}>
                      No mappings found yet.
                    </td>
                  </tr>
                ) : (
                  mappings.map((row) => {
                    const warning = warnings.find((warn) => {
                      const name = (row.finance_account_name || "").toLowerCase();
                      const purpose = (row.purpose || "").toLowerCase();
                      const message = warn.message.toLowerCase();
                      return message.includes(name) || (purpose ? message.includes(purpose) : false);
                    });
                    const isSystemProfile = (row.finance_account_name || "").toLowerCase().includes("ledger posting profiles");
                    const mappingStatus = !row.chart_account_name
                      ? "Missing"
                      : isSystemProfile
                        ? "System-only"
                        : warning
                          ? "Mismatch"
                          : "Correct";
                    const warningText =
                      isSystemProfile
                        ? "System posting profile — not available for manual receipt/counter selection."
                        : warning?.message || "—";
                    return (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-2 py-2">{row.finance_account_name || "—"}</td>
                        <td className="px-2 py-2">{PURPOSE_LABELS[row.purpose || ""] || row.purpose || "—"}</td>
                        <td className="px-2 py-2">
                          <div className="font-medium text-foreground">{row.chart_account_name || "—"}</div>
                          <div className="text-[11px] text-muted-foreground">{row.purpose || "—"}</div>
                        </td>
                        <td className="px-2 py-2">{row.chart_account_type || "—"}</td>
                        <td className="px-2 py-2">{mappingStatus}</td>
                        <td className="px-2 py-2 text-amber-700">{warningText}</td>
                        <td className="px-2 py-2">
                          <ActionButton
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(row)}
                          >
                            Advanced Edit
                          </ActionButton>
                        </td>
                      </tr>
                    );
                  })
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
                <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>
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
      </div>
    </PortalPage>
  );
}
