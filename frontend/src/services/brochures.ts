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

function queryString(params: Record<string, string | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && value.trim()) search.set(key, value.trim());
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

