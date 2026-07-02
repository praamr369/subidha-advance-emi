"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { listHrSalaryPayments, type HrSalaryPayment } from "@/services/admin-hr";

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

function fieldValue(value?: string | null) {
  return value && value.trim() ? value : "—";
}

export default function AdminHrSalaryPaymentsPage() {
  const [rows, setRows] = useState<HrSalaryPayment[]>([]);
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
      eyebrow="Staff HR — Salary payment source"
      title="Salary Payments"
      subtitle="Salary payment source: record and view salary payments against existing salary sheets. Payroll accounting bridge status and reconciliation evidence are separate — use Accounting & Reconciliation for those."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Salary Payments" },
      ]}
      actions={[
        { href: ROUTES.admin.hrPayroll, label: "Payroll setup", variant: "secondary" },
        { href: ROUTES.admin.accountingSalary, label: "View accounting bridge", variant: "ghost" },
        { href: ROUTES.admin.accountingBridgeReconciliation, label: "Reconciliation evidence", variant: "ghost" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      stats={[
        { label: "Payments Recorded", value: loading ? "—" : rows.length, tone: "info" },
        {
          label: "Total Amount",
          value: loading ? "—" : formatMoney(rows.reduce((sum, row) => sum + toNumber(row.amount), 0)),
          tone: "default",
        },
      ]}
    >
      {loading ? <ERPLoadingState label="Loading salary payments..." /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load salary payments" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState title="No salary payments yet" description="Salary payments will appear here when recorded against existing salary sheets. Salary payments are a separate step from payroll setup and payroll accounting bridge posting." />
      ) : null}
      {!loading && !error && rows.length > 0 ? (
        <ERPSectionShell title="Recent salary payments" description="Most recent 200 salary payments, newest first.">
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Payment Date</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Branch</th>
                  <th className="px-3 py-2">Paid From</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Journal Entry</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2">{fieldValue(row.salary_sheet_employee_name)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fieldValue(row.salary_sheet_employee_code)}</td>
                    <td className="px-3 py-2">{fieldValue(row.payment_date)}</td>
                    <td className="px-3 py-2 font-medium">{formatMoney(row.amount)}</td>
                    <td className="px-3 py-2">{fieldValue(row.branch_name)}</td>
                    <td className="px-3 py-2">{fieldValue(row.finance_account_name)}</td>
                    <td className="px-3 py-2">{fieldValue(row.reference_no)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fieldValue(row.posted_journal_entry_no)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ERPSectionShell>
      ) : null}
    </ERPPageShell>
  );
}
