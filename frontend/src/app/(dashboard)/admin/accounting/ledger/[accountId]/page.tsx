"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import {
  AccountingNotice,
  AccountingRefreshButton,
  accountingDate,
  accountingErrorMessage,
  accountingMoney,
  getTransactionBadge,
} from "@/components/accounting/shared";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { buildAdminLedgerStatementPrintRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  getGeneralLedger,
  type GeneralLedgerReport,
  type GeneralLedgerRow,
} from "@/services/accounting";
import { safeDocumentText } from "@/lib/documents/formatters";

export default function AccountingLedgerPage() {
  const params = useParams<{ accountId: string }>();
  const accountId = params?.accountId;
  
  const [report, setReport] = useState<GeneralLedgerReport | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState("");

  const query = useQuery({
    queryKey: ["accounting", "ledger", accountId, dateFrom, dateTo, category],
    queryFn: async () => {
      if (!accountId) return null;
      const reqParams: Record<string, string | number> = {
        account_id: accountId,
        start_date: dateFrom || "",
        end_date: dateTo || "",
      };
      if (category) {
        reqParams.category = category;
      }
      return await getGeneralLedger(reqParams);
    },
    enabled: Boolean(accountId),
  });

  const loading = query.isLoading && query.fetchStatus !== "idle";
  const refreshing = query.isRefetching && !query.isLoading;
  const error = (query.error ? accountingErrorMessage(query.error, "Failed to load ledger statement.") : null) || actionError;

  useEffect(() => {
    if (query.data) {
      setReport(query.data);
      setActionError(null);
    } else if (query.isError && query.error) {
      setReport(null);
    }
  }, [query.data, query.isError, query.error]);

  const loadPage = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const columns: EnterpriseColumnDef<GeneralLedgerRow>[] = [
    {
      key: "entry_date",
      header: "Date",
      render: (row) => accountingDate(row.entry_date),
    },
    { 
      key: "entry_no", 
      header: "Journal",
    },
    { 
      key: "source_type", 
      header: "Category",
      render: (row) => {
        const badge = getTransactionBadge(row.entry_type, row.source_model);
        if (!badge) return row.source_type || "—";
        return (
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.colorClass}`}>
            {badge.label}
          </span>
        );
      },
    },
    { 
      key: "source_reference", 
      header: "Reference",
    },
    { 
      key: "memo", 
      header: "Description",
      render: (row) => safeDocumentText(row.memo || row.description),
    },
    {
      key: "debit_amount",
      header: "In (+)",
      render: (row) => accountingMoney(row.debit_amount),
    },
    {
      key: "credit_amount",
      header: "Out (-)",
      render: (row) => accountingMoney(row.credit_amount),
    },
    {
      key: "running_balance",
      header: "Balance",
      render: (row) => accountingMoney(row.running_balance),
    },
  ];

  return (
    <ERPPageShell
      eyebrow="Accounting"
      title="Ledger Statement"
      subtitle="Interactive ledger view. Filter by date and category to inspect account movements, and print when ready."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Accounting", href: ROUTES.admin.accounting },
        { label: "Books", href: ROUTES.admin.accountingBooks },
        { label: "Ledger" },
      ]}
      actions={
        accountId ? [
          { 
            href: buildAdminLedgerStatementPrintRoute(accountId, { start_date: dateFrom, end_date: dateTo, category }), 
            label: "Print Statement", 
            variant: "primary"
          },
        ] : []
      }
      stats={[
        { label: "Ledger Rows", value: String(report?.rows?.length ?? 0), tone: "info" },
        { label: "Closing Balance", value: report ? accountingMoney(report.closing_balance) : "—", tone: "default" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <ERPDataToolbar
          left={
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm text-muted-foreground">
                From Date
                <input
                  type="date"
                  className="mt-1 block h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </label>
              <label className="text-sm text-muted-foreground">
                To Date
                <input
                  type="date"
                  className="mt-1 block h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </label>
              <label className="text-sm text-muted-foreground">
                Category
                <select
                  className="mt-1 block h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">All Categories</option>
                  <option value="SALARY">Salary / Payroll</option>
                  <option value="EXPENSE">Expense</option>
                  <option value="COMMISSION">Commissions</option>
                  <option value="PURCHASE">Inventory Purchase</option>
                  <option value="MANUAL">Manual Entry</option>
                  <option value="MONEY_MOVEMENT">Money Movement</option>
                  <option value="BILLING">Billing / Invoice</option>
                </select>
              </label>
            </div>
          }
          right={
            <>
              <button
                type="button"
                onClick={() => void loadPage()}
                className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
                disabled={loading || refreshing}
              >
                Apply Filter
              </button>
              {(dateFrom || dateTo || category) ? (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom("");
                    setDateTo("");
                    setCategory("");
                    // We must clear state then refresh, but state updates are batched. 
                    // Simple hack is to just call loadPage and let the next effect cycle pick it up, or wait a tick.
                    setTimeout(() => void loadPage(), 0);
                  }}
                  className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
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
          title={report ? `${report.account.code} · ${report.account.name}` : "Ledger Entries"}
          description="Interactive ledger derived from posted source events."
        >
          <EnterpriseDataTable
            data={report?.rows ?? []}
            columns={columns}
            loading={loading}
            error={error}
            onRetry={() => void loadPage()}
            emptyTitle="No ledger rows"
            emptyDescription="No transactions match the selected filters."
          />
        </ERPSectionShell>
      </div>
    </ERPPageShell>
  );
}
