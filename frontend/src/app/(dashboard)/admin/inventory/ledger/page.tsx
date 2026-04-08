"use client";

import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import {
  accountingDate,
  accountingErrorMessage,
  AccountingPeriodFilters,
} from "@/components/accounting/shared";
import type { StockLedgerRow } from "@/services/inventory";
import { listStockLedger } from "@/services/inventory";

const columns: EnterpriseColumnDef<StockLedgerRow>[] = [
  { key: "movement_date", header: "Date", render: (row) => accountingDate(row.movement_date) },
  { key: "product_code", header: "Product" },
  { key: "movement_type", header: "Movement" },
  { key: "quantity_in", header: "Qty In" },
  { key: "quantity_out", header: "Qty Out" },
  { key: "reference_model", header: "Reference" },
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
      title="Stock Ledger"
      subtitle="Actual stock movements from approved operational documents and adjustments."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Ledger" },
      ]}
    >
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

