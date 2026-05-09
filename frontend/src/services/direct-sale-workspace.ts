import { apiFetch } from "@/lib/api";

export type BillingProductSearchRow = {
  id: number;
  name: string;
  product_code?: string | null;
  sku?: string | null;
  category?: string | null;
  subcategory?: string | null;
  base_price: string;
  sale_price: string;
  image?: string | null;
  is_active: boolean;
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
  is_direct_sale_enabled?: boolean;
  lifecycle_status?: string | null;
  inventory_item_id?: number | null;
  current_stock_qty?: string | null;
  stock_tracking_enabled?: boolean;
  delivery_stock_bridge_enabled?: boolean;
  inventory_ready?: boolean;
  inventory_status: {
    on_hand: string;
    reserved: string;
    available: string;
    incoming: string;
    is_in_stock: boolean;
    requires_purchase: boolean;
  };
  last_sale_price?: string | null;
};

export type BillingProductSearchResponse = {
  count: number;
  page?: number;
  page_size?: number;
  results: BillingProductSearchRow[];
};

export type DirectSalePreviewPayload = {
  lines: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    discount_amount?: number;
    tax_rate?: number;
  }>;
  paid_amount?: number;
};

export type DirectSalePreviewResponse = {
  line_totals: Array<{
    product_id: number;
    product_name: string;
    sku?: string | null;
    quantity: string;
    unit_price: string;
    discount_amount: string;
    tax_rate: string;
    line_total: string;
    requires_purchase: boolean;
  }>;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
  stock_warnings: Array<{
    product_id: number;
    product_name: string;
    requested_quantity: string;
    available_quantity: string;
    shortage_quantity: string;
    message: string;
  }>;
  inventory_requirements_preview: Array<Record<string, unknown>>;
  payment_balance_preview: {
    paid_amount: string;
    balance_due: string;
  };
};

export type InventoryRequirementRow = {
  id: number;
  product_id: number;
  product_name: string;
  required_quantity: string;
  available_quantity: string;
  shortage_quantity: string;
  source_module: string;
  source_object_id?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  status: string;
  priority: string;
  note?: string | null;
  created_at: string;
};

export async function searchAdminBillingProducts(params: {
  q?: string;
  stock?: "all" | "in_stock" | "low_stock" | "out_of_stock";
  include_inactive?: boolean;
  include_inventory?: boolean;
  direct_sale_enabled?: boolean;
  page?: number;
  page_size?: number;
}): Promise<BillingProductSearchResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.stock) qs.set("stock", params.stock);
  if (params.include_inactive) qs.set("include_inactive", "1");
  if (params.include_inventory) qs.set("include_inventory", "true");
  if (params.direct_sale_enabled) qs.set("direct_sale_enabled", "true");
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  return apiFetch<BillingProductSearchResponse>(
    `/admin/billing/products/search/${qs.toString() ? `?${qs}` : ""}`
  );
}

export const searchBillingProducts = searchAdminBillingProducts;

export async function searchCashierBillingProducts(params: {
  q?: string;
  stock?: "all" | "in_stock" | "low_stock" | "out_of_stock";
}): Promise<BillingProductSearchResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.stock) qs.set("stock", params.stock);
  return apiFetch<BillingProductSearchResponse>(
    `/cashier/billing/products/search/${qs.toString() ? `?${qs}` : ""}`
  );
}

export async function previewAdminDirectSaleBilling(
  payload: DirectSalePreviewPayload
): Promise<DirectSalePreviewResponse> {
  return apiFetch<DirectSalePreviewResponse>("/admin/direct-sales/preview/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function previewCashierDirectSaleBilling(
  payload: DirectSalePreviewPayload
): Promise<DirectSalePreviewResponse> {
  return apiFetch<DirectSalePreviewResponse>("/cashier/direct-sales/preview/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAdminInventoryRequirements(params: {
  status?: string;
  source_module?: string;
}): Promise<{ count: number; results: InventoryRequirementRow[] }> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.source_module) qs.set("source_module", params.source_module);
  return apiFetch<{ count: number; results: InventoryRequirementRow[] }>(
    `/admin/inventory/requirements/${qs.toString() ? `?${qs}` : ""}`
  );
}
