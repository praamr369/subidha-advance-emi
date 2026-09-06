"use client";

import { useState } from "react";
import { Star, CheckCircle, ThumbsUp, Send, ChevronDown } from "lucide-react";
import type { ProductReview, ReviewPhoto, ReviewStats } from "@/services/reviews";
import { listReviews, submitReview } from "@/services/reviews";

// ── helpers ────────────────────────────────────────────────────────────────────

function StarRating({ value, max = 5, size = 16 }: { value: number; max?: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={i < value ? "text-amber-400 fill-amber-400" : "text-zinc-300 dark:text-zinc-600"}
        />
      ))}
    </span>
  );
}

function InteractiveStars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(0)}
          aria-label={`Rate ${i} star${i > 1 ? "s" : ""}`}
        >
          <Star
            size={24}
            className={
              i <= (hovered || value)
                ? "text-amber-400 fill-amber-400"
                : "text-zinc-300 dark:text-zinc-600"
            }
          />
        </button>
      ))}
    </span>
  );
}

function RatingBar({ rating, count, total }: { rating: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-4 text-right text-zinc-500">{rating}</span>
      <Star size={12} className="text-amber-400 fill-amber-400 flex-shrink-0" />
      <div className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-zinc-500">{count}</span>
    </div>
  );
}

function ReviewCard({ review }: { review: ProductReview }) {
  const date = new Date(review.created_at).toLocaleDateString("en-IN", {
    year: "numeric", month: "short", day: "numeric",
  });
  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">{review.reviewer_name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <StarRating value={review.rating} size={14} />
            {review.is_verified_purchase && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle size={11} /> Verified Purchase
              </span>
            )}
          </div>
        </div>
        <time className="text-xs text-zinc-400 flex-shrink-0 mt-0.5">{date}</time>
      </div>
      {review.title && (
        <p className="font-medium text-zinc-800 dark:text-zinc-200 text-sm">{review.title}</p>
      )}
      {review.body && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{review.body}</p>
      )}
      {review.photos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {review.photos.map((ph: ReviewPhoto) => (
            ph.file_url && (
              <img
                key={ph.id}
                src={ph.file_url}
                alt="Review photo"
                className="w-16 h-16 object-cover rounded-lg border border-zinc-200 dark:border-zinc-700"
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────

interface Props {
  productId: number;
  productName?: string;
  initialData?: ReviewStats;
}

export default function ProductReviews({ productId, productName, initialData }: Props) {
  const [data, setData] = useState<ReviewStats | null>(initialData ?? null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(!initialData);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const load = async (p: number) => {
    setLoading(true);
    try {
      const d = await listReviews(productId, p);
      setData(d);
      setPage(p);
    } finally {
      setLoading(false);
    }
  };

  // Load on first render if no initialData
  if (!data && !loading) {
    void load(1);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) { setFormError("Please select a star rating."); return; }
    if (!name.trim()) { setFormError("Name is required."); return; }
    setFormError("");
    setSubmitting(true);
    try {
      await submitReview({ product_id: productId, reviewer_name: name, reviewer_email: email, rating, title, body });
      setSubmitted(true);
      setShowForm(false);
    } catch {
      setFormError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Compute rating distribution (approximate from results if no full data)
  const dist = [5, 4, 3, 2, 1].map((r) => ({
    rating: r,
    count: data?.results.filter((rv: ProductReview) => rv.rating === r).length ?? 0,
  }));
  const totalFromDist = dist.reduce((s, d) => s + d.count, 0);

  return (
    <section className="space-y-6" id="reviews">
      {/* Header + summary */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Customer Reviews
          </h2>
          {data && data.total_reviews > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <StarRating value={Math.round(data.average_rating)} size={18} />
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                {data.average_rating.toFixed(1)}
              </span>
              <span className="text-sm text-zinc-500">
                ({data.total_reviews} review{data.total_reviews !== 1 ? "s" : ""})
              </span>
            </div>
          )}
        </div>
        {!submitted ? (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition"
          >
            <ThumbsUp size={15} />
            Write a Review
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
            <CheckCircle size={16} /> Review submitted — thank you!
          </span>
        )}
      </div>

      {/* Rating distribution */}
      {data && data.total_reviews > 0 && (
        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-2 max-w-xs">
          {dist.map((d) => (
            <RatingBar key={d.rating} {...d} total={totalFromDist} />
          ))}
        </div>
      )}

      {/* Submit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-5 space-y-4"
        >
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Review{productName ? ` "${productName}"` : ""}
          </h3>

          <div>
            <label htmlFor="f-your-rating-name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Your Rating <span className="text-red-500">*</span>
            </label>
            <InteractiveStars value={rating} onChange={setRating} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input id="f-your-rating-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                placeholder="Your name"
              />
            </div>
            <div>
              <label htmlFor="f-email-optional" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Email (optional)</label>
              <input id="f-email-optional"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
                placeholder="yourname@email.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="f-review-title" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Review Title
            </label>
            <input id="f-review-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm"
              placeholder="Summarise your experience"
            />
          </div>

          <div>
            <label htmlFor="f-your-review" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Your Review
            </label>
            <textarea id="f-your-review"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm resize-none"
              placeholder="What did you like or dislike? How was the quality?"
            />
          </div>

          {formError && (
            <p className="text-sm text-red-500">{formError}</p>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              <Send size={14} />
              {submitting ? "Submitting…" : "Submit Review"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Reviews list */}
      {loading && (
        <div className="text-sm text-zinc-400 text-center py-8">Loading reviews…</div>
      )}

      {!loading && data && data.results.length === 0 && (
        <div className="text-center py-10 text-zinc-400">
          <Star size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No reviews yet. Be the first to share your experience!</p>
        </div>
      )}

      {!loading && data && data.results.length > 0 && (
        <div className="space-y-3">
          {data.results.map((rv: ProductReview) => (
            <ReviewCard key={rv.id} review={rv} />
          ))}

          {/* Pagination */}
          {data.count > data.page_size && (
            <div className="flex items-center justify-center gap-3 pt-2">
              {page > 1 && (
                <button
                  onClick={() => void load(page - 1)}
                  className="px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                >
                  Previous
                </button>
              )}
              <span className="text-sm text-zinc-500">Page {page}</span>
              {page * data.page_size < data.count && (
                <button
                  onClick={() => void load(page + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-600 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                >
                  More <ChevronDown size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
