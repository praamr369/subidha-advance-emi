"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import StatCard from "@/components/ui/StatCard";
import { WorkflowCard } from "@/components/ui/operations";
import { ROUTES } from "@/lib/routes";
import { getHrSummary, type HrSummary } from "@/services/admin-hr";

export default function AdminHrWorkspacePage() {
  const [payload, setPayload] = useState<HrSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = !payload && !error;

  async function refresh() {
    try {
      const data = await getHrSummary();
      setPayload(data);
      setError(null);
    } catch (err: unknown) {
      setPayload(null);
      setError(err instanceof Error ? err.message : "Unable to load HR summary.");
    }
  }

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
        setPayload(null);
        setError(err instanceof Error ? err.message : "Unable to load HR summary.");
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ERPPageShell
      eyebrow="Staff HR — Staff profile source"
      title="HR & Staff Workspace"
      subtitle="Staff HR command center: staff profile source, onboarding workflow, attendance source workflow, payroll setup, and salary payment source. No payroll accounting posting from this page."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR" },
      ]}
      actions={[
        { href: ROUTES.admin.hrStaff, label: "Staff Register", variant: "primary" },
        { href: ROUTES.admin.hrAttendance, label: "Attendance", variant: "secondary" },
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
      {loading ? <ERPLoadingState label="Loading HR workspace..." /> : null}
      {!loading && error ? (
        <ERPErrorState title="HR workspace unavailable" description={error} onRetry={() => void refresh()} />
      ) : null}
      {!loading && !error && !payload ? (
        <ERPEmptyState title="HR summary unavailable" description="Try refreshing the page. If the issue persists, verify HR summary service availability." />
      ) : null}

      {payload ? (
        <>
          <WorkflowCard
            title="HR & Staff — separation rules"
            description="Staff profile source, onboarding workflow, attendance source workflow, payroll setup, and salary payment source live here. Payroll accounting bridge status and reconciliation evidence are in Accounting & Reconciliation. No payroll journal, money movement, receipt, accounting bridge posting, or reconciliation item is created from any page in this group."
          />
          <ERPSectionShell title="Work queue" description="Snapshot summary from existing HR registers and payroll-safe models.">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Expense claims pending" value={payload.pending_expense_claims} tone={payload.pending_expense_claims > 0 ? "warning" : "success"} />
              <StatCard label="Payroll pending" value={payload.payroll_pending} tone={payload.payroll_pending > 0 ? "info" : "success"} />
              <StatCard label="Salary payments pending" value={payload.salary_payment_pending} tone={payload.salary_payment_pending > 0 ? "warning" : "success"} />
              <StatCard label="As of" value={new Date(payload.as_of).toLocaleString("en-IN")} tone="default" />
            </div>
          </ERPSectionShell>

          <ERPSectionShell title="Quick routes" description="Open HR source workflow workspaces. Staff creation, attendance, payroll setup, and salary payments do not create journals, accounting bridge postings, or reconciliation records.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
          </ERPSectionShell>
        </>
      ) : null}
    </ERPPageShell>
  );
}
