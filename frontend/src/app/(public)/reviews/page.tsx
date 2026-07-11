"use client";

import { useState, useEffect } from "react";
import {
  getPublicReviews,
  submitPublicReview,
  formatStars,
  type CombinedReviewsResponse,
  type ReviewItem,
  type ReviewSource,
} from "@/services/reviews";

// ── Sub-components ─────────────────────────────────────────────────────────

function StarDisplay({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= rating ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}>★</span>
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s} type="button"
          onClick={() => onChange(s)}
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          className="text-3xl leading-none transition-transform hover:scale-110"
        >
          <span className={(hovered || value) >= s ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}>★</span>
        </button>
      ))}
    </div>
  );
}

function SourceBadge({ source }: { source: ReviewSource }) {
  const map: Record<ReviewSource, { label: string; cls: string; icon: React.ReactNode }> = {
    google: {
      label: "Google",
      cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      icon: (
        <svg className="w-3 h-3" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      ),
    },
    facebook: {
      label: "Facebook",
      cls: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
      icon: <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>,
    },
    youtube: {
      label: "YouTube",
      cls: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300",
      icon: <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>,
    },
    internal: {
      label: "Verified",
      cls: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
      icon: <span className="text-green-600">✓</span>,
    },
  };
  const { label, cls, icon } = map[source] ?? map.internal;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>
      {icon}{label}
    </span>
  );
}

