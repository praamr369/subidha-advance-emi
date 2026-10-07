"use client";
import { useQuery } from "@tanstack/react-query";

import { useCallback, useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingMoney,
} from "@/components/accounting/shared";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  getStaffLedger,
  listEmployees,
  type EmployeeProfile,
  type StaffLedgerReport,
  type StaffLedgerRow,
} from "@/services/accounting";

export default function AccountingStaffLedgerPage() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [report, setReport] = useState<StaffLedgerReport | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const query = useQuery({
    queryKey: ['adminStaffLedger', selectedEmployeeId],
    queryFn: async () => {
      const [employeesPayload, ledgerPayload] = await Promise.all([
        listEmployees(),
        getStaffLedger(selectedEmployeeId ? { employee: selectedEmployeeId } : {}),
      ]);
      return { employees: employeesPayload.results, ledger: ledgerPayload };
    }
  });

  const loading = query.isLoading;
  const refreshing = query.isFetching && !query.isLoading;
  const error = query.error ? accountingErrorMessage(query.error, "Failed to load staff ledger.") : null;

  const loadPage = useCallback(async (mode?: "initial" | "refresh", employeeId?: string) => {
    if (employeeId !== undefined && employeeId !== selectedEmployeeId) {
      setSelectedEmployeeId(employeeId);
    } else {
      await query.refetch();
    }
  }, [selectedEmployeeId, query]);

  useEffect(() => {
    if (query.data) {
      setEmployees(query.data.employees);
      setReport(query.data.ledger);
    } else if (query.isError) {
      setEmployees([]);
      setReport(null);
    }
  }, [query.data, query.isError]);

  const columns: EnterpriseColumnDef<StaffLedgerRow>[] = [
    {
      key: "entry_date",
      header: "Date",
      render: (row) => accountingDate(row.entry_date),
    },
    { key: "employee_code", header: "Code" },
    { key: "employee_name", header: "Staff" },
    { key: "entry_kind", header: "Entry" },
    { key: "source_reference", header: "Reference" },
    { key: "document_no", header: "Journal" },
    {
      key: "debit_amount",
      header: "Debit",
      render: (row) => accountingMoney(row.debit_amount),
    },
    {
      key: "credit_amount",
      header: "Credit",
      render: (row) => accountingMoney(row.credit_amount),
    },
    {
      key: "running_balance",
      header: "Balance",
      render: (row) => `${accountingMoney(row.running_balance)} ${row.balance_side}`,
    },
  ];

  return (
    <ERPPageShell
      eyebrow="Accounting · HR"
      title="Staff Ledger"
      subtitle="The staff ledger gives a single payable-receivable view across salary accruals, salary payments, reimbursement accruals, and reimbursement payments while leaving payroll and accounting source records intact."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Staff Ledger" },
      ]}
      actions={[
        { href: ROUTES.admin.accountingStaff, label: "Staff Register", variant: "secondary" },
        { href: ROUTES.admin.accountingSalary, label: "Salary Register", variant: "secondary" },
        { href: ROUTES.admin.accountingExpenseClaims, label: "Expense Claims", variant: "primary" },
      ]}
      stats={[
        { label: "Ledger Rows", value: String(report?.rows.length ?? 0), tone: "info" },
        { label: "Staff Balances", value: String(report?.employees.length ?? 0), tone: "default" },
        {
          label: "Scoped Employee",
          value: selectedEmployeeId
            ? employees.find((employee) => String(employee.id) === selectedEmployeeId)?.employee_code || "—"
            : "All",
          tone: "warning",
        },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <ERPDataToolbar
          left={
            <label className="max-w-sm text-sm text-muted-foreground">
              Staff filter
              <select
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                value={selectedEmployeeId}
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
              >
                <option value="">All staff</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employee_code} · {employee.name}
                  </option>
                ))}
              </select>
            </label>
          }
          right={
            <>
              <button
                type="button"
                onClick={() => void loadPage("refresh", selectedEmployeeId)}
                className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                disabled={loading || refreshing}
              >
                Apply Filter
              </button>
              {selectedEmployeeId ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEmployeeId("");
                    void loadPage("refresh", "");
                  }}
                  className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                  disabled={loading || refreshing}
                >
                  Clear Filter
                </button>
              ) : null}
              <AccountingRefreshButton
                loading={loading}
                refreshing={refreshing}
                onClick={() => void loadPage()}
              />
            </>
          }
        />

        {error ? <AccountingNotice tone="danger" message={error} /> : null}

        <ERPSectionShell
          title="Closing Balances"
          description="Positive balances are staff payables from the business. Negative balances surface receivable posture from the staff side."
        >
          {report && report.employees.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {report.employees.map((employee) => (
                <div
                  key={employee.employee_id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="text-sm font-semibold text-foreground">
                    {employee.employee_code} · {employee.employee_name}
                  </div>
                  <div className="mt-2 text-xl font-semibold text-foreground">
                    {accountingMoney(employee.closing_balance)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {employee.balance_side}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ERPEmptyState
              title="No closing balances yet"
              description="No salary or reimbursement ledger rows are available for the selected scope yet."
            />
          )}
        </ERPSectionShell>

        <ERPSectionShell
          title="Ledger Entries"
          description="The ledger is derived from posted salary and reimbursement source events. It is not a manual journal substitute."
        >
          <EnterpriseDataTable
            data={report?.rows ?? []}
            columns={columns}
            loading={loading}
            error={error}
            onRetry={() => void loadPage()}
            emptyTitle="No staff ledger rows"
            emptyDescription="Posted salary or reimbursement activity will appear here."
          />
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
