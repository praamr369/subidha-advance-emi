import { API_BASE_URL } from "@/lib/constants";
import { apiFetch } from "@/lib/api";

export type ReviewSource = "google" | "facebook" | "youtube" | "internal";

export interface ReviewItem {
  id?: number;
  source: ReviewSource;
  author: string;
  avatar?: string | null;
  rating: number;
  title?: string;
  text: string;
  relative_time: string;
  is_featured?: boolean;
  admin_reply?: string;
  status?: string;
  reviewer_phone?: string;
  like_count?: number;
}

export interface ReviewLinks {
  google_write_url: string | null;
  facebook_review_url: string | null;
  youtube_channel_url: string | null;
}

export interface CombinedReviewsResponse {
  google: { rating: number | null; total: number; error: string | null };
  facebook: { total: number; error: string | null };
  youtube: { total: number; error: string | null };
  internal_count: number;
  reviews: ReviewItem[];
  links: ReviewLinks;
}

// ── Public (no auth — use raw fetch) ─────────────────────────────────────────

async function publicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { error?: string; detail?: string })?.error
      ?? (body as { detail?: string })?.detail
      ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export async function getPublicReviews(): Promise<CombinedReviewsResponse> {
  return publicFetch<CombinedReviewsResponse>("/public/reviews/");
}

export async function submitPublicReview(data: {
  reviewer_name: string;
  reviewer_phone?: string;
  rating: number;
  title?: string;
  body: string;
}): Promise<{ message: string }> {
  return publicFetch<{ message: string }>("/public/reviews/submit/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Authenticated customer calls ──────────────────────────────────────────────

export async function getCustomerReviews(): Promise<{ results: ReviewItem[] }> {
  return apiFetch<{ results: ReviewItem[] }>("/customer/reviews/");
}

// ── Admin calls ───────────────────────────────────────────────────────────────

export async function getAdminReviews(statusFilter?: string): Promise<{
  results: ReviewItem[];
  counts: { pending: number; approved: number; rejected: number };
  links: ReviewLinks;
}> {
  const qs = statusFilter ? `?status=${statusFilter}` : "";
  return apiFetch(`/admin/reviews/${qs}`);
}

export async function patchAdminReview(
  id: number,
  data: { status?: string; is_featured?: boolean; admin_reply?: string }
): Promise<ReviewItem> {
  return apiFetch<ReviewItem>(`/admin/reviews/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteAdminReview(id: number): Promise<void> {
  await apiFetch(`/admin/reviews/${id}/`, { method: "DELETE" });
}

export async function refreshReviewCache(): Promise<{
  google: { fetched: number; error: string | null };
  facebook: { fetched: number; error: string | null };
  youtube: { fetched: number; error: string | null };
}> {
  return apiFetch("/admin/reviews/refresh-cache/", { method: "POST" });
}

// ── Brand Data Center: platform credentials ──────────────────────────────────

export interface PlatformConfigField {
  value: string;
  configured: boolean;
  source: "db" | "env" | "none";
}

export type PlatformConfigFieldName =
  | "google_places_api_key"
  | "google_place_id"
  | "facebook_page_id"
  | "facebook_page_access_token"
  | "youtube_api_key"
  | "youtube_channel_id";

export interface ReviewPlatformConfig {
  fields: Record<PlatformConfigFieldName, PlatformConfigField>;
  links: ReviewLinks;
  updated_at: string;
}

export async function getReviewPlatformConfig(): Promise<ReviewPlatformConfig> {
  return apiFetch<ReviewPlatformConfig>("/admin/reviews/platform-config/");
}

export async function updateReviewPlatformConfig(
  data: Partial<Record<PlatformConfigFieldName, string>>
): Promise<{ message: string; changed: string[] }> {
  return apiFetch("/admin/reviews/platform-config/", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatStars(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}
