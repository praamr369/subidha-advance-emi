import { API_BASE_URL } from "@/lib/constants";
import { resolveApiMediaUrl } from "@/lib/media";

export type PublicStats = {
  total_batches: number;
  total_subscriptions: number;
  active_subscriptions: number;
  active_rent_subscriptions: number;
  active_lease_subscriptions: number;
  total_winners: number;
  batch_total_capacity: number;
  batch_available_seats: number;
  batch_reserved_seats: number;
};

export type PublicWinner = {
  id: number;
  batch: string;
  batch_code: string;
  batch_name?: string;
  month: number;
  draw_month: number;
  draw_date: string;
  draw_datetime?: string;
  revealed_at?: string | null;
  lucky_id: string | null;
  winner_lucky_number?: number | null;
  winner_name_masked?: string | null;
  product_name?: string | null;
  committed_hash?: string | null;
  public_commit_hash?: string | null;
  verification_status?: string | null;
  waived_emi_count?: number;
  waived_amount?: string;
  /** Resolved catalogue image for the winner's subscription product, when present. */
  product_image?: string | null;
};

export type PublicLuckyDrawSummary = {
  id: number;
  batch_code: string;
  draw_month: number;
  draw_date: string;
  commitment_published_at?: string | null;
  reveal_timestamp?: string | null;
  public_commit_hash?: string | null;
  eligible_snapshot_count?: number;
  public_verification_status?: string | null;
  verification_status?: string | null;
  public_explanation?: string | null;
  winner_benefit_note?: string | null;
  waiver_scope?: string | null;
  winner_name_masked?: string | null;
  winner_lucky_number?: number | null;
  product_name?: string | null;
  product_image?: string | null;
  waived_emi_count?: number;
  waived_amount?: string | null;
};

export type PublicLuckyDrawSummaryResponse = {
  draw: PublicLuckyDrawSummary | null;
};

export type PublicLuckyDrawCertificateResponse = {
  certificate: PublicLuckyDrawSummary | null;
};

export type PublicLuckyDrawVerification = {
  id: number;
  batch_code: string;
  draw_month: number;
  public_commit_hash?: string | null;
  commitment_published_at?: string | null;
  reveal_timestamp?: string | null;
  eligible_snapshot_count?: number;
  public_verification_status?: string | null;
  verification_status?: string | null;
  revealed_seed?: string | null;
  hash_matches?: boolean | null;
  recalculated_hash?: string | null;
  verification_message?: string | null;
  public_explanation?: string | null;
};

export type PublicLuckyDrawVerificationResponse = {
  verification: PublicLuckyDrawVerification | null;
};

export type PublicLuckyDrawWinnerResponse = {
  winner: PublicLuckyDrawSummary | null;
};

export type PublicLatestWinnerResponse = {
  winner: PublicWinner | null;
};

export type PublicWinnerHistoryResponse = {
  count: number;
  limit: number;
  results: PublicWinner[];
};

export type PublicLeadPayload = {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  product_id?: number;
  interested_product?: string;
  preferred_emi_amount?: string | number;
  notes?: string;
};

export type PublicLeadResponse = {
  message: string;
  lead_id?: number;
  created_at?: string;
  data: PublicLeadPayload;
};

