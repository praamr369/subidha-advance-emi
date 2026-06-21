import { request } from "@/services/api";
import { toResultsArray } from "@/services/api/list";

export type BrochureType =
  | "RENT"
  | "LEASE"
  | "LUCKY_EMI"
  | "DIRECT_SALE"
  | "CUSTOM";

export type BrochureProduct = {
  id: number;
  product_code: string;
  name: string;
  category: string;
  short_description: string;
  public_badge: string;
  sale_price: string | null;
  monthly_rent: string | null;
  lease_monthly_amount: string | null;
  security_deposit: string | null;
  availability_label: string;
  public_product_url: string;
  featured: boolean;
  sort_order: number;
};

export type BrochureDocument = {
  id: number;
  brochure_no: string;
  title: string;
  brochure_type: BrochureType;
  status: "DRAFT" | "GENERATED" | "EXPIRED";
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_name: string;
  filter_payload: Record<string, unknown>;
  product_snapshot: BrochureProduct[];
  product_count: number;
  pdf_url: string;
  public_url: string;
  whatsapp_message: string;
};

export type BrochureGeneratePayload = {
  brochure_type: BrochureType;
  title: string;
  category: string | null;
  product_ids: number[];
  expires_at: string | null;
};

export type BrochurePreview = {
  brochure_type: BrochureType;
  requested_brochure_type: BrochureType;
  title: string;
  product_count: number;
  products: BrochureProduct[];
  terms: string[];
};

export type BrochureProductSettingsRow = {
  product_id: number;
  product_code: string;
  name: string;
  category: string;
  base_price: string | null;
  is_active: boolean;
  lifecycle_status: string;
  image_url: string | null;
  is_emi_enabled: boolean;
  is_rent_enabled: boolean;
  is_lease_enabled: boolean;
  is_direct_sale_enabled: boolean;
  has_settings: boolean;
  visible_on_public_catalog: boolean;
  visible_on_rent_catalog: boolean;
  visible_on_lease_catalog: boolean;
  visible_on_lucky_emi_catalog: boolean;
  visible_on_sale_catalog: boolean;
  monthly_rent: string | null;
  lease_monthly_amount: string | null;
  security_deposit: string | null;
  brochure_sort_order: number;
  brochure_featured: boolean;
  short_description: string;
  public_badge: string;
  updated_at: string | null;
};

export type BrochureProductSettingsUpdate = Partial<{
  visible_on_public_catalog: boolean;
  visible_on_rent_catalog: boolean;
  visible_on_lease_catalog: boolean;
  visible_on_lucky_emi_catalog: boolean;
  visible_on_sale_catalog: boolean;
  monthly_rent: string | null;
  lease_monthly_amount: string | null;
  security_deposit: string | null;
  brochure_sort_order: number;
  brochure_featured: boolean;
  short_description: string;
  public_badge: string;
}>;

export type BrochureSettingsWarning = {
  product_id?: number;
  message: string;
};

export type BrochureProductSettingsPage = {
  count: number;
  results: BrochureProductSettingsRow[];
  page: number;
  page_size: number;
  num_pages: number;
  has_next: boolean;
  has_previous: boolean;
};

export type BrochureProductSettingsListParams = {
  q?: string;
  category?: string;
  brochure_type?: Exclude<BrochureType, "CUSTOM"> | "";
  visible_only?: boolean;
  missing_settings?: boolean;
  has_rent_price?: boolean;
  has_lease_price?: boolean;
  has_sale_price?: boolean;
  featured?: boolean;
  page?: number;
  page_size?: number;
};

export type BrochureProductSettingsUpdateResponse = {
  row: BrochureProductSettingsRow;
  warnings: string[];
};

export type BrochureProductSettingsBulkResponse = {
  updated_count: number;
  skipped_count: number;
  rows: BrochureProductSettingsRow[];
  warnings: BrochureSettingsWarning[];
};

function queryString(
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listBrochureProducts(
  brochureType: BrochureType,
  category?: string
): Promise<BrochureProduct[]> {
  const payload = await request<unknown>(
    `/admin/brochures/products/${queryString({
      brochure_type: brochureType,
      category,
    })}`
  );
  return toResultsArray<BrochureProduct>(payload);
}

export async function previewBrochure(
  payload: BrochureGeneratePayload
): Promise<BrochurePreview> {
  return request<BrochurePreview>("/admin/brochures/preview/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function generateBrochure(
  payload: BrochureGeneratePayload
): Promise<BrochureDocument> {
  return request<BrochureDocument>("/admin/brochures/generate/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listBrochures(): Promise<BrochureDocument[]> {
  const payload = await request<unknown>("/admin/brochures/");
  return toResultsArray<BrochureDocument>(payload);
}

export async function getBrochure(id: number): Promise<BrochureDocument> {
  return request<BrochureDocument>(`/admin/brochures/${id}/`);
}

export async function listBrochureProductSettings(
  params: BrochureProductSettingsListParams = {}
): Promise<BrochureProductSettingsPage> {
  return request<BrochureProductSettingsPage>(
    `/admin/brochures/product-settings/${queryString(params)}`
  );
}

export async function getBrochureProductSettings(
  productId: number
): Promise<BrochureProductSettingsRow> {
  return request<BrochureProductSettingsRow>(
    `/admin/brochures/product-settings/${productId}/`
  );
}

export async function updateBrochureProductSettings(
  productId: number,
  payload: BrochureProductSettingsUpdate
): Promise<BrochureProductSettingsUpdateResponse> {
  return request<BrochureProductSettingsUpdateResponse>(
    `/admin/brochures/product-settings/${productId}/`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function bulkUpdateBrochureProductSettings(payload: {
  product_ids: number[];
  updates: BrochureProductSettingsUpdate;
}): Promise<BrochureProductSettingsBulkResponse> {
  return request<BrochureProductSettingsBulkResponse>(
    "/admin/brochures/product-settings/bulk-update/",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}
