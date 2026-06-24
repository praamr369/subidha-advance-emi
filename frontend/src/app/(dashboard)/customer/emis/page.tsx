"use client";
import { formatRupee } from "@/lib/utils/currency";
import { RefreshCw, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ERPAuditNote,
  ERPDataToolbar,
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPSectionShell,
  ERPStatusBadge,
} from "@/components/erp";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import { DataTableShell, MobileSafeTable } from "@/components/ui/operations";
import {
  listCustomerSubscriptions,
  type CustomerSubscription,
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

function statusVariant(emi: CustomerEmi): "success" | "warning" | "info" | "error" | "default" {
  const status = emiStatus(emi);
  switch (status) {
    case "PAID":
      return "success";
    case "WAIVED":
      return "info";
    case "OVERDUE":
      return "error";
    case "PENDING":
      return "warning";
    default:
      return "default";
  }
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
    loadData();
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
      label: "Subscription",
      render: (row) => row.subscription_number || "—",
    },
    {
      key: "sequence_no",
      label: "EMI #",
      render: (row) => row.sequence_no || row.month_no || "—",
    },
    {
      key: "due_date",
      label: "Due Date",
      render: (row) => formatDate(row.due_date),
    },
    {
      key: "amount",
      label: "Amount",
      render: (row) => formatRupee(row.amount),
    },
    {
      key: "paid_amount",
      label: "Paid",
      render: (row) => formatRupee(row.paid_amount || 0),
    },
    {
      key: "waived_amount",
      label: "Waived",
      render: (row) => formatRupee(row.waived_amount || 0),
    },
    {
      key: "outstanding",
      label: "Outstanding",
      render: (row) => formatRupee(row.outstanding_amount || 0),
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <ERPStatusBadge
          status={emiStatus(row)}
          variant={statusVariant(row)}
        />
      ),
    },
  ];

  return (
    <ERPPageShell title="EMI Schedule">
      <div className="space-y-6">
        {/* EMI Summary Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <ERPSectionShell>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Total EMIs</p>
              <p className="text-2xl font-semibold">{stats.total}</p>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2 flex items-start gap-2">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm text-muted-foreground">Paid</p>
                <p className="text-2xl font-semibold">{stats.paid}</p>
              </div>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2 flex items-start gap-2">
              <Clock className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-semibold">{formatRupee(stats.totalPending)}</p>
              </div>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-semibold">{stats.overdue}</p>
              </div>
            </div>
          </ERPSectionShell>

          <ERPSectionShell>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Waived</p>
              <p className="text-2xl font-semibold">{formatRupee(stats.totalWaived)}</p>
            </div>
          </ERPSectionShell>
        </div>

        {/* EMI Table */}
        <ERPSectionShell>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">EMI Details</h3>
              <p className="text-sm text-muted-foreground">
                Complete schedule of your monthly EMI payments
              </p>
            </div>

            {/* Status Filters */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  statusFilter === "all"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All ({stats.total})
              </button>
              <button
                onClick={() => setStatusFilter("pending")}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  statusFilter === "pending"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Pending ({stats.pending})
              </button>
              <button
                onClick={() => setStatusFilter("paid")}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  statusFilter === "paid"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Paid ({stats.paid})
              </button>
              <button
                onClick={() => setStatusFilter("waived")}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  statusFilter === "waived"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Waived ({stats.waived})
              </button>
              <button
                onClick={() => setStatusFilter("overdue")}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  statusFilter === "overdue"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Overdue ({stats.overdue})
              </button>
            </div>

            {loading ? (
              <ERPLoadingState message="Loading EMI schedule..." />
            ) : error ? (
              <ERPErrorState
                message={error}
                action={
                  <ActionButton onClick={loadData} icon={RefreshCw} label="Retry" />
                }
              />
            ) : filteredEmis.length === 0 ? (
              <ERPEmptyState message="No EMIs found for the selected filter." />
            ) : (
              <>
                <ERPDataToolbar
                  total={stats.total}
                  showing={filteredEmis.length}
                  onRefresh={loadData}
                />
                <DataTableShell>
                  <MobileSafeTable>
                    <DataTable<EmiRecord>
                      columns={emiColumns}
                      rows={filteredEmis}
                      keyExtractor={(row) => `emi-${row.subscription}-${row.id}`}
                    />
                  </MobileSafeTable>
                </DataTableShell>
              </>
            )}
          </div>
        </ERPSectionShell>

        {/* Info Section */}
        <ERPAuditNote
          icon="info"
          title="EMI Status Guide"
          description="Pending: Payment due in future. Overdue: Payment past due date. Paid: Payment received. Waived: EMI amount waived through lucky draw win."
        />
      </div>
    </ERPPageShell>
  );
}
