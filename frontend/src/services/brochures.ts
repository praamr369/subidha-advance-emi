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

export type BrochureEnquiryPlan =
  | "RENT"
  | "LEASE"
  | "LUCKY_EMI"
  | "DIRECT_SALE"
  | "NOT_SURE";

export type PublicBrochureProducts = {
  brochure_no: string;
  title: string;
  brochure_type: BrochureType;
  pdf_url: string;
  products: BrochureProduct[];
};

export type PublicBrochureEnquiryPayload = {
  customer_name: string;
  phone: string;
  alternate_phone?: string;
  email?: string;
  location?: string;
  address_text?: string;
  preferred_plan: BrochureEnquiryPlan;
  message?: string;
  expected_delivery_date?: string | null;
  products?: Array<{
    product_id: number;
    requested_quantity: number;
    preferred_plan?: BrochureEnquiryPlan | null;
    notes?: string;
  }>;
};

export type PublicBrochureEnquiryResponse = {
  enquiry_no: string;
  status: "NEW";
  message: string;
};

export type BrochureEnquiry = {
  id: number;
  enquiry_no: string;
  brochure_id: number;
  brochure_no: string;
  brochure_type: BrochureType;
  customer_name: string;
  phone: string;
  alternate_phone: string;
  email: string;
  location: string;
  address_text: string;
  preferred_plan: BrochureEnquiryPlan;
  message: string;
  internal_note: string;
  expected_delivery_date: string | null;
  follow_up_at: string | null;
  last_contacted_at: string | null;
  status: "NEW" | "CONTACTED" | "QUOTED" | "CONVERTED" | "CLOSED" | "LOST";
  priority: "LOW" | "NORMAL" | "HIGH";
  assigned_to: number | null;
  assigned_to_name: string;
  source: string;
  is_possible_duplicate: boolean;
  duplicate_of: number | null;
  duplicate_of_enquiry_no: string;
  duplicate_reason: string;
  crm_link_status:
    | "NOT_ATTEMPTED"
    | "LINKED"
    | "PARTIAL"
    | "SKIPPED"
    | "FAILED";
  crm_link_message: string;
  products: Array<{
    id: number;
    product_id: number | null;
    product_snapshot: BrochureProduct;
    brochure_product_code: string;
    brochure_product_name: string;
    requested_quantity: number;
    preferred_plan: BrochureEnquiryPlan | null;
    notes: string;
  }>;
  crm_summary: {
    party_id: number | null;
    interaction_id: number | null;
    lead_id: number | null;
    warning: string;
  };
  status_history?: Array<{
    id: number;
    event_type: "CREATED" | "STATUS" | "ASSIGNMENT" | "PRIORITY" | "FOLLOW_UP";
    from_status: string;
    to_status: string;
    note: string;
    changed_by: number | null;
    changed_by_name: string;
    created_at: string;
  }>;
  quotation_summaries: Array<{
    id: number;
    quotation_no: string;
    status: BrochureQuotationStatus;
    quotation_type: BrochureQuotationType;
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
};

export type BrochureQuotationStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export type BrochureQuotationType =
  | "RENT"
  | "LEASE"
  | "LUCKY_EMI"
  | "DIRECT_SALE"
  | "MIXED";

export type BrochureQuotationLine = {
  id?: number;
  product_id: number | null;
  product_snapshot: Partial<BrochureProduct>;
  product_code: string;
  product_name: string;
  description: string;
  plan_type: Exclude<BrochureQuotationType, "MIXED">;
  quantity: number;
  unit_price: string;
  monthly_amount: string;
  tenure_months: number | null;
  security_deposit: string;
  discount_amount: string;
  line_total: string;
  availability_label: string;
  sort_order?: number;
};

export type BrochureQuotationStatusHistory = {
  id: number;
  from_status: string;
  to_status: BrochureQuotationStatus;
  note: string;
  changed_by: number | null;
  changed_by_name: string;
  created_at: string;
};

export type BrochureQuotationTotals = {
  subtotal_amount: string;
  discount_amount: string;
  delivery_charge: string;
  security_deposit_total: string;
  total_payable_now: string;
  recurring_monthly_total: string;
  grand_total: string;
};

export type BrochureQuotation = BrochureQuotationTotals & {
  id: number;
  quotation_no: string;
  enquiry_id: number | null;
  brochure_id: number | null;
  customer_name: string;
  phone: string;
  email: string;
  location: string;
  address_text: string;
  quotation_type: BrochureQuotationType;
  status: BrochureQuotationStatus;
  validity_date: string | null;
  expected_delivery_date: string | null;
  totals: BrochureQuotationTotals;
  terms_text: string;
  internal_note: string;
  sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_name: string;
  lines: BrochureQuotationLine[];
  status_history: BrochureQuotationStatusHistory[];
  enquiry_summary: { id: number; enquiry_no: string; status: string } | null;
  brochure_summary: { id: number; brochure_no: string; title: string } | null;
  crm_summary: { party_id: number | null; lead_id: number | null };
  pdf_url: string;
  public_url: string;
  whatsapp_message: string;
};

export type BrochureQuotationList = {
  count: number;
  results: BrochureQuotation[];
  page: number;
  page_size: number;
  num_pages: number;
  has_next: boolean;
  has_previous: boolean;
};

export type BrochureQuotationListParams = Partial<{
  q: string;
  status: BrochureQuotationStatus | "";
  quotation_type: BrochureQuotationType | "";
  date_from: string;
  date_to: string;
  enquiry_id: number;
  page: number;
  page_size: number;
}>;

export type BrochureQuotationWriteLine = Omit<
  BrochureQuotationLine,
  "id" | "line_total" | "product_snapshot"
> & {
  product_snapshot?: Partial<BrochureProduct>;
};

export type BrochureQuotationCreatePayload = {
  enquiry_id?: number | null;
  brochure_id?: number | null;
  customer_name: string;
  phone: string;
  email?: string;
  location?: string;
  address_text?: string;
  quotation_type: BrochureQuotationType;
  validity_date?: string | null;
  expected_delivery_date?: string | null;
  discount_amount?: string;
  delivery_charge?: string;
  terms_text?: string;
  internal_note?: string;
  lines: BrochureQuotationWriteLine[];
};

export type PublicBrochureQuotation = BrochureQuotationTotals & {
  quotation_no: string;
  status: BrochureQuotationStatus;
  validity_date: string | null;
  customer_display_name: string;
  quotation_type: BrochureQuotationType;
  lines: BrochureQuotationLine[];
  terms_text: string;
  pdf_url: string;
  business_contact: {
    business_name: string;
    phone: string;
    email: string;
    address: string;
  };
  disclaimer: string;
  created_at: string;
};

export type BrochureEnquiryList = {
  count: number;
  results: BrochureEnquiry[];
  page: number;
  page_size: number;
  num_pages: number;
  has_next: boolean;
  has_previous: boolean;
};

export type BrochureEnquiryListParams = Partial<{
  q: string;
  status: string;
  preferred_plan: string;
  brochure_type: string;
  assigned_to: number;
  date_from: string;
  date_to: string;
  priority: string;
  product_id: number;
  follow_up_due: boolean;
  possible_duplicate: boolean;
  crm_link_status: string;
  page: number;
  page_size: number;
}>;

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

export async function listPublicBrochureProducts(
  token: string
): Promise<PublicBrochureProducts> {
  return request<PublicBrochureProducts>(
    `/public/brochures/${encodeURIComponent(token)}/products/`
  );
}

export async function createPublicBrochureEnquiry(
  token: string,
  payload: PublicBrochureEnquiryPayload
): Promise<PublicBrochureEnquiryResponse> {
  return request<PublicBrochureEnquiryResponse>(
    `/public/brochures/${encodeURIComponent(token)}/enquiries/`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export async function listBrochureEnquiries(
  params: BrochureEnquiryListParams = {}
): Promise<BrochureEnquiryList> {
  return request<BrochureEnquiryList>(
    `/admin/brochures/enquiries/${queryString(params)}`
  );
}

export async function getBrochureEnquiry(id: number): Promise<BrochureEnquiry> {
  return request<BrochureEnquiry>(`/admin/brochures/enquiries/${id}/`);
}

export async function updateBrochureEnquiry(
  id: number,
  payload: Partial<
    Pick<
      BrochureEnquiry,
      "status" | "priority" | "assigned_to" | "internal_note" | "expected_delivery_date" | "follow_up_at"
    >
  >
): Promise<BrochureEnquiry> {
  return request<BrochureEnquiry>(`/admin/brochures/enquiries/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function assignBrochureEnquiry(
  id: number,
  payload: { assigned_to: number | null }
): Promise<BrochureEnquiry> {
  return request<BrochureEnquiry>(`/admin/brochures/enquiries/${id}/assign/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function markBrochureEnquiryContacted(
  id: number
): Promise<BrochureEnquiry> {
  return request<BrochureEnquiry>(
    `/admin/brochures/enquiries/${id}/mark-contacted/`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function closeBrochureEnquiry(
  id: number,
  payload: { status: "CLOSED" | "LOST"; internal_note?: string }
): Promise<BrochureEnquiry> {
  return request<BrochureEnquiry>(`/admin/brochures/enquiries/${id}/close/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listBrochureQuotations(
  params: BrochureQuotationListParams = {}
): Promise<BrochureQuotationList> {
  return request<BrochureQuotationList>(
    `/admin/brochures/quotations/${queryString(params)}`
  );
}

export async function getBrochureQuotation(
  id: number
): Promise<BrochureQuotation> {
  return request<BrochureQuotation>(`/admin/brochures/quotations/${id}/`);
}

export async function createBrochureQuotation(
  payload: BrochureQuotationCreatePayload
): Promise<BrochureQuotation> {
  return request<BrochureQuotation>("/admin/brochures/quotations/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createBrochureQuotationFromEnquiry(
  enquiryId: number
): Promise<BrochureQuotation> {
  return request<BrochureQuotation>(
    `/admin/brochures/quotations/from-enquiry/${enquiryId}/`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function updateBrochureQuotation(
  id: number,
  payload: Partial<
    Pick<
      BrochureQuotation,
      | "customer_name"
      | "phone"
      | "email"
      | "location"
      | "address_text"
      | "validity_date"
      | "expected_delivery_date"
      | "discount_amount"
      | "delivery_charge"
      | "terms_text"
      | "internal_note"
    >
  > & { lines?: BrochureQuotationWriteLine[] }
): Promise<BrochureQuotation> {
  return request<BrochureQuotation>(`/admin/brochures/quotations/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function recalculateBrochureQuotation(
  id: number
): Promise<BrochureQuotation> {
  return request<BrochureQuotation>(
    `/admin/brochures/quotations/${id}/recalculate/`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

async function quotationStatusAction(
  id: number,
  action: "send" | "accept" | "reject" | "cancel",
  payload: { note?: string } = {}
): Promise<BrochureQuotation> {
  return request<BrochureQuotation>(
    `/admin/brochures/quotations/${id}/${action}/`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export const sendBrochureQuotation = (id: number) =>
  quotationStatusAction(id, "send");
export const acceptBrochureQuotation = (id: number) =>
  quotationStatusAction(id, "accept");
export const rejectBrochureQuotation = (
  id: number,
  payload: { note?: string } = {}
) => quotationStatusAction(id, "reject", payload);
export const cancelBrochureQuotation = (
  id: number,
  payload: { note?: string } = {}
) => quotationStatusAction(id, "cancel", payload);

export async function regenerateBrochureQuotationPdf(
  id: number
): Promise<BrochureQuotation> {
  return request<BrochureQuotation>(
    `/admin/brochures/quotations/${id}/regenerate-pdf/`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function getPublicQuotation(
  token: string
): Promise<PublicBrochureQuotation> {
  return request<PublicBrochureQuotation>(
    `/public/quotations/${encodeURIComponent(token)}/`
  );
}
