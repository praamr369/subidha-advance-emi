"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { RefreshCw, Wand2 } from "lucide-react";

import FinanceAccountEditDrawer from "@/components/accounting/FinanceAccountEditDrawer";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { formatRupee } from "@/lib/utils/currency";
import { ROUTES } from "@/lib/routes";
import {
  applyAccountingSetupDefaults,
  createFinanceAccount,
  listChartOfAccounts,
  listFinanceAccounts,
  previewAccountingSetupDefaults,
  type AccountingSetupDefaultsPreviewResponse,
  type ChartOfAccount,
  type FinanceAccount,
  type FinanceAccountDetail,
} from "@/services/accounting";

type KindFilter = "ALL" | "CASH" | "BANK" | "UPI";
type StatusFilter = "ALL" | "READY" | "BLOCKED" | "ACTIVE" | "INACTIVE";

function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function pill(tone: "success" | "warning" | "info" | "muted" = "muted") {
  const base = "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide";
  if (tone === "success") return `${base} border-emerald-200 bg-emerald-50 text-emerald-800`;
  if (tone === "warning") return `${base} border-amber-200 bg-amber-50 text-amber-900`;
  if (tone === "info") return `${base} border-blue-200 bg-blue-50 text-blue-800`;
  return `${base} border-border bg-muted text-muted-foreground`;
}

function recommendedFinanceAccounts(preview: AccountingSetupDefaultsPreviewResponse | null): Array<Record<string, unknown>> {
  return (preview?.finance_accounts?.to_create ?? []) as Array<Record<string, unknown>>;
}

