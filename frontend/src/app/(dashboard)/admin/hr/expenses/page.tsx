"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { listHrExpenseClaims, patchHrExpenseClaim, type HrExpenseClaim } from "@/services/admin-hr";

export default function AdminHrExpenseClaimsPage() {
  const [rows, setRows] = useState<HrExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const payload = await listHrExpenseClaims();
      setRows(payload.results);
      setError(null);
    } catch (err: unknown) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Unable to load expense claims.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(id: number, action: "APPROVE" | "REJECT") {
    try {
      await patchHrExpenseClaim(id, { action, reason: action === "REJECT" ? "Rejected by admin" : undefined });
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Expense action failed.");
    }
  }

  return (
    <ERPPageShell
      eyebrow="Staff HR"
      title="Expense Claims"
      subtitle="Approve or reject employee expense claims (existing expense claim workflow)."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "HR", href: ROUTES.admin.hr },
        { label: "Expenses" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      {loading ? <ERPLoadingState label="Loading expense claims..." /> : null}
      {!loading && error ? <ERPErrorState title="Expense claims unavailable" description={error} onRetry={() => void load()} /> : null}
      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState title="No expense claims" description="Expense claims will appear when staff submits them." />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <ERPSectionShell title="Expense claims" description="Approve/reject actions call the existing expense claim workflow.">
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Claim</th>
                  <th className="py-2 pr-4">Employee</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-2 pr-4 font-mono text-xs">{row.claim_no}</td>
                    <td className="py-2 pr-4">{row.employee_name}</td>
                    <td className="py-2 pr-4">{row.claim_date}</td>
                    <td className="py-2 pr-4">{row.amount}</td>
                    <td className="py-2 pr-4">{row.status}</td>
                    <td className="py-2 pr-4">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void act(row.id, "APPROVE")}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void act(row.id, "REJECT")}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
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
