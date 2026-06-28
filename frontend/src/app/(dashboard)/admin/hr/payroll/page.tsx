"use client";

import { useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { getHrPayroll, listHrStaff, patchHrStaff, type HrPayrollSheet, type HrStaff } from "@/services/admin-hr";

type PayrollPayload = {
  current_period: { id: number; code: string; status: string } | null;
  salary_sheets: HrPayrollSheet[];
};

type BusyAction = "save" | null;

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function toNumber(value: string | number | null | undefined) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: string | number | null | undefined) {
  return inr.format(toNumber(value));
}

function fieldValue(value: string | null | undefined) {
  return value && value.trim() ? value : "—";
}

function payrollLabel(value?: string | null) {
  return fieldValue(value?.replace(/_/g, " "));
}

export default function AdminHrPayrollPage() {
  const [payload, setPayload] = useState<PayrollPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [staff, setStaff] = useState<HrStaff[]>([]);
  const [staffId, setStaffId] = useState("");
  const [employmentType, setEmploymentType] = useState("PERMANENT_MONTHLY");
  const [baseSalary, setBaseSalary] = useState("");
  const [dailyWageRate, setDailyWageRate] = useState("");
  const [hourlyWageRate, setHourlyWageRate] = useState("");
  const [pieceRateAmount, setPieceRateAmount] = useState("");
  const [pieceRateUnitLabel, setPieceRateUnitLabel] = useState("");

  async function load() {
    try {
      setLoading(true);
      const [next, staffPayload] = await Promise.all([getHrPayroll(), listHrStaff()]);
      setPayload(next);
      setStaff(staffPayload.results ?? []);
      setError(null);
    } catch (err: unknown) {
      setPayload(null);
      setError(err instanceof Error ? err.message : "Unable to load payroll.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedStaff = useMemo(
    () => staff.find((entry) => String(entry.id) === staffId) ?? null,
    [staff, staffId]
  );

  useEffect(() => {
    if (!selectedStaff) return;
    setEmploymentType(selectedStaff.employment_type || "PERMANENT_MONTHLY");
    setBaseSalary(selectedStaff.base_salary ?? "");
    setDailyWageRate(selectedStaff.daily_wage_rate ?? "");
    setHourlyWageRate(selectedStaff.hourly_wage_rate ?? "");
    setPieceRateAmount(selectedStaff.piece_rate_amount ?? "");
    setPieceRateUnitLabel(selectedStaff.piece_rate_unit_label ?? "");
    setNotice(null);
  }, [selectedStaff]);

  const estimatedMonthlyPay = useMemo(() => {
    if (employmentType === "DAILY_WAGE") return toNumber(dailyWageRate) * 26;
    if (employmentType === "HOURLY") return toNumber(hourlyWageRate) * 8 * 26;
    if (employmentType === "PIECE_RATE") return toNumber(pieceRateAmount);
    return toNumber(baseSalary);
  }, [baseSalary, dailyWageRate, employmentType, hourlyWageRate, pieceRateAmount]);

  async function savePayrollSetup() {
    if (!selectedStaff) return;
    try {
      setBusy("save");
      setError(null);
      await patchHrStaff(selectedStaff.id, {
        employment_type: employmentType,
        base_salary: baseSalary || null,
        daily_wage_rate: dailyWageRate || null,
        hourly_wage_rate: hourlyWageRate || null,
        piece_rate_amount: pieceRateAmount || null,
        piece_rate_unit_label: pieceRateUnitLabel,
        payroll_eligible: true,
      });
      await load();
      setNotice("Payroll setup saved from staff details.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to save payroll setup.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Staff HR — Payroll setup"
      title="Payroll Setup"
      subtitle="Select staff and the form auto-maps payroll fields from staff details. Only practical salary fields are shown; cost center and other critical accounting fields are hidden from this setup screen."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Payroll Setup" },
      ]}
      actions={[
        { href: ROUTES.admin.hrSalaryPayments, label: "Salary Payments", variant: "secondary" },
        { href: ROUTES.admin.accountingSalary, label: "Accounting salary bridge", variant: "ghost" },
        { href: ROUTES.admin.hrStaffDocuments, label: "Staff Documents", variant: "ghost" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      stats={[
        { label: "Staff", value: loading ? "—" : staff.length, tone: "info" },
        { label: "Current Period", value: loading || !payload?.current_period ? "—" : payload.current_period.code, tone: "default" },
        { label: "Period Status", value: loading || !payload?.current_period ? "—" : payload.current_period.status, tone: payload?.current_period?.status === "OPEN" ? "warning" : "success" },
        { label: "Salary Sheets", value: loading || !payload ? "—" : payload.salary_sheets.length, tone: "default" },
      ]}
    >
      {loading ? <ERPLoadingState label="Loading payroll..." /> : null}
      {!loading && error ? <ERPErrorState title="Payroll unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && notice ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}
      {!loading && !error && payload ? (
        <>
          <ERPSectionShell
            title="Payroll setup — staff details mapped"
            description="Choose staff first. Existing staff salary, wage and employment type are filled automatically; edit only the payroll values you need for daily operation."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <select value={staffId} onChange={(event) => setStaffId(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
                <option value="">Select staff</option>
                {staff.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.name} ({entry.employee_code})</option>
                ))}
              </select>
              <select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-sm">
                <option value="PERMANENT_MONTHLY">Permanent monthly staff</option>
                <option value="TEMPORARY">Temporary staff</option>
                <option value="DAILY_WAGE">Daily wage worker</option>
                <option value="HOURLY">Hourly worker</option>
                <option value="PIECE_RATE">Piece-rate worker</option>
                <option value="MANUFACTURING">Manufacturing worker</option>
                <option value="SERVICE">Service worker</option>
              </select>
              <input value={baseSalary} onChange={(event) => setBaseSalary(event.target.value)} placeholder="Base monthly salary" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input value={dailyWageRate} onChange={(event) => setDailyWageRate(event.target.value)} placeholder="Daily wage rate" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input value={hourlyWageRate} onChange={(event) => setHourlyWageRate(event.target.value)} placeholder="Hourly wage rate" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input value={pieceRateAmount} onChange={(event) => setPieceRateAmount(event.target.value)} placeholder="Piece-rate amount" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input value={pieceRateUnitLabel} onChange={(event) => setPieceRateUnitLabel(event.target.value)} placeholder="Piece-rate unit label" className="h-10 rounded-xl border border-border bg-background px-3 text-sm md:col-span-2" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-border bg-muted/30 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Estimated monthly pay</div><div className="mt-1 text-lg font-semibold">{formatMoney(estimatedMonthlyPay)}</div></div>
              <div className="rounded-2xl border border-border bg-muted/30 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Pay basis</div><div className="mt-1 text-sm font-semibold">{payrollLabel(employmentType)}</div></div>
              <div className="rounded-2xl border border-border bg-muted/30 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payroll ready</div><div className="mt-1 text-sm font-semibold">{selectedStaff?.payroll_ready ? "Ready" : "Needs save/review"}</div></div>
              <div className="rounded-2xl border border-border bg-muted/30 p-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payment mode</div><div className="mt-1 text-sm font-semibold">{payrollLabel(selectedStaff?.payment_mode)}</div></div>
            </div>
            <button type="button" className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={!selectedStaff || busy !== null} onClick={() => void savePayrollSetup()}>
              {busy === "save" ? "Saving..." : "Save payroll setup"}
            </button>
          </ERPSectionShell>

          {selectedStaff ? (
            <ERPSectionShell title="Selected staff details" description="Read-only staff context used to verify that payroll setup is being done for the correct person.">
              <div className="grid gap-3 text-sm md:grid-cols-4">
                <div><span className="text-muted-foreground">Code</span><div className="font-medium">{selectedStaff.employee_code}</div></div>
                <div><span className="text-muted-foreground">Phone</span><div className="font-medium">{fieldValue(selectedStaff.phone)}</div></div>
                <div><span className="text-muted-foreground">Department</span><div className="font-medium">{fieldValue(selectedStaff.department)}</div></div>
                <div><span className="text-muted-foreground">Designation</span><div className="font-medium">{fieldValue(selectedStaff.designation)}</div></div>
                <div><span className="text-muted-foreground">Branch</span><div className="font-medium">{fieldValue(selectedStaff.branch_name)}</div></div>
                <div><span className="text-muted-foreground">Joining date</span><div className="font-medium">{fieldValue(selectedStaff.joining_date)}</div></div>
                <div><span className="text-muted-foreground">Employment status</span><div className="font-medium">{payrollLabel(selectedStaff.employment_status)}</div></div>
                <div><span className="text-muted-foreground">KYC</span><div className="font-medium">{selectedStaff.kyc_verified ? "Verified" : "Pending"}</div></div>
              </div>
            </ERPSectionShell>
          ) : null}

          <ERPSectionShell title="Current payroll period">
            <div className="text-sm text-muted-foreground">
              {payload.current_period ? `${payload.current_period.code} · ${payload.current_period.status}` : "No payroll period found."}
            </div>
          </ERPSectionShell>

          {payload.salary_sheets.length === 0 ? (
            <ERPEmptyState title="No salary sheets yet" description="Salary sheets will appear here when generated through the payroll period workflow." />
          ) : (
            <ERPSectionShell title="Recent salary sheets" description="Quick payroll register view for operator verification.">
              <div className="overflow-auto rounded-2xl border border-border">
                <table className="min-w-full text-sm"><thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Staff</th><th className="px-3 py-2">Period</th><th className="px-3 py-2">Gross</th><th className="px-3 py-2">Net</th><th className="px-3 py-2">Status</th></tr></thead><tbody>{payload.salary_sheets.slice(0, 20).map((sheet) => (<tr key={sheet.id} className="border-t border-border"><td className="px-3 py-2">{sheet.employee_name}</td><td className="px-3 py-2">{sheet.year}-{String(sheet.month).padStart(2, "0")}</td><td className="px-3 py-2">{formatMoney(sheet.gross_amount)}</td><td className="px-3 py-2 font-medium">{formatMoney(sheet.net_amount)}</td><td className="px-3 py-2">{sheet.status}</td></tr>))}</tbody></table>
              </div>
            </ERPSectionShell>
          )}
        </>
      ) : null}
    </ERPPageShell>
  );
}
