import { apiFetch } from "@/lib/api";

export type ReversalType = "sale_return" | "receipt_void" | "customer_refund" | "purchase_return";

export type ReversalRow = {
  id: number;
  type: ReversalType;
  status: string;
  reference_no: string;
  amount: string;
  date: string;
  customer_id?: number;
  vendor_id?: number;
};

export type ReversalListResponse = {
  count: number;
  results: ReversalRow[];
};

export type DirectSaleReturnKind =
  | "POST_INVOICE_CANCEL"
  | "DELIVERED_RETURN"
  | "DELIVERED_EXCHANGE"
  | "DAMAGED_RETURN"
  | "PARTIAL_RETURN";

export type ReturnStockDestination = "SELLABLE" | "INSPECTION" | "DAMAGED" | "SERVICE";

export type DirectSaleReturnEligibility = {
  direct_sale_id: number;
  sale_status: string;
  invoice_status: string;
  delivery_status: string;
  active_receipt_total: string;
  void_receipt_total: string;
  outstanding_balance: string;
  sold_lines: Array<{
    direct_sale_line_id: number;
    product_id: number;
    inventory_item_id: number | null;
    description: string;
    sold_quantity: string;
    already_returned_quantity: string;
    max_returnable_quantity: string;
    unit_price: string;
    line_total: string;
  }>;
  receipt_summary: {
    posted_receipt_count: number;
    posted_receipt_total: string;
    received_total: string;
    balance_total: string;
  };
  allowed_actions: string[];
  blocking_reasons?: string[];
};

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") return;
    q.set(key, String(value));
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function listAdminReversals(params: Record<string, string | number | undefined> = {}): Promise<ReversalListResponse> {
  return apiFetch(`/admin/billing/returns/${query(params)}`);
}

export async function cancelAdminDirectSale(directSaleId: number, reason: string): Promise<{ updated: boolean }> {
  return apiFetch(`/admin/billing/direct-sales/${directSaleId}/cancel/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function getAdminDirectSaleReturnEligibility(directSaleId: number): Promise<DirectSaleReturnEligibility> {
  return apiFetch(`/admin/billing/direct-sales/${directSaleId}/return-eligibility/`);
}

export async function createAdminDirectSaleReturn(
  directSaleId: number,
  payload: {
    reason: string;
    return_kind?: DirectSaleReturnKind;
    stock_destination?: ReturnStockDestination;
    stock_location_id?: number;
    lines: Array<{ direct_sale_line_id: number; quantity: string | number }>;
  }
): Promise<{ direct_sale_return_id: number }> {
  return apiFetch(`/admin/billing/direct-sales/${directSaleId}/returns/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createAdminDirectSaleExchange(
  directSaleId: number,
  payload: {
    reason: string;
    stock_destination?: ReturnStockDestination;
    stock_location_id?: number;
    returned_lines: Array<{ direct_sale_line_id: number; quantity: string | number }>;
    replacement_lines: Array<{ inventory_item_id: number; description?: string; quantity: string | number; unit_price: string | number }>;
  }
): Promise<{ direct_sale_return_id: number; exchange_amount_due: string; exchange_customer_credit: string }> {
  return apiFetch(`/admin/billing/direct-sales/${directSaleId}/exchange/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveAdminDirectSaleReturn(returnId: number): Promise<{ updated: boolean }> {
  return apiFetch(`/admin/billing/returns/${returnId}/approve/`, { method: "POST", body: JSON.stringify({}) });
}

export async function postAdminDirectSaleReturn(returnId: number): Promise<{ updated: boolean }> {
  return apiFetch(`/admin/billing/returns/${returnId}/post/`, { method: "POST", body: JSON.stringify({}) });
}

export async function voidAdminReceipt(receiptId: number, reason: string): Promise<{ updated: boolean }> {
  return apiFetch(`/admin/billing/receipts/${receiptId}/void/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function getAdminCustomerCredits(customerId: number): Promise<{
  customer_id: number;
  credit_total: string;
  debit_total: string;
  balance: string;
  results: Array<{ id: number; entry_date: string; reference_no: string; credit_amount: string; debit_amount: string; notes: string }>;
}> {
  return apiFetch(`/admin/customers/${customerId}/credits/`);
}

export async function createAdminCustomerRefund(
  customerId: number,
  payload: { amount: string | number; method: "CASH_REFUND" | "UPI_REFUND" | "BANK_REFUND"; finance_account_id: number; reason: string; direct_sale_return_id?: number }
): Promise<{ id: number; refund_no: string; status: string }> {
  return apiFetch(`/admin/customers/${customerId}/refunds/`, { method: "POST", body: JSON.stringify(payload) });
}

export async function approveAdminCustomerRefund(refundId: number): Promise<{ updated: boolean }> {
  return apiFetch(`/admin/customers/refunds/${refundId}/approve/`, { method: "POST", body: JSON.stringify({}) });
}

export async function payAdminCustomerRefund(refundId: number): Promise<{ updated: boolean }> {
  return apiFetch(`/admin/customers/refunds/${refundId}/pay/`, { method: "POST", body: JSON.stringify({}) });
}

export async function createAdminPurchaseReturn(
  purchaseId: number,
  payload: { reason: string; lines: Array<{ purchase_bill_line_id: number; quantity: string | number }> }
): Promise<{ id: number; return_no: string }> {
  return apiFetch(`/admin/purchases/${purchaseId}/returns/`, { method: "POST", body: JSON.stringify(payload) });
}

export async function postAdminPurchaseReturn(returnId: number): Promise<{ updated: boolean }> {
  return apiFetch(`/admin/purchases/returns/${returnId}/post/`, { method: "POST", body: JSON.stringify({}) });
}
