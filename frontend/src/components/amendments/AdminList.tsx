"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ActionButton from "@/components/ui/ActionButton";
import { ProfileToolbar } from "@/components/crm-workbench";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import {
  AMENDMENT_STATUSES,
  amendmentContractTypeLabel,
  amendmentTypeLabel,
  listAdminAmendments,
  type AmendmentRecord,
} from "@/services/amendments";

const STATUS_OPTIONS = [
  { value: "REQUESTED", label: "Requested" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

const CONTRACT_TYPE_OPTIONS = [
  { value: "EMI_SUBSCRIPTION", label: "EMI Subscription" },
  { value: "RENT_LEASE", label: "Rent / Lease" },
];

const STATUS_BADGE: Record<string, string> = {
  REQUESTED: "bg-blue-100 text-blue-800",
  UNDER_REVIEW: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed)
    ? value
    : new Date(parsed).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function sourceLabel(row: AmendmentRecord) {
  return row.contract_type === "RENT_LEASE"
    ? row.rent_lease_contract_number || `Contract #${row.rent_lease_contract ?? "—"}`
    : row.subscription_number || `Subscription #${row.subscription ?? "—"}`;
}

export default function AdminAmendmentList({
  status = "",
  contractType = "",
}: {
  status?: string;
  contractType?: string;
}) {
  const [rows, setRows] = useState<AmendmentRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(status);
  const [typeFilter, setTypeFilter] = useState(contractType);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let allRows = await listAdminAmendments({
        status: statusFilter || undefined,
        contractType: typeFilter || undefined
      });

      if (search) {
        allRows = allRows.filter((row) =>
          row.amendment_no?.toLowerCase().includes(search.toLowerCase()) ||
          row.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
          row.subscription_number?.toLowerCase().includes(search.toLowerCase())
        );
      }

      setRows(allRows);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load amendment register.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, search]);

  useEffect(() => {
    setStatusFilter(status);
    setTypeFilter(contractType);
  }, [status, contractType]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => [
    { label: "Total", value: rows.length, tone: "info" as const },
    { label: "Requested", value: rows.filter((r) => r.status === "REQUESTED").length, tone: "default" as const },
    { label: "Under review", value: rows.filter((r) => r.status === "UNDER_REVIEW").length, tone: "warning" as const },
    { label: "Approved", value: rows.filter((r) => r.status === "APPROVED").length, tone: "success" as const },
    { label: "Rejected", value: rows.filter((r) => r.status === "REJECTED").length, tone: "default" as const },
  ], [rows]);

  const COLUMNS = [
    { accessor: "amendment_no", header: "Amendment", width: 120 },
    { accessor: "customer_name", header: "Customer", width: 160 },
    { accessor: "contract_type", header: "Contract Type", width: 140,
      cell: (val: string) => amendmentContractTypeLabel(val) },
    { accessor: "amendment_type", header: "Amendment Type", width: 140,
      cell: (val: string) => amendmentTypeLabel(val) },
    { accessor: "created_at", header: "Requested", width: 110,
      cell: (val: string) => dateLabel(val) },
    { accessor: "status", header: "Status", width: 130,
      cell: (val: string) => (
        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${STATUS_BADGE[val] || "bg-gray-100 text-gray-800"}`}>
          {val}
        </span>
      )
    },
  ];

  return (
    <ERPPageShell
      title="Contract Amendments"
      subtitle="Admin review register for customer and partner amendment requests."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Contract Amendments" }]}
      stats={stats}
    >
      <div className="space-y-6">
        <AmendmentSafetyNotice />

        <div className="flex flex-wrap gap-2">
          <ActionButton href="/admin/contract-amendments/new" variant="primary">
            Create amendment
          </ActionButton>
          <ActionButton href="/admin/contract-amendments/recontract-report" variant="outline">
            Recontract Report
          </ActionButton>
        </div>

        <ProfileToolbar
          searchValue={search}
          onSearchChange={setSearch}
          onRefresh={load}
          filters={[
            { key: "status", label: "Status", options: STATUS_OPTIONS },
            { key: "type", label: "Contract Type", options: CONTRACT_TYPE_OPTIONS },
          ]}
          filterValues={{ status: statusFilter, type: typeFilter }}
          onFilterChange={(key, value) => {
            if (key === "status") setStatusFilter(value);
            if (key === "type") setTypeFilter(value);
          }}
          onApply={() => {}}
          onReset={() => {
            setSearch("");
            setStatusFilter("");
            setTypeFilter("");
          }}
        />

        {loading && <LoadingBlock label="Loading amendments..." />}

        {error && <ErrorState title="Failed to load amendments" description={error} onRetry={load} />}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.accessor} className="px-3 py-2 font-medium" style={{ width: col.width }}>
                      {col.header}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="px-3 py-4 text-center text-muted-foreground">
                      {search || statusFilter || typeFilter ? "No matching amendments found." : "No amendments."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-t border-border hover:bg-muted/20">
                      {COLUMNS.map((col) => (
                        <td key={`${row.id}-${col.accessor}`} className="px-3 py-2" style={{ width: col.width }}>
                          {col.cell ? (col as any).cell((row as any)[col.accessor], row) : (row as any)[col.accessor]}
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/contract-amendments/${row.id}`}
                          className="text-primary hover:underline text-xs font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
