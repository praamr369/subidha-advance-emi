"use client";

import { useState, useEffect } from "react";
import {
  getPublicReviews,
  getCustomerReviews,
  submitPublicReview,
  type ReviewItem,
  type ReviewLinks,
} from "@/services/reviews";

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)}
          onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(0)}
          className="text-3xl leading-none transition-transform hover:scale-110">
          <span className={(hovered || value) >= s ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"}>★</span>
        </button>
      ))}
    </div>
  );
}

const STATUS_CLS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function CustomerReviewsPage() {
  const [links, setLinks] = useState<ReviewLinks | null>(null);
  const [myReviews, setMyReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({ reviewer_name: "", rating: 0, title: "", body: "" });

  useEffect(() => {
    Promise.all([
      getCustomerReviews().then((r) => setMyReviews(r.results)),
      getPublicReviews().then((r) => setLinks(r.links)),
    ]).finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.reviewer_name.trim()) { setFormError("Please enter your name."); return; }
    if (form.rating === 0) { setFormError("Please select a rating."); return; }
    if (!form.body.trim()) { setFormError("Please write your review."); return; }
    setSubmitting(true);
    try {
      await submitPublicReview(form);
      setSubmitted(true);
      setForm({ reviewer_name: "", rating: 0, title: "", body: "" });
      getCustomerReviews().then((r) => setMyReviews(r.results));
    } catch (err: unknown) {
      setFormError((err as Error)?.message ?? "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Reviews &amp; Ratings</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Share your experience, or rate us on Google, Facebook, and YouTube.
      </p>

      {/* External platform CTAs — links from backend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {links?.google_write_url && (
          <a href={links.google_write_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-md transition-all">
            <svg className="w-7 h-7 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">Google Review</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Rate on Google</div>
            </div>
          </a>
        )}
        {links?.facebook_review_url && (
          <a href={links.facebook_review_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 bg-[#1877F2] rounded-xl p-4 hover:bg-[#1565D8] transition-all">
            <svg className="w-7 h-7 text-white flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
            <div>
              <div className="text-sm font-semibold text-white">Facebook</div>
              <div className="text-xs text-blue-200">Recommend us</div>
            </div>
          </a>
        )}
        {links?.youtube_channel_url && (
          <a href={links.youtube_channel_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 bg-[#FF0000] rounded-xl p-4 hover:bg-[#CC0000] transition-all">
            <svg className="w-7 h-7 text-white flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            <div>
              <div className="text-sm font-semibold text-white">YouTube</div>
              <div className="text-xs text-red-200">Visit our channel</div>
            </div>
          </a>
        )}
      </div>

      {/* Write review form */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Write a Review on Our Website</h2>
        {submitted && (
          <div className="mb-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-3 text-green-700 dark:text-green-300 text-sm">
            ✓ Thank you! Your review is pending approval.
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Your Name *</label>
            <input value={form.reviewer_name} onChange={(e) => setForm((f) => ({ ...f, reviewer_name: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">Rating *</label>
            <StarPicker value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Title</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Your Review *</label>
            <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              rows={3} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none" />
          </div>
          {formError && <p className="text-red-500 text-xs">{formError}</p>}
          <button type="submit" disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm">
            {submitting ? "Submitting…" : "Submit Review"}
          </button>
        </form>
      </div>

      {/* My past reviews */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">My Submitted Reviews</h2>
        {loading ? (
          <div className="text-sm text-gray-400">Loading…</div>
        ) : myReviews.length === 0 ? (
          <div className="text-sm text-gray-400 dark:text-gray-500">You haven&apos;t submitted any reviews yet.</div>
        ) : (
          <div className="space-y-3">
            {myReviews.map((r) => (
              <div key={r.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-yellow-400">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CLS[r.status ?? "pending"]}`}>
                    {r.status}
                  </span>
                </div>
                {r.title && <div className="font-medium text-sm text-gray-800 dark:text-gray-200">{r.title}</div>}
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{r.text}</p>
                <div className="text-xs text-gray-400 mt-2">{r.relative_time}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