export type PublicProduct = {
  id: number;
  product_code: string;
  name: string;
  /** SEO-enriched name: base name + key variant attributes (Size, Material, etc.). Falls back to name. */
  seo_name?: string | null;
  base_price: string;
  /** Min/max price across active variant SKUs. Present on blueprint products where base_price=0. */
  price_range?: { min: string; max: string; count: number } | null;
  /** True when this Product record is a variant SKU (not the base blueprint). */
  is_variant_page?: boolean;
  /** ID of the base Product when this is a variant page. */
  parent_product_id?: number | null;
  /** product_code (URL slug) of the base Product when this is a variant page. */
  parent_product_code?: string | null;
  /** The attributes that define this specific variant (e.g. {Size: "King (6x7)"}). */
  selected_attributes?: Record<string, string>;
  /** Other variant Products under the same blueprint. */
  sibling_variants?: Array<{
    product_id: number;
    product_code: string;
    sku: string;
    label: string;
    price: string;
    image?: string | null;
    attributes: Record<string, string>;
    is_current: boolean;
  }> | null;
  category?: string | null;
  /** Canonical public category slug from the category master (SEO-3). */
  category_slug?: string | null;
  subcategory?: string | null;
  image?: string | null;
  video?: string | null;
  /** Optional extra gallery URLs when the API provides them (deduped with `image` on the client). */
  gallery_images?: string[] | null;
  /** PIM gallery video URLs */
  gallery_videos?: string[] | null;
  description?: string | null;
  pim_description?: string | null;
  stock_status?: "IN_STOCK" | "MAKE_TO_ORDER";
  pim_attributes?: Array<{ name: string; value: string }>;
  pim_variants?: Array<{
    id: number;
    sku: string;
    price: string;
    attributes: Record<string, string>;
    is_low_stock: boolean;
    stock_status?: "IN_STOCK" | "MAKE_TO_ORDER";
    image?: string | null;
    product_id?: number | null;
    product_code?: string | null;
  }>;
  /** Cash / EMI / rent / lease pricing with live offer discounts applied. */
  scheme_pricing?: ProductSchemePricing | null;
};

/** One selectable tenure within a scheme. */
export type SchemeTenureQuote = {
  tenure_months: number;
  monthly_amount: string;
  /** Rent/lease only; null for cash and EMI. */
  security_deposit_percent: string | null;
  security_deposit_amount: string | null;
  /** Security deposit + first instalment. */
  upfront_total: string;
  template_code: string;
};

/** Public shape: offer name and saving only — internal codes stay server-side. */
export type SchemeDiscount = {
  package_name: string;
  amount_off: string;
};

export type SchemeQuote = {
  scheme: PublicScheme;
  available: boolean;
  base_price: string;
  effective_price: string;
  has_discount: boolean;
  discount: SchemeDiscount | null;
  lowest_monthly: string | null;
  tenures: SchemeTenureQuote[];
};

export type PublicScheme = "CASH" | "EMI" | "RENT" | "LEASE";

/** Shared rules so a customer-typed tenure recalculates to the same figures the server would return. */
export type SchemePricingRules = {
  tenure_min: number;
  tenure_max: number;
  tenure_presets: number[];
  deposit_schemes: PublicScheme[];
  deposit_bands: Array<{ up_to: string | null; percent: string }>;
};

export type ProductSchemePricing = {
  product_id: number;
  product_code: string | null;
  priced_on: string;
  cash_price: string | null;
  cash_base_price: string | null;
  cash_has_discount: boolean;
  lowest_monthly: string | null;
  available_schemes: PublicScheme[];
  schemes: Partial<Record<PublicScheme, SchemeQuote>>;
  rules: SchemePricingRules;
};

export type PublicBusinessProfile = {
  display_name?: string;
  tagline?: string;
  hero_title?: string;
  hero_subtitle?: string;
  support_phone?: string;
  support_email?: string;
  whatsapp_phone?: string;
  whatsapp_link?: string;
  facebook_url?: string;
  instagram_url?: string;
  youtube_url?: string;
  address_text?: string;
  map_url?: string;
  business_hours?: string;
  public_logo_url?: string;
  updated_at?: string;
};

export type PublicPolicyPage = {
  slug: string;
  version: number;
  category: string;
  title: string;
  summary: string;
  content: string;
  rendered_content?: string;
  effective_date?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
};

export type PublicPolicyListItem = {
  slug: string;
  version: number;
  category: string;
  title: string;
  summary: string;
  effective_date?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
};

export type PublicPolicyListResponse = {
  count: number;
  results: PublicPolicyListItem[];
};

export type PublicPolicyDetailResponse = {
  policy: PublicPolicyPage | null;
};

export type PublicBusinessComplianceSummary = {
  business_name: string;
  business_location: string;
  website_url: string;
  business_phone: string;
  business_email: string;
  business_address: string;
  gst_status_text: string;
  udyam_status_text: string;
  public_documents: Array<{
    document_type: string;
    title: string;
    verification_status: string;
    public_summary: string;
    verified_at?: string | null;
  }>;
  private_document_disclaimer: string;
};

type PublicBusinessProfileResponse = {
  profile: PublicBusinessProfile | null;
};

export type PublicProductCategory = {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  image: string | null;
  display_order: number;
};

