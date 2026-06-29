"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { listVendorBills, type VendorBill } from "@/services/inventory";

export default function AdminVendorPayablesPage() {
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listVendorBills({ page_size: 200 });
      setBills(payload.results);
      setError(null);
    } catch (err) {
      setBills([]);
      setError(accountingErrorMessage(err, "Failed to load vendor payables."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => bills.filter((bill) => bill.status !== "CANCELLED"),
    [bills]
  );
  const postedOutstanding = rows
    .filter((bill) => bill.status === "POSTED")
    .reduce((total, bill) => total + Number(bill.outstanding_amount || 0), 0);

  const columns: EnterpriseColumnDef<VendorBill>[] = [
    { key: "bill_no", header: "Bill No" },
    { key: "vendor_name", header: "Vendor" },
    { key: "grand_total", header: "Bill Total", render: (row) => accountingMoney(row.grand_total) },
    {
      key: "posted_paid_amount",
      header: "Posted Paid",
      render: (row) => accountingMoney(row.posted_paid_amount),
    },
    {
      key: "outstanding_amount",
      header: "Outstanding",
      render: (row) => accountingMoney(row.outstanding_amount),
    },
    { key: "status", header: "Status", render: (row) => <ERPStatusBadge status={row.status} /> },
  ];

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor Payables"
      subtitle="Bill-level payable balances calculated by the backend from posted vendor payments."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Vendor Payables" },
      ]}
      actions={[
        { href: ROUTES.admin.purchaseVendorPayments, label: "Vendor Payments", variant: "primary" },
        { href: ROUTES.admin.accountingVendorSettlements, label: "Accounting Settlements", variant: "secondary" },
      ]}
      stats={[
        { label: "Bills", value: rows.length, tone: "info" },
        { label: "Posted outstanding", value: accountingMoney(postedOutstanding), tone: "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <WorkspaceSection
        title="Vendor payable source"
        description="Each bill subtracts only payments posted against that bill. Unallocated vendor payments are not falsely distributed across every bill."
      >
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          emptyTitle="No payable rows"
          emptyDescription="Enter and post vendor bills to create vendor payable source records."
          toolbar={
            <Link className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted" href={ROUTES.admin.purchaseVendorPayments}>
              Record payment
            </Link>
          }
        />
      </WorkspaceSection>
    </ERPPageShell>
  );
}
