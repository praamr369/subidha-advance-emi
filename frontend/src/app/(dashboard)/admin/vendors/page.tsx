"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import Link from "next/link";

import { listVendors } from "@/services/vendors";

type VendorLite = {
  id: number;
  display_name?: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  status?: string;
  is_active?: boolean;
};

export default function AdminVendorsPage() {
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const payload = (await listVendors()) as { results?: VendorLite[] } | VendorLite[];
        if (!active) return;
        setVendors(Array.isArray(payload) ? payload : payload.results || []);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(accountingErrorMessage(err, "Failed to load vendors."));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const columns: EnterpriseColumnDef<VendorLite>[] = [
    { key: "name", header: "Vendor", render: (row) => <Link href={`${ROUTES.admin.vendors}/${row.id}`}>{row.display_name || row.name}</Link> },
    { key: "phone", header: "Phone" },
    { key: "email", header: "Email" },
    { key: "gstin", header: "GSTIN" },
    { key: "status", header: "Status", render: (row) => row.status || (row.is_active ? "ACTIVE" : "INACTIVE") },
  ];

  return (
    <PortalPage
      title="Vendors"
      subtitle="Internal supplier master for purchase and payable workflows."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendors" }]}
      actions={[
        { href: ROUTES.admin.purchases, label: "Purchases", variant: "primary" },
        { href: ROUTES.admin.accountingVendors, label: "Accounting Vendor Control", variant: "secondary" },
      ]}
      stats={[{ label: "Vendors", value: String(vendors.length), tone: "info" }]}
    >
      <WorkspaceSection title="Vendor Register" description="This list is additive to accounting vendor master and does not affect customer billing flows.">
        <EnterpriseDataTable
          data={vendors}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No vendors found"
          emptyDescription="Create vendors from Accounting > Vendors."
        />
      </WorkspaceSection>
    </PortalPage>
  );
}
