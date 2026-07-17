import { apiFetch } from "@/lib/api";
import { resolveApiMediaUrl } from "@/lib/media";

export type ProductRequestType = "ADVANCE_EMI" | "RENT" | "LEASE" | "DIRECT_SALE";
export type ProductRequestStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";

export type ProductRequestRecord = {
  id: number;
  requester?: number | null;
  requester_username?: string;
  requester_role_snapshot?: string;
  partner?: number | null;
  partner_id?: number | null;
  partner_username?: string | null;
  customer?: number | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  requested_customer_name?: string;
  requested_customer_phone?: string;
  requested_customer_email?: string;
  requested_customer_address?: string;
  requested_customer_city?: string;
  product?: number | null;
  product_id?: number | null;
  product_name?: string | null;
  product_code?: string | null;
  product_image?: string | null;
  request_type: ProductRequestType;
  batch?: number | null;
  batch_id?: number | null;
  batch_code?: string | null;
  preferred_lucky_number?: number | null;
  requested_tenure_months_snapshot?: number | null;
  notes?: string;
  status: ProductRequestStatus;
  reviewed_by?: number | null;
  reviewed_by_username?: string | null;
  reviewed_at?: string | null;
  review_note?: string;
  approved_subscription_id?: number | null;
  approved_subscription_number?: string | null;
  approved_direct_sale_id?: number | null;
  approved_direct_sale_number?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProductRequestListResponse = {
  count: number;
  results: ProductRequestRecord[];
  page: number;
  page_size: number;
  num_pages: number;
  has_next: boolean;
  has_previous: boolean;
};

export type ProductRequestCreateResponse = {
  detail?: string;
} & Partial<ProductRequestRecord>;

export type ProductRequestDecisionResponse = {
  detail?: string;
} & Partial<ProductRequestRecord>;

export type ProductRequestProductOption = {
  id: number;
  name: string;
  product_code?: string | null;
  base_price?: string;
  image?: string | null;
  category?: string | null;
  subcategory?: string | null;
};

export type ProductRequestBatchOption = {
  id: number;
  batch_code?: string | null;
  duration_months?: number | null;
  available_slots?: number | null;
  start_date?: string | null;
  status?: string | null;
};

export type ProductRequestCustomerOption = {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  kyc_status?: string | null;
};

export type ProductRequestOptions = {
  products: ProductRequestProductOption[];
  batches: ProductRequestBatchOption[];
  lucky_numbers: number[];
  customers?: ProductRequestCustomerOption[];
};

type RoleScope = "customer" | "partner" | "admin";

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return toNumber(value);
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toStringOrUndefined(value) ?? null;
}

function toArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function buildQuery(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function normalizeProductRequest(item: unknown): ProductRequestRecord {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: toNumber(row.id),
    requester: toNullableNumber(row.requester),
    requester_username: toStringOrUndefined(row.requester_username),
    requester_role_snapshot: toStringOrUndefined(row.requester_role_snapshot),
    partner: toNullableNumber(row.partner),
    partner_id: toNullableNumber(row.partner_id) ?? toNullableNumber(row.partner),
    partner_username: toNullableString(row.partner_username),
    customer: toNullableNumber(row.customer),
    customer_id: toNullableNumber(row.customer_id) ?? toNullableNumber(row.customer),
    customer_name: toNullableString(row.customer_name),
    customer_phone: toNullableString(row.customer_phone),
    customer_email: toNullableString(row.customer_email),
    requested_customer_name: toStringOrUndefined(row.requested_customer_name) ?? "",
    requested_customer_phone: toStringOrUndefined(row.requested_customer_phone) ?? "",
    requested_customer_email: toStringOrUndefined(row.requested_customer_email) ?? "",
    requested_customer_address: toStringOrUndefined(row.requested_customer_address) ?? "",
    requested_customer_city: toStringOrUndefined(row.requested_customer_city) ?? "",
    product: toNullableNumber(row.product),
    product_id: toNullableNumber(row.product_id) ?? toNullableNumber(row.product),
    product_name: toNullableString(row.product_name),
    product_code: toNullableString(row.product_code),
    product_image: resolveApiMediaUrl(toNullableString(row.product_image)),
    request_type: (toStringOrUndefined(row.request_type) as ProductRequestType) || "ADVANCE_EMI",
    batch: toNullableNumber(row.batch),
    batch_id: toNullableNumber(row.batch_id) ?? toNullableNumber(row.batch),
    batch_code: toNullableString(row.batch_code),
    preferred_lucky_number: toNullableNumber(row.preferred_lucky_number),
    requested_tenure_months_snapshot: toNullableNumber(row.requested_tenure_months_snapshot),
    notes: toStringOrUndefined(row.notes) ?? "",
    status:
      (toStringOrUndefined(row.status) as ProductRequestStatus | undefined) ??
      "SUBMITTED",
    reviewed_by: toNullableNumber(row.reviewed_by),
    reviewed_by_username: toNullableString(row.reviewed_by_username),
    reviewed_at: toNullableString(row.reviewed_at),
    review_note: toStringOrUndefined(row.review_note) ?? "",
    approved_subscription_id: toNullableNumber(row.approved_subscription_id),
    approved_subscription_number: toNullableString(row.approved_subscription_number),
    approved_direct_sale_id: toNullableNumber(row.approved_direct_sale_id),
    approved_direct_sale_number: toNullableString(row.approved_direct_sale_number),
    created_at: toStringOrUndefined(row.created_at),
    updated_at: toStringOrUndefined(row.updated_at),
  };
}

function normalizeListResponse(payload: unknown): ProductRequestListResponse {
  const root = (payload ?? {}) as Record<string, unknown>;
  return {
    count: toNumber(root.count, 0),
    results: toArray(root.results).map(normalizeProductRequest),
    page: Math.max(toNumber(root.page, 1), 1),
    page_size: Math.max(toNumber(root.page_size, 25), 1),
    num_pages: Math.max(toNumber(root.num_pages, 0), 0),
    has_next: root.has_next === true,
    has_previous: root.has_previous === true,
  };
}

function normalizeOptions(payload: unknown): ProductRequestOptions {
  const root = (payload ?? {}) as Record<string, unknown>;
  return {
    products: toArray(root.products).map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id: toNumber(row.id),
        name: toStringOrUndefined(row.name) ?? "",
        product_code: toNullableString(row.product_code),
        base_price: toStringOrUndefined(row.base_price) ?? "0.00",
        image: resolveApiMediaUrl(toNullableString(row.image)),
        category: toNullableString(row.category),
        subcategory: toNullableString(row.subcategory),
      };
    }),
    batches: toArray(root.batches).map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id: toNumber(row.id),
        batch_code: toNullableString(row.batch_code),
        duration_months: toNullableNumber(row.duration_months),
        available_slots: toNullableNumber(row.available_slots),
        start_date: toNullableString(row.start_date),
        status: toNullableString(row.status),
      };
    }),
    lucky_numbers: toArray(root.lucky_numbers).map((value) => toNumber(value)),
    customers: root.customers
      ? toArray(root.customers).map((item) => {
          const row = (item ?? {}) as Record<string, unknown>;
          return {
            id: toNumber(row.id),
            name: toStringOrUndefined(row.name) ?? "",
            phone: toStringOrUndefined(row.phone) ?? "",
            email: toNullableString(row.email),
            kyc_status: toNullableString(row.kyc_status),
          };
        })
      : undefined,
  };
}

function basePath(scope: RoleScope): string {
  if (scope === "customer") return "/customer";
  if (scope === "partner") return "/partner";
  return "/admin";
}

