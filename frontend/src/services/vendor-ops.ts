import { apiFetch } from "@/lib/api";

export async function listAdminVendors(): Promise<any> {
  return apiFetch("/admin/vendors/");
}

export async function getAdminVendor(id: number): Promise<any> {
  return apiFetch(`/admin/vendors/${id}/`);
}

export async function listAdminVendorCategories(): Promise<any> {
  return apiFetch("/admin/vendors/categories/");
}

export async function listAdminVendorLedger(id: number): Promise<any> {
  return apiFetch(`/admin/vendors/${id}/ledger/`);
}

export async function getAdminVendorOutstanding(id: number): Promise<any> {
  return apiFetch(`/admin/vendors/${id}/outstanding/`);
}

export async function listAdminVendorPurchases(id: number): Promise<any> {
  return apiFetch(`/admin/vendors/${id}/purchases/`);
}

export async function listAdminVendorPurchaseReturns(id: number): Promise<any> {
  return apiFetch(`/admin/vendors/${id}/purchase-returns/`);
}

export async function listAdminVendorProducts(vendorId: number): Promise<any> {
  return apiFetch(`/admin/vendors/${vendorId}/products/`);
}

export async function createAdminVendorProduct(vendorId: number, payload: Record<string, unknown>): Promise<any> {
  return apiFetch(`/admin/vendors/${vendorId}/products/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function suggestVendors(payload: Record<string, unknown>): Promise<any> {
  return apiFetch("/admin/vendor-sourcing/suggest/", { method: "POST", body: JSON.stringify(payload) });
}

export async function requestVendorQuotesViaSourcing(payload: Record<string, unknown>): Promise<any> {
  return apiFetch("/admin/vendor-sourcing/request-quotes/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAdminQuoteRequests(): Promise<any> {
  return apiFetch("/admin/vendor-quotes/requests/");
}

export async function createAdminQuoteRequest(payload: Record<string, unknown>): Promise<any> {
  return apiFetch("/admin/vendor-quotes/requests/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAdminQuoteRequest(id: number): Promise<any> {
  return apiFetch(`/admin/vendor-quotes/requests/${id}/`);
}

export async function acceptAdminVendorQuote(quoteId: number): Promise<any> {
  return apiFetch(`/admin/vendor-quotes/${quoteId}/accept/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function rejectAdminVendorQuote(quoteId: number): Promise<any> {
  return apiFetch(`/admin/vendor-quotes/${quoteId}/reject/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function listVendorDashboard(): Promise<any> {
  return apiFetch("/vendor/dashboard/");
}

export async function getVendorProfile(): Promise<any> {
  return apiFetch("/vendor/profile/");
}

export async function listVendorQuotes(): Promise<any> {
  return apiFetch("/vendor/quote-requests/");
}

export async function getVendorQuoteRequest(id: number): Promise<any> {
  return apiFetch(`/vendor/quote-requests/${id}/`);
}

export async function submitVendorQuote(requestId: number, payload: Record<string, unknown>): Promise<any> {
  return apiFetch(`/vendor/quote-requests/${requestId}/quote/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listVendorLedger(): Promise<any> {
  return apiFetch("/vendor/ledger/");
}

export async function getVendorOutstanding(): Promise<any> {
  return apiFetch("/vendor/outstanding/");
}

export async function listVendorPurchaseOrders(): Promise<any> {
  return apiFetch("/vendor/purchase-orders/");
}

export async function listVendorPurchaseReturns(): Promise<any> {
  return apiFetch("/vendor/purchase-returns/");
}

export async function listVendorProducts(): Promise<any> {
  return apiFetch("/vendor/products/");
}

export async function createVendorProduct(payload: Record<string, unknown>): Promise<any> {
  return apiFetch("/vendor/products/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
