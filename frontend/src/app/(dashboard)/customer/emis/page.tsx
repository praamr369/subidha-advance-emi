"use client";
import { formatRupee } from "@/lib/utils/currency";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ERPAuditNote,
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
  ERPStatusBadge,
} from "@/components/erp";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { DataTableShell, MobileSafeTable } from "@/components/ui/operations";
import {
  listCustomerSubscriptions,
  type CustomerEmi,
} from "@/services/customer";

interface EmiRecord extends CustomerEmi {
  subscription_number?: string;
  product_name?: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load EMI schedule.";
}

function emiStatus(emi: CustomerEmi): "PAID" | "PENDING" | "WAIVED" | "OVERDUE" {
  if (emi.status?.toUpperCase() === "WAIVED") return "WAIVED";
  if (emi.status?.toUpperCase() === "PAID") return "PAID";

  if (emi.due_date) {
    const dueDate = new Date(emi.due_date);
    if (dueDate < new Date() && emi.status?.toUpperCase() !== "PAID") {
      return "OVERDUE";
    }
  }

  return "PENDING";
}

function statusFilterClass(active: boolean, color: string) {
  return `px-3 py-2 rounded-full text-sm font-medium transition touch-manipulation min-h-[2.5rem] ${
    active ? color : "bg-muted/60 text-muted-foreground hover:bg-muted"
  }`;
}

function EmiMobileCard({ emi }: { emi: EmiRecord }) {
  const status = emiStatus(emi);
  const isOverdue = status === "OVERDUE";
  const isPaid = status === "PAID";
  const isWaived = status === "WAIVED";

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm transition ${
        isOverdue
          ? "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
          : isPaid
            ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/50 dark:bg-emerald-950/20"
            : isWaived
              ? "border-blue-200 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-950/20"
              : "border-border bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              EMI #{emi.sequence_no ?? emi.month_no ?? "—"}
            </span>
            {emi.subscription_number ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {emi.subscription_number}
              </span>
            ) : null}
          </div>
          {emi.product_name ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{emi.product_name}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">Due {formatDate(emi.due_date)}</p>
        </div>
        <ERPStatusBadge status={status} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Amount</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{formatRupee(emi.amount)}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Paid</p>
          <p className="mt-0.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {formatRupee(emi.paid_amount || 0)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Due</p>
          <p
            className={`mt-0.5 text-sm font-semibold ${
              Number(emi.outstanding_amount ?? 0) > 0
                ? isOverdue
                  ? "text-red-700 dark:text-red-400"
                  : "text-amber-700 dark:text-amber-400"
                : "text-foreground"
            }`}
          >
            {formatRupee(emi.outstanding_amount || 0)}
          </p>
        </div>
      </div>

      {Number(emi.waived_amount ?? 0) > 0 ? (
        <div className="mt-2 rounded-xl bg-blue-50 px-3 py-1.5 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
          Waived {formatRupee(emi.waived_amount || 0)}
        </div>
      ) : null}
    </div>
  );
}

