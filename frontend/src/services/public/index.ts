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
  winner_lucky_id: number | null;
  winner_lucky_number?: number | null;
  product_name?: string | null;
  committed_hash?: string | null;
  public_commit_hash?: string | null;
  verification_status?: string | null;
  waived_emi_count?: number;
  waived_amount?: string;
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
  return {
    ...product,
    image: resolveApiMediaUrl(product.image),
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
  return fetchPublic<PublicLatestWinnerResponse>(
    "/public/latest-winner/",
    { cache: "no-store" },
    "Unable to load the latest winner right now."
  );
}

export async function getPublicWinnerHistory(
  limit = 24
): Promise<PublicWinnerHistoryResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  return fetchPublic<PublicWinnerHistoryResponse>(
    `/public/winner-history/?${params.toString()}`,
    { cache: "no-store" },
    "Unable to load winner history right now."
  );
}

export async function getPublicWinners(
  limit = 12
): Promise<PublicWinnerHistoryResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  return fetchPublic<PublicWinnerHistoryResponse>(
    `/public/winners/?${params.toString()}`,
    { cache: "no-store" },
    "Unable to load winners right now."
  );
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