type PublicProductsResponse = {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: PublicProduct[];
};

type FetchPublicOptions = RequestInit & {
  cache?: RequestCache;
};

function buildPublicApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => null);
}

function resolveErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "string" && body.trim()) {
    return body;
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;

    if (typeof record.detail === "string" && record.detail.trim()) {
      return record.detail;
    }

    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }

    if (typeof record.error === "string" && record.error.trim()) {
      return record.error;
    }
  }

  return fallback;
}

async function fetchPublic<T>(
  path: string,
  options: FetchPublicOptions = {},
  fallbackMessage = "Unable to load public data."
): Promise<T> {
  const response = await fetch(buildPublicApiUrl(path), {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(resolveErrorMessage(body, fallbackMessage));
  }

  return body as T;
}

function normalizePublicProduct(product: PublicProduct): PublicProduct {
  const next: PublicProduct = {
    ...product,
    image: resolveApiMediaUrl(product.image),
  };
  if (Array.isArray(product.gallery_images)) {
    next.gallery_images = product.gallery_images
      .map((url) => resolveApiMediaUrl(url))
      .filter((url): url is string => Boolean(url));
  }
  return next;
}

function normalizePublicWinner(row: PublicWinner): PublicWinner {
  return {
    ...row,
    product_image: resolveApiMediaUrl(row.product_image),
  };
}

function normalizePublicLuckyDraw(row: PublicLuckyDrawSummary): PublicLuckyDrawSummary {
  return {
    ...row,
    product_image: resolveApiMediaUrl(row.product_image),
  };
}

export async function getPublicStats(): Promise<PublicStats> {
  return fetchPublic<PublicStats>(
    "/public/stats/",
    { cache: "no-store" },
    "Unable to load live business stats right now."
  );
}

export async function getPublicLatestWinner(): Promise<PublicLatestWinnerResponse> {
  const payload = await fetchPublic<PublicLatestWinnerResponse>(
    "/public/latest-winner/",
    { cache: "no-store" },
    "Unable to load the latest winner right now."
  );
  return {
    winner: payload.winner ? normalizePublicWinner(payload.winner) : null,
  };
}

export async function getPublicLuckyDrawLatestSummary(): Promise<PublicLuckyDrawSummaryResponse> {
  const payload = await fetchPublic<PublicLuckyDrawSummaryResponse>(
    "/public/lucky-draws/latest/",
    { cache: "no-store" },
    "Unable to load the latest Lucky Draw summary right now."
  );
  return {
    draw: payload.draw ? normalizePublicLuckyDraw(payload.draw) : null,
  };
}

export async function getPublicLuckyDrawSummary(drawId: number | string): Promise<PublicLuckyDrawSummaryResponse> {
  const payload = await fetchPublic<PublicLuckyDrawSummaryResponse>(
    `/public/lucky-draws/${drawId}/trust-summary/`,
    { cache: "no-store" },
    "Unable to load the Lucky Draw summary right now."
  );
  return {
    draw: payload.draw ? normalizePublicLuckyDraw(payload.draw) : null,
  };
}

export async function getPublicLuckyDrawCertificate(
  drawId: number | string
): Promise<PublicLuckyDrawCertificateResponse> {
  const payload = await fetchPublic<PublicLuckyDrawCertificateResponse>(
    `/public/lucky-draws/${drawId}/certificate/`,
    { cache: "no-store" },
    "Unable to load the Lucky Draw certificate right now."
  );
  return {
    certificate: payload.certificate ? normalizePublicLuckyDraw(payload.certificate) : null,
  };
}

export async function getPublicLuckyDrawVerification(
  drawId: number | string
): Promise<PublicLuckyDrawVerificationResponse> {
  return fetchPublic<PublicLuckyDrawVerificationResponse>(
    `/public/lucky-draws/${drawId}/verification/`,
    { cache: "no-store" },
    "Unable to load the Lucky Draw verification right now."
  );
}

export async function getPublicLuckyDrawWinner(
  drawId: number | string
): Promise<PublicLuckyDrawWinnerResponse> {
  const payload = await fetchPublic<PublicLuckyDrawWinnerResponse>(
    `/public/lucky-draws/${drawId}/winner/`,
    { cache: "no-store" },
    "Unable to load the Lucky Draw winner right now."
  );
  return {
    winner: payload.winner ? normalizePublicLuckyDraw(payload.winner) : null,
  };
}

export async function getPublicWinnerHistory(
  limit = 24
): Promise<PublicWinnerHistoryResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  const payload = await fetchPublic<PublicWinnerHistoryResponse>(
    `/public/winner-history/?${params.toString()}`,
    { cache: "no-store" },
    "Unable to load winner history right now."
  );
  return {
    ...payload,
    results: payload.results.map(normalizePublicWinner),
  };
}