export async function listProductRequests(
  scope: RoleScope,
  params: {
    status?: string;
    requestType?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  } = {}
): Promise<ProductRequestListResponse> {
  const query = buildQuery({
    status: params.status,
    request_type: params.requestType,
    q: params.q,
    page: params.page,
    page_size: params.pageSize,
  });
  const payload = await apiFetch<unknown>(
    `${basePath(scope)}/product-requests/${query}`
  );
  return normalizeListResponse(payload);
}

export async function getProductRequest(
  scope: RoleScope,
  id: number | string
): Promise<ProductRequestRecord> {
  const payload = await apiFetch<unknown>(`${basePath(scope)}/product-requests/${id}`);
  return normalizeProductRequest(payload);
}

export async function getProductRequestOptions(
  scope: RoleScope,
  params: {
    batchId?: number | string;
    customerQ?: string;
    q?: string;
  } = {}
): Promise<ProductRequestOptions> {
  const query = buildQuery({
    batch: params.batchId,
    customer_q: params.customerQ,
    q: params.q,
  });
  const payload = await apiFetch<unknown>(
    `${basePath(scope)}/product-request-options/${query}`
  );
  return normalizeOptions(payload);
}

export async function createCustomerProductRequest(payload: {
  product_id: number;
  request_type: string;
  batch_id?: number | null;
  preferred_lucky_number?: number | null;
  notes?: string;
}): Promise<ProductRequestCreateResponse> {
  const response = await apiFetch<unknown>("/customer/product-requests/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    detail: toStringOrUndefined(root.detail),
    ...normalizeProductRequest(root),
  };
}

export async function cancelCustomerProductRequest(
  id: number | string
): Promise<ProductRequestCreateResponse> {
  const response = await apiFetch<unknown>(
    `/customer/product-requests/${id}/cancel/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    detail: toStringOrUndefined(root.detail),
    ...normalizeProductRequest(root),
  };
}

export async function createPartnerProductRequest(payload: {
  customer_id?: number;
  requested_customer_name?: string;
  requested_customer_phone?: string;
  requested_customer_email?: string;
  requested_customer_address?: string;
  requested_customer_city?: string;
  product_id: number;
  request_type: string;
  batch_id?: number | null;
  preferred_lucky_number?: number | null;
  notes?: string;
}): Promise<ProductRequestCreateResponse> {
  const response = await apiFetch<unknown>("/partner/product-requests/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    detail: toStringOrUndefined(root.detail),
    ...normalizeProductRequest(root),
  };
}

export async function cancelPartnerProductRequest(
  id: number | string
): Promise<ProductRequestCreateResponse> {
  const response = await apiFetch<unknown>(
    `/partner/product-requests/${id}/cancel/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    detail: toStringOrUndefined(root.detail),
    ...normalizeProductRequest(root),
  };
}

export async function decideAdminProductRequest(
  id: number | string,
  payload: Record<string, unknown>
): Promise<ProductRequestDecisionResponse> {
  const response = await apiFetch<unknown>(
    `/admin/product-requests/${id}/decision/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    detail: toStringOrUndefined(root.detail),
    ...normalizeProductRequest(root),
  };
}

export async function cancelAdminProductRequest(
  id: number | string,
  reviewNote = ""
): Promise<ProductRequestDecisionResponse> {
  const response = await apiFetch<unknown>(
    `/admin/product-requests/${id}/cancel/`,
    {
      method: "POST",
      body: JSON.stringify({ review_note: reviewNote }),
    }
  );
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    detail: toStringOrUndefined(root.detail),
    ...normalizeProductRequest(root),
  };
}

export async function editAdminProductRequest(
  id: number | string,
  payload: {
    notes?: string;
    requested_customer_name?: string;
    requested_customer_phone?: string;
    requested_customer_email?: string;
    requested_customer_address?: string;
    requested_customer_city?: string;
  }
): Promise<ProductRequestDecisionResponse> {
  const response = await apiFetch<unknown>(
    `/admin/product-requests/${id}/edit/`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    detail: toStringOrUndefined(root.detail),
    ...normalizeProductRequest(root),
  };
}

