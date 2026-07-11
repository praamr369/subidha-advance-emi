import { apiFetch } from "@/lib/api";

export interface ReviewItem {
  id?: number;
  source: "google" | "facebook" | "internal";
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
}

export interface CombinedReviewsResponse {
  google: { rating: number | null; total: number; error: string | null };
  facebook: { total: number; error: string | null };
  internal_count: number;
  reviews: ReviewItem[];
}

export async function getPublicReviews(): Promise<CombinedReviewsResponse> {
  return apiFetch("/public/reviews/");
}

export async function submitPublicReview(data: {
  reviewer_name: string;
  reviewer_phone?: string;
  rating: number;
  title?: string;
  body: string;
}): Promise<{ message: string }> {
  return apiFetch("/public/reviews/submit/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getCustomerReviews(): Promise<{ results: ReviewItem[] }> {
  return apiFetch("/customer/reviews/");
}

export async function getAdminReviews(statusFilter?: string): Promise<{
  results: ReviewItem[];
  counts: { pending: number; approved: number; rejected: number };
}> {
  const qs = statusFilter ? `?status=${statusFilter}` : "";
  return apiFetch(`/admin/reviews/${qs}`);
}

export async function patchAdminReview(
  id: number,
  data: { status?: string; is_featured?: boolean; admin_reply?: string }
): Promise<ReviewItem> {
  return apiFetch(`/admin/reviews/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteAdminReview(id: number): Promise<void> {
  await apiFetch(`/admin/reviews/${id}/`, { method: "DELETE" });
}

export async function refreshReviewCache(): Promise<{
  google_fetched: number;
  facebook_fetched: number;
  google_error: string | null;
  facebook_error: string | null;
}> {
  return apiFetch("/admin/reviews/refresh-cache/", { method: "POST" });
}

export const GOOGLE_REVIEW_URL = `https://search.google.com/local/writereview?placeid=${process.env.NEXT_PUBLIC_GOOGLE_PLACE_ID ?? ""}`;
export const FACEBOOK_REVIEW_URL = `https://www.facebook.com/${process.env.NEXT_PUBLIC_FACEBOOK_PAGE_ID ?? ""}/reviews`;

export function renderStars(rating: number): string {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}
