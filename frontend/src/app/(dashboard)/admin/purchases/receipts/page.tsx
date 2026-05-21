"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import { listGoodsReceipts, type GoodsReceipt } from "@/services/inventory";

export default function AdminPurchaseReceiptsPage() {
  const [rows, setRows] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const payload = await listGoodsReceipts();
        if (!active) return;
        setRows(payload.results);
      } catch (err) {
        if (!active) return;
        setError(accountingErrorMessage(err, "Failed to load goods receipts."));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);
  const columns: EnterpriseColumnDef<GoodsReceipt>[] = [
    { key: "receipt_no", header: "Receipt No" },
    { key: "receipt_date", header: "Date" },
    { key: "purchase_order_no", header: "PO No" },
    { key: "vendor_name", header: "Vendor" },
    { key: "status", header: "Status" },
  ];
  return (
    <ERPPageShell
      title="Goods Receipts"
      subtitle="Receiving goods creates stock ledger IN entries and updates availability."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Receipts" },
      ]}
    >
      <ERPSectionShell title="Receipts" description="Post receipts only after physical verification.">
        {loading ? <ERPLoadingState label="Loading goods receipts..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load receipts" description={error} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No goods receipts" description="No goods receipts are available yet." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <EnterpriseDataTable data={rows} columns={columns} loading={false} error={null} />
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
