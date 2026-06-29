"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { accountingDate, accountingErrorMessage, accountingMoney } from "@/components/accounting/shared";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  listAdminVendorPurchaseReturnRegister,
  type AdminVendorPurchaseReturn,
} from "@/services/vendor-ops";
import { listVendors, type Vendor } from "@/services/vendors";

export default function AdminVendorReturnsPage() {
  const [rows, setRows] = useState<AdminVendorPurchaseReturn[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [returnPayload, vendorPayload] = await Promise.all([
        listAdminVendorPurchaseReturnRegister({
          vendor: vendorId ? Number(vendorId) : undefined,
          status: status || undefined,
        }),
        listVendors({ page_size: 200 }),
      ]);
      setRows(returnPayload.results);
      setVendors(Array.isArray(vendorPayload) ? vendorPayload : vendorPayload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load vendor purchase returns."));
    } finally {
      setLoading(false);
    }
  }, [status, vendorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const postedTotal = useMemo(
    () => rows.filter((row) => row.status === "POSTED").reduce((sum, row) => sum + Number(row.grand_total || 0), 0),
    [rows]
  );

  const columns: EnterpriseColumnDef<AdminVendorPurchaseReturn>[] = [
    { key: "return_date", header: "Date", render: (row) => accountingDate(row.return_date) },
    { key: "return_no", header: "Return" },
    { key: "vendor_name", header: "Vendor" },
    { key: "purchase_bill_no", header: "Purchase Bill" },
    { key: "reason", header: "Reason" },
    { key: "grand_total", header: "Value", render: (row) => accountingMoney(row.grand_total) },
    { key: "status", header: "Status", render: (row) => <ERPStatusBadge status={row.status} /> },
  ];

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor Returns"
      subtitle="Global vendor-side purchase return register backed by persisted return and journal records."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Vendor Returns" },
      ]}
      actions={[
        { href: ROUTES.admin.purchaseBills, label: "Purchase Bills", variant: "secondary" },
        { href: ROUTES.admin.vendors, label: "Vendor Register", variant: "primary" },
      ]}
      stats={[
        { label: "Returns", value: rows.length, tone: "info" },
        { label: "Posted", value: rows.filter((row) => row.status === "POSTED").length, tone: "success" },
        { label: "Posted value", value: accountingMoney(postedTotal), tone: "warning" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <WorkspaceSection
        title="Purchase return register"
        description="Read-only register. Return creation and posting remain controlled from the purchase-bill reversal workflow."
      >
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={() => void load()}
          emptyTitle="No vendor returns"
          emptyDescription="No purchase returns match the selected filters."
          toolbar={
            <div className="flex flex-wrap gap-2">
              <select className="h-10 rounded-xl border border-border bg-background px-3 text-sm" value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
                <option value="">All vendors</option>
                {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.display_name || vendor.name}</option>)}
              </select>
              <select className="h-10 rounded-xl border border-border bg-background px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="POSTED">Posted</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          }
        />
      </WorkspaceSection>
    </ERPPageShell>
  );
}
