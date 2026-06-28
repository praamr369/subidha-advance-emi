"use client";

import { useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { apiFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { getHrPayroll, listHrStaff, patchHrStaff, type HrPayrollSheet, type HrStaff } from "@/services/admin-hr";
import { approveSalarySheetSafe, createSalarySheetSafe, listFinanceAccounts, postSalarySheetSafe, type FinanceAccount, type SalaryPayment, type SalarySheetLine } from "@/services/accounting";

type PayrollPayload = { current_period: { id: number; code: string; status: string } | null; salary_sheets: HrPayrollSheet[] };
type LineDraft = Omit<SalarySheetLine, "id">;
type Busy = "setup" | "sheet" | "post" | "pay" | null;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const money = (value: string | number | null | undefined) => {
  const parsed = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const amount = (value: string | number | null | undefined) => Math.max(0, money(value)).toFixed(2);
const todayIso = () => new Date().toISOString().slice(0, 10);
const parsedPeriod = (code?: string | null) => {
  const match = (code ?? "").match(/(\d{4})[-/](\d{1,2})/);
  return match ? { year: match[1], month: String(Number(match[2])) } : null;
};
const defaultCostCenter = (staff: HrStaff) => (staff.cost_center_code || staff.department || staff.branch_code || "GENERAL").trim().replace(/\s+/g, "_").toUpperCase();

function createHrSalaryPayment(payload: { salary_sheet: number; payment_date: string; amount: string; finance_account: number; reference_no?: string }) {
  return apiFetch<SalaryPayment>("/admin/hr/salary-payments/", { method: "POST", body: JSON.stringify(payload) });
}

export default function AdminHrPayrollPage() {
  const now = useMemo(() => new Date(), []);
  const [payload, setPayload] = useState<PayrollPayload | null>(null);
  const [staff, setStaff] = useState<HrStaff[]>([]);
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [staffId, setStaffId] = useState("");
  const [employmentType, setEmploymentType] = useState("PERMANENT_MONTHLY");
  const [costCenterCode, setCostCenterCode] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [dailyWageRate, setDailyWageRate] = useState("");
  const [hourlyWageRate, setHourlyWageRate] = useState("");
  const [pieceRateAmount, setPieceRateAmount] = useState("");
  const [pieceRateUnitLabel, setPieceRateUnitLabel] = useState("");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [advanceTaken, setAdvanceTaken] = useState<"NO" | "YES">("NO");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [otherDeduction, setOtherDeduction] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [financeAccountId, setFinanceAccountId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");

  async function load() {
    try {
      setLoading(true);
      const [hr, staffPayload, financePayload] = await Promise.all([getHrPayroll(), listHrStaff(), listFinanceAccounts({ is_active: "true" })]);
      setPayload(hr);
      setStaff(staffPayload.results);
      setFinanceAccounts((financePayload.results ?? []).filter((account) => account.is_active));
      const current = parsedPeriod(hr.current_period?.code);
      if (current) {
        setYear(current.year);
        setMonth(current.month);
      }
      setError(null);
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : "Unable to load payroll.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedStaff = useMemo(() => staff.find((entry) => String(entry.id) === staffId) ?? null, [staff, staffId]);
  useEffect(() => {
    if (!selectedStaff) return;
    setEmploymentType(selectedStaff.employment_type || "PERMANENT_MONTHLY");
    setCostCenterCode(defaultCostCenter(selectedStaff));
    setBaseSalary(selectedStaff.base_salary ?? "");
    setDailyWageRate(selectedStaff.daily_wage_rate ?? "");
    setHourlyWageRate(selectedStaff.hourly_wage_rate ?? "");
    setPieceRateAmount(selectedStaff.piece_rate_amount ?? "");
    setPieceRateUnitLabel(selectedStaff.piece_rate_unit_label ?? "");
  }, [selectedStaff]);

  const y = Number(year);
  const m = Number(month);
  const costCenter = costCenterCode.trim().replace(/\s+/g, "_").toUpperCase();
  const gross = money(baseSalary);
  const advanceDeduction = advanceTaken === "YES" ? money(advanceAmount) : 0;
  const deductions = advanceDeduction + money(otherDeduction);
  const net = Math.max(gross - deductions, 0);
  const existingSheet = useMemo(() => payload?.salary_sheets.find((sheet) => String(sheet.employee) === staffId && Number(sheet.year) === y && Number(sheet.month) === m) ?? null, [payload, staffId, y, m]);
  useEffect(() => { if (existingSheet) setSheetId(String(existingSheet.id)); }, [existingSheet]);
  const selectedSheet = useMemo(() => payload?.salary_sheets.find((sheet) => String(sheet.id) === sheetId) ?? existingSheet ?? null, [payload, sheetId, existingSheet]);
  const paid = money(selectedSheet?.payment_total);
  const outstanding = selectedSheet ? money(selectedSheet.outstanding_amount ?? selectedSheet.net_amount) || Math.max(money(selectedSheet.net_amount) - paid, 0) : net;

  useEffect(() => {
    if (!selectedSheet) return;
    setPaymentAmount(amount(outstanding));
    if (!referenceNo) setReferenceNo(`SAL-${selectedSheet.employee_code}-${selectedSheet.year}-${String(selectedSheet.month).padStart(2, "0")}`);
  }, [selectedSheet, outstanding, referenceNo]);

  async function syncStaffMaster() {
    if (!staffId) throw new Error("Select staff first.");
    await patchHrStaff(Number(staffId), {
      employment_type: employmentType,
      cost_center_code: costCenter,
      base_salary: baseSalary || null,
      daily_wage_rate: dailyWageRate || null,
      hourly_wage_rate: hourlyWageRate || null,
      piece_rate_amount: pieceRateAmount || null,
      piece_rate_unit_label: pieceRateUnitLabel,
      payroll_eligible: true,
    });
  }

  function salaryLines(): LineDraft[] {
    const lines: LineDraft[] = [];
    if (gross > 0) lines.push({ component_name: "Base Salary", component_type: "EARNING", source_type: "BASE_SALARY", source_reference: selectedStaff?.employee_code ?? "STAFF_MASTER", quantity: "1.00", rate: amount(gross), amount: amount(gross), sort_order: 1, notes: `Cost center: ${costCenter || "GENERAL"}` });
    if (advanceDeduction > 0) lines.push({ component_name: "Staff Advance Deduction", component_type: "DEDUCTION", source_type: "MANUAL", source_reference: "STAFF_ADVANCE", quantity: "1.00", rate: amount(advanceDeduction), amount: amount(advanceDeduction), sort_order: lines.length + 1, notes: "Advance deducted in payroll." });
    if (money(otherDeduction) > 0) lines.push({ component_name: "Other Payroll Deduction", component_type: "DEDUCTION", source_type: "MANUAL", source_reference: "PAYROLL_ADJUSTMENT", quantity: "1.00", rate: amount(otherDeduction), amount: amount(otherDeduction), sort_order: lines.length + 1, notes: "Manual payroll deduction." });
    return lines;
  }

  async function run(action: Busy, task: () => Promise<string>) {
    try {
      setBusy(action);
      setError(null);
      setNotice(await task());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payroll action failed.");
    } finally {
      setBusy(null);
    }
  }

  const saveSetup = () => run("setup", async () => { await syncStaffMaster(); return "Staff payroll master synced."; });
  const createSheet = () => run("sheet", async () => {
    if (!selectedStaff) throw new Error("Select staff first.");
    if (!y || !m || m < 1 || m > 12) throw new Error("Enter a valid payroll year and month.");
    if (gross <= 0) throw new Error("Base salary must be greater than zero.");
    if (deductions > gross) throw new Error("Deductions cannot exceed gross salary.");
    await syncStaffMaster();
    if (existingSheet) { setSheetId(String(existingSheet.id)); return "Salary sheet already exists for this staff and period."; }
    await createSalarySheetSafe({ employee: selectedStaff.id, payroll_period: payload?.current_period?.id ?? null, year: y, month: m, gross_amount: amount(gross), deductions_amount: amount(deductions), net_amount: amount(net), lines: salaryLines() as SalarySheetLine[] });
    return "Salary sheet created with base salary, advance deduction, and net payable.";
  });
  const approvePost = () => run("post", async () => {
    if (!selectedSheet) throw new Error("Select or create a salary sheet first.");
    if (selectedSheet.status === "DRAFT") await approveSalarySheetSafe(selectedSheet.id);
    if (!["POSTED", "PAID_PARTIAL", "PAID"].includes(selectedSheet.status)) await postSalarySheetSafe(selectedSheet.id);
    return "Salary sheet approved and posted to the accounting bridge.";
  });
  const settlePayment = () => run("pay", async () => {
    if (!selectedSheet) throw new Error("Select a posted salary sheet first.");
    if (!["POSTED", "PAID_PARTIAL"].includes(selectedSheet.status)) throw new Error("Salary sheet must be posted before payment settlement.");
    if (!financeAccountId) throw new Error("Select payment source.");
    const payable = money(paymentAmount);
    if (payable <= 0) throw new Error("Payment amount must be greater than zero.");
    if (payable > outstanding) throw new Error("Payment amount cannot exceed outstanding salary balance.");
    await createHrSalaryPayment({ salary_sheet: selectedSheet.id, payment_date: paymentDate, amount: amount(payable), finance_account: Number(financeAccountId), reference_no: referenceNo.trim() });
    return "Salary payment settled and posted.";
  });

  return (
    <ERPPageShell
      eyebrow="Staff HR — Payroll workbench"
      title="Payroll Setup & Settlement"
      subtitle="Sync staff payroll data, calculate advance deductions, create salary sheets, approve/post, reconcile outstanding, and settle payments."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "HR", href: ROUTES.admin.hr }, { label: "Payroll" }]}
      actions={[{ href: ROUTES.admin.hrSalaryPayments, label: "Salary Payment Source", variant: "secondary" }, { href: ROUTES.admin.accountingSalary, label: "View accounting bridge", variant: "ghost" }, { href: ROUTES.admin.hrStaffDocuments, label: "Staff Documents", variant: "ghost" }]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      stats={[{ label: "Staff", value: loading ? "—" : staff.length, tone: "info" }, { label: "Current Period", value: loading || !payload?.current_period ? "—" : payload.current_period.code, tone: "default" }, { label: "Period Status", value: loading || !payload?.current_period ? "—" : payload.current_period.status, tone: payload?.current_period?.status === "OPEN" ? "warning" : "success" }, { label: "Salary Sheets", value: loading || !payload ? "—" : payload.salary_sheets.length, tone: "default" }]}
    >
      {loading ? <ERPLoadingState label="Loading payroll..." /> : null}
      {!loading && error ? <ERPErrorState title="Payroll unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div> : null}
      {!loading && !error && payload ? <>
        <ERPSectionShell title="1. Staff payroll master" description="Selecting staff auto-fills cost center, pay basis, base salary, and wage details from the staff master.">
          <div className="grid gap-3 md:grid-cols-3">
            <select value={staffId} onChange={(event) => { setStaffId(event.target.value); setNotice(null); }} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="">Select staff</option>{staff.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({entry.employee_code})</option>)}</select>
            <select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="PERMANENT_MONTHLY">Permanent Monthly Staff</option><option value="TEMPORARY">Temporary Staff</option><option value="DAILY_WAGE">Daily Wage Worker</option><option value="HOURLY">Hourly Worker</option><option value="PIECE_RATE">Piece-rate Worker</option><option value="MANUFACTURING">Manufacturing Worker</option><option value="SERVICE">Service Worker</option></select>
            <input value={costCenter} onChange={(event) => setCostCenterCode(event.target.value)} placeholder="Cost center code" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <input value={baseSalary} onChange={(event) => setBaseSalary(event.target.value)} placeholder="Base salary" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <input value={dailyWageRate} onChange={(event) => setDailyWageRate(event.target.value)} placeholder="Daily wage rate" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <input value={hourlyWageRate} onChange={(event) => setHourlyWageRate(event.target.value)} placeholder="Hourly wage rate" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <input value={pieceRateAmount} onChange={(event) => setPieceRateAmount(event.target.value)} placeholder="Piece-rate amount" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <input value={pieceRateUnitLabel} onChange={(event) => setPieceRateUnitLabel(event.target.value)} placeholder="Piece-rate unit label" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
          </div>
          <button type="button" className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={!staffId || busy !== null} onClick={() => void saveSetup()}>{busy === "setup" ? "Saving..." : "Save payroll setup"}</button>
        </ERPSectionShell>

        <ERPSectionShell title="2. Sheet calculation" description="Advance is deducted only when marked as taken. Net payable becomes the salary sheet amount.">
          <div className="grid gap-3 md:grid-cols-5">
            <input value={year} onChange={(event) => setYear(event.target.value)} placeholder="Year" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <select value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">{Array.from({ length: 12 }, (_, index) => index + 1).map((item) => <option key={item} value={item}>{String(item).padStart(2, "0")}</option>)}</select>
            <select value={advanceTaken} onChange={(event) => setAdvanceTaken(event.target.value as "NO" | "YES")} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="NO">No staff advance taken</option><option value="YES">Staff advance taken</option></select>
            <input value={advanceAmount} disabled={advanceTaken === "NO"} onChange={(event) => setAdvanceAmount(event.target.value)} placeholder="Advance amount" className="h-10 rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-50" />
            <input value={otherDeduction} onChange={(event) => setOtherDeduction(event.target.value)} placeholder="Other deductions" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">{[["Gross", gross], ["Advance", advanceDeduction], ["Deductions", deductions], ["Net payable", net], ["Sheet", existingSheet ? existingSheet.status : "Not created"]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-border bg-muted/30 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{typeof value === "number" ? inr.format(value) : value}</div></div>)}</div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={!staffId || busy !== null} onClick={() => void createSheet()}>{busy === "sheet" ? "Creating..." : existingSheet ? "Use existing sheet" : "Create salary sheet"}</button><button type="button" className="rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-60" disabled={!selectedSheet || busy !== null} onClick={() => void approvePost()}>{busy === "post" ? "Posting..." : "Approve + Post"}</button></div>
        </ERPSectionShell>

        <ERPSectionShell title="3. Payment settlement" description="Settle only posted salary sheets. Backend prevents overpayment and posts the salary payment bridge entry.">
          <div className="grid gap-3 md:grid-cols-5">
            <select value={sheetId} onChange={(event) => setSheetId(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="">Select sheet</option>{payload.salary_sheets.map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.employee_name} · {sheet.year}-{String(sheet.month).padStart(2, "0")} · {sheet.status}</option>)}</select>
            <select value={financeAccountId} onChange={(event) => setFinanceAccountId(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm"><option value="">Payment source</option>{financeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.kind}</option>)}</select>
            <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <input value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Amount" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} placeholder="Reference no" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">{[["Sheet net", money(selectedSheet?.net_amount)], ["Paid", paid], ["Outstanding", outstanding], ["After payment", Math.max(outstanding - money(paymentAmount), 0)]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-border bg-muted/30 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{inr.format(Number(value))}</div></div>)}</div>
          <button type="button" className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={!selectedSheet || !financeAccountId || busy !== null} onClick={() => void settlePayment()}>{busy === "pay" ? "Settling..." : "Settle payment"}</button>
        </ERPSectionShell>

        {payload.salary_sheets.length === 0 ? <ERPEmptyState title="No salary sheets yet" description="Create a salary sheet after selecting a staff member and payroll period." /> : <ERPSectionShell title="Recent salary sheets" description="Gross, deductions, net, paid and outstanding values for reconciliation."><div className="overflow-auto rounded-2xl border border-border"><table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr>{["Staff", "Period", "Gross", "Deduction", "Net", "Paid", "Outstanding", "Status"].map((head) => <th key={head} className="px-3 py-2">{head}</th>)}</tr></thead><tbody>{payload.salary_sheets.slice(0, 20).map((sheet) => <tr key={sheet.id} className="border-t border-border"><td className="px-3 py-2">{sheet.employee_name}<div className="text-xs text-muted-foreground">{sheet.employee_code}</div></td><td className="px-3 py-2">{sheet.year}-{String(sheet.month).padStart(2, "0")}</td><td className="px-3 py-2">{inr.format(money(sheet.gross_amount))}</td><td className="px-3 py-2">{inr.format(money(sheet.deductions_amount))}</td><td className="px-3 py-2 font-medium">{inr.format(money(sheet.net_amount))}</td><td className="px-3 py-2">{inr.format(money(sheet.payment_total))}</td><td className="px-3 py-2">{inr.format(money(sheet.outstanding_amount))}</td><td className="px-3 py-2">{sheet.status}</td></tr>)}</tbody></table></div></ERPSectionShell>}
      </> : null}
    </ERPPageShell>
  );
}