export async function getPublicWinners(
  limit = 12
): Promise<PublicWinnerHistoryResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  const payload = await fetchPublic<PublicWinnerHistoryResponse>(
    `/public/winners/?${params.toString()}`,
    { cache: "no-store" },
    "Unable to load winners right now."
  );
  return {
    ...payload,
    results: payload.results.map(normalizePublicWinner),
  };
}

export async function listPublicProductCategories(): Promise<PublicProductCategory[]> {
  const payload = await fetchPublic<{ results: PublicProductCategory[] }>(
    "/public/product-categories/",
    { cache: "no-store" },
    "Unable to load categories right now."
  );
  return payload.results || [];
}

export async function listPublicProducts(options?: {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  subcategory?: string;
  min_price?: number;
  max_price?: number;
  include_variants?: boolean;
}): Promise<{
  products: PublicProduct[];
  count: number;
  next?: string | null;
  previous?: string | null;
}> {
  const params = new URLSearchParams();
  if (options?.page) params.set("page", String(options.page));
  if (options?.limit) params.set("page_size", String(options.limit));
  if (options?.search) params.set("search", options.search);
  if (options?.category) params.set("category", options.category);
  if (options?.subcategory) params.set("subcategory", options.subcategory);
  if (options?.min_price) params.set("min_price", String(options.min_price));
  if (options?.max_price) params.set("max_price", String(options.max_price));
  if (options?.include_variants) params.set("include_variants", "true");

  const qs = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchPublic<PublicProductsResponse>(
    `/public/products/${qs}`,
    { cache: "no-store" },
    "Unable to load products right now."
  );

  const products = Array.isArray(payload.results)
    ? payload.results.map((product) => normalizePublicProduct(product))
    : [];

  return {
    products,
    count: typeof payload.count === "number" ? payload.count : products.length,
    next: payload.next,
    previous: payload.previous,
  };
}

export async function getPublicProductDetail(
  id: string | number
): Promise<PublicProduct | null> {
  try {
    const product = await fetchPublic<PublicProduct>(
      `/public/products/${id}/`,
      { cache: "no-store" },
      "Unable to load product details right now."
    );

    return normalizePublicProduct(product);
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes("not found")) {
      return null;
    }

    throw error;
  }
}

export async function submitPublicLead(
  payload: PublicLeadPayload
): Promise<PublicLeadResponse> {
  return fetchPublic<PublicLeadResponse>(
    "/public/leads/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    "Unable to submit your enquiry right now."
  );
}

export async function getPublicBusinessProfile(): Promise<PublicBusinessProfile | null> {
  const payload = await fetchPublic<PublicBusinessProfileResponse>(
    "/public/business-profile/",
    { cache: "no-store" },
    "Unable to load public business profile right now."
  );

  return payload.profile ?? null;
}

export async function listPublicPolicies(): Promise<PublicPolicyListResponse> {
  return fetchPublic<PublicPolicyListResponse>(
    "/public/policies/",
    { cache: "no-store" },
    "Unable to load public policies right now."
  );
}

export async function getPublicPolicyBySlug(slug: string): Promise<PublicPolicyPage | null> {
  try {
    const payload = await fetchPublic<PublicPolicyDetailResponse>(
      `/public/policies/${slug}/`,
      { cache: "no-store" },
      "Unable to load this policy right now."
    );
    return payload.policy ?? null;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("not found")
    ) {
      return null;
    }
    throw error;
  }
}

export async function getPublicBusinessComplianceSummary(): Promise<PublicBusinessComplianceSummary> {
  return fetchPublic<PublicBusinessComplianceSummary>(
    "/public/business-compliance/summary/",
    { cache: "no-store" },
    "Unable to load compliance summary right now."
  );
}
