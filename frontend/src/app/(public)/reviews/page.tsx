"use client";

import { useState, useEffect } from "react";
import {
  getPublicReviews,
  submitPublicReview,
  GOOGLE_REVIEW_URL,
  FACEBOOK_REVIEW_URL,
  type CombinedReviewsResponse,
  type ReviewItem,
} from "@/services/reviews";

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const sz = size === "lg" ? "text-2xl" : "text-base";
  return (
    <span className={`${sz} leading-none`} aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < rating ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}>
          ★
        </span>
      ))}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === "google")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded-full">
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93V18c0-.55.45-1 1-1s1 .45 1 1v1.93c-3.95-.49-7-3.85-7-7.93h2c0 2.97 1.97 5.47 5 6.31V15c0-.55.45-1 1-1s1 .45 1 1v2.31c3.03-.84 5-3.34 5-6.31h2c0 4.08-3.05 7.44-7 7.93z"/></svg>
        Google
      </span>
    );
  if (source === "facebook")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-0.5 rounded-full">
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
        Facebook
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 rounded-full">
      ✓ Verified
    </span>
  );
}

function ReviewCard({ review }: { review: ReviewItem }) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border ${review.is_featured ? "border-yellow-400 dark:border-yellow-500" : "border-gray-200 dark:border-gray-700"} p-5 flex flex-col gap-3 shadow-sm`}>
      {review.is_featured && (
        <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">⭐ Featured Review</span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          {review.avatar ? (
            <img src={review.avatar} alt={review.author} className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {review.author?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div>
            <div className="font-semibold text-gray-900 dark:text-white text-sm">{review.author}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">{review.relative_time}</div>
          </div>
        </div>
        <SourceBadge source={review.source} />
      </div>
      <StarRating rating={review.rating} />
      {review.title && <div className="font-medium text-gray-800 dark:text-gray-200 text-sm">{review.title}</div>}
      <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{review.text}</p>
      {review.admin_reply && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border-l-4 border-blue-500">
          <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">Response from Subidha Furniture</div>
          <p className="text-sm text-gray-700 dark:text-gray-300">{review.admin_reply}</p>
        </div>
      )}
    </div>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="text-3xl leading-none transition-transform hover:scale-110"
        >
          <span className={(hovered || value) >= star ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}>★</span>
        </button>
      ))}
    </div>
  );
}

export default function ReviewsPage() {
  const [data, setData] = useState<CombinedReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ reviewer_name: "", reviewer_phone: "", rating: 0, title: "", body: "" });
  const [filterSource, setFilterSource] = useState<"all" | "google" | "facebook" | "internal">("all");

  useEffect(() => {
    getPublicReviews()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.reviewer_name.trim()) return setFormError("Please enter your name.");
    if (form.rating === 0) return setFormError("Please select a star rating.");
    if (!form.body.trim()) return setFormError("Please write your review.");
    setSubmitting(true);
    try {
      await submitPublicReview(form);
      setSubmitted(true);
      setShowForm(false);
    } catch (err: unknown) {
      const msg = (err as { detail?: string })?.detail ?? "Submission failed. Please try again.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = filterSource === "all"
    ? (data?.reviews ?? [])
    : (data?.reviews ?? []).filter((r) => r.source === filterSource);

  const googleRating = data?.google.rating;
  const googleTotal = data?.google.total ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-700 to-indigo-800 text-white py-16 px-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold mb-3">Customer Reviews</h1>
        <p className="text-blue-100 max-w-xl mx-auto">
          Real experiences from families across Asansol who trust Subidha Furniture for their home needs.
        </p>
        {googleRating && (
          <div className="mt-6 inline-flex items-center gap-3 bg-white/10 backdrop-blur rounded-2xl px-6 py-3">
            <StarRating rating={Math.round(googleRating)} size="lg" />
            <div className="text-left">
              <div className="font-bold text-xl">{googleRating.toFixed(1)}</div>
              <div className="text-blue-200 text-sm">{googleTotal.toLocaleString()} Google reviews</div>
            </div>
          </div>
        )}
      </div>

      {/* CTA row */}
      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-wrap gap-3 items-center justify-center">
        <a
          href={GOOGLE_REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white font-medium px-5 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all text-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Review us on Google
        </a>
        <a
          href={FACEBOOK_REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#1877F2] text-white font-medium px-5 py-2.5 rounded-xl shadow-sm hover:bg-[#1565D8] transition-all text-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
          Recommend on Facebook
        </a>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2.5 rounded-xl shadow-sm transition-all text-sm"
        >
          ✍️ Write a Review Here
        </button>
      </div>

      {/* Success message */}
      {submitted && (
        <div className="max-w-5xl mx-auto px-4 mb-4">
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl p-4 text-green-800 dark:text-green-200 text-sm font-medium">
            ✓ Thank you! Your review has been submitted and is pending approval.
          </div>
        </div>
      )}

      {/* Review form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowForm(false)}>
          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Write Your Review</h2>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Your Name *</label>
              <input
                value={form.reviewer_name}
                onChange={(e) => setForm((f) => ({ ...f, reviewer_name: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="e.g. Rahul Sharma"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Phone (optional)</label>
              <input
                value={form.reviewer_phone}
                onChange={(e) => setForm((f) => ({ ...f, reviewer_phone: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="10-digit mobile"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Rating *</label>
              <StarPicker value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Title (optional)</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="Summarise your experience"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Your Review *</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={4}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                placeholder="Tell others about your experience…"
              />
            </div>

            {formError && <p className="text-red-600 text-xs">{formError}</p>}

            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 py-2 rounded-lg text-sm">
                Cancel
              </button>
              <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium">
                {submitting ? "Submitting…" : "Submit Review"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter tabs */}
      <div className="max-w-5xl mx-auto px-4 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["all", "google", "facebook", "internal"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterSource(f)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterSource === f
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-400"
              }`}
            >
              {f === "all" ? `All (${data?.reviews.length ?? 0})` : f === "google" ? `Google (${data?.google.total ?? 0})` : f === "facebook" ? `Facebook (${data?.facebook.total ?? 0})` : `Website (${data?.internal_count ?? 0})`}
            </button>
          ))}
        </div>
      </div>

      {/* Reviews grid */}
      <div className="max-w-5xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading reviews…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            No reviews yet.{" "}
            <button onClick={() => setShowForm(true)} className="text-blue-600 underline">Be the first!</button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r, i) => (
              <ReviewCard key={`${r.source}-${r.id ?? i}`} review={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
