"use client";

import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { listHrSalaryPayments } from "@/services/admin-hr";

export default function AdminHrSalaryPaymentsPage() {
  const [rows, setRows] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const payload = await listHrSalaryPayments();
      setRows(payload.results);
      setError(null);
    } catch (err: unknown) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Unable to load salary payments.");
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
      title="Salary Payments"
      subtitle="Salary payment register. This uses existing salary payment models and does not mutate unrelated finance records."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Salary Payments" },
      ]}
      actions={[
        { href: ROUTES.admin.hrPayroll, label: "Payroll", variant: "secondary" },
        { href: ROUTES.admin.accountingSalary, label: "Accounting Salary", variant: "ghost" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      {loading ? <LoadingBlock label="Loading salary payments..." /> : null}
      {!loading && error ? <ErrorState title="Unable to load salary payments" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No salary payments yet" description="Salary payments will appear here when recorded." /> : null}
      {!loading && !error && rows.length > 0 ? (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="text-sm font-semibold text-foreground">Recent salary payments</div>
          <div className="mt-3 overflow-auto">
            <pre className="text-xs text-muted-foreground">{JSON.stringify(rows.slice(0, 20), null, 2)}</pre>
          </div>
        </section>
      ) : null}
    </PortalPage>
  );
}

