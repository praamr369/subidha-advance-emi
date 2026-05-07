"use client";

import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
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
  const [returnLineId, setReturnLineId] = useState("");
  const [returnQty, setReturnQty] = useState("1");
  const [returnKind, setReturnKind] = useState<DirectSaleReturnKind>("DELIVERED_RETURN");
  const [stockDestination, setStockDestination] = useState<ReturnStockDestination>("SELLABLE");
  const [stockLocationId, setStockLocationId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [eligibilitySaleId, setEligibilitySaleId] = useState("");
  const [eligibility, setEligibility] = useState<DirectSaleReturnEligibility | null>(null);

  const [exchangeSaleId, setExchangeSaleId] = useState("");
  const [exchangeReturnLineId, setExchangeReturnLineId] = useState("");
  const [exchangeReturnQty, setExchangeReturnQty] = useState("1");
  const [exchangeInventoryItemId, setExchangeInventoryItemId] = useState("");
  const [exchangeQty, setExchangeQty] = useState("1");
  const [exchangeUnitPrice, setExchangeUnitPrice] = useState("");
  const [exchangeReason, setExchangeReason] = useState("");

  const [refundCustomerId, setRefundCustomerId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<"CASH_REFUND" | "UPI_REFUND" | "BANK_REFUND">("CASH_REFUND");
  const [refundFinanceId, setRefundFinanceId] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const [purchaseBillId, setPurchaseBillId] = useState("");
  const [purchaseLineId, setPurchaseLineId] = useState("");
  const [purchaseQty, setPurchaseQty] = useState("1");
  const [purchaseReason, setPurchaseReason] = useState("");

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
            <p className="mb-2 text-xs text-muted-foreground">Original invoice and receipt will remain unchanged. A reversal/credit note and stock ledger entries will be created.</p>
            <input className="mb-2 h-10 w-full rounded border px-2" value={returnSaleId} onChange={(e) => setReturnSaleId(e.target.value)} placeholder="Direct Sale ID" />
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
            <div className="grid grid-cols-2 gap-2">
              <input className="h-10 rounded border px-2" value={returnLineId} onChange={(e) => setReturnLineId(e.target.value)} placeholder="Sale Line ID" />
              <input className="h-10 rounded border px-2" value={returnQty} onChange={(e) => setReturnQty(e.target.value)} placeholder="Qty" />
            </div>
            <input className="mt-2 h-10 w-full rounded border px-2" value={stockLocationId} onChange={(e) => setStockLocationId(e.target.value)} placeholder="Stock Location ID for inspection/damaged/service" />
            <input className="mt-2 mb-2 h-10 w-full rounded border px-2" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Reason" />
            <button className="rounded border px-3 py-2 text-sm" onClick={() => {
              if (!returnReason.trim()) { setError("Return reason is required."); return; }
              void runAction(() => createAdminDirectSaleReturn(Number(returnSaleId), { reason: returnReason, return_kind: returnKind, stock_destination: stockDestination, stock_location_id: stockLocationId ? Number(stockLocationId) : undefined, lines: [{ direct_sale_line_id: Number(returnLineId), quantity: returnQty }] }), "Return created.");
            }}>Create Return</button>
          </div>

          <div className="rounded border p-3">
            <div className="mb-2 text-sm font-semibold">Exchange Product</div>
            <p className="mb-2 text-xs text-muted-foreground">Original invoice and receipt will remain unchanged. Exchange difference is shown as customer payable or credit.</p>
            <input className="mb-2 h-10 w-full rounded border px-2" value={exchangeSaleId} onChange={(e) => setExchangeSaleId(e.target.value)} placeholder="Direct Sale ID" />
            <div className="grid grid-cols-2 gap-2">
              <input className="h-10 rounded border px-2" value={exchangeReturnLineId} onChange={(e) => setExchangeReturnLineId(e.target.value)} placeholder="Old Sale Line ID" />
              <input className="h-10 rounded border px-2" value={exchangeReturnQty} onChange={(e) => setExchangeReturnQty(e.target.value)} placeholder="Old Qty" />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <input className="h-10 rounded border px-2" value={exchangeInventoryItemId} onChange={(e) => setExchangeInventoryItemId(e.target.value)} placeholder="New Inventory Item ID" />
              <input className="h-10 rounded border px-2" value={exchangeQty} onChange={(e) => setExchangeQty(e.target.value)} placeholder="New Qty" />
              <input className="h-10 rounded border px-2" value={exchangeUnitPrice} onChange={(e) => setExchangeUnitPrice(e.target.value)} placeholder="New Unit Price" />
            </div>
            <input className="mt-2 h-10 w-full rounded border px-2" value={stockLocationId} onChange={(e) => setStockLocationId(e.target.value)} placeholder="Returned Stock Location ID" />
            <input className="mt-2 mb-2 h-10 w-full rounded border px-2" value={exchangeReason} onChange={(e) => setExchangeReason(e.target.value)} placeholder="Reason" />
            <button className="rounded border px-3 py-2 text-sm" onClick={() => {
              if (!exchangeReason.trim()) { setError("Exchange reason is required."); return; }
              void runAction(() => createAdminDirectSaleExchange(Number(exchangeSaleId), { reason: exchangeReason, stock_destination: "INSPECTION", stock_location_id: stockLocationId ? Number(stockLocationId) : undefined, returned_lines: [{ direct_sale_line_id: Number(exchangeReturnLineId), quantity: exchangeReturnQty }], replacement_lines: [{ inventory_item_id: Number(exchangeInventoryItemId), quantity: exchangeQty, unit_price: exchangeUnitPrice }] }), "Exchange created.");
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
            {eligibility ? (
              <div className="mt-3 space-y-2 text-xs">
                <div>Status: {eligibility.sale_status} · Invoice: {eligibility.invoice_status || "N/A"} · Delivery: {eligibility.delivery_status}</div>
                <div>Allowed actions: {eligibility.allowed_actions.join(", ") || "None"}</div>
                {eligibility.sold_lines.length === 0 ? <div>No sale lines found.</div> : eligibility.sold_lines.map((line) => (
                  <div key={line.direct_sale_line_id} className="rounded border p-2">
                    Line {line.direct_sale_line_id}: max returnable {line.max_returnable_quantity} · already returned {line.already_returned_quantity}
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
            <input className="mt-2 mb-2 h-10 w-full rounded border px-2" value={purchaseReason} onChange={(e) => setPurchaseReason(e.target.value)} placeholder="Reason" />
            <button className="rounded border px-3 py-2 text-sm" onClick={() => {
              if (!purchaseReason.trim()) { setError("Purchase return reason is required."); return; }
              void runAction(() => createAdminPurchaseReturn(Number(purchaseBillId), { reason: purchaseReason, lines: [{ purchase_bill_line_id: Number(purchaseLineId), quantity: purchaseQty }] }), "Purchase return created.");
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
