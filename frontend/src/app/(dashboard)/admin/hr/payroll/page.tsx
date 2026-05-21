"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { getHrPayroll, listHrStaff, patchHrStaff, type HrStaff } from "@/services/admin-hr";

export default function AdminHrPayrollPage() {
  const [payload, setPayload] = useState<{ current_period: { id: number; code: string; status: string } | null; salary_sheets: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<HrStaff[]>([]);
  const [staffId, setStaffId] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [dailyWageRate, setDailyWageRate] = useState("");
  const [hourlyWageRate, setHourlyWageRate] = useState("");
  const [pieceRateAmount, setPieceRateAmount] = useState("");
  const [pieceRateUnitLabel, setPieceRateUnitLabel] = useState("");
  const [costCenterCode, setCostCenterCode] = useState("");
  const [employmentType, setEmploymentType] = useState("PERMANENT_MONTHLY");

  async function load() {
    try {
      setLoading(true);
      const [next, staffPayload] = await Promise.all([getHrPayroll(), listHrStaff()]);
      setPayload(next);
      setStaff(staffPayload.results);
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

  return (
    <ERPPageShell
      eyebrow="Staff HR"
      title="Salary / Payroll"
      subtitle="Payroll periods and salary sheets from existing accounting workforce models."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Payroll" },
      ]}
      actions={[
        { href: ROUTES.admin.hrSalaryPayments, label: "Salary Payments", variant: "secondary" },
        { href: ROUTES.admin.accountingSalary, label: "Accounting Salary", variant: "ghost" },
        { href: ROUTES.admin.hrStaffDocuments, label: "Staff Documents", variant: "ghost" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      {loading ? <ERPLoadingState label="Loading payroll..." /> : null}
      {!loading && error ? <ERPErrorState title="Payroll unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && payload ? (
        <>
          <ERPSectionShell title="Payroll setup (Staff master)" description="Updates staff payroll fields only through the existing staff patch API.">
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="">Select staff</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.employee_code})
                  </option>
                ))}
              </select>
              <select
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="PERMANENT_MONTHLY">Permanent Monthly Staff</option>
                <option value="TEMPORARY">Temporary Staff</option>
                <option value="DAILY_WAGE">Daily Wage Worker</option>
                <option value="HOURLY">Hourly Worker</option>
                <option value="PIECE_RATE">Piece-rate Worker</option>
                <option value="MANUFACTURING">Manufacturing Worker</option>
                <option value="SERVICE">Service Worker</option>
              </select>
              <input value={costCenterCode} onChange={(e) => setCostCenterCode(e.target.value)} placeholder="Cost center code" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} placeholder="Base salary" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input value={dailyWageRate} onChange={(e) => setDailyWageRate(e.target.value)} placeholder="Daily wage rate" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input value={hourlyWageRate} onChange={(e) => setHourlyWageRate(e.target.value)} placeholder="Hourly wage rate" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input value={pieceRateAmount} onChange={(e) => setPieceRateAmount(e.target.value)} placeholder="Piece-rate amount" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
              <input value={pieceRateUnitLabel} onChange={(e) => setPieceRateUnitLabel(e.target.value)} placeholder="Piece-rate unit label" className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            </div>
            <button
              type="button"
              className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              disabled={!staffId}
              onClick={() =>
                void patchHrStaff(Number(staffId), {
                  employment_type: employmentType,
                  cost_center_code: costCenterCode,
                  base_salary: baseSalary || null,
                  daily_wage_rate: dailyWageRate || null,
                  hourly_wage_rate: hourlyWageRate || null,
                  piece_rate_amount: pieceRateAmount || null,
                  piece_rate_unit_label: pieceRateUnitLabel,
                }).then(load)
              }
            >
              Save payroll setup
            </button>
          </ERPSectionShell>

          <ERPSectionShell title="Current payroll period">
            <div className="text-sm text-muted-foreground">
              {payload.current_period ? `${payload.current_period.code} · ${payload.current_period.status}` : "No payroll period found."}
            </div>
          </ERPSectionShell>

          {payload.salary_sheets.length === 0 ? (
            <ERPEmptyState title="No salary sheets yet" description="Salary sheets will appear here when generated in the salary module." />
          ) : (
            <ERPSectionShell title="Recent salary sheets" description="Read-only peek at the first 20 rows for operator troubleshooting.">
              <div className="overflow-auto">
                <pre className="text-xs text-muted-foreground">{JSON.stringify(payload.salary_sheets.slice(0, 20), null, 2)}</pre>
              </div>
            </ERPSectionShell>
          )}
        </>
      ) : null}
    </ERPPageShell>
  );
}