export default function AdminAccountingFinanceAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [chartAccounts, setChartAccounts] = useState<ChartOfAccount[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [defaultsPreview, setDefaultsPreview] = useState<AccountingSetupDefaultsPreviewResponse | null>(null);
  const [selectedFinanceAccountId, setSelectedFinanceAccountId] = useState<number | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [form, setForm] = useState({
    name: "",
    kind: "CASH",
    chart_account: "",
    opening_balance: "0.00",
    bank_last4: "",
    upi_handle: "",
    notes: "",
  });

  async function load(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const [chartPayload, financePayload, previewPayload] = await Promise.allSettled([
        listChartOfAccounts({ page_size: 500 }),
        listFinanceAccounts({ page_size: 500 }),
        previewAccountingSetupDefaults(),
      ]);
      if (chartPayload.status === "rejected") throw chartPayload.reason;
      if (financePayload.status === "rejected") throw financePayload.reason;
      setChartAccounts(chartPayload.value.results ?? []);
      setFinanceAccounts(financePayload.value.results ?? []);
      setDefaultsPreview(previewPayload.status === "fulfilled" ? previewPayload.value : null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load finance accounts workspace.");
      if (mode === "initial") {
        setChartAccounts([]);
        setFinanceAccounts([]);
        setDefaultsPreview(null);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => { void load("initial"); }, []);

  const assetChartAccounts = useMemo(
    () => chartAccounts.filter((account) => account.account_type === "ASSET" && account.is_active),
    [chartAccounts],
  );

  const filteredRows = useMemo(() => {
    return financeAccounts.filter((account) => {
      const ready = account.collection_ready !== false;
      const kindMatch = kindFilter === "ALL" || account.kind === kindFilter;
      const statusMatch =
        statusFilter === "ALL" ||
        (statusFilter === "READY" ? ready : statusFilter === "BLOCKED" ? !ready : statusFilter === "ACTIVE" ? account.is_active : !account.is_active);
      return kindMatch && statusMatch;
    });
  }, [financeAccounts, kindFilter, statusFilter]);

  const summary = useMemo(() => {
    const ready = financeAccounts.filter((account) => account.collection_ready !== false).length;
    const blocked = financeAccounts.filter((account) => account.collection_ready === false).length;
    const active = financeAccounts.filter((account) => account.is_active).length;
    return { ready, blocked, active, total: financeAccounts.length };
  }, [financeAccounts]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chartAccountId = Number(form.chart_account);
    if (!Number.isInteger(chartAccountId) || chartAccountId <= 0) {
      setError("Select an active ASSET chart account before creating a finance account.");
      return;
    }
    setSaving(true);
    try {
      await createFinanceAccount({
        name: form.name.trim(),
        kind: form.kind as FinanceAccount["kind"],
        chart_account: chartAccountId,
        opening_balance: form.opening_balance,
        bank_last4: form.bank_last4.trim(),
        upi_handle: form.upi_handle.trim(),
        notes: form.notes.trim(),
      });
      setNotice("Finance account created.");
      setForm({ name: "", kind: "CASH", chart_account: "", opening_balance: "0.00", bank_last4: "", upi_handle: "", notes: "" });
      await load("refresh");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create finance account.");
    } finally {
      setSaving(false);
    }
  }

  async function applyDefaults() {
    const ok = window.confirm("Apply system-recommended accounting defaults for missing COA / finance setup? This does not post payments, receipts, journals, settlements, reconciliation, EMI, lucky draw, commission, payout, delivery, or stock records.");
    if (!ok) return;
    setSaving(true);
    try {
      await applyAccountingSetupDefaults({ confirm: true });
      setNotice("System default COA / finance account setup applied. Review mappings before live operations.");
      await load("refresh");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply accounting defaults.");
    } finally {
      setSaving(false);
    }
  }

  const recommended = recommendedFinanceAccounts(defaultsPreview);

  return (
    <ERPPageShell
      eyebrow="Accounting Setup"
      title="Finance Accounts"
      subtitle="Cash, bank, and UPI settlement accounts separated from the Chart of Accounts register. Finance accounts must map to active ASSET chart accounts before collection/posting workflows can use them."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Finance Accounts" }]}
      actions={[{ href: ROUTES.admin.accountingChartOfAccounts, label: "Chart of Accounts", variant: "secondary" }, { href: ROUTES.admin.accountingSetup, label: "Setup Matrix", variant: "secondary" }]}
      stats={[{ label: "Finance Accounts", value: String(summary.total), tone: "info" }, { label: "Collection-ready", value: String(summary.ready), tone: "success" }, { label: "Blocked", value: String(summary.blocked), tone: summary.blocked > 0 ? "warning" : "success" }, { label: "Active", value: String(summary.active), tone: "info" }]}
      statusBadge={{ label: summary.blocked > 0 ? "Needs mapping" : "Ready", tone: summary.blocked > 0 ? "warning" : "success" }}
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading finance accounts..." /> : null}
        {error ? <ERPErrorState title="Unable to load finance accounts" description={error} onRetry={() => void load("initial")} /> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

        <ERPSectionShell title="Auto-sync posture" description="Uses the existing accounting setup defaults service to create/claim missing system COA and finance account defaults. This does not post money or rewrite history.">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
              <div className="font-semibold text-foreground">Recommended defaults</div>
              <p className="mt-1">Missing finance account defaults: <span className="font-semibold text-foreground">{recommended.length}</span>. Required settlement types are Cash, Bank, and UPI accounts mapped to active ASSET chart accounts.</p>
              {recommended.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{recommended.slice(0, 8).map((row, index) => <span key={index} className={pill("warning")}>{text(row.kind)} · {text(row.name)}</span>)}</div> : <div className="mt-3"><span className={pill("success")}>No missing recommended finance defaults</span></div>}
            </div>
            <button type="button" disabled={saving} onClick={() => void applyDefaults()} className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-background px-4 py-3 text-sm font-semibold transition hover:bg-muted disabled:opacity-50"><Wand2 className="h-4 w-4" />Apply safe defaults</button>
          </div>
        </ERPSectionShell>

        <ERPSectionShell title="Create finance account" description="Create real settlement instruments only. Use ASSET COA accounts such as CASH-1000, BANK-1010, UPI-1020, or PGW-1030.">
          {assetChartAccounts.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">No active ASSET chart account is available. Create or activate one in Chart of Accounts first.</div> : null}
          <form className="mt-3 grid gap-3 md:grid-cols-3" onSubmit={handleCreate}>
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Display name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
            <select title="Account kind" className="rounded-xl border px-3 py-2 text-sm" value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value }))}><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option></select>
            <select title="Chart of account" className="rounded-xl border px-3 py-2 text-sm" value={form.chart_account} onChange={(event) => setForm((current) => ({ ...current, chart_account: event.target.value }))} required disabled={assetChartAccounts.length === 0}><option value="">Select active ASSET COA</option>{assetChartAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select>
            <input className="rounded-xl border px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Opening balance" value={form.opening_balance} onChange={(event) => setForm((current) => ({ ...current, opening_balance: event.target.value }))} />
            <input className="rounded-xl border px-3 py-2 text-sm" maxLength={4} placeholder="Bank last 4" value={form.bank_last4} onChange={(event) => setForm((current) => ({ ...current, bank_last4: event.target.value }))} />
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="UPI handle" value={form.upi_handle} onChange={(event) => setForm((current) => ({ ...current, upi_handle: event.target.value }))} />
            <input className="rounded-xl border px-3 py-2 text-sm md:col-span-2" placeholder="Notes" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            <button type="submit" disabled={saving || assetChartAccounts.length === 0} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50">{saving ? "Saving..." : "Create finance account"}</button>
          </form>
        </ERPSectionShell>

        <ERPSectionShell title="Finance account register" description="Operator-friendly view of settlement accounts and collection readiness. Use Edit to repair labels, handles, notes, or allowed account mapping changes.">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <select title="Filter by kind" className="rounded-xl border px-3 py-2 text-sm" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as KindFilter)}><option value="ALL">All kinds</option><option value="CASH">Cash</option><option value="BANK">Bank</option><option value="UPI">UPI</option></select>
              <select title="Filter by status" className="rounded-xl border px-3 py-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="ALL">All statuses</option><option value="READY">Collection ready</option><option value="BLOCKED">Blocked</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>
            </div>
            <button type="button" onClick={() => void load("refresh")} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>
          </div>
          {filteredRows.length === 0 && !loading ? (
            <ERPEmptyState
              title="No finance accounts match the current filter"
              description={financeAccounts.length === 0 ? "No finance accounts have been created yet. Use the form above to create the first settlement account." : "Adjust the kind or status filter to see accounts."}
            />
          ) : (
            <div className="overflow-x-auto rounded-2xl border"><table className="min-w-full text-sm"><thead className="bg-muted/40 text-left"><tr><th className="px-3 py-2">Finance account</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2">Linked COA</th><th className="px-3 py-2">Readiness</th><th className="px-3 py-2 text-right">Opening</th><th className="px-3 py-2">Action</th></tr></thead><tbody>{filteredRows.map((row) => { const ready = row.collection_ready !== false; return <tr key={row.id} className="border-t"><td className="px-3 py-2"><div className="font-semibold">{row.name}</div><div className="text-xs text-muted-foreground">{row.branch_code || row.branch_name || "Primary"}</div></td><td className="px-3 py-2"><span className={pill("info")}>{row.kind}</span></td><td className="px-3 py-2"><div className="font-medium">{row.chart_account_code || row.mapped_chart_account_code || text(row.chart_account)}</div><div className="text-xs text-muted-foreground">{row.chart_account_name || row.mapped_chart_account_name || "Mapped chart account"}</div></td><td className="px-3 py-2"><span className={ready ? pill("success") : pill("warning")}>{ready ? "Ready" : "Blocked"}</span>{!ready ? <div className="mt-1 max-w-xs text-xs text-amber-800">{row.collection_blocker_reason || row.recommended_action || "Map to an active ASSET posting account."}</div> : null}</td><td className="px-3 py-2 text-right">{formatRupee(row.opening_balance)}</td><td className="px-3 py-2"><button type="button" className="rounded-xl border px-3 py-2 text-xs font-semibold" onClick={() => setSelectedFinanceAccountId(row.id)}>Edit</button></td></tr>; })}</tbody></table></div>
          )}
        </ERPSectionShell>

        <ERPSectionShell title="COA / FA operating rule" description="Keep these pages separate for daily operators.">
          <div className="grid gap-3 md:grid-cols-2"><Link href={ROUTES.admin.accountingChartOfAccounts} className="rounded-2xl border bg-card p-4 text-sm transition hover:bg-muted"><div className="font-semibold">Chart of Accounts</div><p className="mt-1 text-muted-foreground">System ledger structure: ASSET, LIABILITY, EQUITY, INCOME, EXPENSE. Used by all modules.</p></Link><div className="rounded-2xl border bg-card p-4 text-sm"><div className="font-semibold">Finance Accounts</div><p className="mt-1 text-muted-foreground">Real settlement instruments: cash drawer, bank account, UPI/payment gateway. Must point to ASSET COA.</p></div></div>
        </ERPSectionShell>
      </div>
      <FinanceAccountEditDrawer open={selectedFinanceAccountId !== null} accountId={selectedFinanceAccountId} chartAccounts={chartAccounts} onClose={() => setSelectedFinanceAccountId(null)} onSaved={async (account: FinanceAccountDetail) => { setNotice(`Finance account ${account.name} updated.`); await load("refresh"); }} />
    </ERPPageShell>
  );
}