export default function CustomerEmisPage() {
  const [allEmis, setAllEmis] = useState<EmiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const subscriptions = await listCustomerSubscriptions();
      const emis: EmiRecord[] = [];

      subscriptions.results?.forEach((sub) => {
        sub.emis?.forEach((emi) => {
          emis.push({
            ...emi,
            subscription_number: sub.subscription_number,
            product_name: sub.product_name,
          });
        });
      });

      setAllEmis(emis.sort((a, b) => {
        const dateA = a.due_date ? new Date(a.due_date).getTime() : 0;
        const dateB = b.due_date ? new Date(b.due_date).getTime() : 0;
        return dateA - dateB;
      }));
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredEmis = useMemo(() => {
    if (statusFilter === "all") return allEmis;
    return allEmis.filter((emi) => emiStatus(emi).toLowerCase() === statusFilter.toLowerCase());
  }, [allEmis, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: allEmis.length,
      paid: allEmis.filter((e) => emiStatus(e) === "PAID").length,
      pending: allEmis.filter((e) => emiStatus(e) === "PENDING").length,
      overdue: allEmis.filter((e) => emiStatus(e) === "OVERDUE").length,
      waived: allEmis.filter((e) => emiStatus(e) === "WAIVED").length,
      totalPending: allEmis
        .filter((e) => emiStatus(e) === "PENDING")
        .reduce((sum, e) => sum + (typeof e.amount === "string" ? parseFloat(e.amount) : 0), 0),
      totalWaived: allEmis
        .filter((e) => emiStatus(e) === "WAIVED")
        .reduce((sum, e) => sum + (typeof e.waived_amount === "string" ? parseFloat(e.waived_amount) : 0), 0),
    };
  }, [allEmis]);

  const emiColumns: Column<EmiRecord>[] = [
    {
      key: "subscription_number",
      title: "Subscription",
      render: (row) => (
        <div>
          <div className="font-medium">{row.subscription_number || "—"}</div>
          {row.product_name ? (
            <div className="text-xs text-muted-foreground">{row.product_name}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "sequence_no",
      title: "EMI #",
      render: (row) => row.sequence_no ?? row.month_no ?? "—",
    },
    {
      key: "due_date",
      title: "Due Date",
      render: (row) => formatDate(row.due_date),
    },
    {
      key: "amount",
      title: "Amount",
      align: "right",
      render: (row) => formatRupee(row.amount),
    },
    {
      key: "paid_amount",
      title: "Paid",
      align: "right",
      render: (row) => formatRupee(row.paid_amount || 0),
    },
    {
      key: "waived_amount",
      title: "Waived",
      align: "right",
      render: (row) => formatRupee(row.waived_amount || 0),
    },
    {
      key: "outstanding",
      title: "Outstanding",
      align: "right",
      render: (row) => formatRupee(row.outstanding_amount || 0),
    },
    {
      key: "status",
      title: "Status",
      render: (row) => <ERPStatusBadge status={emiStatus(row)} />,
    },
  ];

  const statTiles = [
    {
      label: "Total EMIs",
      value: stats.total,
      icon: null,
      color: "text-foreground",
    },
    {
      label: "Paid",
      value: stats.paid,
      icon: <CheckCircle className="h-4 w-4 text-emerald-600" />,
      color: "text-emerald-700 dark:text-emerald-400",
    },
    {
      label: "Pending",
      value: formatRupee(stats.totalPending),
      icon: <Clock className="h-4 w-4 text-amber-600" />,
      color: "text-amber-700 dark:text-amber-400",
    },
    {
      label: "Overdue",
      value: stats.overdue,
      icon: <AlertCircle className="h-4 w-4 text-red-600" />,
      color: stats.overdue > 0 ? "text-red-700 dark:text-red-400" : "text-foreground",
    },
    {
      label: "Waived",
      value: formatRupee(stats.totalWaived),
      icon: null,
      color: "text-blue-700 dark:text-blue-400",
    },
  ];

  return (
    <ERPPageShell
      title="EMI Schedule"
      subtitle="Your complete advance EMI payment schedule across all subscriptions."
      breadcrumbs={[{ label: "Dashboard", href: "/customer" }, { label: "EMI Schedule" }]}
    >
      <div className="space-y-5">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {statTiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                {tile.icon}
                <p className="text-xs font-medium text-muted-foreground">{tile.label}</p>
              </div>
              <p className={`mt-2 text-xl font-semibold ${tile.color}`}>{tile.value}</p>
            </div>
          ))}
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={statusFilterClass(statusFilter === "all", "bg-primary/10 text-primary font-semibold")}
          >
            All ({stats.total})
          </button>
          <button
            onClick={() => setStatusFilter("pending")}
            className={statusFilterClass(statusFilter === "pending", "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 font-semibold")}
          >
            Pending ({stats.pending})
          </button>
          <button
            onClick={() => setStatusFilter("paid")}
            className={statusFilterClass(statusFilter === "paid", "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 font-semibold")}
          >
            Paid ({stats.paid})
          </button>
          <button
            onClick={() => setStatusFilter("waived")}
            className={statusFilterClass(statusFilter === "waived", "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 font-semibold")}
          >
            Waived ({stats.waived})
          </button>
          <button
            onClick={() => setStatusFilter("overdue")}
            className={statusFilterClass(statusFilter === "overdue", "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 font-semibold")}
          >
            Overdue ({stats.overdue})
          </button>
        </div>

        {loading ? <ERPLoadingState label="Loading EMI schedule..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load EMIs" message={error} onRetry={() => void loadData()} />
        ) : null}
        {!loading && !error && filteredEmis.length === 0 ? (
          <ERPEmptyState title="No EMIs" description="No EMIs found for the selected filter." />
        ) : null}

        {!loading && !error && filteredEmis.length > 0 ? (
          <>
            {/* Mobile card view */}
            <div className="grid gap-3 md:hidden">
              {filteredEmis.map((emi, i) => (
                <EmiMobileCard key={`${emi.id ?? i}`} emi={emi} />
              ))}
            </div>

            {/* Desktop table view */}
            <ERPSectionShell className="hidden md:block">
              <div className="mb-3">
                <h3 className="text-base font-semibold">EMI Details</h3>
                <p className="text-sm text-muted-foreground">
                  Complete schedule of your monthly EMI payments
                </p>
              </div>
              <DataTableShell>
                <MobileSafeTable>
                  <DataTable<EmiRecord> columns={emiColumns} rows={filteredEmis} />
                </MobileSafeTable>
              </DataTableShell>
            </ERPSectionShell>
          </>
        ) : null}

        <ERPAuditNote title="EMI Status Guide">
          Pending: Payment due in future. Overdue: Payment past due date. Paid:
          Payment received. Waived: EMI amount waived through lucky draw win.
        </ERPAuditNote>
      </div>
    </ERPPageShell>
  );
}
