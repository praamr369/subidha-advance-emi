"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { ROUTES } from "@/lib/routes";
import { getHrSummary, type HrSummary } from "@/services/admin-hr";

export default function AdminHrWorkspacePage() {
  const [payload, setPayload] = useState<HrSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = !payload && !error;

  useEffect(() => {
    let active = true;
    void getHrSummary()
      .then((data) => {
        if (!active) return;
        setPayload(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load HR summary.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <PortalPage
      eyebrow="Staff HR"
      title="Staff Workspace"
      subtitle="Daily HR command center over existing employee, attendance, leave, expense, and payroll records."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR" },
      ]}
      actions={[
        { href: ROUTES.admin.hrStaff, label: "Staff Register", variant: "primary" },
        { href: ROUTES.admin.hrAttendance, label: "Mark Attendance", variant: "secondary" },
        { href: ROUTES.admin.hrLeave, label: "Leave Requests", variant: "secondary" },
        { href: ROUTES.admin.hrExpenses, label: "Expense Claims", variant: "secondary" },
        { href: ROUTES.admin.hrStaffDocuments, label: "Staff Documents", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      stats={[
        { label: "Active staff", value: payload ? payload.total_active_staff : "—", tone: payload ? "info" : "default" },
        { label: "Present today", value: payload ? payload.today_present : "—", tone: payload ? "success" : "default" },
        { label: "Absent today", value: payload ? payload.today_absent : "—", tone: payload ? "warning" : "default" },
        { label: "Leave pending", value: payload ? payload.pending_leave_requests : "—", tone: payload ? "warning" : "default" },
      ]}
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {payload ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Expense claims pending" value={payload.pending_expense_claims} tone={payload.pending_expense_claims > 0 ? "warning" : "success"} />
            <StatCard label="Payroll pending" value={payload.payroll_pending} tone={payload.payroll_pending > 0 ? "info" : "success"} />
            <StatCard label="Salary payments pending" value={payload.salary_payment_pending} tone={payload.salary_payment_pending > 0 ? "warning" : "success"} />
            <StatCard label="As of" value={new Date(payload.as_of).toLocaleString("en-IN")} tone="default" />
          </div>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Quick routes</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ["Staff Register", ROUTES.admin.hrStaff],
                ["Attendance", ROUTES.admin.hrAttendance],
                ["Payroll", ROUTES.admin.hrPayroll],
                ["Salary Payments", ROUTES.admin.hrSalaryPayments],
                ["Leave Requests", ROUTES.admin.hrLeave],
                ["Expense Claims", ROUTES.admin.hrExpenses],
                ["Staff Documents", ROUTES.admin.hrStaffDocuments],
              ].map(([label, href]) => (
                <Link
                  key={String(label)}
                  href={String(href)}
                  className="rounded-xl border border-border bg-[var(--surface-muted)] px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-[var(--surface-strong)]"
                >
                  {label}
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {loading ? "Loading HR workspace..." : "HR summary unavailable."}
        </div>
      )}
    </PortalPage>
  );
}
