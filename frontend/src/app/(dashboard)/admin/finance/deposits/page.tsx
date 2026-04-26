"use client";

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  approveAdminDepositRefund,
  createAdminDepositDeduction,
  getAdminRentLeaseAccountMapping,
  listAdminDepositRegister,
  recordAdminDepositRefund,
  saveAdminRentLeaseAccountMapping,
  type AdminDepositRow,
} from "@/services/phase4-finance";

function money(value: unknown): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

export default function AdminFinanceDepositsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminDepositRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, unknown> | null>(null);
  const [chartAccounts, setChartAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [financeAccounts, setFinanceAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({
    subscription_id: "",
    amount: "",
    reason: "",
    approval_transaction_id: "",
  });
  const [mappingForm, setMappingForm] = useState({
    monthly_income_account_id: "",
    deposit_liability_account_id: "",
    deposit_refund_account_id: "",
    damage_recovery_income_account_id: "",
    settlement_finance_account_id: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [registerPayload, mappingPayload] = await Promise.all([
        listAdminDepositRegister(),
        getAdminRentLeaseAccountMapping(),
      ]);
      setRows(registerPayload.results ?? []);
      setMapping(mappingPayload.mapping ?? null);
      setChartAccounts(mappingPayload.chart_accounts ?? []);
      setFinanceAccounts(mappingPayload.finance_accounts ?? []);
      setMappingForm({
        monthly_income_account_id: String(mappingPayload.mapping?.monthly_income_account_id ?? ""),
        deposit_liability_account_id: String(mappingPayload.mapping?.deposit_liability_account_id ?? ""),
        deposit_refund_account_id: String(mappingPayload.mapping?.deposit_refund_account_id ?? ""),
        damage_recovery_income_account_id: String(mappingPayload.mapping?.damage_recovery_income_account_id ?? ""),
        settlement_finance_account_id: String(mappingPayload.mapping?.settlement_finance_account_id ?? ""),
        notes: String(mappingPayload.mapping?.notes ?? ""),
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deposit finance workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDeduct() {
    try {
      await createAdminDepositDeduction({
        subscription_id: Number(form.subscription_id),
        amount: form.amount,
        reason: form.reason,
      });
      setNotice("Deposit deduction recorded.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record deduction.");
    }
  }

  async function handleApproveRefund() {
    try {
      await approveAdminDepositRefund({
        subscription_id: Number(form.subscription_id),
        amount: form.amount,
      });
      setNotice("Deposit refund approved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve refund.");
    }
  }

  async function handleRecordRefund() {
    try {
      await recordAdminDepositRefund({
        subscription_id: Number(form.subscription_id),
        amount: form.amount,
        approval_transaction_id: form.approval_transaction_id
          ? Number(form.approval_transaction_id)
          : undefined,
      });
      setNotice("Deposit refund recorded.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record refund.");
    }
  }

  async function handleSaveMapping() {
    try {
      await saveAdminRentLeaseAccountMapping({
        monthly_income_account_id: Number(mappingForm.monthly_income_account_id),
        deposit_liability_account_id: Number(mappingForm.deposit_liability_account_id),
        deposit_refund_account_id: Number(mappingForm.deposit_refund_account_id),
        damage_recovery_income_account_id: Number(mappingForm.damage_recovery_income_account_id),
        settlement_finance_account_id: mappingForm.settlement_finance_account_id
          ? Number(mappingForm.settlement_finance_account_id)
          : null,
        notes: mappingForm.notes,
      });
      setNotice("Rent/lease accounting mapping saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account mapping.");
    }
  }

  return (
    <PortalPage
      title="Rent/Lease Deposit Operations"
      subtitle="Admin workspace for live deposit deduction/refund actions and account mapping setup."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Finance", href: "/admin/finance" }, { label: "Deposits" }]}
    >
      {loading ? <LoadingBlock label="Loading deposit operations..." /> : null}
      {error ? <ErrorState title="Unable to load deposit workspace" message={error} onRetry={() => void load()} /> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <WorkspaceSection title="Deposit Register" description="Live rent/lease security deposit ledger from authoritative demand records.">
        {rows.length === 0 ? (
          <EmptyState title="No deposit rows" description="No rent/lease security deposit demands are available yet." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Contract</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Collected</th>
                  <th className="px-3 py-2">Held</th>
                  <th className="px-3 py-2">Refundable</th>
                  <th className="px-3 py-2">Deducted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.demand_id} className="border-t">
                    <td className="px-3 py-2">{row.subscription_number || `SUB-${row.subscription_id}`}</td>
                    <td className="px-3 py-2">{row.customer_name}</td>
                    <td className="px-3 py-2">{row.plan_type}</td>
                    <td className="px-3 py-2">{money(row.collected_amount)}</td>
                    <td className="px-3 py-2">{money(row.held_amount)}</td>
                    <td className="px-3 py-2">{money(row.refundable_amount)}</td>
                    <td className="px-3 py-2">{money(row.deducted_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Deposit Actions" description="Record deduction, approve refund, and post refund records with audit trail.">
        <div className="grid gap-3 md:grid-cols-2">
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Subscription ID" value={form.subscription_id} onChange={(e) => setForm((c) => ({ ...c, subscription_id: e.target.value }))} />
          <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} />
          <input className="rounded-xl border px-3 py-2 text-sm md:col-span-2" placeholder="Reason (required for deduction)" value={form.reason} onChange={(e) => setForm((c) => ({ ...c, reason: e.target.value }))} />
          <input className="rounded-xl border px-3 py-2 text-sm md:col-span-2" placeholder="Approval transaction ID (optional for refund recording)" value={form.approval_transaction_id} onChange={(e) => setForm((c) => ({ ...c, approval_transaction_id: e.target.value }))} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => void handleDeduct()}>
            Record Deduction
          </button>
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => void handleApproveRefund()}>
            Approve Refund
          </button>
          <button type="button" className="rounded-xl border px-3 py-2 text-sm" onClick={() => void handleRecordRefund()}>
            Record Refund
          </button>
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Accounting Account Mapping" description="Configure account codes used by live rent/lease finance sync boundary.">
        {mapping ? <div className="mb-2 text-xs text-muted-foreground">Active mapping ID: {String(mapping.id)}</div> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["monthly_income_account_id", "Monthly income account"],
            ["deposit_liability_account_id", "Deposit liability account"],
            ["deposit_refund_account_id", "Deposit refund account"],
            ["damage_recovery_income_account_id", "Damage recovery income account"],
          ].map(([key, label]) => (
            <label key={key} className="text-sm">
              <div className="mb-1 text-xs text-muted-foreground">{label}</div>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={mappingForm[key as keyof typeof mappingForm]}
                onChange={(e) => setMappingForm((c) => ({ ...c, [key]: e.target.value }))}
              >
                <option value="">Select account</option>
                {chartAccounts.map((acc) => (
                  <option key={String(acc.id)} value={String(acc.id)}>
                    {String(acc.code)} - {String(acc.name)} ({String(acc.account_type)})
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="text-sm">
            <div className="mb-1 text-xs text-muted-foreground">Settlement finance account</div>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={mappingForm.settlement_finance_account_id}
              onChange={(e) => setMappingForm((c) => ({ ...c, settlement_finance_account_id: e.target.value }))}
            >
              <option value="">Optional</option>
              {financeAccounts.map((acc) => (
                <option key={String(acc.id)} value={String(acc.id)}>
                  {String(acc.name)} ({String(acc.kind)})
                </option>
              ))}
            </select>
          </label>
          <textarea className="rounded-xl border px-3 py-2 text-sm md:col-span-2" rows={3} placeholder="Notes" value={mappingForm.notes} onChange={(e) => setMappingForm((c) => ({ ...c, notes: e.target.value }))} />
        </div>
        <button type="button" className="mt-3 rounded-xl border px-3 py-2 text-sm" onClick={() => void handleSaveMapping()}>
          Save Mapping
        </button>
      </WorkspaceSection>
    </PortalPage>
  );
}

