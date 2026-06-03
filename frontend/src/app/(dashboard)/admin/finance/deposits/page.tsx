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
import { ApiError } from "@/lib/api";
import { getAccountingSetupReadiness } from "@/services/accounting-setup";
import {
  approveAdminDepositRefund,
  createAdminDepositDeduction,
  ensureAdminRentLeasePremadeAccountingSetup,
  getAdminRentLeaseAccountMapping,
  listAdminDepositRegister,
  recordAdminDepositRefund,
  saveAdminRentLeaseAccountMapping,
  type AdminDepositRow,
} from "@/services/phase4-finance";

const SOURCE_NOTE = "Security deposits are recorded against authoritative rent/lease demand records. The accounting bridge posts system journals when premade COA, finance account, and mapping setup is ready.";
const HISTORY_NOTE = "Refund actions do not rewrite historical collection, receipt, journal, settlement, or reconciliation records.";
const MAPPING_NOTE = "Premade setup creates the required COA, Finance Account, and active rent/lease mapping. Manual override remains available for admin control.";
const READY_NOTE = "Operational source collection is enabled. Rent/lease accounting bridge posts system journals after premade COA/FA/mapping setup is available.";
const REQUIRED_MAPPING_TYPES: Record<string, string> = {
  monthly_income_account_id: "INCOME",
  deposit_liability_account_id: "LIABILITY",
  deposit_refund_account_id: "ASSET",
  damage_recovery_income_account_id: "INCOME",
};

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

function accountType(account: Record<string, unknown> | undefined): string {
  return String(account?.account_type ?? account?.type ?? "").trim().toUpperCase();
}

function financeAccountChartType(account: Record<string, unknown> | undefined): string {
  const nested = account?.chart_account;
  if (nested && typeof nested === "object") {
    return accountType(nested as Record<string, unknown>);
  }
  return String(account?.chart_account_type ?? "").trim().toUpperCase();
}

function isSelectableSettlementFinanceAccount(account: Record<string, unknown>): boolean {
  if (account.is_active === false || account.chart_account_is_active === false) return false;
  if (account.is_real_settlement_account === false || account.diagnostic_only === true || account.system_posting_profile === true) return false;
  if (account.selectable_for_collection !== undefined) return Boolean(account.selectable_for_collection);
  if (account.is_selectable_collection_account !== undefined) return Boolean(account.is_selectable_collection_account);
  if (account.collection_ready !== undefined) return Boolean(account.collection_ready);
  return financeAccountChartType(account) === "ASSET";
}

function formatApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
    return Object.entries(err.fieldErrors)
      .map(([field, messages]) => `${field}: ${messages.join(" ")}`)
      .join(" ");
  }
  return err instanceof Error ? err.message : fallback;
}

