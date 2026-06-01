"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { DataTableShell, MobileSafeTable } from "@/components/ui/operations";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  approveAdminDepositRefund,
  createAdminDepositDeduction,
  getAdminRentLeaseAccountMapping,
  listAdminDepositRegister,
  recordAdminDepositRefund,
  saveAdminRentLeaseAccountMapping,
  type AdminDepositRow,
} from "@/services/phase4-finance";

const SOURCE_NOTE = "Security deposits are recorded against rent/lease source demand records. Accounting posting remains audit-deferred until separately approved.";
const HISTORY_NOTE = "Refund actions do not rewrite historical collection, receipt, journal, settlement, or reconciliation records.";
const MAPPING_NOTE = "Mapping configures sync metadata and future posting bridge readiness. It does not create journal entries.";

function money(value: unknown): string {
  const parsed = Number(value ?? 0);
  return `₹${Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00"}`;
}

function isPositive(value: string): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function posture(row: AdminDepositRow): string {
  if (row.can_collect) return "COLLECTIBLE";
  if (row.can_record_refund) return "REFUND_READY";
  if (row.can_approve_refund) return "REFUND_APPROVAL";
  if (row.can_deduct) return "DEDUCTIBLE";
  return "VIEW_ONLY";
}

export default function AdminFinanceDepositsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminDepositRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mapping, setMapping] = useState<Record<string, unknown> | null>(null);
  const [mappingNote, setMappingNote] = useState("Operational source collection is enabled. Accounting posting bridge remains audit-deferred until approved.");
  const [chartAccounts, setChartAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [financeAccounts, setFinanceAccounts] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({ amount: "", reason: "", approval_transaction_id: "" });
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
      const [registerPayload, mappingPayload] = await Promise.all([listAdminDepositRegister(), getAdminRentLeaseAccountMapping()]);
      const nextRows = registerPayload.results ?? [];
      setRows(nextRows);
      setSelectedId((current) => current && nextRows.some((row) => row.demand_id === current) ? current : nextRows[0]?.demand_id ?? null);
      setMapping(mappingPayload.mapping ?? null);
      setMappingNote(mappingPayload.posting_boundary_note || "Operational source collection is enabled. Accounting posting bridge remains audit-deferred until approved.");
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

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => rows.find((row) => row.demand_id === selectedId) ?? null, [rows, selectedId]);
  const kpis = useMemo(() => {
    const sum = (field: keyof AdminDepositRow) => rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
    return {
      count: rows.length,
      collected: sum("collected_amount"),
      held: sum("held_amount"),
      refundable: sum("refundable_amount"),
      deducted: sum("deducted_amount"),
      pendingRefunds: rows.filter((row) => row.can_approve_refund || row.can_record_refund).length,
    };
  }, [rows]);

  const validAmount = isPositive(form.amount);
  const canDeduct = Boolean(selected?.can_deduct && validAmount && form.reason.trim());
  const canApprove = Boolean(selected?.can_approve_refund && validAmount);
  const canRecord = Boolean(selected?.can_record_refund && validAmount);
  const canSaveMapping = Boolean(mappingForm.monthly_income_account_id && mappingForm.deposit_liability_account_id && mappingForm.deposit_refund_account_id && mappingForm.damage_recovery_income_account_id);

  async function runAction(kind: "deduct" | "approve" | "record") {
    if (!selected) return;
    try {
      if (kind === "deduct") {
        await createAdminDepositDeduction({ subscription_id: selected.subscription_id, amount: form.amount, reason: form.reason });
        setNotice("Deposit deduction recorded.");
      }
      if (kind === "approve") {
        const response = await approveAdminDepositRefund({ subscription_id: selected.subscription_id, amount: form.amount });
        setForm((current) => ({ ...current, approval_transaction_id: String(response.transaction_id ?? "") }));
        setNotice("Deposit refund approved.");
      }
      if (kind === "record") {
        await recordAdminDepositRefund({
          subscription_id: selected.subscription_id,
          amount: form.amount,
          approval_transaction_id: form.approval_transaction_id ? Number(form.approval_transaction_id) : undefined,
        });
        setNotice("Deposit refund recorded.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit action failed.");
    }
  }

  async function handleSaveMapping() {
    if (!canSaveMapping) return;
    try {
      await saveAdminRentLeaseAccountMapping({
        monthly_income_account_id: Number(mappingForm.monthly_income_account_id),
        deposit_liability_account_id: Number(mappingForm.deposit_liability_account_id),
        deposit_refund_account_id: Number(mappingForm.deposit_refund_account_id),
        damage_recovery_income_account_id: Number(mappingForm.damage_recovery_income_account_id),
        settlement_finance_account_id: mappingForm.settlement_finance_account_id ? Number(mappingForm.settlement_finance_account_id) : null,
        notes: mappingForm.notes,
      });
      setNotice("Rent/lease accounting mapping saved. Accounting posting remains audit-deferred.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save account mapping.");
    }
  }

  return (
    <PortalPage title="Rent/Lease Deposit Operations" subtitle={SOURCE_NOTE} breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Finance", href: "/admin/finance" }, { label: "Deposits" }]}>
      {loading ? <LoadingBlock label="Loading deposit operations..." /> : null}
      {error ? <ErrorState title="Unable to load deposit workspace" message={error} onRetry={() => void load()} /> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[["Total deposit demands", kpis.count], ["Total collected", money(kpis.collected)], ["Total held", money(kpis.held)], ["Refundable amount", money(kpis.refundable)], ["Deducted amount", money(kpis.deducted)], ["Pending refund count", kpis.pendingRefunds]].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border bg-card p-4 shadow-sm"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-2 text-xl font-semibold">{value}</div></div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={ROUTES.admin.rentLease} className="rounded-xl border px-3 py-2 text-sm font-semibold">Rent/Lease Workspace</Link>
        <Link href={`${ROUTES.admin.financeCollect}?workflow=unified`} className="rounded-xl border px-3 py-2 text-sm font-semibold">Unified Collection</Link>
        <Link href={ROUTES.admin.accountingSetup} className="rounded-xl border px-3 py-2 text-sm font-semibold">Accounting Setup</Link>
      </div>

      <WorkspaceSection title="Deposit Register" description="Live rent/lease security deposit ledger from authoritative demand records.">
        {rows.length === 0 ? <EmptyState title="No deposit rows" description="No rent/lease security deposit demands are available yet." /> : (
          <DataTableShell><MobileSafeTable className="border-none bg-transparent"><table className="min-w-full text-sm"><thead className="bg-muted/40 text-left"><tr><th className="px-3 py-2">Contract</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2 text-right">Collected</th><th className="px-3 py-2 text-right">Held</th><th className="px-3 py-2 text-right">Refundable</th><th className="px-3 py-2 text-right">Deducted</th><th className="px-3 py-2">Posture</th></tr></thead><tbody>
            {rows.map((row) => (
              <tr key={row.demand_id} tabIndex={0} role="button" onClick={() => { setSelectedId(row.demand_id); setForm({ amount: "", reason: "", approval_transaction_id: "" }); }} className={`cursor-pointer border-t ${selectedId === row.demand_id ? "bg-muted/60" : "hover:bg-muted/40"}`}>
                <td className="px-3 py-2"><div className="font-medium">{row.subscription_number || `SUB-${row.subscription_id}`}</div><div className="text-xs text-muted-foreground">Demand #{row.demand_id}</div></td>
                <td className="px-3 py-2"><div>{row.customer_name}</div>{row.customer_phone ? <div className="text-xs text-muted-foreground">{row.customer_phone}</div> : null}</td>
                <td className="px-3 py-2">{row.plan_type}</td><td className="px-3 py-2 text-right font-medium">{money(row.collected_amount)}</td><td className="px-3 py-2 text-right">{money(row.held_amount)}</td><td className="px-3 py-2 text-right">{money(row.refundable_amount)}</td><td className="px-3 py-2 text-right">{money(row.deducted_amount)}</td>
                <td className="px-3 py-2"><StatusBadge status={posture(row)} />{row.disabled_reason ? <div className="mt-1 max-w-[12rem] text-xs text-muted-foreground">{row.disabled_reason}</div> : null}</td>
              </tr>
            ))}
          </tbody></table></MobileSafeTable></DataTableShell>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Selected Deposit Action Panel" description="Select a register row first. No manual subscription ID entry is required.">
        {selected ? <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]"><div className="rounded-2xl border bg-card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected contract</div><div className="mt-2 text-lg font-semibold">{selected.subscription_number || `SUB-${selected.subscription_id}`}</div><div className="mt-1 text-sm text-muted-foreground">{selected.customer_name} · {selected.plan_type}</div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Collected</dt><dd className="font-semibold">{money(selected.collected_amount)}</dd></div><div><dt className="text-muted-foreground">Held</dt><dd className="font-semibold">{money(selected.held_amount)}</dd></div><div><dt className="text-muted-foreground">Refundable</dt><dd className="font-semibold">{money(selected.refundable_amount)}</dd></div><div><dt className="text-muted-foreground">Deducted</dt><dd className="font-semibold">{money(selected.deducted_amount)}</dd></div></dl></div><div className="rounded-2xl border bg-card p-4"><div className="rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{HISTORY_NOTE}</div>{selected.disabled_reason ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{selected.disabled_reason}</div> : null}<div className="mt-4 grid gap-3 md:grid-cols-2"><input className="rounded-xl border px-3 py-2 text-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} /><input className="rounded-xl border px-3 py-2 text-sm" placeholder="Approval transaction ID" value={form.approval_transaction_id} onChange={(e) => setForm((c) => ({ ...c, approval_transaction_id: e.target.value }))} /><input className="rounded-xl border px-3 py-2 text-sm md:col-span-2" placeholder="Reason (required for deduction)" value={form.reason} onChange={(e) => setForm((c) => ({ ...c, reason: e.target.value }))} /></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`${ROUTES.admin.financeCollect}?workflow=unified&subscription=${selected.subscription_id}`} aria-disabled={!selected.can_collect} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${selected.can_collect ? "" : "pointer-events-none opacity-50"}`}>Collect Deposit</Link><button type="button" disabled={!canDeduct} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void runAction("deduct")}>Record Deduction</button><button type="button" disabled={!canApprove} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void runAction("approve")}>Approve Refund</button><button type="button" disabled={!canRecord} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void runAction("record")}>Record Refund</button></div></div></div> : <EmptyState title="Select a deposit" description="Choose a deposit register row to open controlled actions." />}
      </WorkspaceSection>

      <WorkspaceSection title="Accounting Mapping Panel" description={MAPPING_NOTE}>
        <div id="accounting-mapping" className="rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{mappingNote}</div>
        {mapping ? <div className="mt-3 text-xs text-muted-foreground">Active mapping ID: {String(mapping.id)}</div> : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[["monthly_income_account_id", "Monthly income account"], ["deposit_liability_account_id", "Deposit liability account"], ["deposit_refund_account_id", "Deposit refund account"], ["damage_recovery_income_account_id", "Damage recovery income account"]].map(([key, label]) => (
            <label key={key} className="text-sm"><div className="mb-1 text-xs text-muted-foreground">{label}</div><select className="w-full rounded-xl border px-3 py-2 text-sm" value={mappingForm[key as keyof typeof mappingForm]} onChange={(e) => setMappingForm((c) => ({ ...c, [key]: e.target.value }))}><option value="">Select account</option>{chartAccounts.map((acc) => <option key={String(acc.id)} value={String(acc.id)}>{String(acc.code)} - {String(acc.name)} ({String(acc.account_type)})</option>)}</select></label>
          ))}
          <label className="text-sm"><div className="mb-1 text-xs text-muted-foreground">Settlement finance account</div><select className="w-full rounded-xl border px-3 py-2 text-sm" value={mappingForm.settlement_finance_account_id} onChange={(e) => setMappingForm((c) => ({ ...c, settlement_finance_account_id: e.target.value }))}><option value="">Optional</option>{financeAccounts.map((acc) => <option key={String(acc.id)} value={String(acc.id)}>{String(acc.name)} ({String(acc.kind)})</option>)}</select></label>
          <textarea className="rounded-xl border px-3 py-2 text-sm md:col-span-2" rows={3} placeholder="Notes" value={mappingForm.notes} onChange={(e) => setMappingForm((c) => ({ ...c, notes: e.target.value }))} />
        </div>
        <button type="button" disabled={!canSaveMapping} className="mt-3 rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void handleSaveMapping()}>Save Mapping</button>
      </WorkspaceSection>
    </PortalPage>
  );
}
