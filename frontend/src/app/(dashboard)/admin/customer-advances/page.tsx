"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  createCustomerAdvance,
  executeCustomerAdvancePosting,
  listCustomerAdvances,
  previewCustomerAdvancePosting,
  type BridgePostingPreview,
} from "@/services/rent-lease-accounting-bridge";

type AdvanceRow = Record<string, unknown>;

function money(value: unknown): string {
  const parsed = Number(value ?? 0);
  return `₹${Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00"}`;
}

function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export default function AdminCustomerAdvancesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<AdvanceRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<BridgePostingPreview | null>(null);
  const [form, setForm] = useState({ customer_id: "", amount: "", transaction_type: "COLLECTION", payment_method: "CASH", finance_account_id: "", reference_no: "", notes: "" });

  async function load() {
    setLoading(true);
    try {
      const payload = await listCustomerAdvances();
      const nextRows = payload.results ?? [];
      setRows(nextRows);
      setSelectedId((current) => current ?? Number(nextRows[0]?.id ?? 0) || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer advances.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selected = useMemo(() => rows.find((row) => Number(row.id) === selectedId) ?? null, [rows, selectedId]);
  const total = useMemo(() => rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0), [rows]);

  async function createAdvance() {
    try {
      await createCustomerAdvance({
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        amount: form.amount,
        transaction_type: form.transaction_type,
        payment_method: form.payment_method,
        finance_account_id: form.finance_account_id ? Number(form.finance_account_id) : null,
        reference_no: form.reference_no,
        notes: form.notes,
      });
      setNotice("Customer advance source record created.");
      setForm({ customer_id: "", amount: "", transaction_type: "COLLECTION", payment_method: "CASH", finance_account_id: "", reference_no: "", notes: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer advance.");
    }
  }

  async function runPreview() {
    if (!selectedId) return;
    try {
      setPreview(await previewCustomerAdvancePosting(selectedId));
      setNotice("Posting preview loaded. Review debit and credit lines before execute.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview customer advance posting.");
    }
  }

  async function runExecute() {
    if (!selectedId) return;
    const ok = window.confirm("Execute customer advance posting? Duplicate execution is protected by the backend idempotency key.");
    if (!ok) return;
    try {
      const result = await executeCustomerAdvancePosting(selectedId);
      setNotice(`Posted customer advance. Journal ${result.journal_entry_no || result.journal_entry_id || "created"}.`);
      setPreview(result.preview);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute customer advance posting.");
    }
  }

  return (
    <ERPPageShell
      eyebrow="Accounting"
      title="Customer Advances"
      subtitle="Create customer advance source records and explicitly post customer advance liability through the controlled accounting bridge. This workflow does not allocate advances to EMI/rent receivables."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Accounting", href: ROUTES.admin.accounting }, { label: "Customer Advances" }]}
      actions={[{ href: ROUTES.admin.accountingChartOfAccounts, label: "Chart of Accounts", variant: "secondary" }, { href: ROUTES.admin.financeDeposits, label: "Deposits", variant: "secondary" }]}
      stats={[{ label: "Records", value: String(rows.length), tone: "info" }, { label: "Total source amount", value: money(total), tone: "success" }, { label: "Selected", value: selected ? `#${text(selected.id)}` : "None", tone: selected ? "info" : "warning" }]}
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading customer advances..." /> : null}
        {error ? <ERPErrorState title="Unable to load customer advances" description={error} onRetry={() => void load()} /> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}

        <ERPSectionShell title="Create source record" description="Source record only. Posting remains explicit and idempotent.">
          <div className="grid gap-3 md:grid-cols-3">
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Customer ID optional" value={form.customer_id} onChange={(e) => setForm((c) => ({ ...c, customer_id: e.target.value }))} />
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Amount" value={form.amount} onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))} />
            <select className="rounded-xl border px-3 py-2 text-sm" value={form.transaction_type} onChange={(e) => setForm((c) => ({ ...c, transaction_type: e.target.value }))}>
              <option value="COLLECTION">Collection</option>
              <option value="REFUND">Refund</option>
              <option value="ADJUSTMENT">Adjustment blocked</option>
            </select>
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Payment method" value={form.payment_method} onChange={(e) => setForm((c) => ({ ...c, payment_method: e.target.value }))} />
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Finance account ID optional" value={form.finance_account_id} onChange={(e) => setForm((c) => ({ ...c, finance_account_id: e.target.value }))} />
            <input className="rounded-xl border px-3 py-2 text-sm" placeholder="Reference no optional" value={form.reference_no} onChange={(e) => setForm((c) => ({ ...c, reference_no: e.target.value }))} />
            <input className="rounded-xl border px-3 py-2 text-sm md:col-span-3" placeholder="Notes" value={form.notes} onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))} />
          </div>
          <button type="button" className="mt-3 rounded-xl border px-3 py-2 text-sm font-semibold" onClick={() => void createAdvance()}>Create source record</button>
        </ERPSectionShell>

        <ERPSectionShell title="Advance register" description="Select a source record to preview or execute posting.">
          <div className="overflow-x-auto rounded-2xl border">
            <table className="min-w-full text-sm"><thead className="bg-muted/40 text-left"><tr><th className="px-3 py-2">ID</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Reference</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.id)} onClick={() => { setSelectedId(Number(row.id)); setPreview(null); }} className={`cursor-pointer border-t ${Number(row.id) === selectedId ? "bg-muted/60" : "hover:bg-muted/40"}`}><td className="px-3 py-2">#{text(row.id)}</td><td className="px-3 py-2">{text(row.customer_id)}</td><td className="px-3 py-2">{text(row.transaction_type)}</td><td className="px-3 py-2">{text(row.status)}</td><td className="px-3 py-2 text-right">{money(row.amount)}</td><td className="px-3 py-2">{text(row.reference_no)}</td></tr>)}</tbody></table>
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!selectedId} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => void runPreview()}>Preview posting</button><button type="button" disabled={!selectedId} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => void runExecute()}>Execute posting</button></div>
        </ERPSectionShell>

        {preview ? <ERPSectionShell title="Posting preview" description={preview.duplicate_posting_protection}><div className="rounded-xl border bg-muted/30 px-3 py-2 text-sm">{preview.event_type} · {money(preview.amount)} · {preview.status}</div><div className="mt-3 overflow-x-auto rounded-2xl border"><table className="min-w-full text-sm"><thead className="bg-muted/40 text-left"><tr><th className="px-3 py-2">Account</th><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr></thead><tbody>{preview.lines.map((line, index) => <tr key={`${line.account.id}-${index}`} className="border-t"><td className="px-3 py-2">{line.account.code} - {line.account.name}</td><td className="px-3 py-2">{line.description}</td><td className="px-3 py-2 text-right">{money(line.debit)}</td><td className="px-3 py-2 text-right">{money(line.credit)}</td></tr>)}</tbody></table></div></ERPSectionShell> : null}
      </div>
    </ERPPageShell>
  );
}
