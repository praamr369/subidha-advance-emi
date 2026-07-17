"use client";

import { type ReceivableWorkbench, type WorkbenchScheduleRow } from "@/services/receivables";
import { type Column } from "@/components/ui/DataTable";
import {
  WorkbenchDataGrid,
  MoneyCell,
  StatusBadge,
  LoadingState,
  ErrorState,
} from "@/components/admin-workbench";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function money(val: string | number): string {
  if (!val) return "₹0.00";
  return `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

export default function ReceivableWorkbenchPanel({
  workbench,
  loading,
  error,
  onSelectOtherDue,
}: {
  workbench: ReceivableWorkbench | null;
  loading: boolean;
  error: string | null;
  onSelectOtherDue?: (sourceType: string, sourceId: number) => void;
}) {
  if (loading) {
    return <LoadingState label="Loading full customer position — contract, dues, and payment history…" />;
  }
  if (error) {
    return <ErrorState title="Could not load the full customer position" description={error} />;
  }
  if (!workbench) return null;

  const { contract, customer, schedule, other_dues } = workbench;

  const columns: Column<WorkbenchScheduleRow & { id?: string }>[] = [
    {
      key: "period_label",
      title: "Period",
      render: (row) => row.period_label,
    },
    {
      key: "due_date",
      title: "Due Date",
      render: (row) => formatDate(row.due_date),
    },
    {
      key: "amount",
      title: "Billed",
      align: "right",
      render: (row) => <MoneyCell value={row.amount} />,
    },
    {
      key: "paid_amount",
      title: "Paid",
      align: "right",
      render: (row) => <MoneyCell value={row.paid_amount} className="text-emerald-700" />,
    },
    {
      key: "outstanding_amount",
      title: "Due",
      align: "right",
      render: (row) =>
        Number(row.outstanding_amount) > 0 ? (
          <MoneyCell value={row.outstanding_amount} className="font-semibold" />
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      title: "Status",
      render: (row) => (
        <StatusBadge status={row.status} isOverdue={row.is_overdue} />
      ),
    },
    {
      key: "payments",
      title: "Payments (Amount · Method · Date)",
      render: (row) =>
        row.payments.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="text-xs text-muted-foreground">
            {row.payments.map((payment) => (
              <div key={payment.payment_id} className="whitespace-nowrap">
                <MoneyCell value={payment.amount} /> · {payment.method} · {formatDate(payment.date)}
                {payment.reference_no ? ` · ${payment.reference_no}` : ""}
              </div>
            ))}
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {customer.name || "Customer"}{" "}
                <span className="font-normal text-muted-foreground">· {contract.reference}</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                {contract.plan_type}
                {contract.product_summary ? ` · ${contract.product_summary}` : ""}
                {contract.tenure_months ? ` · ${contract.tenure_months} months` : ""}
                {contract.monthly_amount ? ` · ${money(contract.monthly_amount)}/month` : ""}
              </p>
            </div>
            {contract.next_due && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-right">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">
                  Next Due — {contract.next_due.label}
                </div>
                <div className="text-sm font-bold text-blue-900">
                  <MoneyCell value={contract.next_due.amount} />{" "}
                  <span className="font-normal text-blue-700">by {formatDate(contract.next_due.due_date)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {[
            { label: "Contract Value", value: contract.contract_value, tone: "text-foreground" },
            { label: "Total Paid", value: contract.total_paid, tone: "text-emerald-700" },
            { label: "Total Outstanding", value: contract.total_outstanding, tone: "text-blue-700" },
            { label: "Overdue", value: contract.overdue_amount, tone: Number(contract.overdue_amount) > 0 ? "text-red-700" : "text-muted-foreground" },
          ].map((stat) => (
            <div key={stat.label} className="bg-card px-6 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{stat.label}</div>
              <MoneyCell value={stat.value} className={`text-lg font-bold ${stat.tone}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-6 py-3">
          <h4 className="text-sm font-semibold text-foreground">Month-wise Schedule &amp; Payment History</h4>
          <p className="text-xs text-muted-foreground">
            Every billed period with what was paid (and how) and what is still due — verify before collecting.
          </p>
        </div>
        <div className="max-h-80 overflow-auto">
          <WorkbenchDataGrid
            columns={columns}
            rows={schedule.map((s) => ({ ...s, id: s.period_label }))}
            emptyText="No schedule rows found for this record."
          />
        </div>
      </div>

      {other_dues.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 shadow-sm">
          <div className="border-b border-amber-200 px-6 py-3">
            <h4 className="text-sm font-semibold text-amber-900">
              Other Open Dues for this Customer ({other_dues.length})
            </h4>
            <p className="text-xs text-amber-800/80">
              This customer also owes on the records below — collect or remind while they are here.
            </p>
          </div>
          <div className="divide-y divide-amber-200/70">
            {other_dues.map((due) => (
              <div key={`${due.source_type}-${due.source_id}`} className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-foreground">{due.reference}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {due.source_type}
                    {due.next_due_date ? ` · next due ${formatDate(due.next_due_date)}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <MoneyCell value={due.due_amount} className="font-semibold text-amber-900" />
                  {onSelectOtherDue && (
                    <button
                      type="button"
                      onClick={() => onSelectOtherDue(due.source_type, due.source_id)}
                      className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      Open
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
