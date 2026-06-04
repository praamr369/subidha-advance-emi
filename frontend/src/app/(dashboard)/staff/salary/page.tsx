"use client";

import Link from "next/link";

import StaffDataPage from "@/components/staff/StaffDataPage";
import { ROUTES } from "@/lib/routes";
import { getStaffSalarySummary, type StaffSalarySummary } from "@/services/staff";

function money(value?: string | null): string {
  return `₹${Number(value ?? 0).toLocaleString("en-IN")}`;
}

export default function StaffSalaryPage() {
  return (
    <StaffDataPage<StaffSalarySummary>
      title="Salary Summary"
      description="Read-only salary structure and latest payroll posture. Finance accounts, journals, and posting controls are not exposed to staff."
      load={getStaffSalarySummary}
      render={(data) => (
        <div className="space-y-4">
          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base salary</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{money(data.base_salary)}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employment type</div>
              <div className="mt-2 text-lg font-semibold text-foreground">{data.employment_type || "Not set"}</div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Salary payments</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{data.salary_payment_count}</div>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Latest payslip</h2>
            {data.latest_payslip ? (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-semibold text-foreground">{data.latest_payslip.year}-{String(data.latest_payslip.month).padStart(2, "0")}</div>
                  <div className="mt-1 text-sm text-muted-foreground">Net: {money(data.latest_payslip.net_amount)} · Status: {data.latest_payslip.status}</div>
                </div>
                <Link className="rounded-xl border px-3 py-2 text-sm font-semibold" href={`${ROUTES.staff.payslips}/${data.latest_payslip.id}`}>Open payslip</Link>
              </div>
            ) : <p className="mt-4 text-sm text-muted-foreground">No payslip available yet.</p>}
          </section>
        </div>
      )}
    />
  );
}
