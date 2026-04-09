"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
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
import { listInventoryMovements } from "@/services/inventory";

function buildBillingMovementHref(row: StockLedgerRow): string | null {
  if (row.reference_model !== "BillingInvoiceLine") {
    return null;
  }
  const [invoiceId] = String(row.reference_id || "").split(":");
  return invoiceId ? buildAdminBillingDocumentRoute(invoiceId) : null;
}

const columns: EnterpriseColumnDef<StockLedgerRow>[] = [
  { key: "movement_date", header: "Date", render: (row) => accountingDate(row.movement_date) },
  { key: "product_code", header: "Product" },
  { key: "product_name", header: "Item" },
  { key: "stock_location_name", header: "Location", render: (row) => row.stock_location_name || "Default" },
  { key: "movement_type", header: "Movement" },
  { key: "quantity_in", header: "Qty In" },
  { key: "quantity_out", header: "Qty Out" },
  {
    key: "reference_model",
    header: "Reference",
    render: (row) => {
      const href = buildBillingMovementHref(row);
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

export default function InventoryMovementsPage() {
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
        const payload = await listInventoryMovements({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        });
        if (cancelled) return;
        setRows(payload.results);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setError(accountingErrorMessage(err, "Failed to load inventory movements."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [endDate, startDate]);

  return (
    <PortalPage
      title="Inventory Movements"
      subtitle="Read-only movement register from the additive stock ledger, covering purchase intake, sale outflow, returns, and approved adjustments."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Movements" },
      ]}
      actions={[
        { href: ROUTES.admin.inventoryLedger, label: "Stock Ledger", variant: "secondary" },
        { href: ROUTES.admin.inventoryValuation, label: "Valuation", variant: "secondary" },
        { href: ROUTES.admin.billingRegister, label: "Billing Register", variant: "secondary" },
        { href: ROUTES.admin.billingDirectSales, label: "Direct Sales", variant: "secondary" },
      ]}
    >
      <WorkspaceSection
        title="Filters"
        description="Filter inventory movements by movement date."
      >
        <AccountingPeriodFilters
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </WorkspaceSection>

      <EnterpriseDataTable
        data={rows}
        columns={columns}
        loading={loading}
        error={error}
        emptyTitle="No inventory movements found"
        emptyDescription="Post purchase bills, retail invoices, or stock adjustments to populate this register."
      />
    </PortalPage>
  );
}
