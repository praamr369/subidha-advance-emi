import { apiFetch } from "@/lib/api";

type ApiObject = Record<string, unknown>;
type ApiListResponse = { results?: ApiObject[]; [key: string]: unknown };

export async function listAdminVendors(): Promise<ApiListResponse> {
  return apiFetch("/admin/vendors/?page_size=200");
}

export async function getAdminVendor(id: number): Promise<ApiObject> {
  return apiFetch(`/admin/vendors/${id}/`);
}

export async function listAdminVendorCategories(): Promise<ApiListResponse> {
  return apiFetch("/admin/vendors/categories/");
}

export async function listAdminVendorLedger(id: number): Promise<ApiListResponse> {
  return apiFetch(`/admin/vendors/${id}/ledger/`);
}

export async function setVendorOpeningBalance(id: number, amount: string, entry_date: string, notes?: string): Promise<ApiObject> {
  return apiFetch(`/admin/vendors/${id}/ledger/`, { method: "POST", body: { amount, entry_date, notes: notes ?? "" } });
}

export async function setFinanceOpeningBalance(id: number, amount: string, entry_date: string): Promise<ApiObject> {
  return apiFetch(`/admin/opening-balances/finance-accounts/${id}/`, { method: "POST", body: { amount, entry_date } });
}

// ── Customer opening outstandings (BillBook migration) ────────────────────

export type CustomerOpeningOutstanding = {
  id: number;
  customer_name: string;
  phone: string;
  outstanding_amount: string;
  entry_date: string;
  notes: string;
  is_settled: boolean;
  settled_at: string | null;
};

export async function listCustomerOpeningOutstandings(settled?: boolean): Promise<{ count: number; total_outstanding: string; results: CustomerOpeningOutstanding[] }> {
  const q = settled !== undefined ? `?settled=${settled}` : "";
  return apiFetch(`/admin/opening-balances/customers/${q}`);
}

export async function createCustomerOpeningOutstanding(data: {
  customer_name: string;
  phone?: string;
  outstanding_amount: string;
  entry_date?: string;
  notes?: string;
}): Promise<CustomerOpeningOutstanding> {
  return apiFetch("/admin/opening-balances/customers/", { method: "POST", body: data });
}

export async function settleCustomerOpeningOutstanding(id: number, is_settled: boolean): Promise<ApiObject> {
  return apiFetch(`/admin/opening-balances/customers/${id}/`, { method: "PATCH", body: { is_settled } });
}

export async function deleteCustomerOpeningOutstanding(id: number): Promise<void> {
  return apiFetch(`/admin/opening-balances/customers/${id}/`, { method: "DELETE" });
}

export async function getAdminVendorOutstanding(id: number): Promise<ApiObject> {
  return apiFetch(`/admin/vendors/${id}/outstanding/`);
}

export async function listAdminVendorPurchases(id: number): Promise<ApiListResponse> {
  return apiFetch(`/admin/vendors/${id}/purchases/`);
}

export async function listAdminVendorPurchaseReturns(id: number): Promise<ApiListResponse> {
  return apiFetch(`/admin/vendors/${id}/purchase-returns/`);
}

export type AdminVendorPurchaseReturn = {
  id: number;
  return_no: string;
  return_date: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  vendor: number;
  vendor_name: string;
  purchase_bill: number;
  purchase_bill_no: string;
  reason: string;
  subtotal: string;
  tax_total: string;
  grand_total: string;
  posted_journal_entry?: number | null;
  posted_at?: string | null;
};

export async function listAdminVendorPurchaseReturnRegister(params: {
  vendor?: number;
  status?: string;
  date_from?: string;
  date_to?: string;
} = {}): Promise<{ count: number; results: AdminVendorPurchaseReturn[] }> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch(`/admin/vendor-purchase-returns/${suffix}`);
}

export async function listAdminVendorProducts(vendorId: number): Promise<ApiListResponse> {
  return apiFetch(`/admin/vendors/${vendorId}/products/`);
}

export async function createAdminVendorProduct(vendorId: number, payload: Record<string, unknown>): Promise<ApiObject> {
  return apiFetch(`/admin/vendors/${vendorId}/products/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function suggestVendors(payload: Record<string, unknown>): Promise<ApiListResponse> {
  return apiFetch("/admin/vendor-sourcing/suggest/", { method: "POST", body: JSON.stringify(payload) });
}

export async function requestVendorQuotesViaSourcing(payload: Record<string, unknown>): Promise<ApiObject> {
  return apiFetch("/admin/vendor-sourcing/request-quotes/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAdminQuoteRequests(): Promise<ApiListResponse> {
  return apiFetch("/admin/vendor-quotes/requests/");
}

export async function createAdminQuoteRequest(payload: Record<string, unknown>): Promise<ApiObject> {
  return apiFetch("/admin/vendor-quotes/requests/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAdminQuoteRequest(id: number): Promise<ApiObject> {
  return apiFetch(`/admin/vendor-quotes/requests/${id}/`);
}

export async function acceptAdminVendorQuote(quoteId: number): Promise<ApiObject> {
  return apiFetch(`/admin/vendor-quotes/${quoteId}/accept/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function rejectAdminVendorQuote(quoteId: number): Promise<ApiObject> {
  return apiFetch(`/admin/vendor-quotes/${quoteId}/reject/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function listVendorDashboard(): Promise<ApiObject> {
  return apiFetch("/vendor/dashboard/");
}

export async function getVendorProfile(): Promise<ApiObject> {
  return apiFetch("/vendor/profile/");
}

export async function listVendorQuotes(): Promise<ApiListResponse> {
  return apiFetch("/vendor/quote-requests/");
}

export async function getVendorQuoteRequest(id: number): Promise<ApiObject> {
  return apiFetch(`/vendor/quote-requests/${id}/`);
}

export async function submitVendorQuote(requestId: number, payload: Record<string, unknown>): Promise<ApiObject> {
  return apiFetch(`/vendor/quote-requests/${requestId}/quote/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listVendorLedger(): Promise<ApiListResponse> {
  return apiFetch("/vendor/ledger/");
}

export async function getVendorOutstanding(): Promise<ApiObject> {
  return apiFetch("/vendor/outstanding/");
}

export async function listVendorPurchaseOrders(): Promise<ApiListResponse> {
  return apiFetch("/vendor/purchase-orders/");
}

export async function listVendorPurchaseReturns(): Promise<ApiListResponse> {
  return apiFetch("/vendor/purchase-returns/");
}

export async function listVendorProducts(): Promise<ApiListResponse> {
  return apiFetch("/vendor/products/");
}

export async function createVendorProduct(payload: Record<string, unknown>): Promise<ApiObject> {
  return apiFetch("/vendor/products/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
