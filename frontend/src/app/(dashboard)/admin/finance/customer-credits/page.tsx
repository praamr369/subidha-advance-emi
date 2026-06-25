"use client";

import { useEffect, useMemo, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import {
  createCustomerCredit,
  executeCustomerCreditPosting,
  listCustomerCredits,
  previewCustomerCreditPosting,
  type BridgePostingPreview,
} from "@/services/rent-lease-accounting-bridge";

type CreditRow = Record<string, unknown>;

function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function firstRowId(rows: CreditRow[]): number | null {
  const parsed = Number(rows[0]?.id ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function AdminCustomerCreditsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<CreditRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<BridgePostingPreview | null>(null);
  const [form, setForm] = useState({
    customer_id: "",
    amount: "",
    transaction_type: "COLLECTION",
    payment_method: "CASH",
    finance_account_id: "",
    reference_no: "",
    notes: "",
  });

  async function load() {
    setLoading(true);
    try {
      const payload = await listCustomerCredits();
      const nextRows = payload.results ?? [];
      setRows(nextRows);
      setSelectedId((current) => current ?? firstRowId(nextRows));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer credits.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(() => rows.find((row) => Number(row.id) === selectedId) ?? null, [rows, selectedId]);
  const total = useMemo(() => rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0), [rows]);

  async function createCredit() {
    try {
      await createCustomerCredit({
        customer_id: form.customer_id ? Number(form.customer_id) : null,
        amount: form.amount,
        transaction_type: form.transaction_type,
        payment_method: form.payment_method,
        finance_account_id: form.finance_account_id ? Number(form.finance_account_id) : null,
        reference_no: form.reference_no,
        notes: form.notes,
      });
      setNotice("Customer credit source record created.");
      setForm({
        customer_id: "",
        amount: "",
        transaction_type: "COLLECTION",
        payment_method: "CASH",
        finance_account_id: "",
        reference_no: "",
        notes: "",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer credit.");
    }
  }

  async function runPreview() {
    if (!selectedId) return;
    try {
      setPreview(await previewCustomerCreditPosting(selectedId));
      setNotice("Posting preview loaded. Review debit and credit lines before execute.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview customer credit posting.");
    }
  }

  async function runExecute() {
    if (!selectedId) return;
    const ok = window.confirm("Execute customer credit posting? Duplicate execution is protected by the backend idempotency key.");
    if (!ok) return;
    try {
      const result = await executeCustomerCreditPosting(selectedId);
      setNotice(`Posted customer credit. Journal ${result.journal_entry_no || result.journal_entry_id || "created"}.`);
      setPreview(result.preview);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute customer credit posting.");
    }
  }

  return (
    <ERPPageShell
      eyebrow="Finance"
      title="Customer Credits"
      subtitle="Create customer credit source records and explicitly post the customer-credit liability through the controlled accounting bridge."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Finance", href: ROUTES.admin.finance },
        { label: "Customer Credits" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingChartOfAccounts, label: "Chart of Accounts", variant: "secondary" },
        { href: ROUTES.admin.financeDeposits, label: "Deposits", variant: "secondary" },
      ]}
      stats={[
        { label: "Records", value: String(rows.length), tone: "info" },
        { label: "Total source amount", value: formatRupee(total), tone: "success" },
        { label: "Selected", value: selected ? `#${text(selected.id)}` : "None", tone: selected ? "info" : "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading customer credits..." /> : null}
        {error ? <ERPErrorState title="Unable to load customer credits" description={error} onRetry={() => void load()} /> : null}
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
          <button type="button" className="mt-3 rounded-xl border px-3 py-2 text-sm font-semibold" onClick={() => void createCredit()}>Create source record</button>
        </ERPSectionShell>

        <ERPSectionShell title="Credit register" description="Select a source record to preview or execute posting.">
          <div className="overflow-x-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={String(row.id)}
                    onClick={() => {
                      setSelectedId(Number(row.id));
                      setPreview(null);
                    }}
                    className={`cursor-pointer border-t ${Number(row.id) === selectedId ? "bg-muted/60" : "hover:bg-muted/40"}`}
                  >
                    <td className="px-3 py-2">#{text(row.id)}</td>
                    <td className="px-3 py-2">{text(row.customer_id)}</td>
                    <td className="px-3 py-2">{text(row.transaction_type)}</td>
                    <td className="px-3 py-2">{text(row.status)}</td>
                    <td className="px-3 py-2 text-right">{formatRupee(row.amount)}</td>
                    <td className="px-3 py-2">{text(row.reference_no)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={!selectedId} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => void runPreview()}>
              Preview posting
            </button>
            <button type="button" disabled={!selectedId} className="rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => void runExecute()}>
              Execute posting
            </button>
          </div>
        </ERPSectionShell>

        {preview ? (
          <ERPSectionShell title="Posting preview" description={preview.duplicate_posting_protection}>
            <div className="rounded-xl border bg-muted/30 px-3 py-2 text-sm">
              {preview.event_type} · {formatRupee(preview.amount)} · {preview.status}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border px-3 py-2 text-sm">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Posting date</div>
                <div className="mt-1 font-semibold">{text(preview.posting_date)}</div>
              </div>
              <div className="rounded-xl border px-3 py-2 text-sm">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Financial year</div>
                <div className="mt-1 font-semibold">{text(preview.financial_year_code)}</div>
              </div>
              <div className="rounded-xl border px-3 py-2 text-sm">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Period</div>
                <div className="mt-1 font-semibold">{text(preview.accounting_period_code)}</div>
              </div>
              <div className="rounded-xl border px-3 py-2 text-sm">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Period status</div>
                <div className="mt-1 font-semibold">{text(preview.accounting_period_status)}</div>
              </div>
            </div>
            {preview.blocked_reason ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {preview.blocked_reason}
              </div>
            ) : null}
            <div className="mt-3 overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lines.map((line, index) => (
                    <tr key={`${line.account.id}-${index}`} className="border-t">
                      <td className="px-3 py-2">
                        {line.account.code} - {line.account.name}
                      </td>
                      <td className="px-3 py-2">{line.description}</td>
                      <td className="px-3 py-2 text-right">{formatRupee(line.debit)}</td>
                      <td className="px-3 py-2 text-right">{formatRupee(line.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ERPSectionShell>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