export default function AdminFinanceDepositsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminDepositRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mapping, setMapping] = useState<Record<string, unknown> | null>(null);
  const [mappingNote, setMappingNote] = useState(READY_NOTE);
  const [mappingSetupError, setMappingSetupError] = useState<string | null>(null);
  const [backendMappingFieldErrors, setBackendMappingFieldErrors] = useState<Record<string, string[]>>({});
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
      const [registerPayload, mappingResult] = await Promise.all([
        listAdminDepositRegister(),
        getAdminRentLeaseAccountMapping()
          .then((payload) => ({ ok: true as const, payload }))
          .catch((err) => ({ ok: false as const, err })),
      ]);
      const nextRows = registerPayload.results ?? [];
      setRows(nextRows);
      setSelectedId((current) =>
        current && nextRows.some((row) => row.demand_id === current)
          ? current
          : nextRows[0]?.demand_id ?? null,
      );
      if (mappingResult.ok) {
        const mappingPayload = mappingResult.payload;
        setMapping(mappingPayload.mapping ?? null);
        setMappingNote(mappingPayload.posting_boundary_note || READY_NOTE);
        const readinessStatus = String(mappingPayload.readiness?.status ?? "").toUpperCase();
        const readinessReason = readinessStatus && readinessStatus !== "READY" ? mappingPayload.readiness?.reason : "";
        setMappingSetupError(String(mappingPayload.setup_error ?? readinessReason ?? "").trim() || null);
        setBackendMappingFieldErrors(mappingPayload.readiness?.field_errors ?? {});
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
      } else {
        setMapping(null);
        setBackendMappingFieldErrors({});
        setMappingSetupError(formatApiError(mappingResult.err, "Rent/lease mapping requires repair."));
        setMappingNote("Rent/lease mapping could not be loaded. Review the notice below or run premade setup to repair COA/FA/mapping.");
        try {
          const readiness = await getAccountingSetupReadiness();
          setChartAccounts((readiness.chart_accounts ?? []) as Array<Record<string, unknown>>);
          setFinanceAccounts((readiness.finance_accounts ?? []) as Array<Record<string, unknown>>);
        } catch {
          setChartAccounts([]);
          setFinanceAccounts([]);
        }
      }
      setError(null);
    } catch (err) {
      setError(formatApiError(err, "Failed to load deposit finance workspace."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
  const accountById = useMemo(() => {
    const out = new Map<string, Record<string, unknown>>();
    chartAccounts.forEach((account) => out.set(String(account.id), account));
    return out;
  }, [chartAccounts]);

  const mappingFieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const [field, expectedType] of Object.entries(REQUIRED_MAPPING_TYPES)) {
      const selectedValue = mappingForm[field as keyof typeof mappingForm];
      if (!selectedValue) {
        errors[field] = `${expectedType} account is required.`;
        continue;
      }
      const selectedAccount = accountById.get(selectedValue);
      if (accountType(selectedAccount) !== expectedType) {
        errors[field] = `Select an active ${expectedType} chart account.`;
      }
    }
    const selectedSettlement = mappingForm.settlement_finance_account_id
      ? financeAccounts.find((account) => String(account.id) === mappingForm.settlement_finance_account_id)
      : undefined;
    if (mappingForm.settlement_finance_account_id && (!selectedSettlement || !isSelectableSettlementFinanceAccount(selectedSettlement))) {
      errors.settlement_finance_account_id = "Select an active collection-ready settlement finance account mapped to an ASSET chart account.";
    }
    return errors;
  }, [accountById, financeAccounts, mappingForm]);

  const canSaveMapping = Object.keys(mappingFieldErrors).length === 0;

  async function runAction(kind: "deduct" | "approve" | "record") {
    if (!selected) return;
    try {
      if (kind === "deduct") {
        await createAdminDepositDeduction({ subscription_id: selected.subscription_id, amount: form.amount, reason: form.reason });
        setNotice("Deposit deduction recorded and accounting bridge evaluated.");
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
        setNotice("Deposit refund recorded and accounting bridge evaluated.");
      }
      await load();
    } catch (err) {
      setError(formatApiError(err, "Deposit action failed."));
    }
  }

  async function handleEnsurePremade() {
    try {
      const response = await ensureAdminRentLeasePremadeAccountingSetup();
      setNotice(response.detail || "Premade rent/lease accounting setup is ready.");
      await load();
    } catch (err) {
      setError(formatApiError(err, "Failed to ensure premade rent/lease accounting setup."));
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
      setBackendMappingFieldErrors({});
      setNotice("Rent/lease accounting mapping saved. Bridge is posting-ready for future source events.");
      await load();
    } catch (err) {
      if (err instanceof ApiError) setBackendMappingFieldErrors(err.fieldErrors);
      setError(formatApiError(err, "Failed to save account mapping."));
    }
  }

  return (
    <PortalPage
      title="Rent/Lease Deposit Operations"
      subtitle={SOURCE_NOTE}
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Finance", href: "/admin/finance" }, { label: "Deposits" }]}
    >
      {loading ? <LoadingBlock label="Loading deposit operations..." /> : null}
      {error ? <ErrorState title="Unable to load deposit workspace" message={error} onRetry={() => void load()} /> : null}
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Total deposit demands", kpis.count],
          ["Total collected", money(kpis.collected)],
          ["Total held", money(kpis.held)],
          ["Refundable amount", money(kpis.refundable)],
          ["Deducted amount", money(kpis.deducted)],
          ["Pending refund count", kpis.pendingRefunds],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-2 text-xl font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={ROUTES.admin.rentLease} className="rounded-xl border px-3 py-2 text-sm font-semibold">Rent/Lease Workspace</Link>
        <Link href={`${ROUTES.admin.financeCollect}?workflow=unified`} className="rounded-xl border px-3 py-2 text-sm font-semibold">Unified Collection</Link>
        <Link href={ROUTES.admin.accountingSetup} className="rounded-xl border px-3 py-2 text-sm font-semibold">Accounting Setup</Link>
      </div>

      <WorkspaceSection title="Deposit Register" description="Live rent/lease security deposit ledger from authoritative demand records.">
        {rows.length === 0 ? <EmptyState title="No deposit rows" description="No rent/lease security deposit demands are available yet." /> : (
          <DataTableShell>
            <MobileSafeTable className="border-none bg-transparent">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2">Contract</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2 text-right">Collected</th>
                    <th className="px-3 py-2 text-right">Held</th>
                    <th className="px-3 py-2 text-right">Refundable</th>
                    <th className="px-3 py-2 text-right">Deducted</th>
                    <th className="px-3 py-2">Posture</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.demand_id}
                      tabIndex={0}
                      role="button"
                      onClick={() => {
                        setSelectedId(row.demand_id);
                        setForm({ amount: "", reason: "", approval_transaction_id: "" });
                      }}
                      className={`cursor-pointer border-t ${selectedId === row.demand_id ? "bg-muted/60" : "hover:bg-muted/40"}`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.subscription_number || `SUB-${row.subscription_id}`}</div>
                        <div className="text-xs text-muted-foreground">Demand #{row.demand_id}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div>{row.customer_name}</div>
                        {row.customer_phone ? <div className="text-xs text-muted-foreground">{row.customer_phone}</div> : null}
                      </td>
                      <td className="px-3 py-2">{row.plan_type}</td>
                      <td className="px-3 py-2 text-right font-medium">{money(row.collected_amount)}</td>
                      <td className="px-3 py-2 text-right">{money(row.held_amount)}</td>
                      <td className="px-3 py-2 text-right">{money(row.refundable_amount)}</td>
                      <td className="px-3 py-2 text-right">{money(row.deducted_amount)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={posture(row)} />
                        {row.disabled_reason ? <div className="mt-1 max-w-[12rem] text-xs text-muted-foreground">{row.disabled_reason}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </MobileSafeTable>
          </DataTableShell>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="Selected Deposit Action Panel" description="Select a register row first. No manual subscription ID entry is required.">
        {selected ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <div className="rounded-2xl border bg-card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected contract</div>
              <div className="mt-2 text-lg font-semibold">{selected.subscription_number || `SUB-${selected.subscription_id}`}</div>
              <div className="mt-1 text-sm text-muted-foreground">{selected.customer_name} · {selected.plan_type}</div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted-foreground">Collected</dt><dd className="font-semibold">{money(selected.collected_amount)}</dd></div>
                <div><dt className="text-muted-foreground">Held</dt><dd className="font-semibold">{money(selected.held_amount)}</dd></div>
                <div><dt className="text-muted-foreground">Refundable</dt><dd className="font-semibold">{money(selected.refundable_amount)}</dd></div>
                <div><dt className="text-muted-foreground">Deducted</dt><dd className="font-semibold">{money(selected.deducted_amount)}</dd></div>
              </dl>
            </div>
            <div className="rounded-2xl border bg-card p-4">
              <div className="rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{HISTORY_NOTE}</div>
              {selected.disabled_reason ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{selected.disabled_reason}</div> : null}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} />
                <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Approval transaction ID" value={form.approval_transaction_id} onChange={(e) => setForm((c) => ({ ...c, approval_transaction_id: e.target.value }))} />
                <input className="rounded-xl border px-3 py-2 text-sm md:col-span-2" placeholder="Reason (required for deduction)" value={form.reason} onChange={(e) => setForm((c) => ({ ...c, reason: e.target.value }))} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`${ROUTES.admin.financeCollect}?workflow=unified&subscription=${selected.subscription_id}`} aria-disabled={!selected.can_collect} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${selected.can_collect ? "" : "pointer-events-none opacity-50"}`}>Collect Deposit</Link>
                <button type="button" disabled={!canDeduct} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void runAction("deduct")}>Record Deduction</button>
                <button type="button" disabled={!canApprove} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void runAction("approve")}>Approve Refund</button>
                <button type="button" disabled={!canRecord} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void runAction("record")}>Record Refund</button>
              </div>
            </div>
          </div>
        ) : <EmptyState title="Select a deposit" description="Choose a deposit register row to open controlled actions." />}
      </WorkspaceSection>

      <WorkspaceSection title="Accounting Mapping Panel" description={MAPPING_NOTE}>
        <div id="accounting-mapping" className="rounded-xl border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{mappingNote}</div>
        {mappingSetupError ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">Repair required: {mappingSetupError}</div> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-xl border px-3 py-2 text-sm font-semibold" onClick={() => void handleEnsurePremade()}>
            Ensure Premade COA + FA + Mapping
          </button>
          {mapping ? <div className="text-xs text-muted-foreground">Active mapping ID: {String(mapping.id)}</div> : null}
        </div>
        {mapping ? (
          <div className="mt-3 grid gap-2 rounded-xl border bg-card p-3 text-xs text-muted-foreground md:grid-cols-2">
            <div>Monthly income: {String(mapping.monthly_income_account_code ?? "-")}</div>
            <div>Deposit liability: {String(mapping.deposit_liability_account_code ?? "-")}</div>
            <div>Deposit refund: {String(mapping.deposit_refund_account_code ?? "-")}</div>
            <div>Damage recovery: {String(mapping.damage_recovery_income_account_code ?? "-")}</div>
            <div className="md:col-span-2">Settlement FA: {String(mapping.settlement_finance_account_name ?? mapping.settlement_finance_account_id ?? "-")}</div>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[
            ["monthly_income_account_id", "Monthly income account", "INCOME"],
            ["deposit_liability_account_id", "Deposit liability account", "LIABILITY"],
            ["deposit_refund_account_id", "Deposit refund account", "ASSET"],
            ["damage_recovery_income_account_id", "Damage recovery income account", "INCOME"],
          ].map(([key, label, expectedType]) => (
            <label key={key} className="text-sm">
              <div className="mb-1 text-xs text-muted-foreground">{label} ({expectedType})</div>
              <select className="w-full rounded-xl border px-3 py-2 text-sm" value={mappingForm[key as keyof typeof mappingForm]} onChange={(e) => setMappingForm((c) => ({ ...c, [key]: e.target.value }))}>
                <option value="">Select account</option>
                {chartAccounts
                  .filter((acc) => accountType(acc) === expectedType)
                  .map((acc) => <option key={String(acc.id)} value={String(acc.id)}>{String(acc.code)} - {String(acc.name)} ({String(acc.account_type ?? acc.type)})</option>)}
              </select>
              {mappingFieldErrors[key] ? <div className="mt-1 text-xs text-red-700">{mappingFieldErrors[key]}</div> : null}
              {backendMappingFieldErrors[key]?.length ? <div className="mt-1 text-xs text-red-700">{backendMappingFieldErrors[key].join(" ")}</div> : null}
            </label>
          ))}
          <label className="text-sm">
            <div className="mb-1 text-xs text-muted-foreground">Settlement finance account</div>
            <select className="w-full rounded-xl border px-3 py-2 text-sm" value={mappingForm.settlement_finance_account_id} onChange={(e) => setMappingForm((c) => ({ ...c, settlement_finance_account_id: e.target.value }))}>
              <option value="">Use premade/default</option>
              {financeAccounts
                .filter(isSelectableSettlementFinanceAccount)
                .map((acc) => <option key={String(acc.id)} value={String(acc.id)}>{String(acc.name)} ({String(acc.kind)})</option>)}
            </select>
            {mappingFieldErrors.settlement_finance_account_id ? <div className="mt-1 text-xs text-red-700">{mappingFieldErrors.settlement_finance_account_id}</div> : null}
            {backendMappingFieldErrors.settlement_finance_account?.length ? <div className="mt-1 text-xs text-red-700">{backendMappingFieldErrors.settlement_finance_account.join(" ")}</div> : null}
          </label>
          <textarea className="rounded-xl border px-3 py-2 text-sm md:col-span-2" rows={3} placeholder="Notes" value={mappingForm.notes} onChange={(e) => setMappingForm((c) => ({ ...c, notes: e.target.value }))} />
        </div>
        <button type="button" disabled={!canSaveMapping} className="mt-3 rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void handleSaveMapping()}>Save Manual Mapping</button>
      </WorkspaceSection>
    </PortalPage>
  );
}
