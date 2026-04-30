"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import { listVendorBills, type VendorBill } from "@/services/inventory";

export default function AdminPurchaseBillsPage() {
  const [rows, setRows] = useState<VendorBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const payload = await listVendorBills();
        if (!active) return;
        setRows(payload.results);
      } catch (err) {
        if (!active) return;
        setError(accountingErrorMessage(err, "Failed to load vendor bills."));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  const columns: EnterpriseColumnDef<VendorBill>[] = [
    { key: "bill_no", header: "Bill No" },
    { key: "bill_date", header: "Date" },
    { key: "vendor_name", header: "Vendor" },
    { key: "status", header: "Status" },
    { key: "grand_total", header: "Total" },
  ];
  return (
    <PortalPage
      title="Vendor Bills"
      subtitle="Post vendor bills through accounting mapping to payable, inventory/expense, and GST accounts."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Bills" },
      ]}
    >
      <WorkspaceSection title="Bills" description="Posting uses system account mappings and does not bypass finance controls.">
        <EnterpriseDataTable data={rows} columns={columns} loading={loading} error={error} />
      </WorkspaceSection>
    </PortalPage>
  );
}
