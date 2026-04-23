"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { buildAdminBillingDocumentRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  accountingDate,
  accountingErrorMessage,
  AccountingPeriodFilters,
} from "@/components/accounting/shared";
import type { StockLedgerRow } from "@/services/inventory";
import { listStockLedger } from "@/services/inventory";

function buildBillingLedgerHref(row: StockLedgerRow): string | null {
  if (row.reference_model !== "BillingInvoiceLine") {
    return null;
  }
  const [invoiceId] = String(row.reference_id || "").split(":");
  return invoiceId ? buildAdminBillingDocumentRoute(invoiceId) : null;
}

const columns: EnterpriseColumnDef<StockLedgerRow>[] = [
  { key: "movement_date", header: "Date", render: (row) => accountingDate(row.movement_date) },
  { key: "product_code", header: "Product" },
  { key: "stock_location_name", header: "Location", render: (row) => row.stock_location_name || "Default" },
  { key: "movement_type", header: "Movement" },
  { key: "quantity_in", header: "Qty In" },
  { key: "quantity_out", header: "Qty Out" },
  {
    key: "reference_model",
    header: "Reference",
    render: (row) => {
      const href = buildBillingLedgerHref(row);
      const label = `${row.reference_model} ${row.reference_id}`;
      return href ? (
        <Link href={href} className="text-primary underline-offset-4 hover:underline">
          {label}
        </Link>
      ) : (
        label
      );
    },
  },
  { key: "notes", header: "Notes" },
];

export default function InventoryLedgerPage() {
  const [rows, setRows] = useState<StockLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      setLoading(true);
      try {
        const payload = await listStockLedger({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        });
        if (cancelled) return;
        setRows(payload.results);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setError(accountingErrorMessage(err, "Failed to load stock ledger."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  return (
    <PortalPage
      eyebrow="Inventory Ledger Review"
      title="Stock Ledger"
      subtitle="Actual stock movements from approved operational documents and adjustments."
      helperNote="The stock ledger is the authoritative inventory movement record. It remains distinct from billing documents and from accounting statement surfaces."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Ledger" },
      ]}
    >
      <WorkspaceDirectory
        title="Inventory route map"
        description="Use the inventory directory to move between ledger review, movements, adjustments, live stock, and valuation controls."
        groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
      />

      <WorkspaceSection
        title="Filters"
        description="Filter the stock ledger by posting date."
      >
        <AccountingPeriodFilters
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </WorkspaceSection>

      <div className="mb-4 flex flex-wrap gap-3">
        <Link
          href={ROUTES.admin.billingRegister}
          className="rounded-xl border border-border px-4 py-2 text-sm"
        >
          Billing Register
        </Link>
        <Link
          href={ROUTES.admin.billingDirectSales}
          className="rounded-xl border border-border px-4 py-2 text-sm"
        >
          Direct Sales
        </Link>
      </div>

      <EnterpriseDataTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        emptyTitle="No stock ledger rows found"
        emptyDescription="Post stock adjustments, purchase bills, or retail notes to populate the ledger."
      />
    </PortalPage>
  );
}
