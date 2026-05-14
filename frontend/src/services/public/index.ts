import { API_BASE_URL } from "@/lib/constants";
import { resolveApiMediaUrl } from "@/lib/media";

export type PublicStats = {
  total_batches: number;
  total_subscriptions: number;
  active_subscriptions: number;
  total_winners: number;
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
  base_price: string;
  category?: string | null;
  subcategory?: string | null;
  image?: string | null;
  /** Optional extra gallery URLs when the API provides them (deduped with `image` on the client). */
  gallery_images?: string[] | null;
  description?: string | null;
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

type PublicProductsResponse = {
  count?: number;
  results?: PublicProduct[];
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

export async function listPublicProducts(): Promise<{
  products: PublicProduct[];
  count: number;
}> {
  const payload = await fetchPublic<PublicProductsResponse>(
    "/public/products/",
    { cache: "no-store" },
    "Unable to load products right now."
  );

  const products = Array.isArray(payload.results)
    ? payload.results.map((product) => normalizePublicProduct(product))
    : [];

  return {
    products,
    count: typeof payload.count === "number" ? payload.count : products.length,
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
