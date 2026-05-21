"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
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
    <ERPPageShell
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
      {loading ? <ERPLoadingState label="Loading salary payments..." /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load salary payments" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState title="No salary payments yet" description="Salary payments will appear here when recorded." />
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <ERPSectionShell title="Recent salary payments" description="Read-only preview of the first 20 items returned by the API.">
          <div className="overflow-auto">
            <pre className="text-xs text-muted-foreground">{JSON.stringify(rows.slice(0, 20), null, 2)}</pre>
          </div>
        </ERPSectionShell>
      ) : null}
    </ERPPageShell>
  );
}
