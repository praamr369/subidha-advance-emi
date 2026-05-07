"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { directSalesKeys, inventoryKeys } from "@/lib/query-keys";
import { ROUTES } from "@/lib/routes";
import {
  approveAdminCustomerRefund,
  approveAdminDirectSaleReturn,
  cancelAdminDirectSale,
  createAdminCustomerRefund,
  createAdminDirectSaleExchange,
  createAdminDirectSaleReturn,
  createAdminPurchaseReturn,
  getAdminDirectSaleReturnEligibility,
  listAdminReversals,
  searchAdminInventoryItems,
  payAdminCustomerRefund,
  postAdminDirectSaleReturn,
  postAdminPurchaseReturn,
  voidAdminReceipt,
  type ReversalRow,
  type ReversalType,
  type DirectSaleReturnEligibility,
  type DirectSaleReturnKind,
  type ReturnStockDestination,
} from "@/services/reversals";

const types: ReversalType[] = ["sale_return", "receipt_void", "customer_refund", "purchase_return"];

export default function AdminBillingReversalsPage() {
  const searchParams = useSearchParams();
  const debugMode = searchParams.get("debug") === "1";
  const [rows, setRows] = useState<ReversalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [type, setType] = useState<string>("");
  const [status, setStatus] = useState("");
  const [customer, setCustomer] = useState("");
  const [vendor, setVendor] = useState("");
  const [reference, setReference] = useState("");

  const [cancelSaleId, setCancelSaleId] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const [voidReceiptId, setVoidReceiptId] = useState("");
  const [voidReason, setVoidReason] = useState("");

  const [returnSaleId, setReturnSaleId] = useState("");
  const [returnKind, setReturnKind] = useState<DirectSaleReturnKind>("DELIVERED_RETURN");
  const [returnCondition, setReturnCondition] = useState("NEEDS_INSPECTION");
  const [refundMode, setRefundMode] = useState("CUSTOMER_CREDIT");
  const [stockDestination, setStockDestination] = useState<ReturnStockDestination>("INSPECTION");
  const [stockLocationId, setStockLocationId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [eligibilitySaleId, setEligibilitySaleId] = useState("");
  const [eligibility, setEligibility] = useState<DirectSaleReturnEligibility | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [returnQuantities, setReturnQuantities] = useState<Record<number, string>>({});

  const [exchangeSaleId, setExchangeSaleId] = useState("");
  const [exchangeInventoryItemId, setExchangeInventoryItemId] = useState("");
  const [exchangeReplacementLocationId, setExchangeReplacementLocationId] = useState("");
  const [exchangeQty, setExchangeQty] = useState("1");
  const [exchangeUnitPrice, setExchangeUnitPrice] = useState("");
  const [exchangeReason, setExchangeReason] = useState("");
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventorySearchRows, setInventorySearchRows] = useState<Array<{ id: number; product_name: string; sku: string; available_by_location: Array<{ stock_location_id: number; stock_location_name: string; available_quantity: string }> }>>([]);

  const [refundCustomerId, setRefundCustomerId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<"CASH_REFUND" | "UPI_REFUND" | "BANK_REFUND">("CASH_REFUND");
  const [refundFinanceId, setRefundFinanceId] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const [purchaseBillId, setPurchaseBillId] = useState("");
  const [purchaseLineId, setPurchaseLineId] = useState("");
  const [purchaseQty, setPurchaseQty] = useState("1");
  const [purchaseStockLocationId, setPurchaseStockLocationId] = useState("");
  const [purchaseReason, setPurchaseReason] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    const directSale = searchParams.get("direct_sale") || "";
    const exchangeSale = searchParams.get("exchange_sale") || "";
    if (directSale) {
      setReturnSaleId(directSale);
      setEligibilitySaleId(directSale);
    }
    if (exchangeSale) {
      setExchangeSaleId(exchangeSale);
      setEligibilitySaleId(exchangeSale);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!eligibilitySaleId) return;
    setLoadingEligibility(true);
    void getAdminDirectSaleReturnEligibility(Number(eligibilitySaleId))
      .then((payload) => {
        setEligibility(payload);
        setReturnSaleId(String(payload.direct_sale_id));
        setExchangeSaleId(String(payload.direct_sale_id));
        setReturnKind((payload.default_return_kind as DirectSaleReturnKind) || "DELIVERED_RETURN");
        setReturnCondition(payload.default_condition || "NEEDS_INSPECTION");
        setRefundMode(payload.default_refund_mode || "CUSTOMER_CREDIT");
        setStockLocationId(String(payload.default_stock_destination_id || ""));
        const initial: Record<number, string> = {};
        (payload.return_lines || []).forEach((line) => {
          initial[line.sale_line_id] = line.default_return_quantity || line.returnable_quantity || "0";
        });
        setReturnQuantities(initial);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load return eligibility."))
      .finally(() => setLoadingEligibility(false));
  }, [eligibilitySaleId]);

  async function load() {
    setLoading(true);
    try {
      const payload = await listAdminReversals({ type, status, customer, vendor, reference });
      setRows(payload.results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reversals");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [type, status, customer, vendor, reference]);

  const grouped = useMemo(() => {
    return {
      pendingReturns: rows.filter((r) => r.type === "sale_return" && r.status === "DRAFT").length,
      approvedReturns: rows.filter((r) => r.type === "sale_return" && r.status === "APPROVED").length,
      postedReturns: rows.filter((r) => r.type === "sale_return" && r.status === "POSTED").length,
      voidedReceipts: rows.filter((r) => r.type === "receipt_void").length,
      customerCredits: rows.filter((r) => r.type === "sale_return" && r.status === "POSTED").length,
      pendingRefunds: rows.filter((r) => r.type === "customer_refund" && r.status !== "PAID").length,
      purchaseReturns: rows.filter((r) => r.type === "purchase_return").length,
    };
  }, [rows]);

  async function runAction(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      setNotice(success);
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: directSalesKeys.all }),
        queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "stock-movements"] }),
        queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "stock-summary"] }),
        queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "items"] }),
        queryClient.invalidateQueries({ queryKey: [...inventoryKeys.all, "requirements"] }),
      ]);
      if (eligibilitySaleId) {
        const refreshed = await getAdminDirectSaleReturnEligibility(Number(eligibilitySaleId));
        setEligibility(refreshed);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <PortalPage
      title="Returns, Voids & Reversal Center"
      subtitle="Admin-only control center for direct sale cancellation, returns, receipt voids, customer refunds, and purchase returns."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.root }, { label: "Billing", href: ROUTES.admin.billing }, { label: "Reversals" }]}
    >
      <div className="space-y-6">
        {notice ? <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</div> : null}
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-7">
          <div className="rounded border p-2">Pending Returns: {grouped.pendingReturns}</div>
          <div className="rounded border p-2">Approved Returns: {grouped.approvedReturns}</div>
          <div className="rounded border p-2">Posted Returns: {grouped.postedReturns}</div>
          <div className="rounded border p-2">Voided Receipts: {grouped.voidedReceipts}</div>
          <div className="rounded border p-2">Customer Credits: {grouped.customerCredits}</div>
          <div className="rounded border p-2">Pending Refunds: {grouped.pendingRefunds}</div>
          <div className="rounded border p-2">Purchase Returns: {grouped.purchaseReturns}</div>
        </div>

        <div className="grid gap-2 md:grid-cols-5">
          <select className="h-10 rounded border px-2" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className="h-10 rounded border px-2" placeholder="Status" value={status} onChange={(e) => setStatus(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="Customer ID" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="Vendor ID" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          <input className="h-10 rounded border px-2" placeholder="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-semibold">Cancel Sale</div>
            <input className="mb-2 h-10 w-full rounded border px-2" value={cancelSaleId} onChange={(e) => setCancelSaleId(e.target.value)} placeholder="Direct Sale ID" />
            <input className="mb-2 h-10 w-full rounded border px-2" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Reason (required)" />
            <button className="rounded border px-3 py-2 text-sm" onClick={() => {
              if (!cancelReason.trim()) { setError("Cancel reason is required."); return; }
              void runAction(() => cancelAdminDirectSale(Number(cancelSaleId), cancelReason), "Sale cancelled.");
            }}>Cancel Sale</button>
          </div>

          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-semibold">Void Receipt</div>
            <input className="mb-2 h-10 w-full rounded border px-2" value={voidReceiptId} onChange={(e) => setVoidReceiptId(e.target.value)} placeholder="Receipt ID" />
            <input className="mb-2 h-10 w-full rounded border px-2" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason (required)" />
            <button className="rounded border px-3 py-2 text-sm" onClick={() => {
              if (!voidReason.trim()) { setError("Void reason is required."); return; }
              void runAction(() => voidAdminReceipt(Number(voidReceiptId), voidReason), "Receipt voided.");
            }}>Void Receipt</button>
          </div>

          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-semibold">Create Return</div>
            <p className="mb-2 text-xs text-muted-foreground">Original invoice, receipt, delivery, and stock ledger rows will remain unchanged. The system will create reversal documents and additive stock movements.</p>
            <div className="mb-2 rounded border bg-muted/20 p-2 text-xs">
              Sale: {eligibility?.sale_no || "N/A"} | Customer: {eligibility?.customer_name || "N/A"} {eligibility?.customer_phone_masked ? `(${eligibility.customer_phone_masked})` : ""}
            </div>
            {debugMode ? <input className="mb-2 h-10 w-full rounded border px-2" value={returnSaleId} onChange={(e) => setReturnSaleId(e.target.value)} placeholder="Direct Sale ID" /> : null}
            <div className="mb-2 grid grid-cols-2 gap-2">
              <select className="h-10 rounded border px-2" value={returnKind} onChange={(e) => setReturnKind(e.target.value as DirectSaleReturnKind)} aria-label="Return Kind">
                <option value="POST_INVOICE_CANCEL">POST_INVOICE_CANCEL</option>
                <option value="DELIVERED_RETURN">DELIVERED_RETURN</option>
                <option value="DELIVERED_EXCHANGE">DELIVERED_EXCHANGE</option>
                <option value="DAMAGED_RETURN">DAMAGED_RETURN</option>
                <option value="PARTIAL_RETURN">PARTIAL_RETURN</option>
              </select>
              <select className="h-10 rounded border px-2" value={stockDestination} onChange={(e) => setStockDestination(e.target.value as ReturnStockDestination)} aria-label="Stock Destination">
                <option value="SELLABLE">SELLABLE</option>
                <option value="INSPECTION">INSPECTION</option>
                <option value="DAMAGED">DAMAGED</option>
                <option value="SERVICE">SERVICE</option>
              </select>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <select className="h-10 rounded border px-2" value={returnCondition} onChange={(e) => {
                const next = e.target.value;
                setReturnCondition(next);
                if (next === "SELLABLE") setStockDestination("SELLABLE");
                if (next === "NEEDS_INSPECTION") setStockDestination("INSPECTION");
                if (next === "DAMAGED") {
                  setReturnKind("DAMAGED_RETURN");
                  setStockDestination("DAMAGED");
                }
                if (next === "SERVICE_REPAIR") setStockDestination("SERVICE");
              }} aria-label="Return condition">
                <option value="SELLABLE">SELLABLE</option>
                <option value="NEEDS_INSPECTION">NEEDS_INSPECTION</option>
                <option value="DAMAGED">DAMAGED</option>
                <option value="SERVICE_REPAIR">SERVICE_REPAIR</option>
              </select>
              <select className="h-10 rounded border px-2" value={refundMode} onChange={(e) => setRefundMode(e.target.value)} aria-label="Refund mode">
                <option value="CUSTOMER_CREDIT">CUSTOMER_CREDIT</option>
                <option value="CASH_REFUND_LATER">CASH_REFUND_LATER</option>
                <option value="UPI_REFUND_LATER">UPI_REFUND_LATER</option>
                <option value="BANK_REFUND_LATER">BANK_REFUND_LATER</option>
                <option value="ADJUST_AGAINST_DUE">ADJUST_AGAINST_DUE</option>
              </select>
            </div>
            <div className="mb-2 rounded border p-2 text-xs">
              {(eligibility?.return_lines || []).length === 0 ? "No returnable lines." : (
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="px-1 py-1 text-left">Product</th>
                      <th className="px-1 py-1 text-left">SKU</th>
                      <th className="px-1 py-1 text-left">Returnable</th>
                      <th className="px-1 py-1 text-left">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(eligibility?.return_lines || []).map((line) => (
                      <tr key={line.sale_line_id} className="border-t">
                        <td className="px-1 py-1">{line.product_name}</td>
                        <td className="px-1 py-1">{line.sku || "-"}</td>
                        <td className="px-1 py-1">{line.returnable_quantity}</td>
                        <td className="px-1 py-1">
                          <input className="h-8 w-24 rounded border px-2" value={returnQuantities[line.sale_line_id] || "0"} onChange={(e) => setReturnQuantities((prev) => ({ ...prev, [line.sale_line_id]: e.target.value }))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <select className="mt-2 h-10 w-full rounded border px-2" value={stockLocationId} onChange={(e) => setStockLocationId(e.target.value)} aria-label="Stock Destination Location">
              <option value="">Select stock destination</option>
              {(eligibility?.stock_destinations || []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} ({location.type})
                </option>
              ))}
            </select>
            <input className="mt-2 mb-2 h-10 w-full rounded border px-2" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Reason" />
            <button className="rounded border px-3 py-2 text-sm" onClick={() => {
              if (!returnReason.trim()) { setError("Return reason is required."); return; }
              const lines = (eligibility?.return_lines || [])
                .map((line) => ({ direct_sale_line_id: line.sale_line_id, quantity: returnQuantities[line.sale_line_id] || "0" }))
                .filter((line) => Number(line.quantity) > 0);
              void runAction(() => createAdminDirectSaleReturn(Number(returnSaleId), { reason: returnReason, return_kind: returnKind, stock_destination: stockDestination, stock_location_id: stockLocationId ? Number(stockLocationId) : undefined, confirm_sellable_destination: stockDestination === "SELLABLE", lines }), "Return created.");
            }}>Create Return</button>
          </div>

          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-semibold">Exchange Product</div>
            <p className="mb-2 text-xs text-muted-foreground">Original invoice, receipt, and stock ledger rows will remain unchanged. The system will create reversal documents, credit notes, and stock ledger movements.</p>
            {debugMode ? <input className="mb-2 h-10 w-full rounded border px-2" value={exchangeSaleId} onChange={(e) => setExchangeSaleId(e.target.value)} placeholder="Direct Sale ID" /> : null}
            <input className="h-10 w-full rounded border px-2" value={inventoryQuery} onChange={(e) => setInventoryQuery(e.target.value)} placeholder="Search replacement by product/SKU" />
            <button className="mt-2 rounded border px-3 py-2 text-sm" onClick={() => {
              void searchAdminInventoryItems(inventoryQuery).then((payload) => setInventorySearchRows(payload.results)).catch((err) => setError(err instanceof Error ? err.message : "Inventory search failed."));
            }}>Search Replacement</button>
            <select className="mt-2 h-10 w-full rounded border px-2" value={exchangeInventoryItemId} onChange={(e) => setExchangeInventoryItemId(e.target.value)} aria-label="Replacement Inventory Item">
              <option value="">Select replacement item</option>
              {inventorySearchRows.map((row) => (
                <option key={row.id} value={row.id}>{row.product_name} ({row.sku || "No SKU"})</option>
              ))}
            </select>
            <select className="mt-2 h-10 w-full rounded border px-2" value={exchangeReplacementLocationId} onChange={(e) => setExchangeReplacementLocationId(e.target.value)} aria-label="Replacement Stock Location">
              <option value="">Select replacement location</option>
              {(inventorySearchRows.find((row) => String(row.id) === exchangeInventoryItemId)?.available_by_location || []).map((loc) => (
                <option key={loc.stock_location_id} value={loc.stock_location_id}>
                  {loc.stock_location_name} (Qty {loc.available_quantity})
                </option>
              ))}
            </select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input className="h-10 rounded border px-2" value={exchangeQty} onChange={(e) => setExchangeQty(e.target.value)} placeholder="New Qty" />
              <input className="h-10 rounded border px-2" value={exchangeUnitPrice} onChange={(e) => setExchangeUnitPrice(e.target.value)} placeholder="New Unit Price" />
            </div>
            <div className="mt-2 rounded border border-border bg-muted/30 p-2 text-xs">
              Replacement value {(Number(exchangeQty || 0) * Number(exchangeUnitPrice || 0)).toFixed(2)}. Backend will classify the difference as customer payable, customer credit, or zero-difference exchange.
            </div>
            <select className="mt-2 h-10 w-full rounded border px-2" value={stockLocationId} onChange={(e) => setStockLocationId(e.target.value)} aria-label="Returned Stock Location">
              <option value="">Select returned stock location</option>
              {(eligibility?.stock_destinations || []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} ({location.type})
                </option>
              ))}
            </select>
            <input className="mt-2 mb-2 h-10 w-full rounded border px-2" value={exchangeReason} onChange={(e) => setExchangeReason(e.target.value)} placeholder="Reason" />
            <button className="rounded border px-3 py-2 text-sm" onClick={() => {
              if (!exchangeReason.trim()) { setError("Exchange reason is required."); return; }
              const firstReturnLine = (eligibility?.return_lines || []).find((line) => Number(returnQuantities[line.sale_line_id] || "0") > 0) || eligibility?.return_lines?.[0];
              if (!firstReturnLine) { setError("No returnable sale line available for exchange."); return; }
              void runAction(() => createAdminDirectSaleExchange(Number(exchangeSaleId), { reason: exchangeReason, stock_destination: "INSPECTION", stock_location_id: stockLocationId ? Number(stockLocationId) : undefined, returned_lines: [{ direct_sale_line_id: firstReturnLine.sale_line_id, quantity: returnQuantities[firstReturnLine.sale_line_id] || firstReturnLine.returnable_quantity }], replacement_lines: [{ inventory_item_id: Number(exchangeInventoryItemId), stock_location_id: exchangeReplacementLocationId ? Number(exchangeReplacementLocationId) : undefined, quantity: exchangeQty, unit_price: exchangeUnitPrice }] }), "Exchange created.");
            }}>Create Exchange</button>
          </div>

          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-semibold">View Return Eligibility</div>
            <input className="mb-2 h-10 w-full rounded border px-2" value={eligibilitySaleId} onChange={(e) => setEligibilitySaleId(e.target.value)} placeholder="Direct Sale ID" />
            <button className="rounded border px-3 py-2 text-sm" onClick={() => {
              void runAction(async () => {
                const payload = await getAdminDirectSaleReturnEligibility(Number(eligibilitySaleId));
                setEligibility(payload);
              }, "Return eligibility loaded.");
            }}>View Return Eligibility</button>
            {loadingEligibility ? <div className="mt-2 text-xs">Loading eligibility...</div> : null}
            {eligibility ? (
              <div className="mt-3 space-y-2 text-xs">
                <div>Status: {eligibility.sale_status} · Invoice: {eligibility.invoice_status || "N/A"} · Delivery: {eligibility.delivery_status}</div>
                <div>Receipts: active {eligibility.active_receipt_total} · void {eligibility.void_receipt_total} · Outstanding {eligibility.outstanding_balance}</div>
                <div>Allowed actions: {eligibility.allowed_actions.join(", ") || "None"}</div>
                {eligibility.replacement_stock_available ? <div>Replacement stock available: {eligibility.replacement_stock_available}</div> : null}
                {(eligibility.blocking_reasons || []).length ? <div>Blocking reasons: {eligibility.blocking_reasons?.join(" | ")}</div> : null}
                {eligibility.stock_setup_required ? <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">{eligibility.stock_setup_message} Missing: {(eligibility.missing_location_types || []).join(", ")}</div> : null}
                <div className="rounded border p-2">
                  <div className="font-semibold">Workflow checklist</div>
                  <div>Receipt voided: {Number(eligibility.receipt_summary?.active_receipt_count || 0) === 0 ? "Done" : "Required"}</div>
                  <div>Invoice reversed/voided: {["VOID", "REVERSED", "CANCELLED"].includes(eligibility.invoice_status || "") ? "Done" : "Required"}</div>
                  <div>Product returned to stock: {(eligibility.return_lines || []).every((line) => Number(line.returnable_quantity) <= 0) ? "Done" : "Required"}</div>
                  <div>Customer credit/refund decision: {eligibility.is_operationally_active ? "Blocked" : "Done"}</div>
                  <div>Finalize/archive sale: {eligibility.can_finalize_reversal ? "Done" : "Blocked"}</div>
                </div>
                {!eligibility.can_finalize_reversal ? <div>Finalize blockers: {(eligibility.finalize_blocking_reasons || []).join(" | ")}</div> : null}
                {eligibility.can_finalize_reversal ? (
                  <button
                    className="rounded border px-3 py-2 text-xs"
                    onClick={() => {
                      void runAction(
                        () => cancelAdminDirectSale(eligibility.direct_sale_id, "Finalize full cancellation/archive after reversal controls satisfied."),
                        "Sale finalized and archived.",
                      );
                    }}
                  >
                    Finalize Full Cancellation / Archive Sale
                  </button>
                ) : null}
                {eligibility.sold_lines.length === 0 ? <div>No sale lines found.</div> : eligibility.sold_lines.map((line) => (
                  <div key={line.direct_sale_line_id} className="rounded border p-2">
                    Line {line.direct_sale_line_id}: sold {line.sold_quantity} · returned {line.already_returned_quantity} · returnable {line.returnable_quantity || line.max_returnable_quantity}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-semibold">Create Refund</div>
            <input className="mb-2 h-10 w-full rounded border px-2" value={refundCustomerId} onChange={(e) => setRefundCustomerId(e.target.value)} placeholder="Customer ID" />
            <input className="mb-2 h-10 w-full rounded border px-2" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="Amount" />
            <select className="mb-2 h-10 w-full rounded border px-2" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)} aria-label="Refund Method">
              <option value="CASH_REFUND">CASH_REFUND</option>
              <option value="UPI_REFUND">UPI_REFUND</option>
              <option value="BANK_REFUND">BANK_REFUND</option>
            </select>
            <input className="mb-2 h-10 w-full rounded border px-2" value={refundFinanceId} onChange={(e) => setRefundFinanceId(e.target.value)} placeholder="Finance Account ID" />
            <input className="mb-2 h-10 w-full rounded border px-2" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Reason" />
            <button className="rounded border px-3 py-2 text-sm" onClick={() => {
              if (!refundMethod || !refundFinanceId) { setError("Refund method and finance account are required."); return; }
              void runAction(() => createAdminCustomerRefund(Number(refundCustomerId), { amount: refundAmount, method: refundMethod, finance_account_id: Number(refundFinanceId), reason: refundReason }), "Refund created.");
            }}>Create Refund</button>
          </div>

          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-semibold">Create Purchase Return</div>
            <input className="mb-2 h-10 w-full rounded border px-2" value={purchaseBillId} onChange={(e) => setPurchaseBillId(e.target.value)} placeholder="Purchase Bill ID" />
            <div className="grid grid-cols-2 gap-2">
              <input className="h-10 rounded border px-2" value={purchaseLineId} onChange={(e) => setPurchaseLineId(e.target.value)} placeholder="Bill Line ID" />
              <input className="h-10 rounded border px-2" value={purchaseQty} onChange={(e) => setPurchaseQty(e.target.value)} placeholder="Qty" />
            </div>
            <input className="mt-2 h-10 w-full rounded border px-2" value={purchaseStockLocationId} onChange={(e) => setPurchaseStockLocationId(e.target.value)} placeholder="Vendor-return Stock Location ID" />
            <input className="mt-2 mb-2 h-10 w-full rounded border px-2" value={purchaseReason} onChange={(e) => setPurchaseReason(e.target.value)} placeholder="Reason" />
            <button className="rounded border px-3 py-2 text-sm" onClick={() => {
              if (!purchaseReason.trim()) { setError("Purchase return reason is required."); return; }
              void runAction(() => createAdminPurchaseReturn(Number(purchaseBillId), { reason: purchaseReason, stock_location_id: purchaseStockLocationId ? Number(purchaseStockLocationId) : undefined, lines: [{ purchase_bill_line_id: Number(purchaseLineId), quantity: purchaseQty }] }), "Purchase return created.");
            }}>Create Purchase Return</button>
          </div>
        </div>

        {loading ? <LoadingBlock label="Loading reversal center..." /> : null}
        {!loading && error ? <ErrorState title="Unable to load reversal center" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? <EmptyState title="No reversal records" description="Create cancellation, return, void, refund, or purchase return records to populate this center." /> : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-hidden rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.type}-${row.id}`} className="border-t">
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="px-3 py-2">{row.reference_no}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{row.amount}</td>
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        {row.type === "sale_return" && row.status === "DRAFT" ? <button className="rounded border px-2 py-1" onClick={() => void runAction(() => approveAdminDirectSaleReturn(row.id), "Return approved.")}>Approve</button> : null}
                        {row.type === "sale_return" && row.status === "APPROVED" ? <button className="rounded border px-2 py-1" onClick={() => void runAction(() => postAdminDirectSaleReturn(row.id), "Return posted.")}>Post</button> : null}
                        {row.type === "customer_refund" && row.status === "DRAFT" ? <button className="rounded border px-2 py-1" onClick={() => void runAction(() => approveAdminCustomerRefund(row.id), "Refund approved.")}>Approve</button> : null}
                        {row.type === "customer_refund" && row.status === "APPROVED" ? <button className="rounded border px-2 py-1" onClick={() => void runAction(() => payAdminCustomerRefund(row.id), "Refund paid.")}>Pay</button> : null}
                        {row.type === "purchase_return" && row.status === "DRAFT" ? <button className="rounded border px-2 py-1" onClick={() => void runAction(() => postAdminPurchaseReturn(row.id), "Purchase return posted.")}>Post</button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </PortalPage>
  );
}
