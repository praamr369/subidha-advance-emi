"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import { approveHrStaffAdvance, createHrStaffAdvance, disburseHrStaffAdvance, listHrStaff, listHrStaffAdvances, recoverHrStaffAdvance, type HrStaff, type HrStaffAdvance } from "@/services/admin-hr";

const today = () => new Date().toISOString().slice(0, 10);
const message = (error: unknown) => error instanceof Error ? error.message : "Request failed.";

export default function StaffAdvancesPage() {
  const [rows, setRows] = useState<HrStaffAdvance[]>([]);
  const [staff, setStaff] = useState<HrStaff[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [form, setForm] = useState({ employee: "", request_date: today(), amount: "", reason: "" });
  const [account, setAccount] = useState("");
  const [recovery, setRecovery] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const [advancePayload, staffPayload, accountPayload] = await Promise.all([listHrStaffAdvances(), listHrStaff(), listFinanceAccounts({ is_active: 1 })]);
    setRows(advancePayload.results); setStaff(staffPayload.results);
    setAccounts(accountPayload.results.filter((row) => row.is_real_settlement_account && row.collection_ready !== false));
  }
  useEffect(() => { void load().catch((e) => setError(message(e))); }, []);

  async function run(action: () => Promise<unknown>, success: string) {
    setError(null); setNotice(null);
    try { await action(); setNotice(success); await load(); } catch (e) { setError(message(e)); }
  }

  return <ERPPageShell eyebrow="HR & Staff" title="Staff Advances" subtitle="Auditable staff advance approval, disbursement, recovery, journal, and outstanding control." breadcrumbs={[{ label: "HR", href: ROUTES.admin.hr }, { label: "Staff Advances" }]} statusBadge={{ label: "Posting Enabled", tone: "success" }}>
    <div className="space-y-5">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div> : null}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="font-semibold">New staff advance request</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <select className="rounded-lg border px-3 py-2" value={form.employee} onChange={(e) => setForm({ ...form, employee: e.target.value })}><option value="">Select staff</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.employee_code} · {s.name}</option>)}</select>
          <input type="date" className="rounded-lg border px-3 py-2" value={form.request_date} onChange={(e) => setForm({ ...form, request_date: e.target.value })} />
          <input type="number" min="0.01" step="0.01" placeholder="Amount" className="rounded-lg border px-3 py-2" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input placeholder="Business reason" className="rounded-lg border px-3 py-2" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
        <button className="mt-3 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background" onClick={() => void run(() => createHrStaffAdvance({ employee: Number(form.employee), request_date: form.request_date, amount: form.amount, reason: form.reason }), "Advance request created.")}>Create draft</button>
      </section>
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center gap-3"><h2 className="font-semibold">Advance register</h2><select className="ml-auto rounded-lg border px-3 py-2 text-sm" value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Settlement account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="overflow-auto"><table className="min-w-[1000px] w-full text-sm"><thead><tr className="text-left"><th>Staff</th><th>Date</th><th>Amount</th><th>Recovered</th><th>Outstanding</th><th>Status</th><th>Journal</th><th>Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="py-3">{row.employee_code} · {row.employee_name}<div className="text-xs text-muted-foreground">{row.reason}</div></td><td>{row.request_date}</td><td>₹{row.amount}</td><td>₹{row.recovered_amount}</td><td>₹{row.outstanding_amount}</td><td>{row.status}</td><td>{row.journal_entry_no || "Pending"}</td><td><div className="flex gap-2">{row.status === "DRAFT" ? <button className="rounded border px-2 py-1" onClick={() => void run(() => approveHrStaffAdvance(row.id), "Advance approved.")}>Approve</button> : null}{row.status === "APPROVED" ? <button className="rounded border px-2 py-1" disabled={!account} onClick={() => void run(() => disburseHrStaffAdvance(row.id, { finance_account: Number(account), disbursement_date: today() }), "Advance disbursed and journal posted.")}>Disburse</button> : null}{["DISBURSED", "PARTIALLY_RECOVERED"].includes(row.status) ? <><input className="w-24 rounded border px-2 py-1" placeholder="Recover" value={recovery[row.id] || ""} onChange={(e) => setRecovery({ ...recovery, [row.id]: e.target.value })} /><button className="rounded border px-2 py-1" disabled={!account || !recovery[row.id]} onClick={() => void run(() => recoverHrStaffAdvance(row.id, { finance_account: Number(account), recovery_date: today(), amount: recovery[row.id] }), "Recovery posted.")}>Recover</button></> : null}</div></td></tr>)}</tbody></table></div>
      </section>
    </div>
  </ERPPageShell>;
}
