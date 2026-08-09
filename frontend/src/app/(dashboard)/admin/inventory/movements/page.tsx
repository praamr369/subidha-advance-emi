"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";

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
import type { StockLedgerRow, StockLedgerMovementsResponse, StockLocation } from "@/services/inventory";
import { listInventoryMovements, listStockLocations } from "@/services/inventory";

const MOVEMENT_TYPES = [
  "OPENING_BALANCE_IN",
  "PURCHASE_IN",
  "SALE_OUT",
  "EMI_DELIVERY_OUT",
  "EMI_RETURN_IN",
  "CUSTOMER_RETURN",
  "SALE_RETURN_IN",
  "PRODUCTION_ISSUE_OUT",
  "PRODUCTION_RETURN_IN",
  "PRODUCTION_RECEIPT_IN",
  "PURCHASE_RETURN_OUT",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
];

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
  const [response, setResponse] = useState<StockLedgerMovementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [referenceSearch, setReferenceSearch] = useState("");
  const [selectedMovementTypes, setSelectedMovementTypes] = useState<string[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(1);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 350);
  const debouncedReferenceSearch = useDebounce(referenceSearch, 350);

  // Load locations on mount
  useEffect(() => {
    let cancelled = false;

    async function loadLocations() {
      setLocationsLoading(true);
      try {
        const result = await listStockLocations({ is_active: true });
        if (cancelled) return;
        setLocations(result.results || []);
      } catch (err) {
        if (!cancelled) console.error("Failed to load stock locations:", err);
      } finally {
        if (!cancelled) setLocationsLoading(false);
      }
    }

    void loadLocations();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load movements data
  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      try {
        const payload = await listInventoryMovements({
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          search: debouncedSearch || undefined,
          reference_search: debouncedReferenceSearch || undefined,
          movement_type: selectedMovementTypes.length > 0 ? selectedMovementTypes.join(",") : undefined,
          location_id: locationId || undefined,
          page: pageIndex,
          page_size: 50,
        });
        if (cancelled) return;
        setResponse(payload);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setResponse(null);
        setError(accountingErrorMessage(err, "Failed to load inventory movements."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, debouncedSearch, debouncedReferenceSearch, selectedMovementTypes, locationId, pageIndex]);

  const handleMovementTypeToggle = (type: string) => {
    setSelectedMovementTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    setPageIndex(1);
  };

  const rows = response?.results ?? [];

  return (
    <ERPPageShell
      eyebrow="Inventory Movement Control"
      title="Inventory Movements"
      subtitle="Read-only movement register from the additive stock ledger, covering purchase intake, sale outflow, returns, and approved adjustments."
      helperNote="Inventory movements are ledger-backed operational facts. They remain separate from billing document review and from stock valuation summaries."
      helperTone="info"
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
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Page Rows", value: loading ? "—" : rows.length, tone: "info" },
        { label: "Total Quantity In", value: loading ? "—" : response?.total_in || "0", tone: "success" },
        { label: "Total Quantity Out", value: loading ? "—" : response?.total_out || "0", tone: "default" },
      ]}
    >
      <WorkspaceDirectory
        title="Inventory route map"
        description="Use the shared inventory directory to move between movement review, ledger inspection, adjustments, master control, and valuation."
        groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
      />

      <ERPSectionShell
        title="Date & Reference Filters"
        description="Filter inventory movements by date range and search for specific products or references."
      >
        <div className="flex flex-col gap-4">
          <AccountingPeriodFilters
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />

          <div className="flex flex-wrap items-center gap-4 p-4 border rounded-md bg-muted/20">
            <div className="flex flex-col gap-1.5 min-w-[240px] flex-1">
              <label className="text-sm font-medium text-foreground">Product Search</label>
              <input
                type="text"
                placeholder="Search by name, SKU, or code..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPageIndex(1);
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5 min-w-[240px] flex-1">
              <label className="text-sm font-medium text-foreground">Reference Search</label>
              <input
                type="text"
                placeholder="Search by invoice, delivery ID..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={referenceSearch}
                onChange={(e) => {
                  setReferenceSearch(e.target.value);
                  setPageIndex(1);
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <label className="text-sm font-medium text-foreground">Location</label>
              <select
                disabled={locationsLoading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={locationId || ""}
                onChange={(e) => {
                  setLocationId(e.target.value ? parseInt(e.target.value) : null);
                  setPageIndex(1);
                }}
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Movement Type Filter"
        description="Select specific movement types to isolate stock flows (e.g., show only SALE_OUT and EMI_DELIVERY_OUT)."
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 border rounded-md bg-muted/20">
          {MOVEMENT_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedMovementTypes.includes(type)}
                onChange={() => handleMovementTypeToggle(type)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm font-medium">{type}</span>
            </label>
          ))}
        </div>
      </ERPSectionShell>

      <ERPSectionShell title="Movement Register" description="Read-only movement register derived from ledger-backed stock events.">
        <div className="space-y-4">
          <EnterpriseDataTable
            data={rows}
            columns={columns}
            loading={loading}
            error={error}
            emptyTitle="No inventory movements found"
            emptyDescription="Post purchase bills, retail invoices, or stock adjustments to populate this register."
          />

          {/* Pagination Controls */}
          {response && response.num_pages > 1 && (
            <div className="flex items-center justify-between gap-4 p-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {Math.min((pageIndex - 1) * 50 + 1, response.count)} to{" "}
                {Math.min(pageIndex * 50, response.count)} of {response.count} movements
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPageIndex(Math.max(1, pageIndex - 1))}
                  disabled={pageIndex === 1 || loading}
                  className="h-9 px-3 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, response.num_pages) }, (_, i) => {
                    let pageNum: number;
                    if (response.num_pages <= 5) {
                      pageNum = i + 1;
                    } else if (pageIndex <= 3) {
                      pageNum = i + 1;
                    } else if (pageIndex >= response.num_pages - 2) {
                      pageNum = response.num_pages - 4 + i;
                    } else {
                      pageNum = pageIndex - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPageIndex(pageNum)}
                        className={`h-9 px-3 rounded-md text-sm ${
                          pageNum === pageIndex
                            ? "bg-primary text-primary-foreground"
                            : "border border-input bg-background hover:bg-muted"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setPageIndex(Math.min(response.num_pages, pageIndex + 1))}
                  disabled={pageIndex === response.num_pages || loading}
                  className="h-9 px-3 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
