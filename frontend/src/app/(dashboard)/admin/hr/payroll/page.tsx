"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileText,
  RefreshCw,
  TrendingUp,
  Users,
  X,
} from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { ROUTES } from "@/lib/routes";
import {
  approveSalarySheet,
  createSalarySheet,
  getHrPayroll,
  listHrSalaryPayments,
  listHrStaff,
  postSalarySheet,
  recordSalaryPayment,
  type HrPayrollSheet,
  type HrSalarySheetLine,
  type HrSalaryPayment,
  type HrStaff,
} from "@/services/admin-hr";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtCur(v?: string | number | null) {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return String(v);
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(v?: string | null) {
  if (!v) return "0";
  const n = parseFloat(v);
  return isNaN(n) ? v : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function monthName(m: number) { return MONTHS[(m - 1) % 12] ?? ""; }

function periodLabel(year: number, month: number) {
  return `${monthName(month)} ${year}`;
}

function sum(sheets: HrPayrollSheet[], key: keyof HrPayrollSheet): number {
  return sheets.reduce((acc, s) => acc + parseFloat(String(s[key] ?? "0")), 0);
}

// ─── Small components ─────────────────────────────────────────────────────────

function Notice({ ok, children, onClose }: { ok?: boolean; children: ReactNode; onClose?: () => void }) {
  const cls = ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900";
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="flex-1">{children}</span>
      {onClose && <button type="button" onClick={onClose} className="ml-2 shrink-0 opacity-60 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

function Kpi({ label, value, sub, tone = "neutral" }: { label: string; value: ReactNode; sub?: string; tone?: "ok" | "warn" | "bad" | "neutral" }) {
  const bg = { ok: "border-emerald-200 bg-emerald-50", warn: "border-amber-200 bg-amber-50", bad: "border-red-200 bg-red-50", neutral: "border-border bg-card" };
  const tx = { ok: "text-emerald-900", warn: "text-amber-900", bad: "text-red-900", neutral: "text-foreground" };
  return (
    <div className={`rounded-xl border px-4 py-3 ${bg[tone]}`}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-bold leading-tight ${tx[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Salary Sheet Lines breakdown ─────────────────────────────────────────────

function SheetLines({ lines }: { lines: HrSalarySheetLine[] }) {
  const earnings   = lines.filter((l) => l.component_type === "EARNING");
  const deductions = lines.filter((l) => l.component_type === "DEDUCTION");
  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/10 p-3 text-xs space-y-2">
      {earnings.length > 0 && (
        <div>
          <p className="mb-1.5 font-bold uppercase tracking-wider text-emerald-700">Earnings</p>
          <table className="w-full">
            <thead><tr className="text-muted-foreground"><th className="pb-1 pr-4 text-left font-semibold">Component</th><th className="pb-1 pr-4 text-right font-semibold">Qty</th><th className="pb-1 pr-4 text-right font-semibold">Rate</th><th className="pb-1 text-right font-semibold">Amount</th></tr></thead>
            <tbody>
              {earnings.map((l) => (
                <tr key={l.id} className="border-t border-border/40">
                  <td className="py-1 pr-4 font-medium text-foreground">{l.component_name}</td>
                  <td className="py-1 pr-4 text-right text-muted-foreground">{fmtNum(l.quantity)}</td>
                  <td className="py-1 pr-4 text-right text-muted-foreground">{fmtCur(l.rate)}</td>
                  <td className="py-1 text-right font-semibold text-emerald-800">{fmtCur(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {deductions.length > 0 && (
        <div>
          <p className="mb-1.5 font-bold uppercase tracking-wider text-red-700">Deductions</p>
          <table className="w-full">
            <thead><tr className="text-muted-foreground"><th className="pb-1 pr-4 text-left font-semibold">Component</th><th className="pb-1 pr-4 text-right font-semibold">Qty</th><th className="pb-1 pr-4 text-right font-semibold">Rate</th><th className="pb-1 text-right font-semibold">Amount</th></tr></thead>
            <tbody>
              {deductions.map((l) => (
                <tr key={l.id} className="border-t border-border/40">
                  <td className="py-1 pr-4 font-medium text-foreground">
                    {l.component_name}
                    {l.notes && <span className="ml-1.5 text-muted-foreground">({l.notes})</span>}
                  </td>
                  <td className="py-1 pr-4 text-right text-muted-foreground">{fmtNum(l.quantity)}</td>
                  <td className="py-1 pr-4 text-right text-muted-foreground">{fmtCur(l.rate)}</td>
                  <td className="py-1 text-right font-semibold text-red-700">–{fmtCur(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Single sheet row ─────────────────────────────────────────────────────────

function SheetRow({ sheet, financeAccounts, onAction }: {
  sheet: HrPayrollSheet;
  financeAccounts: FinanceAccount[];
  onAction: (msg: string, isErr?: boolean) => void;
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [payOpen,     setPayOpen]     = useState(false);
  const [busy,        setBusy]        = useState(false);
  const [payForm, setPayForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: sheet.outstanding_amount || sheet.net_amount,
    financeAccount: "",
    referenceNo: "",
  });

  const statusTone =
    sheet.status === "PAID" ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
    sheet.status === "POSTED" || sheet.status === "PAID_PARTIAL" ? "border-blue-200 bg-blue-50 text-blue-800" :
    sheet.status === "APPROVED" ? "border-amber-200 bg-amber-50 text-amber-800" :
    "border-border bg-muted text-muted-foreground";

  async function approve() {
    setBusy(true);
    try { await approveSalarySheet(sheet.id); onAction(`Sheet approved for ${sheet.employee_name}.`); }
    catch (e) { onAction(e instanceof Error ? e.message : "Approve failed.", true); }
    finally { setBusy(false); }
  }

  async function post() {
    setBusy(true);
    try { await postSalarySheet(sheet.id); onAction(`Sheet posted for ${sheet.employee_name}. Journal entry created.`); }
    catch (e) { onAction(e instanceof Error ? e.message : "Post failed.", true); }
    finally { setBusy(false); }
  }

  async function pay() {
    if (!payForm.financeAccount) { onAction("Select a payment account.", true); return; }
    setBusy(true);
    try {
      await recordSalaryPayment({ salary_sheet: sheet.id, payment_date: payForm.paymentDate, amount: payForm.amount, finance_account: Number(payForm.financeAccount), reference_no: payForm.referenceNo.trim() || undefined });
      setPayOpen(false);
      onAction(`Payment of ${fmtCur(payForm.amount)} recorded for ${sheet.employee_name}.`);
    } catch (e) { onAction(e instanceof Error ? e.message : "Payment failed.", true); }
    finally { setBusy(false); }
  }

  const hasLines = (sheet.lines?.length ?? 0) > 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        {/* Staff */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link href={`${ROUTES.admin.hrStaff}/${sheet.employee}`}
              className="font-semibold text-sm text-primary hover:underline">
              {sheet.employee_name}
            </Link>
            <span className="text-xs text-muted-foreground font-mono">{sheet.employee_code}</span>
          </div>
          {(sheet.employee_designation || sheet.employee_department) && (
            <p className="text-xs text-muted-foreground">{[sheet.employee_designation, sheet.employee_department].filter(Boolean).join(" · ")}</p>
          )}
        </div>

        {/* Amounts */}
        <div className="flex items-center gap-4 text-sm shrink-0">
          <div className="text-center">
            <p className="text-[10px] font-medium text-muted-foreground">GROSS</p>
            <p className="font-semibold text-foreground">{fmtCur(sheet.gross_amount)}</p>
          </div>
          {parseFloat(sheet.deductions_amount) > 0 && (
            <div className="text-center">
              <p className="text-[10px] font-medium text-muted-foreground">DEDUCTIONS</p>
              <p className="font-semibold text-red-700">–{fmtCur(sheet.deductions_amount)}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-[10px] font-medium text-muted-foreground">NET PAY</p>
            <p className="text-lg font-bold text-foreground">{fmtCur(sheet.net_amount)}</p>
          </div>
          {sheet.outstanding_amount && parseFloat(sheet.outstanding_amount) > 0 && (
            <div className="text-center">
              <p className="text-[10px] font-medium text-muted-foreground">OUTSTANDING</p>
              <p className="font-semibold text-amber-700">{fmtCur(sheet.outstanding_amount)}</p>
            </div>
          )}
        </div>

        {/* Status badge */}
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${statusTone}`}>
          {sheet.status.replace(/_/g, " ")}
        </span>

        {/* Actions */}
        <div className="flex gap-1.5 shrink-0 flex-wrap">
          {sheet.status === "DRAFT" && (
            <button type="button" disabled={busy} onClick={() => void approve()}
              className="rounded-lg border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition">
              {busy ? "…" : "Approve"}
            </button>
          )}
          {sheet.status === "APPROVED" && (
            <button type="button" disabled={busy} onClick={() => void post()}
              className="rounded-lg border border-blue-400 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-50 transition">
              {busy ? "…" : "Post to Ledger"}
            </button>
          )}
          {(sheet.status === "POSTED" || sheet.status === "PAID_PARTIAL") && (
            <button type="button" disabled={busy} onClick={() => setPayOpen((v) => !v)}
              className="rounded-lg border border-emerald-500 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 transition">
              Pay
            </button>
          )}
          {hasLines && (
            <button type="button" onClick={() => setExpanded((v) => !v)}
              className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition">
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Breakdown lines */}
      {expanded && hasLines && sheet.lines && (
        <div className="border-t border-border px-4 pb-4">
          <SheetLines lines={sheet.lines} />
        </div>
      )}

      {/* Pay form */}
      {payOpen && (
        <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-emerald-800">Record salary payment</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label htmlFor="f-payment-date-setpayform-c-c-paymentdate-" className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Payment date
              <input type="date" value={payForm.paymentDate}
                onChange={(e) => setPayForm((c) => ({ ...c, paymentDate: e.target.value }))}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Amount
              <input value={payForm.amount}
                onChange={(e) => setPayForm((c) => ({ ...c, amount: e.target.value }))}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm font-mono" />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Pay from account
              <select value={payForm.financeAccount}
                onChange={(e) => setPayForm((c) => ({ ...c, financeAccount: e.target.value }))}
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
                <option value="">Select account…</option>
                {financeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Reference / UTR
              <input value={payForm.referenceNo}
                onChange={(e) => setPayForm((c) => ({ ...c, referenceNo: e.target.value }))}
                placeholder="Optional"
                className="h-9 rounded-lg border border-input bg-background px-3 text-sm" />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy || !payForm.financeAccount} onClick={() => void pay()}
              className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50 transition">
              {busy ? "Recording…" : "Confirm Payment"}
            </button>
            <button type="button" onClick={() => setPayOpen(false)}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Generate sheet modal ─────────────────────────────────────────────────────

function GenerateModal({ staff, year, month, onClose, onCreated }: {
  staff: HrStaff[];
  year: number; month: number;
  onClose: () => void;
  onCreated: (sheet: HrPayrollSheet) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; msg: string }[]>([]);
  const [done, setDone] = useState(false);

  const eligible = staff.filter((s) => s.payroll_eligible && s.is_active);

  function toggle(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() { setSelectedIds(new Set(eligible.map((s) => s.id))); }
  function clearAll()  { setSelectedIds(new Set()); }

  async function generate() {
    if (selectedIds.size === 0) return;
    setBusy(true); setResults([]);
    const out: typeof results = [];
    for (const id of selectedIds) {
      const s = eligible.find((e) => e.id === id);
      if (!s) continue;
      try {
        const sheet = await createSalarySheet({ employee: id, year, month, auto_generate: true });
        out.push({ name: s.name, ok: true, msg: `Net: ${fmtCur(sheet.net_amount)}` });
        onCreated(sheet);
      } catch (e) {
        out.push({ name: s.name, ok: false, msg: e instanceof Error ? e.message : "Failed" });
      }
    }
    setResults(out);
    setDone(true);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">Generate salary sheets</h2>
            <p className="text-xs text-muted-foreground">{periodLabel(year, month)} — auto-generate from attendance, leave balance &amp; advances</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {/* How it works */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900 space-y-1">
          <p className="font-bold">How auto-generate works:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Base salary + active compensation components → gross earnings</li>
            <li>Overtime hours in attendance → extra earning line</li>
            <li>Approved <strong>unpaid leave</strong> in this month → salary deduction (daily rate × days)</li>
            <li><strong>Paid leave</strong> uses leave balance — no salary deduction</li>
            <li>Outstanding staff advances → deduction line (capped at net, never over-deducts)</li>
          </ul>
        </div>

        {done ? (
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${r.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
                {r.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                <span className="font-medium">{r.name}</span>
                <span className="text-xs opacity-80">{r.msg}</span>
              </div>
            ))}
            <button type="button" onClick={onClose}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">{eligible.length} payroll-eligible active staff</p>
              <div className="flex gap-2">
                <button type="button" onClick={selectAll} className="text-xs font-semibold text-primary hover:underline">Select all</button>
                <span className="text-muted-foreground">·</span>
                <button type="button" onClick={clearAll} className="text-xs font-semibold text-muted-foreground hover:underline">Clear</button>
              </div>
            </div>

            {eligible.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                No payroll-eligible active staff found. Mark staff as payroll eligible on their profile first.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {eligible.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition">
                    <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggle(s.id)}
                      className="h-4 w-4 rounded" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.employee_code} · {s.department} · {(s.employment_type || "").replace(/_/g, " ")}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono font-semibold text-foreground">
                        {s.base_salary ? fmtCur(s.base_salary) : s.daily_wage_rate ? `${fmtCur(s.daily_wage_rate)}/day` : s.hourly_wage_rate ? `${fmtCur(s.hourly_wage_rate)}/hr` : "—"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{s.payment_mode || "CASH"}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{selectedIds.size} selected</p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted transition">Cancel</button>
                <button type="button" disabled={selectedIds.size === 0 || busy} onClick={() => void generate()}
                  className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition">
                  {busy ? "Generating…" : `Generate ${selectedIds.size} sheet${selectedIds.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type ActiveTab = "sheets" | "payments" | "summary";

export default function AdminHrPayrollPage() {
  const now = new Date();
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);

  const [sheets,         setSheets]         = useState<HrPayrollSheet[]>([]);
  const [payments,       setPayments]       = useState<HrSalaryPayment[]>([]);
  const [staff,          setStaff]          = useState<HrStaff[]>([]);
  const [financeAccounts,setFinanceAccounts]= useState<FinanceAccount[]>([]);
  const [currentPeriod,  setCurrentPeriod]  = useState<{ id: number; code: string; status: string } | null>(null);

  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [notice,   setNotice]   = useState<string | null>(null);
  const [noticeOk, setNoticeOk] = useState(true);
  const [activeTab,setActiveTab]= useState<ActiveTab>("sheets");
  const [genOpen,  setGenOpen]  = useState(false);
  const [filter,   setFilter]   = useState<string>("");

  function showMsg(msg: string, isErr = false) {
    setNotice(msg); setNoticeOk(!isErr);
    setTimeout(() => setNotice(null), 6000);
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [payrollRes, staffRes, finRes, paymentsRes] = await Promise.all([
        getHrPayroll({ year: selYear, month: selMonth }),
        listHrStaff({ payroll_eligible: "true" }),
        listFinanceAccounts({ is_active: 1 }),
        listHrSalaryPayments({ year: selYear, month: selMonth } as Record<string, string | number>),
      ]);
      setCurrentPeriod(payrollRes.current_period);
      setSheets(payrollRes.salary_sheets ?? []);
      setStaff(staffRes.results ?? []);
      setFinanceAccounts(finRes.results ?? []);
      setPayments(paymentsRes.results ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load payroll."); }
    finally { setLoading(false); }
  }, [selYear, selMonth]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return sheets;
    const q = filter.toLowerCase();
    return sheets.filter((s) =>
      s.employee_name.toLowerCase().includes(q) ||
      s.employee_code?.toLowerCase().includes(q) ||
      s.employee_department?.toLowerCase().includes(q)
    );
  }, [sheets, filter]);

  const byStatus = useMemo(() => ({
    draft:    sheets.filter((s) => s.status === "DRAFT").length,
    approved: sheets.filter((s) => s.status === "APPROVED").length,
    posted:   sheets.filter((s) => s.status === "POSTED" || s.status === "PAID_PARTIAL").length,
    paid:     sheets.filter((s) => s.status === "PAID").length,
    total:    sheets.length,
  }), [sheets]);

  const totalGross       = sum(sheets, "gross_amount");
  const totalDeductions  = sum(sheets, "deductions_amount");
  const totalNet         = sum(sheets, "net_amount");
  const totalOutstanding = sheets.reduce((a, s) => a + parseFloat(s.outstanding_amount ?? "0"), 0);

  const YEARS = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <ERPPageShell
      eyebrow="HR Module"
      title="Payroll Workbench"
      subtitle="Generate salary sheets from attendance + leave + advances, then Approve → Post → Pay."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR",    href: ROUTES.admin.hr },
        { label: "Payroll" },
      ]}
      actions={[
        { href: ROUTES.admin.hrStaff,       label: "Staff Register",   variant: "secondary" as const },
        { href: ROUTES.admin.hrAttendance,  label: "Attendance",       variant: "secondary" as const },
        { href: ROUTES.admin.hrLeave,       label: "Leave Requests",   variant: "secondary" as const },
        { href: ROUTES.admin.hrStaffAdvances, label: "Advances",       variant: "secondary" as const },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {/* ── Period picker ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Period</label>
          <select id="f-payment-date-setpayform-c-c-paymentdate-" value={selMonth} onChange={(e) => setSelMonth(Number(e.target.value))}
            className="h-9 rounded-xl border border-input bg-background px-3 text-sm font-semibold">
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select value={selYear} onChange={(e) => setSelYear(Number(e.target.value))}
            className="h-9 rounded-xl border border-input bg-background px-3 text-sm font-semibold">
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {currentPeriod && (
          <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            Period: {currentPeriod.code} · {currentPeriod.status}
          </span>
        )}

        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => void load()} disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted transition disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button type="button" onClick={() => setGenOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition">
            <FileText className="h-4 w-4" /> Generate Sheets
          </button>
        </div>
      </div>

      {/* Notices */}
      {notice && <Notice ok={noticeOk} onClose={() => setNotice(null)}>{notice}</Notice>}
      {error  && <Notice onClose={() => setError(null)}>{error}</Notice>}

      {loading && (
        <div className="py-16 text-center text-sm text-muted-foreground animate-pulse">Loading payroll data…</div>
      )}

      {!loading && (
        <>
          {/* ── KPI strip ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Kpi label="Total sheets"     value={byStatus.total} />
            <Kpi label="Draft"            value={byStatus.draft}    tone={byStatus.draft    > 0 ? "warn" : "ok"} />
            <Kpi label="Approved"         value={byStatus.approved} tone={byStatus.approved > 0 ? "warn" : "ok"} />
            <Kpi label="Posted / Partial" value={byStatus.posted}   tone={byStatus.posted   > 0 ? "warn" : "ok"} />
            <Kpi label="Fully paid"       value={byStatus.paid}     tone={byStatus.paid === byStatus.total && byStatus.total > 0 ? "ok" : "neutral"} />
            <Kpi label="Total gross"      value={fmtCur(totalGross.toFixed(2))} />
            <Kpi label="Total net"        value={fmtCur(totalNet.toFixed(2))}   tone={totalOutstanding > 0 ? "warn" : "ok"} sub={totalOutstanding > 0 ? `${fmtCur(totalOutstanding.toFixed(2))} outstanding` : undefined} />
          </div>

          {/* ── How deductions work ────────────────────────────────────────── */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-xs text-blue-900">
            <p className="mb-2 font-bold text-sm">How payroll deductions work for {periodLabel(selYear, selMonth)}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-white/60 px-3 py-2">
                <p className="font-bold text-blue-800 mb-1">Leave deduction rule</p>
                <p>Staff on <strong>paid leave</strong> (EL, CL, etc.) → leave balance consumed, no salary deduction.</p>
                <p className="mt-1">Staff on <strong>unpaid leave</strong> (LOP) → daily rate × days deducted from salary.</p>
                <p className="mt-1 text-blue-700 font-medium">Leave balance exhausted → excess days auto-converted to LOP.</p>
              </div>
              <div className="rounded-lg bg-white/60 px-3 py-2">
                <p className="font-bold text-blue-800 mb-1">Advance recovery</p>
                <p>Outstanding advance balance → automatically added as a deduction line in the salary sheet.</p>
                <p className="mt-1">Never over-deducts — capped at available net salary. Remaining balance carries forward.</p>
              </div>
              <div className="rounded-lg bg-white/60 px-3 py-2">
                <p className="font-bold text-blue-800 mb-1">Workflow</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Generate sheet (auto-computes all lines)</li>
                  <li>Review breakdown — expand each row</li>
                  <li>Approve → Post to accounting ledger</li>
                  <li>Pay → via unified payables</li>
                </ol>
              </div>
            </div>
          </div>

          {/* ── Tab bar ───────────────────────────────────────────────────── */}
          <div className="flex gap-0 border-b border-border">
            {([["sheets", `Salary Sheets (${sheets.length})`], ["payments", `Payments (${payments.length})`], ["summary", "Summary"]] as [ActiveTab, string][]).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setActiveTab(id)}
                className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${activeTab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </div>

          {/* ══════════════════ SHEETS TAB */}
          {activeTab === "sheets" && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input value={filter} onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search by name, code, department…"
                  className="h-9 flex-1 max-w-sm rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" />
                {filter && <button type="button" onClick={() => setFilter("")} className="text-xs text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
                <span className="text-xs text-muted-foreground">{filtered.length} shown</span>
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-xl border border-border bg-card py-16 text-center">
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
                  <p className="text-sm font-semibold text-foreground">No salary sheets for {periodLabel(selYear, selMonth)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Click "Generate Sheets" to auto-calculate pay for all eligible staff.</p>
                  <button type="button" onClick={() => setGenOpen(true)}
                    className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 transition">
                    Generate Sheets
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtered.map((sheet) => (
                    <SheetRow
                      key={sheet.id}
                      sheet={sheet}
                      financeAccounts={financeAccounts}
                      onAction={(msg, isErr) => { showMsg(msg, isErr); void load(); }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════ PAYMENTS TAB */}
          {activeTab === "payments" && (
            <div className="space-y-4">
              {payments.length === 0 ? (
                <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                  No salary payments recorded for {periodLabel(selYear, selMonth)}.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[700px] text-sm">
                    <thead className="border-b border-border bg-muted/30">
                      <tr>
                        {["Staff", "Payment date", "Amount", "Account", "Reference", "Journal entry"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-b border-border/60 hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium">{p.salary_sheet_employee_name ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{fmt(p.payment_date)}</td>
                          <td className="px-4 py-3 font-mono font-semibold">{fmtCur(p.amount)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.finance_account_name ?? "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.reference_no || "—"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.posted_journal_entry_no || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-muted/30">
                      <tr>
                        <td colSpan={2} className="px-4 py-2.5 text-xs font-bold text-muted-foreground">Total payments</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-foreground">
                          {fmtCur(payments.reduce((a, p) => a + parseFloat(p.amount), 0).toFixed(2))}
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════ SUMMARY TAB */}
          {activeTab === "summary" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-4 text-sm font-bold text-foreground">{periodLabel(selYear, selMonth)} — Payroll Summary</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: "Total staff sheets",   value: sheets.length },
                    { label: "Payroll-eligible staff", value: staff.filter((s) => s.payroll_eligible && s.is_active).length },
                    { label: "Total gross earnings", value: fmtCur(totalGross.toFixed(2)) },
                    { label: "Total deductions",     value: fmtCur(totalDeductions.toFixed(2)) },
                    { label: "Total net payable",    value: fmtCur(totalNet.toFixed(2)) },
                    { label: "Total outstanding",    value: fmtCur(totalOutstanding.toFixed(2)) },
                    { label: "Total paid",           value: fmtCur(payments.reduce((a, p) => a + parseFloat(p.amount), 0).toFixed(2)) },
                    { label: "Sheets fully paid",    value: byStatus.paid },
                    { label: "Sheets pending payment", value: byStatus.posted },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-0.5 text-lg font-bold text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-staff breakdown */}
              {sheets.length > 0 && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="border-b border-border bg-muted/30 px-4 py-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Per-staff breakdown</h4>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/10">
                      <tr>
                        {["Staff", "Gross", "Deductions", "Net", "Status"].map((h) => (
                          <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheets.map((s) => (
                        <tr key={s.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="px-4 py-2.5">
                            <Link href={`${ROUTES.admin.hrStaff}/${s.employee}`} className="font-medium text-primary hover:underline">{s.employee_name}</Link>
                            <span className="ml-2 text-xs text-muted-foreground">{s.employee_code}</span>
                          </td>
                          <td className="px-4 py-2.5 font-mono">{fmtCur(s.gross_amount)}</td>
                          <td className="px-4 py-2.5 font-mono text-red-700">
                            {parseFloat(s.deductions_amount) > 0 ? `–${fmtCur(s.deductions_amount)}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 font-mono font-bold">{fmtCur(s.net_amount)}</td>
                          <td className="px-4 py-2.5">
                            <ERPStatusBadge status={s.status} label={s.status.replace(/_/g, " ")} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border bg-muted/30">
                      <tr>
                        <td className="px-4 py-2.5 text-xs font-bold text-muted-foreground">Totals</td>
                        <td className="px-4 py-2.5 font-mono font-bold">{fmtCur(totalGross.toFixed(2))}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-red-700">–{fmtCur(totalDeductions.toFixed(2))}</td>
                        <td className="px-4 py-2.5 font-mono font-bold">{fmtCur(totalNet.toFixed(2))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold">Payroll accounting note</p>
                <p>Posting a salary sheet creates a real journal entry: Salary Expense (Dr) → Salary Payable (Cr). Payment of the payable settles it: Salary Payable (Dr) → Cash/Bank (Cr). These entries are visible in the accounting ledger.</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Generate modal ─────────────────────────────────────────────────── */}
      {genOpen && (
        <GenerateModal
          staff={staff}
          year={selYear}
          month={selMonth}
          onClose={() => { setGenOpen(false); void load(); }}
          onCreated={(sheet) => setSheets((prev) => {
            const exists = prev.findIndex((s) => s.id === sheet.id);
            return exists >= 0 ? prev.map((s) => s.id === sheet.id ? sheet : s) : [sheet, ...prev];
          })}
        />
      )}
    </ERPPageShell>
  );
}
