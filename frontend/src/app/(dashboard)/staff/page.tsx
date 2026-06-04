"use client";

import Link from "next/link";

import StaffDataPage from "@/components/staff/StaffDataPage";
import { ROUTES } from "@/lib/routes";
import { getStaffDashboard, type StaffDashboardPayload } from "@/services/staff";

function Money({ value }: { value?: string | null }) {
  return <span>₹{Number(value ?? 0).toLocaleString("en-IN")}</span>;
}

export default function StaffDashboardPage() {
  return (
    <StaffDataPage<StaffDashboardPayload>
      title="Staff Dashboard"
      description="Your own staff profile, attendance, latest payslip, and read-only payroll posture."
      load={getStaffDashboard}
      render={(data) => (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</div>
            <div className="mt-2 text-xl font-semibold text-foreground">{data.profile.profile.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">{data.profile.profile.employee_code}</div>
            <div className="mt-4 text-sm text-muted-foreground">{data.profile.profile.designation || "Designation not set"}</div>
            <Link className="mt-4 inline-flex rounded-xl border px-3 py-2 text-sm font-semibold" href={ROUTES.staff.profile}>View profile</Link>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today attendance</div>
            <div className="mt-2 text-xl font-semibold text-foreground">{data.today_attendance?.status || "Not marked"}</div>
            <div className="mt-1 text-sm text-muted-foreground">Worked hours: {data.today_attendance?.worked_hours || "0.00"}</div>
            <Link className="mt-4 inline-flex rounded-xl border px-3 py-2 text-sm font-semibold" href={ROUTES.staff.attendance}>Attendance</Link>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest salary</div>
            <div className="mt-2 text-xl font-semibold text-foreground"><Money value={data.salary_summary.latest_payslip?.net_amount ?? data.salary_summary.base_salary} /></div>
            <div className="mt-1 text-sm text-muted-foreground">Payslips: {data.reports.payslip_count || 0}</div>
            <Link className="mt-4 inline-flex rounded-xl border px-3 py-2 text-sm font-semibold" href={ROUTES.staff.payslips}>Payslips</Link>
          </section>
        </div>
      )}
    />
  );
}
