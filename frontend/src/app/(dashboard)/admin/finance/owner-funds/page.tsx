"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BadgeIndianRupee,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Loader2,
  PlusCircle,
  RefreshCw,
  TableProperties,
  X,
} from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { listFinanceAccounts, type FinanceAccount } from "@/services/accounting";
import {
  createOwnerFundInjection,
  getRepaymentSchedule,
  listOwnerFunds,
  previewRepaymentSchedule,
  recordOwnerLoanRepayment,
  type InjectionType,
  type InterestType,
  type OwnerFundInjection,
  type OwnerFundsSummary,
  type RepaymentFrequency,
  type ScheduleLine,
} from "@/services/owner-funds";
import { formatRupee } from "@/lib/utils/currency";

function toNum(v: string | undefined | null): number {
  return parseFloat(v ?? "0") || 0;
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${color}`}>
      <div className="flex items-center gap-2 mb-2 text-sm font-medium opacity-80">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-2xl font-bold">{formatRupee(value)}</div>
    </div>
  );
}

function ScheduleTable({ lines }: { lines: ScheduleLine[] }) {
  if (!lines.length) return <p className="text-xs text-muted-foreground py-2">No schedule data.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            {["#", "Due Date", "Principal", "Interest", "Total EMI", "Balance"].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((row) => (
            <tr key={row.installment} className="border-t border-border hover:bg-muted/20">
              <td className="px-3 py-2 font-mono">{row.installment}</td>
              <td className="px-3 py-2">{row.due_date}</td>
              <td className="px-3 py-2 text-right font-medium">{formatRupee(row.principal)}</td>
              <td className="px-3 py-2 text-right text-amber-700">{formatRupee(row.interest)}</td>
              <td className="px-3 py-2 text-right font-semibold">{formatRupee(row.total)}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{formatRupee(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InjectionRow({
  item,
  financeAccounts,
  onRepaid,
}: {
  item: OwnerFundInjection;
  financeAccounts: FinanceAccount[];
  onRepaid: (updated: OwnerFundInjection) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "schedule" | "repay">("details");
  const [repaying, setRepaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleLine[] | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    finance_account_id: financeAccounts[0]?.id?.toString() ?? "",
    notes: "",
  });

  const isLoan = item.injection_type === "LOAN";
  const outstanding = toNum(item.loan_outstanding);

  async function loadSchedule() {
    if (schedule !== null) return;
    setScheduleLoading(true);
    try {
      const res = await getRepaymentSchedule(item.id);
      setSchedule(res.schedule);
    } catch {
      setSchedule([]);
    } finally {
      setScheduleLoading(false);
    }
  }

  function handleTabChange(tab: "details" | "schedule" | "repay") {
    setActiveTab(tab);
    if (tab === "schedule" && isLoan && item.tenure_months) {
      void loadSchedule();
    }
  }

  async function submitRepayment() {
    setErr(null);
    if (!form.amount || parseFloat(form.amount) <= 0) { setErr("Enter a valid amount"); return; }
    setSaving(true);
    try {
      const updated = await recordOwnerLoanRepayment(item.id, {
        amount: form.amount,
        date: form.date,
        finance_account_id: parseInt(form.finance_account_id),
        notes: form.notes,
      });
      onRepaid(updated);
      setRepaying(false);
      setForm({ amount: "", date: new Date().toISOString().slice(0, 10), finance_account_id: financeAccounts[0]?.id?.toString() ?? "", notes: "" });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to record repayment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-border rounded-2xl overflow-hidden bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            item.injection_type === "CAPITAL" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
          }`}>
            {item.injection_type === "CAPITAL" ? <Building2 className="h-3 w-3" /> : <CreditCard className="h-3 w-3" />}
            {item.injection_type_display}
          </span>
          <span className="font-semibold text-foreground">{formatRupee(item.amount)}</span>
          <span className="text-xs text-muted-foreground">→ {item.finance_account_name}</span>
          {isLoan && item.tenure_months && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
              {item.tenure_months}M · {item.interest_rate ?? "0"}% {item.interest_type === "NONE" ? "interest-free" : item.interest_type?.toLowerCase()}
            </span>
          )}
          {isLoan && outstanding > 0 && (
            <span className="text-xs text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
              Outstanding: {formatRupee(item.loan_outstanding)}
            </span>
          )}
          {isLoan && outstanding === 0 && (
            <span className="text-xs text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Fully Repaid
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
          <span>{item.date}</span>
          {item.journal_entry_no && (
            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{item.journal_entry_no}</span>
          )}
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {/* Tabs */}
          <div className="flex gap-1 px-5 pt-3 border-b border-border">
            {(["details", ...(isLoan && item.tenure_months ? ["schedule"] : []), ...(isLoan && outstanding > 0 ? ["repay"] : [])] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => handleTabChange(tab as "details" | "schedule" | "repay")}
                className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition capitalize ${
                  activeTab === tab ? "bg-background border border-b-0 border-border text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "schedule" ? "Repayment Schedule" : tab === "repay" ? "Record Repayment" : "Details"}
              </button>
            ))}
          </div>

          <div className="p-5">
            {activeTab === "details" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-muted-foreground text-xs">Date</p><p className="font-medium">{item.date}</p></div>
                  <div><p className="text-muted-foreground text-xs">Amount</p><p className="font-medium">{formatRupee(item.amount)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Account</p><p className="font-medium">{item.finance_account_name}</p></div>
                  <div><p className="text-muted-foreground text-xs">Reference</p><p className="font-medium">{item.reference || "—"}</p></div>
                  {isLoan && item.tenure_months && (
                    <>
                      <div><p className="text-muted-foreground text-xs">Tenure</p><p className="font-medium">{item.tenure_months} months</p></div>
                      <div><p className="text-muted-foreground text-xs">Interest Rate</p><p className="font-medium">{item.interest_rate ?? "0"}% p.a.</p></div>
                      <div><p className="text-muted-foreground text-xs">Interest Type</p><p className="font-medium">{item.interest_type === "NONE" ? "Interest-Free" : item.interest_type === "FLAT" ? "Flat Rate" : "Reducing Balance"}</p></div>
                      <div><p className="text-muted-foreground text-xs">Frequency</p><p className="font-medium">{item.repayment_frequency === "MONTHLY" ? "Monthly" : item.repayment_frequency === "QUARTERLY" ? "Quarterly" : "Lump Sum"}</p></div>
                      <div><p className="text-muted-foreground text-xs">Start Date</p><p className="font-medium">{item.repayment_start_date ?? "—"}</p></div>
                      <div><p className="text-muted-foreground text-xs">Total Interest</p><p className="font-medium text-amber-700">{formatRupee(item.total_interest)}</p></div>
                      <div><p className="text-muted-foreground text-xs">Total Payable</p><p className="font-semibold">{formatRupee(String(toNum(item.amount) + toNum(item.total_interest)))}</p></div>
                      <div><p className="text-muted-foreground text-xs">Outstanding</p><p className={`font-semibold ${outstanding > 0 ? "text-amber-700" : "text-emerald-700"}`}>{formatRupee(item.loan_outstanding)}</p></div>
                    </>
                  )}
                  {item.description && (
                    <div className="col-span-2 md:col-span-4"><p className="text-muted-foreground text-xs">Notes</p><p className="font-medium">{item.description}</p></div>
                  )}
                </div>
                {isLoan && item.repayments.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Repayment History</p>
                    <div className="space-y-2">
                      {item.repayments.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-sm">
                          <span className="text-muted-foreground">{r.date}</span>
                          <span className="text-xs">{r.notes || "—"}</span>
                          <span className="font-semibold text-emerald-700">{formatRupee(r.amount)}</span>
                          {r.journal_entry_no && <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{r.journal_entry_no}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "schedule" && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TableProperties className="h-4 w-4 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground">
                    {item.tenure_months}-month schedule · {item.interest_rate}% p.a. {item.interest_type !== "NONE" ? `(${item.interest_type?.toLowerCase()})` : "(interest-free)"} · {item.repayment_frequency?.toLowerCase()} payments
                  </p>
                </div>
                {scheduleLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : (
                  <ScheduleTable lines={schedule ?? []} />
                )}
              </div>
            )}

            {activeTab === "repay" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Outstanding: <strong>{formatRupee(item.loan_outstanding)}</strong></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="f-amount-max-formatrupee-item-loan-outstan" className="block text-xs font-medium text-muted-foreground mb-1">Amount (max {formatRupee(item.loan_outstanding)})</label>
                    <input id="f-amount-max-formatrupee-item-loan-outstan" type="number" step="0.01" min="0.01" max={item.loan_outstanding} value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label htmlFor="f-date" className="block text-xs font-medium text-muted-foreground mb-1">Date</label>
                    <input id="f-date" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="f-pay-from-account" className="block text-xs font-medium text-muted-foreground mb-1">Pay From Account</label>
                    <select id="f-pay-from-account" value={form.finance_account_id} onChange={(e) => setForm((f) => ({ ...f, finance_account_id: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                      {financeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="f-notes" className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                    <input id="f-notes" type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. NEFT transfer" />
                  </div>
                </div>
                {err && <p className="text-xs text-red-600">{err}</p>}
                <button type="button" onClick={submitRepayment} disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Post Repayment
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type LoanForm = {
  tenure_months: string;
  tenure_custom: boolean;
  interest_rate: string;
  interest_type: InterestType;
  repayment_frequency: RepaymentFrequency;
  repayment_start_date: string;
};

function InjectModal({ financeAccounts, onClose, onCreated }: {
  financeAccounts: FinanceAccount[];
  onClose: () => void;
  onCreated: (item: OwnerFundInjection) => void;
}) {
  const [form, setForm] = useState({
    injection_type: "CAPITAL" as InjectionType,
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    finance_account_id: financeAccounts[0]?.id?.toString() ?? "",
    description: "",
    reference: "",
  });
  const [loan, setLoan] = useState<LoanForm>({
    tenure_months: "12",
    tenure_custom: false,
    interest_rate: "0",
    interest_type: "NONE",
    repayment_frequency: "MONTHLY",
    repayment_start_date: (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10);
    })(),
  });
  const [previewLines, setPreviewLines] = useState<ScheduleLine[] | null>(null);
  const [previewSummary, setPreviewSummary] = useState<{ total_interest: string; total_payable: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [showSchedulePreview, setShowSchedulePreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isLoan = form.injection_type === "LOAN";

  const TENURE_PRESETS = [3, 6, 12, 24, 36, 60];

  async function fetchPreview() {
    if (!form.amount || parseFloat(form.amount) <= 0) return;
    if (!loan.tenure_months || parseInt(loan.tenure_months) <= 0) return;
    setPreviewing(true);
    try {
      const res = await previewRepaymentSchedule({
        amount: form.amount,
        tenure_months: parseInt(loan.tenure_months),
        interest_rate: loan.interest_rate || "0",
        interest_type: loan.interest_type,
        repayment_frequency: loan.repayment_frequency,
        repayment_start_date: loan.repayment_start_date,
      });
      setPreviewLines(res.schedule);
      setPreviewSummary({ total_interest: res.summary.total_interest, total_payable: res.summary.total_payable });
    } catch {
      setPreviewLines([]);
    } finally {
      setPreviewing(false);
    }
  }

  async function submit() {
    setErr(null);
    if (!form.amount || parseFloat(form.amount) <= 0) { setErr("Enter a valid amount"); return; }
    if (!form.finance_account_id) { setErr("Select a destination account"); return; }
    if (isLoan && loan.tenure_months && parseInt(loan.tenure_months) <= 0) { setErr("Tenure must be at least 1 month"); return; }
    setSaving(true);
    try {
      const created = await createOwnerFundInjection({
        injection_type: form.injection_type,
        amount: form.amount,
        date: form.date,
        finance_account_id: parseInt(form.finance_account_id),
        description: form.description,
        reference: form.reference,
        ...(isLoan ? {
          tenure_months: loan.tenure_months ? parseInt(loan.tenure_months) : null,
          interest_rate: loan.interest_rate || null,
          interest_type: loan.interest_type,
          repayment_frequency: loan.repayment_frequency,
          repayment_start_date: loan.repayment_start_date || null,
        } : {}),
      });
      onCreated(created);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to record injection");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-border bg-background shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-background z-10">
          <div>
            <h2 className="text-base font-semibold">Record Owner Fund Injection</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Posts a real double-entry journal immediately</p>
          </div>
          <button type="button" onClick={onClose}><X className="h-5 w-5 text-muted-foreground hover:text-foreground" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Type */}
          <div>
            <label htmlFor="f-injection-type-capital-loan-as-injection" className="block text-xs font-medium text-muted-foreground mb-2">Injection Type</label>
            <div className="grid grid-cols-2 gap-3">
              {(["CAPITAL", "LOAN"] as InjectionType[]).map((t) => (
                <button key={t} type="button"
                  onClick={() => setForm((f) => ({ ...f, injection_type: t }))}
                  className={`rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${
                    form.injection_type === t
                      ? t === "CAPITAL" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-blue-500 bg-blue-50 text-blue-800"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}>
                  <div className="flex items-center justify-center gap-2">
                    {t === "CAPITAL" ? <Building2 className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                    {t === "CAPITAL" ? "Capital (Equity)" : "Owner Loan"}
                  </div>
                  <div className="text-[11px] font-normal mt-1 opacity-70">
                    {t === "CAPITAL" ? "DR Cash/Bank · CR Owner's Capital" : "DR Cash/Bank · CR Owner's Loan Payable"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Amount (₹) *</label>
              <input id="f-injection-type-capital-loan-as-injection" type="number" step="0.01" min="1" value={form.amount}
                onChange={(e) => { setForm((f) => ({ ...f, amount: e.target.value })); setPreviewLines(null); }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="0.00" />
            </div>
            <div>
              <label htmlFor="f-date-2" className="block text-xs font-medium text-muted-foreground mb-1">Date *</label>
              <input id="f-date-2" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Account */}
          <div>
            <label htmlFor="f-destination-account" className="block text-xs font-medium text-muted-foreground mb-1">Destination Account *</label>
            <select id="f-destination-account" value={form.finance_account_id} onChange={(e) => setForm((f) => ({ ...f, finance_account_id: e.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              {financeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.kind})</option>)}
            </select>
          </div>

          {/* Loan-specific section */}
          {isLoan && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                <CalendarDays className="h-4 w-4" />
                Loan Profile
              </div>

              {/* Tenure presets */}
              <div>
                <label htmlFor="f-tenure-months-tenure-presets-map-m-setlo" className="block text-xs font-medium text-muted-foreground mb-2">Tenure (months)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {TENURE_PRESETS.map((m) => (
                    <button key={m} type="button"
                      onClick={() => { setLoan((l) => ({ ...l, tenure_months: String(m), tenure_custom: false })); setPreviewLines(null); }}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        !loan.tenure_custom && loan.tenure_months === String(m)
                          ? "bg-blue-600 text-white"
                          : "border border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}>
                      {m}M
                    </button>
                  ))}
                  <button type="button"
                    onClick={() => setLoan((l) => ({ ...l, tenure_custom: true, tenure_months: "" }))}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      loan.tenure_custom ? "bg-blue-600 text-white" : "border border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}>
                    Custom
                  </button>
                </div>
                {loan.tenure_custom && (
                  <input type="number" min="1" max="360" value={loan.tenure_months}
                    onChange={(e) => { setLoan((l) => ({ ...l, tenure_months: e.target.value })); setPreviewLines(null); }}
                    className="w-32 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    placeholder="e.g. 18" />
                )}
              </div>

              {/* Interest */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Interest Type</label>
                  <select id="f-tenure-months-tenure-presets-map-m-setlo" value={loan.interest_type}
                    onChange={(e) => { setLoan((l) => ({ ...l, interest_type: e.target.value as InterestType })); setPreviewLines(null); }}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="NONE">Interest-Free</option>
                    <option value="FLAT">Flat Rate</option>
                    <option value="REDUCING">Reducing Balance</option>
                  </select>
                </div>
                {loan.interest_type !== "NONE" && (
                  <div>
                    <label htmlFor="f-rate-per-annum" className="block text-xs font-medium text-muted-foreground mb-1">Rate (% per annum)</label>
                    <input id="f-rate-per-annum" type="number" step="0.01" min="0" max="100" value={loan.interest_rate}
                      onChange={(e) => { setLoan((l) => ({ ...l, interest_rate: e.target.value })); setPreviewLines(null); }}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. 12" />
                  </div>
                )}
              </div>

              {/* Frequency + Start Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-repayment-frequency" className="block text-xs font-medium text-muted-foreground mb-1">Repayment Frequency</label>
                  <select id="f-repayment-frequency" value={loan.repayment_frequency}
                    onChange={(e) => { setLoan((l) => ({ ...l, repayment_frequency: e.target.value as RepaymentFrequency })); setPreviewLines(null); }}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="LUMP_SUM">Lump Sum at End</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-first-repayment-date" className="block text-xs font-medium text-muted-foreground mb-1">First Repayment Date</label>
                  <input id="f-first-repayment-date" type="date" value={loan.repayment_start_date}
                    onChange={(e) => { setLoan((l) => ({ ...l, repayment_start_date: e.target.value })); setPreviewLines(null); }}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                </div>
              </div>

              {/* Schedule preview */}
              <div>
                <button type="button" onClick={() => { setShowSchedulePreview((v) => !v); if (!showSchedulePreview) void fetchPreview(); }}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 hover:text-blue-900 transition">
                  <TableProperties className="h-3.5 w-3.5" />
                  {showSchedulePreview ? "Hide" : "Preview"} Repayment Schedule
                </button>

                {showSchedulePreview && (
                  <div className="mt-3 space-y-2">
                    {previewSummary && (
                      <div className="flex gap-6 text-xs text-muted-foreground">
                        <span>Total Interest: <strong className="text-amber-700">{formatRupee(previewSummary.total_interest)}</strong></span>
                        <span>Total Payable: <strong className="text-foreground">{formatRupee(previewSummary.total_payable)}</strong></span>
                      </div>
                    )}
                    {previewing ? (
                      <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : (
                      <ScheduleTable lines={previewLines ?? []} />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ref + Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="f-reference-cheque-utr" className="block text-xs font-medium text-muted-foreground mb-1">Reference / Cheque / UTR</label>
              <input id="f-reference-cheque-utr" type="text" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. UTR123456" />
            </div>
            <div>
              <label htmlFor="f-notes-2" className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
              <input id="f-notes-2" type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder="Optional details" />
            </div>
          </div>

          {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted transition">
              Cancel
            </button>
            <button type="button" onClick={submit} disabled={saving}
              className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownCircle className="h-4 w-4" />}
              Post Injection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OwnerFundsPage() {
  const [injections, setInjections] = useState<OwnerFundInjection[]>([]);
  const [summary, setSummary] = useState<OwnerFundsSummary | null>(null);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "CAPITAL" | "LOAN">("ALL");

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true); else setRefreshing(true);
    try {
      const [fundsRes, accountsRes] = await Promise.all([listOwnerFunds(), listFinanceAccounts()]);
      setInjections(fundsRes.results);
      setSummary(fundsRes.summary);
      setFinanceAccounts(accountsRes.results ?? []);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load owner funds");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleCreated(item: OwnerFundInjection) {
    setInjections((prev) => [item, ...prev]);
    void load("refresh");
  }

  function handleRepaid(updated: OwnerFundInjection) {
    setInjections((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    void load("refresh");
  }

  const filtered = filter === "ALL" ? injections : injections.filter((i) => i.injection_type === filter);

  return (
    <ERPPageShell
      eyebrow="Finance"
      title="Owner Fund Injections"
      subtitle="Record capital injections or owner loans into the business. Every entry posts a double-entry journal automatically."
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">All fund injections post double-entry journals immediately.</p>
        <button type="button" onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition">
          <PlusCircle className="h-4 w-4" />
          New Injection
        </button>
      </div>

      {showModal && <InjectModal financeAccounts={financeAccounts} onClose={() => setShowModal(false)} onCreated={handleCreated} />}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard label="Total Funds In" value={summary.total_funds_in} icon={BadgeIndianRupee} color="border-primary/20 bg-primary/5 text-foreground" />
          <KpiCard label="Capital Injected" value={summary.total_capital_injected} icon={Building2} color="border-emerald-200 bg-emerald-50 text-emerald-900" />
          <KpiCard label="Loan Outstanding" value={summary.total_loan_outstanding} icon={CreditCard}
            color={toNum(summary.total_loan_outstanding) > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-border bg-card text-foreground"} />
          <KpiCard label="Loan Repaid" value={summary.total_loan_repaid} icon={CheckCircle2} color="border-blue-200 bg-blue-50 text-blue-900" />
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        {(["ALL", "CAPITAL", "LOAN"] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              filter === f ? "bg-primary text-primary-foreground shadow" : "border border-border text-muted-foreground hover:text-foreground"
            }`}>
            {f === "ALL" ? "All" : f === "CAPITAL" ? "Capital Only" : "Loans Only"}
          </button>
        ))}
        <button type="button" onClick={() => load("refresh")} disabled={refreshing}
          className="ml-auto rounded-full border border-border p-1.5 text-muted-foreground hover:text-foreground transition">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-muted/20 py-16 text-center">
          <BadgeIndianRupee className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-muted-foreground">No fund injections yet</p>
          <p className="text-xs text-muted-foreground mt-1">Click &quot;New Injection&quot; to record a capital or loan entry.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <InjectionRow key={item.id} item={item} financeAccounts={financeAccounts} onRepaid={handleRepaid} />
          ))}
        </div>
      )}
    </ERPPageShell>
  );
}
