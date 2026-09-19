"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { accountingDate, accountingErrorMessage, accountingMoney, accountingFieldClassName } from "@/components/accounting/shared";
import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { WorkspaceSection } from "@/components/ui/workspace";
import DrawerShell from "@/components/ui/DrawerShell";
import ConfirmActionButton from "@/components/ui/ConfirmActionButton";
import { ROUTES } from "@/lib/routes";
import {
  listAdminVendorPurchaseReturnRegister,
  createAdminPurchaseReturn,
  postAdminPurchaseReturn,
  type AdminVendorPurchaseReturn,
} from "@/services/vendor-ops";
import { listVendors, type Vendor } from "@/services/vendors";
import { listPurchaseBills, type AccountingPurchaseBill, type AccountingPurchaseBillLine } from "@/services/accounting";
import { listVendorBills, listStockLocations, type StockLocation, type VendorBill, type VendorBillLine } from "@/services/inventory";

export default function AdminVendorReturnsPage() {
  const [rows, setRows] = useState<AdminVendorPurchaseReturn[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [status, setStatus] = useState("");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New return state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [purchaseBills, setPurchaseBills] = useState<any[]>([]);
  const [selectedBillId, setSelectedBillId] = useState<string>("");
  const [returnReason, setReturnReason] = useState("");
  const [returnLines, setReturnLines] = useState<Record<number, string>>({}); // lineId -> quantity string
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [stockLocationId, setStockLocationId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [returnPayload, vendorPayload, billsPayload, vbPayload, locPayload] = await Promise.all([
        listAdminVendorPurchaseReturnRegister({
          vendor: vendorId ? Number(vendorId) : undefined,
          status: status || undefined,
        }),
        listVendors({ page_size: 200 }),
        listPurchaseBills({ status: "POSTED" }),
        listVendorBills({ status: "POSTED" }),
        listStockLocations({ is_active: 1, page_size: 100 })
      ]);
      setRows(returnPayload.results);
      setVendors(Array.isArray(vendorPayload) ? vendorPayload : vendorPayload.results);
      setLocations(Array.isArray(locPayload) ? locPayload : locPayload.results);
      
      const pbills = Array.isArray(billsPayload) ? billsPayload : billsPayload.results;
      const vbills = Array.isArray(vbPayload) ? vbPayload : (vbPayload as any)?.results;
      const combined = [
        ...(pbills || []).map((b: any) => ({ ...b, _isVendor: false, _id: `pb_${b.id}`, lines: b.lines?.map((l: any) => ({ ...l, _item_name: l.item_name, _id: `pb_${l.id}` })) })),
        ...(vbills || []).map((b: any) => ({ ...b, _isVendor: true, _id: `vb_${b.id}`, lines: b.lines?.map((l: any) => ({ ...l, _item_name: l.inventory_item_product_name || l.description, _id: `vb_${l.id}` })) }))
      ];
      setPurchaseBills(combined);
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

  const handleCreateReturn = async () => {
    if (!selectedBillId) return;
    if (!stockLocationId) {
      setCreateError("Please select a source stock location.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    
    try {
      const validLines = Object.entries(returnLines)
      .map(([id, qty]) => {
        const payload = { quantity: Number(qty) } as any;
        if (selectedBill._isVendor) payload.vendor_bill_line_id = Number(id);
        else payload.purchase_bill_line_id = Number(id);
        return payload;
      })
      .filter((l) => l.quantity > 0) as any;
        
      if (validLines.length === 0) {
        throw new Error("Please enter return quantity for at least one item.");
      }
      
      if (!returnReason.trim()) {
        throw new Error("Return reason is required.");
      }

      await createAdminPurchaseReturn(Number(selectedBill._id.split('_')[1]), {
        reason: returnReason,
        stock_location_id: Number(stockLocationId),
        lines: validLines
      }, selectedBill._isVendor);
      setDrawerOpen(false);
      setSelectedBillId("");
      setReturnReason("");
      setReturnLines({});
      await load();
    } catch (err) {
      setCreateError(accountingErrorMessage(err, "Failed to create return"));
    } finally {
      setCreating(false);
    }
  };

  const handlePostReturn = async (returnId: number) => {
    try {
      await postAdminPurchaseReturn(returnId);
      await load();
    } catch (err) {
      alert(accountingErrorMessage(err, "Failed to post return"));
    }
  };

  const postedTotal = useMemo(
    () => rows.filter((row) => row.status === "POSTED").reduce((sum, row) => sum + Number(row.grand_total || 0), 0),
    [rows]
  );
  
  const selectedBill = useMemo(() => {
    return purchaseBills.find(b => b._id === selectedBillId);
  }, [purchaseBills, selectedBillId]);

  const columns: EnterpriseColumnDef<AdminVendorPurchaseReturn>[] = [
    { key: "return_date", header: "Date", render: (row) => accountingDate(row.return_date) },
    { key: "return_no", header: "Return" },
    { key: "vendor_name", header: "Vendor" },
    { key: "purchase_bill_no", header: "Purchase Bill", render: (row) => row.purchase_bill_no || "N/A" },
    { key: "reason", header: "Reason" },
    { key: "grand_total", header: "Value", render: (row) => accountingMoney(row.grand_total) },
    { key: "status", header: "Status", render: (row) => <ERPStatusBadge status={row.status} /> },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-2">
          {row.status === "DRAFT" ? (
             <ConfirmActionButton
               label="Post"
               title={`Post return ${row.return_no}?`}
               description="This will finalize the return and reverse stock."
               onConfirm={() => handlePostReturn(row.id)}
               variant="primary"
             />
          ) : null}
        </div>
      )
    }
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
        { href: ROUTES.admin.vendors, label: "Vendor Register", variant: "secondary" },
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
        description="Return creation and posting remain controlled from the purchase-bill reversal workflow."
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
            <div className="flex flex-wrap items-center justify-between gap-4 w-full">
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
              <button
                onClick={() => {
                  setDrawerOpen(true);
                  setSelectedBillId("");
                  setReturnLines({});
                  setReturnReason("");
                  setCreateError(null);
                }}
                className="rounded-xl border border-border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                New Return
              </button>
            </div>
          }
        />
      </WorkspaceSection>
      
      <DrawerShell
        open={drawerOpen}
        onClose={() => !creating && setDrawerOpen(false)}
        title="Create Vendor Return"
        description="Select a posted purchase bill and specify return quantities."
      >
        <div className="space-y-6 p-1">
          {createError && (
            <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{createError}</div>
          )}
          
          <div className="space-y-3">
             <label className="text-sm font-semibold">Select Purchase Bill</label>
             <select 
               className={accountingFieldClassName()} 
               value={selectedBillId}
               onChange={(e) => {
                 setSelectedBillId(e.target.value);
                 setReturnLines({});
               }}
               disabled={creating}
             >
               <option value="">-- Choose a bill --</option>
               {purchaseBills.map(b => (
                 <option key={b._id} value={b._id}>{b.bill_no} - {b.vendor_name} ({accountingDate(b.bill_date)})</option>
               ))}
             </select>
          </div>
          
          {selectedBill && selectedBill.lines && (
            <div className="space-y-4 rounded-xl border border-border p-4">
              <h4 className="text-sm font-semibold">Return Quantities</h4>
              {selectedBill.lines.map((line: AccountingPurchaseBillLine) => (
                <div key={(line as any)._id} className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{line.inventory_item_product_name || `Item #${line.inventory_item}`}</div>
                    <div className="text-xs text-muted-foreground">Original Qty: {line.quantity} | Unit Cost: {accountingMoney(line.unit_cost)}</div>
                  </div>
                  <div className="w-32">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      max={line.quantity}
                      placeholder="Qty to return"
                      className={accountingFieldClassName()}
                      value={returnLines[line.id as number] || ""}
                      onChange={(e) => setReturnLines(prev => ({ ...prev, [line.id as number]: e.target.value }))}
                      disabled={creating}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {selectedBill && (
             <div className="space-y-4">
               <div className="space-y-3">
                 <label className="text-sm font-semibold">Stock Location <span className="text-destructive">*</span></label>
                 <select 
                   className={accountingFieldClassName()} 
                   value={stockLocationId}
                   onChange={(e) => setStockLocationId(e.target.value)}
                   disabled={creating}
                 >
                   <option value="" disabled>-- Select Stock Location --</option>
                   {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                 </select>
               </div>
               
               <div className="space-y-3">
                  <label className="text-sm font-semibold">Reason for Return</label>
                  <textarea 
                    className={accountingFieldClassName()} 
                    value={returnReason}
                    onChange={(e) => setReturnReason(e.target.value)}
                    rows={3}
                    disabled={creating}
                    placeholder="E.g. Damaged during transit"
                  />
               </div>
             </div>
          )}
          
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              onClick={() => setDrawerOpen(false)}
              disabled={creating}
              className="px-4 py-2 text-sm font-medium border border-border rounded-xl hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateReturn}
              disabled={creating || !selectedBillId}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:opacity-90 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create Return"}
            </button>
          </div>
        </div>
      </DrawerShell>
    </ERPPageShell>
  );
}

