"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import { listPurchaseOrders, type PurchaseOrder } from "@/services/inventory";

export default function AdminPurchaseOrdersPage() {
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const payload = await listPurchaseOrders();
        if (!active) return;
        setRows(payload.results);
      } catch (err) {
        if (!active) return;
        setError(accountingErrorMessage(err, "Failed to load purchase orders."));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  const columns: EnterpriseColumnDef<PurchaseOrder>[] = [
    { key: "po_no", header: "PO No" },
    { key: "po_date", header: "Date" },
    { key: "vendor_name", header: "Vendor" },
    { key: "status", header: "Status" },
    { key: "notes", header: "Notes" },
  ];
  return (
    <PortalPage
      title="Purchase Orders"
      subtitle="Draft, send, receive, bill, and cancel purchase orders with status controls."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Orders" },
      ]}
    >
      <WorkspaceSection title="Orders" description="Cancellation is allowed only in draft state.">
        <EnterpriseDataTable data={rows} columns={columns} loading={loading} error={error} />
      </WorkspaceSection>
    </PortalPage>
  );
}
