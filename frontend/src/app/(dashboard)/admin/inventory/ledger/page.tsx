"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
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
  if (row.reference_model === "BillingInvoiceLine") {
    const [invoiceId] = String(row.reference_id || "").split(":");
    return invoiceId ? buildAdminBillingDocumentRoute(invoiceId) : null;
  }
  if (
    row.reference_model === "DirectSaleReturnLine" ||
    row.reference_model === "DirectSaleExchangeReplacement" ||
    row.reference_model === "PurchaseReturnLine"
  ) {
    return `${ROUTES.admin.billingReversals}?reference=${encodeURIComponent(row.reference_id.split(":")[0] || row.reference_id)}`;
  }
  return null;
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
  const [sourceFilter, setSourceFilter] = useState("");
  const [sourceId, setSourceId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadPage() {
      setLoading(true);
      try {
        const payload = await listStockLedger({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          ...(sourceFilter && sourceId ? { [sourceFilter]: sourceId } : {}),
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
  }, [startDate, endDate, sourceFilter, sourceId]);

  return (
    <ERPPageShell
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
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Ledger Entries", value: loading ? "—" : rows.length, tone: "info" },
        { label: "Total In", value: loading ? "—" : rows.reduce((s, r) => s + Number(r.quantity_in || 0), 0), tone: "success" },
        { label: "Total Out", value: loading ? "—" : rows.reduce((s, r) => s + Number(r.quantity_out || 0), 0), tone: "default" },
      ]}
    >
      <WorkspaceDirectory
        title="Inventory route map"
        description="Use the inventory directory to move between ledger review, movements, adjustments, live stock, and valuation controls."
        groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
      />

      <ERPSectionShell title="Filters" description="Filter the stock ledger by posting date and optional source document.">
        <AccountingPeriodFilters
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
        <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
          <select
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
          >
            <option value="">All sources</option>
            <option value="direct_sale">Direct Sale</option>
            <option value="direct_sale_return">Direct Sale Return</option>
            <option value="exchange">Exchange</option>
            <option value="purchase_return">Purchase Return</option>
            <option value="credit_note">Credit Note</option>
          </select>
          <input
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            placeholder="Source document ID"
          />
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Ledger Register"
        description="Read-only register. Posting and reversal actions remain in their respective controlled workflows."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.admin.billingRegister} className="workspace-pill px-3 py-1.5 text-xs font-semibold">
              Billing Register
            </Link>
            <Link href={ROUTES.admin.billingDirectSales} className="workspace-pill px-3 py-1.5 text-xs font-semibold">
              Direct Sales
            </Link>
          </div>
        }
      >
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No stock ledger rows found"
          emptyDescription="Post stock adjustments, purchase bills, or retail notes to populate the ledger."
        />
      </ERPSectionShell>
    </ERPPageShell>
  );
}
