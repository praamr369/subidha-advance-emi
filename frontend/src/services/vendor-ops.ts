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

export type VendorLedgerEntryType =
  | "OPENING_BALANCE"
  | "PURCHASE_BILL"
  | "PAYMENT_TO_VENDOR"
  | "PURCHASE_RETURN"
  | "DEBIT_NOTE"
  | "CREDIT_ADJUSTMENT"
  | "MANUAL_ADJUSTMENT";

export interface VendorLedgerEntry {
  id: number;
  vendor: number;
  entry_type: VendorLedgerEntryType;
  source_type: string;
  source_id: number | null;
  source_reference: string;
  debit: string;
  credit: string;
  balance_after: string;
  posted_at: string;
  notes: string;
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

export interface VendorLedgerResponse {
  count: number;
  results: VendorLedgerEntry[];
}

export async function listAdminVendorLedger(id: number): Promise<VendorLedgerResponse> {
  return apiFetch(`/admin/vendors/${id}/ledger/`);
}

export async function setFinanceOpeningBalance(id: number, amount: string, entry_date: string): Promise<ApiObject> {
  return apiFetch(`/admin/opening-balances/finance-accounts/${id}/`, { method: "POST", body: JSON.stringify({ amount, entry_date }) });
}

export interface VendorOutstanding {
  vendor_id: number;
  opening_balance: string;
  purchase_bills: string;
  vendor_payments: string;
  purchase_returns: string;
  debit_notes: string;
  adjustments: string;
  outstanding: string;
  semantic_note: string;
}

export async function getAdminVendorOutstanding(id: number): Promise<VendorOutstanding> {
  return apiFetch(`/admin/vendors/${id}/outstanding/`);
}



export interface PurchaseSummaryRow {
  id: number;
  bill_no?: string;
  po_no?: string;
  payment_no?: string;
  status: string;
  grand_total?: string;
  amount?: string;
}

export interface PurchaseSummary {
  purchase_bills_count: number;
  purchase_orders_count: number;
  vendor_payments_count: number;
  purchase_bills: PurchaseSummaryRow[];
  purchase_orders: PurchaseSummaryRow[];
  vendor_payments: PurchaseSummaryRow[];
  summary: {
    draft_total: string;
    approved_total: string;
    posted_total: string;
  };
}

export interface ReturnSummaryRow {
  id: number;
  return_no: string;
  status: string;
  grand_total: string;
}

export interface ReturnSummary {
  count: number;
  results: ReturnSummaryRow[];
  summary: {
    draft_total: string;
    posted_total: string;
    cancelled_total: string;
  };
}

export async function listAdminVendorPurchases(id: number): Promise<PurchaseSummary> {
  return apiFetch(`/admin/vendors/${id}/purchases/`);
}

export async function listAdminVendorPurchaseReturns(id: number): Promise<ReturnSummary> {
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

export interface VendorProduct {
  id: number;
  product_name: string;
  vendor_sku: string;
  category_text: string;
  base_quote_price: string | null;
  lead_time_days: number | null;
  active: boolean;
}

export interface VendorProductCreatePayload {
  product_name: string;
  vendor_sku?: string;
  category_text?: string;
  base_quote_price?: string;
  lead_time_days?: number;
  min_order_qty?: string;
  active?: boolean;
}

export async function listAdminVendorProducts(vendorId: number): Promise<{ results?: VendorProduct[] }> {
  return apiFetch(`/admin/vendors/${vendorId}/products/`);
}

export async function createAdminVendorProduct(vendorId: number, payload: VendorProductCreatePayload): Promise<VendorProduct> {
  return apiFetch(`/admin/vendors/${vendorId}/products/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface VendorSourcingPayload {
  customer_pincode?: string;
  customer_city?: string;
  customer_district?: string;
  customer_state?: string;
  customer_branch?: string;
  product_id?: number;
  product_name?: string;
  category_text?: string;
  material?: string;
  quantity?: string;
  required_by?: string;
  budget_amount?: string;
  include_out_of_area?: boolean;
}

export interface VendorSourcingResult {
  results?: VendorSuggestionRow[];
}

export interface VendorSuggestionMatchProduct {
  id: number;
  product_name: string;
  vendor_sku?: string;
  base_quote_price?: string;
  lead_time_days?: number;
}

export interface VendorSuggestionRow {
  vendor_id: number;
  vendor_name: string;
  location_match_level?: string;
  category_match_indicator?: string;
  overall_score?: string;
  suggested_reason?: string;
  price_score?: string;
  quality_score?: string;
  delivery_score?: string;
  warranty_score?: string;
  reliability_score?: string;
  score_breakdown?: {
    location?: string;
    price_band?: string;
    quality?: string;
    delivery?: string;
    warranty?: string;
    reliability?: string;
    catalog_filters_match?: boolean;
  };
  matching_products?: VendorSuggestionMatchProduct[];
  latest_quote?: { quoted_price?: string; lead_time_days?: number; status?: string } | null;
  actions?: { request_quote?: string; open_vendor?: string; compare_quotes?: string };
}

export interface VendorQuoteViaSourcingPayload {
  source_type: string;
  product_name?: string;
  category_text?: string;
  quantity?: string;
  vendor_ids: number[];
  send_to_vendors?: boolean;
  customer_pincode?: string;
  customer_city?: string;
  customer_district?: string;
  customer_state?: string;
  required_by?: string;
  budget_amount?: string;
  product?: number;
}

export async function suggestVendors(payload: VendorSourcingPayload): Promise<VendorSourcingResult> {
  return apiFetch("/admin/vendor-sourcing/suggest/", { method: "POST", body: JSON.stringify(payload) });
}

export async function requestVendorQuotesViaSourcing(payload: VendorQuoteViaSourcingPayload): Promise<ApiObject> {
  return apiFetch("/admin/vendor-sourcing/request-quotes/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type QuoteRequestStatus =
  | "DRAFT"
  | "SENT"
  | "QUOTING"
  | "PARTIALLY_QUOTED"
  | "CLOSED"
  | "CANCELLED";

export type QuoteStatus = "REQUESTED" | "QUOTED" | "ACCEPTED" | "REJECTED" | "EXPIRED";

export interface VendorQuote {
  id: number;
  quote_request: number;
  vendor: number;
  vendor_name?: string;
  quoted_price: string;
  available_quantity: string;
  lead_time_days: number;
  warranty_months: number;
  delivery_available: boolean;
  delivery_charge: string;
  quality_note: string;
  valid_until: string | null;
  status: QuoteStatus;
  submitted_by: number | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteRequest {
  id: number;
  request_no: string;
  source_type: "CUSTOMER_ENQUIRY" | "DIRECT_SALE_ORDER" | "ONLINE_ORDER" | "MANUAL";
  source_id: number | null;
  customer: number | null;
  customer_pincode: string;
  customer_city: string;
  customer_district: string;
  customer_state: string;
  product: number | null;
  product_name: string;
  category_text: string;
  quantity: string;
  required_by: string | null;
  budget_amount: string | null;
  status: QuoteRequestStatus;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  quotes: VendorQuote[];
}

export interface QuoteListResponse {
  results?: QuoteRequest[];
}

export interface AcceptQuoteResponse {
  suggested_purchase_order_url?: string;
}

export interface CreateQuoteRequestPayload {
  source_type: string;
  product_name?: string;
  category_text?: string;
  quantity?: string;
  vendor_ids: number[];
  send_to_vendors?: boolean;
  customer?: number;
  customer_pincode?: string;
  customer_city?: string;
  customer_district?: string;
  customer_state?: string;
}

export async function listAdminQuoteRequests(): Promise<QuoteListResponse> {
  return apiFetch("/admin/vendor-quotes/requests/");
}

export async function createAdminQuoteRequest(payload: CreateQuoteRequestPayload): Promise<QuoteRequest> {
  return apiFetch("/admin/vendor-quotes/requests/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAdminQuoteRequest(id: number): Promise<QuoteRequest> {
  return apiFetch(`/admin/vendor-quotes/requests/${id}/`);
}

export async function acceptAdminVendorQuote(quoteId: number): Promise<AcceptQuoteResponse> {
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
