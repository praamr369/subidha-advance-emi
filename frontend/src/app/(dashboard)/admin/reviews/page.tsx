"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getAdminReviews,
  patchAdminReview,
  deleteAdminReview,
  refreshReviewCache,
  GOOGLE_REVIEW_URL,
  FACEBOOK_REVIEW_URL,
  type ReviewItem,
} from "@/services/reviews";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReviewItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminReviews(statusFilter || undefined);
      setReviews(data.results);
      setCounts(data.counts);
    } catch {
      showToast("Failed to load reviews.", "err");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleStatus(id: number, status: string) {
    try {
      const updated = await patchAdminReview(id, { status });
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
      showToast(`Review ${status}.`);
    } catch {
      showToast("Failed to update.", "err");
    }
  }

  async function handleFeature(r: ReviewItem) {
    try {
      const updated = await patchAdminReview(r.id!, { is_featured: !r.is_featured });
      setReviews((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...updated } : x)));
      showToast(updated.is_featured ? "Marked as featured." : "Removed from featured.");
    } catch {
      showToast("Failed.", "err");
    }
  }

  async function handleReply(id: number) {
    try {
      await patchAdminReview(id, { admin_reply: replyText });
      setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, admin_reply: replyText } : r)));
      setReplyTarget(null);
      setReplyText("");
      showToast("Reply saved.");
    } catch {
      showToast("Failed.", "err");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this review permanently?")) return;
    try {
      await deleteAdminReview(id);
      setReviews((prev) => prev.filter((r) => r.id !== id));
      showToast("Deleted.");
    } catch {
      showToast("Failed.", "err");
    }
  }

  async function handleRefreshCache() {
    setRefreshing(true);
    try {
      const r = await refreshReviewCache();
      showToast(`Cache refreshed — Google: ${r.google_fetched}, Facebook: ${r.facebook_fetched}`);
    } catch {
      showToast("Refresh failed.", "err");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reviews Manager</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Moderate website reviews, reply, and monitor Google & Facebook.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 px-3 py-2 rounded-lg hover:shadow">
            <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Google Reviews
          </a>
          <a href={FACEBOOK_REVIEW_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#1877F2] text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-[#1565D8]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
            Facebook
          </a>
          <button onClick={handleRefreshCache} disabled={refreshing}
            className="inline-flex items-center gap-2 bg-gray-800 dark:bg-gray-700 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-gray-900 disabled:opacity-50">
            {refreshing ? "Refreshing…" : "↻ Refresh Google/FB Cache"}
          </button>
        </div>
      </div>

      {/* Count chips */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {[
          { label: "All", value: "", count: counts.pending + counts.approved + counts.rejected },
          { label: "Pending", value: "pending", count: counts.pending },
          { label: "Approved", value: "approved", count: counts.approved },
          { label: "Rejected", value: "rejected", count: counts.rejected },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
            }`}
          >
            {tab.label} <span className="ml-1 opacity-70">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No reviews in this category.</div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">{r.author}</div>
                  {r.reviewer_phone && <div className="text-xs text-gray-400">{r.reviewer_phone}</div>}
                  <div className="text-xs text-gray-400 mt-0.5">{r.relative_time}</div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-yellow-400">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[r.status ?? "pending"]}`}>
                    {r.status}
                  </span>
                  {r.is_featured && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                      ⭐ Featured
                    </span>
                  )}
                </div>
              </div>

              {r.title && <div className="font-medium text-sm text-gray-800 dark:text-gray-200 mb-1">{r.title}</div>}
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{r.text}</p>

              {r.admin_reply && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg p-3 mb-3">
                  <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">Your Reply</div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{r.admin_reply}</p>
                </div>
              )}

              {replyTarget?.id === r.id && (
                <div className="mb-3">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                    placeholder="Write your public reply…"
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleReply(r.id!)} className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700">
                      Save Reply
                    </button>
                    <button onClick={() => { setReplyTarget(null); setReplyText(""); }} className="text-gray-500 text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Action row */}
              <div className="flex gap-2 flex-wrap">
                {r.status !== "approved" && (
                  <button onClick={() => handleStatus(r.id!, "approved")} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    Approve
                  </button>
                )}
                {r.status !== "rejected" && (
                  <button onClick={() => handleStatus(r.id!, "rejected")} className="text-xs px-3 py-1.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-lg hover:bg-red-200">
                    Reject
                  </button>
                )}
                <button
                  onClick={() => handleFeature(r)}
                  className="text-xs px-3 py-1.5 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 rounded-lg hover:bg-yellow-100"
                >
                  {r.is_featured ? "Unfeature" : "Feature"}
                </button>
                <button
                  onClick={() => { setReplyTarget(r); setReplyText(r.admin_reply ?? ""); }}
                  className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg hover:bg-blue-100"
                >
                  {r.admin_reply ? "Edit Reply" : "Reply"}
                </button>
                <button onClick={() => handleDelete(r.id!)} className="text-xs px-3 py-1.5 text-gray-400 hover:text-red-500 ml-auto">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply modal */}
    </div>
  );
}
