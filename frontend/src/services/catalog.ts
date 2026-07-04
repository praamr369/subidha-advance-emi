import { apiFetch } from "@/lib/api";
import { resolveApiMediaUrl } from "@/lib/media";

export type CatalogPurposeKey =
  | "emi"
  | "rent"
  | "lease"
  | "direct_sale"
  | "purchase_request";

export type CatalogPurpose = {
  key: CatalogPurposeKey;
  label: string;
};

export type CatalogProduct = {
  id: number;
  product_code: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  base_price: string;
  unit_of_measure: string;
  gst_rate: string | null;
  hsn_sac_code: string;
  lifecycle_status: string;
  image: string | null;
  purposes: CatalogPurpose[];
  flags: {
    emi: boolean;
    rent: boolean;
    lease: boolean;
    direct_sale: boolean;
  };
  default_plan_type: string;
};

export type CatalogListResponse = {
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  has_next: boolean;
  has_previous: boolean;
  results: CatalogProduct[];
};

export type CatalogFacets = {
  categories: { name: string; count: number }[];
  purposes: { key: CatalogPurposeKey; label: string; count: number }[];
  total: number;
};

export type CatalogRole = "customer" | "partner" | "vendor";

export type CatalogQuery = {
  purpose?: CatalogPurposeKey | "";
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizePurposes(value: unknown): CatalogPurpose[] {
  return toArray(value)
    .map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return { key: String(row.key ?? "") as CatalogPurposeKey, label: String(row.label ?? "") };
    })
    .filter((purpose) => purpose.key.length > 0);
}

function normalizeProduct(raw: unknown): CatalogProduct {
  const row = (raw ?? {}) as Record<string, unknown>;
  const flags = (row.flags ?? {}) as Record<string, unknown>;
  return {
    id: toNumber(row.id),
    product_code: String(row.product_code ?? ""),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    category: String(row.category ?? ""),
    subcategory: String(row.subcategory ?? ""),
    base_price: String(row.base_price ?? "0"),
    unit_of_measure: String(row.unit_of_measure ?? "PCS"),
    gst_rate: row.gst_rate == null ? null : String(row.gst_rate),
    hsn_sac_code: String(row.hsn_sac_code ?? ""),
    lifecycle_status: String(row.lifecycle_status ?? "ACTIVE"),
    image: row.image ? resolveApiMediaUrl(String(row.image)) : null,
    purposes: normalizePurposes(row.purposes),
    flags: {
      emi: Boolean(flags.emi),
      rent: Boolean(flags.rent),
      lease: Boolean(flags.lease),
      direct_sale: Boolean(flags.direct_sale),
    },
    default_plan_type: String(row.default_plan_type ?? "EMI"),
  };
}

function buildQuery(params?: CatalogQuery): string {
  const search = new URLSearchParams();
  if (params?.purpose) search.set("purpose", params.purpose);
  if (params?.category) search.set("category", params.category);
  if (params?.search) search.set("search", params.search);
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("page_size", String(params.pageSize));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listCatalogProducts(
  role: CatalogRole,
  params?: CatalogQuery,
): Promise<CatalogListResponse> {
  const payload = await apiFetch<unknown>(`/${role}/catalog/${buildQuery(params)}`);
  const root = (payload ?? {}) as Record<string, unknown>;
  return {
    count: toNumber(root.count, 0),
    page: toNumber(root.page, 1),
    page_size: toNumber(root.page_size, 24),
    num_pages: toNumber(root.num_pages, 0),
    has_next: Boolean(root.has_next),
    has_previous: Boolean(root.has_previous),
    results: toArray(root.results).map(normalizeProduct),
  };
}

export async function getCatalogFacets(role: CatalogRole): Promise<CatalogFacets> {
  const payload = await apiFetch<unknown>(`/${role}/catalog/facets/`);
  const root = (payload ?? {}) as Record<string, unknown>;
  return {
    total: toNumber(root.total, 0),
    categories: toArray(root.categories).map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return { name: String(row.name ?? ""), count: toNumber(row.count) };
    }),
    purposes: toArray(root.purposes).map((raw) => {
      const row = (raw ?? {}) as Record<string, unknown>;
      return {
        key: String(row.key ?? "") as CatalogPurposeKey,
        label: String(row.label ?? ""),
        count: toNumber(row.count),
      };
    }),
  };
}