function ReviewCard({ review }: { review: ReviewItem }) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border ${review.is_featured ? "border-yellow-400 dark:border-yellow-500 shadow-yellow-100 dark:shadow-none" : "border-gray-200 dark:border-gray-700"} p-5 flex flex-col gap-3 shadow-sm h-full`}>
      {review.is_featured && <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">⭐ Featured</span>}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {review.avatar ? (
            <img src={review.avatar} alt={review.author} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {(review.author?.[0] ?? "?").toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 dark:text-white text-sm truncate">{review.author}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">{review.relative_time}</div>
          </div>
        </div>
        <SourceBadge source={review.source} />
      </div>
      <StarDisplay rating={review.rating} />
      {review.title && <div className="font-medium text-gray-800 dark:text-gray-200 text-sm">{review.title}</div>}
      <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed flex-1">{review.text}</p>
      {review.like_count ? (
        <div className="text-xs text-gray-400">👍 {review.like_count} likes</div>
      ) : null}
      {review.admin_reply && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border-l-4 border-blue-500">
          <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">Response from Subidha Furniture</div>
          <p className="text-sm text-gray-700 dark:text-gray-300">{review.admin_reply}</p>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const [data, setData] = useState<CombinedReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ reviewer_name: "", reviewer_phone: "", rating: 0, title: "", body: "" });
  const [filterSource, setFilterSource] = useState<"all" | ReviewSource>("all");

  useEffect(() => {
    getPublicReviews()
      .then(setData)
      .catch(() => setLoadError("Could not load reviews. Please try again later."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.reviewer_name.trim()) { setFormError("Please enter your name."); return; }
    if (form.rating === 0) { setFormError("Please select a star rating."); return; }
    if (!form.body.trim()) { setFormError("Please write your review."); return; }
    setSubmitting(true);
    try {
      await submitPublicReview(form);
      setSubmitted(true);
      setShowForm(false);
      setForm({ reviewer_name: "", reviewer_phone: "", rating: 0, title: "", body: "" });
    } catch (err: unknown) {
      setFormError((err as Error)?.message ?? "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const links = data?.links;
  const filtered = filterSource === "all"
    ? (data?.reviews ?? [])
    : (data?.reviews ?? []).filter((r) => r.source === filterSource);

  const tabCounts = {
    all: data?.reviews.length ?? 0,
    google: data?.google.total ?? 0,
    facebook: data?.facebook.total ?? 0,
    youtube: data?.youtube.total ?? 0,
    internal: data?.internal_count ?? 0,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-700 to-indigo-800 text-white py-16 px-6 text-center">
        <h1 className="text-3xl md:text-4xl font-bold mb-3">Customer Reviews</h1>
        <p className="text-blue-100 max-w-xl mx-auto text-sm md:text-base">
          Real experiences from families across Asansol who trust Subidha Furniture for their home.
        </p>
        {data?.google.rating && (
          <div className="mt-6 inline-flex items-center gap-3 bg-white/10 backdrop-blur rounded-2xl px-6 py-3">
            <StarDisplay rating={Math.round(data.google.rating)} />
            <div className="text-left">
              <div className="font-bold text-xl">{data.google.rating.toFixed(1)}</div>
              <div className="text-blue-200 text-sm">{data.google.total.toLocaleString("en-IN")} Google reviews</div>
            </div>
          </div>
        )}
      </div>

      {/* CTA buttons — links come from backend so no NEXT_PUBLIC_ env needed */}
      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-wrap gap-3 items-center justify-center">
        {links?.google_write_url && (
          <a href={links.google_write_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-white font-medium px-5 py-2.5 rounded-xl shadow-sm hover:shadow-md transition-all text-sm">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Review on Google
          </a>
        )}
        {links?.facebook_review_url && (
          <a href={links.facebook_review_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#1877F2] text-white font-medium px-5 py-2.5 rounded-xl shadow-sm hover:bg-[#1565D8] transition-all text-sm">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
            Recommend on Facebook
          </a>
        )}
        {links?.youtube_channel_url && (
          <a href={links.youtube_channel_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#FF0000] text-white font-medium px-5 py-2.5 rounded-xl shadow-sm hover:bg-[#CC0000] transition-all text-sm">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            Our YouTube Channel
          </a>
        )}
        <button onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2.5 rounded-xl shadow-sm transition-all text-sm">
          ✍️ Write a Review
        </button>
      </div>

      {/* Success banner */}
      {submitted && (
        <div className="max-w-5xl mx-auto px-4 mb-4">
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl p-4 text-green-800 dark:text-green-200 text-sm font-medium">
            ✓ Thank you! Your review has been submitted and is pending approval.
          </div>
        </div>
      )}

      {/* Write-review modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowForm(false)}>
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Write Your Review</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Your Name *</label>
              <input value={form.reviewer_name} onChange={(e) => setForm((f) => ({ ...f, reviewer_name: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="e.g. Rahul Sharma" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Phone (optional)</label>
              <input value={form.reviewer_phone} onChange={(e) => setForm((f) => ({ ...f, reviewer_phone: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="10-digit mobile" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Rating *</label>
              <StarPicker value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Title (optional)</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Your Review *</label>
              <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={4} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                placeholder="Tell others about your experience…" />
            </div>
            {formError && <p className="text-red-600 text-xs">{formError}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 py-2 rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium">
                {submitting ? "Submitting…" : "Submit Review"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Source filter tabs */}
      <div className="max-w-5xl mx-auto px-4 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {(["all", "google", "facebook", "youtube", "internal"] as const).map((src) => {
            const labels: Record<string, string> = {
              all: `All (${tabCounts.all})`,
              google: `Google (${tabCounts.google})`,
              facebook: `Facebook (${tabCounts.facebook})`,
              youtube: `YouTube (${tabCounts.youtube})`,
              internal: `Website (${tabCounts.internal})`,
            };
            return (
              <button key={src} onClick={() => setFilterSource(src)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${filterSource === src ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-400"}`}>
                {labels[src]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reviews grid */}
      <div className="max-w-5xl mx-auto px-4 pb-16">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading reviews…</div>
        ) : loadError ? (
          <div className="text-center py-16 text-red-400">{loadError}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            No reviews in this category yet.{" "}
            <button onClick={() => setShowForm(true)} className="text-blue-600 underline">Be the first!</button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r, i) => (
              <ReviewCard key={`${r.source}-${r.id ?? i}`} review={r} />
            ))}
          </div>
        )}

        {/* Platform error hints (admin-visible only if configured wrong) */}
        {data && (
          <div className="mt-8 space-y-2">
            {data.google.error && <p className="text-xs text-gray-400 text-center">Google: {data.google.error}</p>}
            {data.facebook.error && <p className="text-xs text-gray-400 text-center">Facebook: {data.facebook.error}</p>}
            {data.youtube.error && <p className="text-xs text-gray-400 text-center">YouTube: {data.youtube.error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
