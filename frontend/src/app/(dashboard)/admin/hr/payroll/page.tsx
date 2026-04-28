"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { getHrPayroll } from "@/services/admin-hr";

export default function AdminHrPayrollPage() {
  const [payload, setPayload] = useState<{ current_period: { id: number; code: string; status: string } | null; salary_sheets: unknown[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const next = await getHrPayroll();
      setPayload(next);
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
    <PortalPage
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
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      {loading ? <LoadingBlock label="Loading payroll..." /> : null}
      {!loading && error ? <ErrorState title="Payroll unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && payload ? (
        <>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="text-sm font-semibold text-foreground">Current payroll period</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {payload.current_period ? `${payload.current_period.code} · ${payload.current_period.status}` : "No payroll period found."}
            </div>
          </section>

          {payload.salary_sheets.length === 0 ? (
            <EmptyState title="No salary sheets yet" description="Salary sheets will appear here when generated in the salary module." />
          ) : (
            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="text-sm font-semibold text-foreground">Recent salary sheets</div>
              <div className="mt-3 overflow-auto">
                <pre className="text-xs text-muted-foreground">{JSON.stringify(payload.salary_sheets.slice(0, 20), null, 2)}</pre>
              </div>
            </section>
          )}
        </>
      ) : null}
    </PortalPage>
  );
}

