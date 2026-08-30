"use client";

import { useEffect, useState } from "react";
import {
  Star, Check, X, RefreshCw, Share2, MessageCircle,
  Facebook, Instagram, Globe, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { AdminReview } from "@/services/reviews";
import {
  adminListReviews,
  adminApproveReview,
  adminRejectReview,
  adminSyncReview,
} from "@/services/reviews";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function StarBadge({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-amber-600">
      {rating}
      <Star size={13} className="fill-amber-400 text-amber-400" />
    </span>
  );
}

function SyncBadge({ label, synced }: { label: string; synced: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${synced ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"}`}>
      {label}
      {synced && <Check size={10} />}
    </span>
  );
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);

  const load = async (p = page, sf = statusFilter) => {
    setLoading(true);
    try {
      const d = await adminListReviews({ status: sf || undefined, page: p });
      setReviews(d.results as AdminReview[]);
      setTotal(d.count);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = async (id: number) => {
    setWorking(id);
    try {
      const updated = await adminApproveReview(id);
      setReviews((prev) => prev.map((r) => r.id === id ? { ...r, ...updated } : r));
    } finally { setWorking(null); }
  };

  const handleReject = async (id: number) => {
    setWorking(id);
    try {
      const updated = await adminRejectReview(id, rejectNote);
      setReviews((prev) => prev.map((r) => r.id === id ? { ...r, ...updated } : r));
    } finally {
      setWorking(null);
      setRejectTarget(null);
      setRejectNote("");
    }
  };

  const handleSync = async (id: number) => {
    setWorking(id);
    try {
      const updated = await adminSyncReview(id);
      setReviews((prev) => prev.map((r) => r.id === id ? { ...r, ...updated } : r));
    } finally { setWorking(null); }
  };

  const changeFilter = (sf: string) => {
    setStatusFilter(sf);
    setPage(1);
    void load(1, sf);
  };

  const changePage = (p: number) => {
    setPage(p);
    void load(p);
  };

  const PAGE_SIZE = 20;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Product Reviews</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{total} total · moderate and sync to social platforms</p>
        </div>
        <div className="flex items-center gap-2">
          {["", "PENDING", "APPROVED", "REJECTED"].map((s) => (
            <button
              key={s}
              onClick={() => changeFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${statusFilter === s ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-transparent" : "border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
            >
              {s ? STATUS_LABELS[s] : "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-zinc-400 text-sm">Loading reviews…</div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <Star size={40} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No reviews found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((rv) => (
            <div
              key={rv.id}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 space-y-3"
            >
              {/* Top row */}
              <div className="flex flex-wrap items-start gap-3 justify-between">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StarBadge rating={rv.rating} />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[rv.status]}`}>
                      {STATUS_LABELS[rv.status]}
                    </span>
                    {rv.is_verified_purchase && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ Verified</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {rv.reviewer_name}
                    {rv.reviewer_email && (
                      <span className="ml-2 text-xs text-zinc-400 font-normal">{rv.reviewer_email}</span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {rv.product_code} — {rv.product_name}
                  </p>
                </div>
                <time className="text-xs text-zinc-400 flex-shrink-0">
                  {new Date(rv.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </time>
              </div>

              {/* Review text */}
              {(rv.title || rv.body) && (
                <div className="text-sm text-zinc-700 dark:text-zinc-300 space-y-1">
                  {rv.title && <p className="font-medium">{rv.title}</p>}
                  {rv.body && <p className="leading-relaxed text-zinc-500 dark:text-zinc-400">{rv.body}</p>}
                </div>
              )}

              {/* Sync badges */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-xs text-zinc-400">Synced:</span>
                <SyncBadge label="Google" synced={rv.synced_google} />
                <SyncBadge label="Facebook" synced={rv.synced_facebook} />
                <SyncBadge label="WhatsApp" synced={rv.synced_whatsapp} />
                <SyncBadge label="Instagram" synced={rv.synced_instagram} />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                {rv.status === "PENDING" && (
                  <>
                    <button
                      onClick={() => handleApprove(rv.id)}
                      disabled={working === rv.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition disabled:opacity-50"
                    >
                      <Check size={13} /> Approve
                    </button>
                    <button
                      onClick={() => setRejectTarget(rv.id)}
                      disabled={working === rv.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition disabled:opacity-50"
                    >
                      <X size={13} /> Reject
                    </button>
                  </>
                )}
                {rv.status === "APPROVED" && (
                  <button
                    onClick={() => handleSync(rv.id)}
                    disabled={working === rv.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={working === rv.id ? "animate-spin" : ""} />
                    Re-sync Social
                  </button>
                )}
                {rv.status === "REJECTED" && rv.admin_note && (
                  <span className="text-xs text-zinc-400 italic">Note: {rv.admin_note}</span>
                )}
              </div>

              {/* Reject modal inline */}
              {rejectTarget === rv.id && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">Reject reason (optional)</p>
                  <input
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    className="w-full px-3 py-1.5 rounded border border-red-200 dark:border-red-700 bg-white dark:bg-zinc-900 text-sm"
                    placeholder="Spam, offensive, unrelated…"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReject(rv.id)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition"
                    >
                      Confirm Reject
                    </button>
                    <button
                      onClick={() => { setRejectTarget(null); setRejectNote(""); }}
                      className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 text-xs text-zinc-600 dark:text-zinc-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => changePage(page - 1)}
            disabled={page <= 1}
            className="p-2 rounded-lg border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => changePage(page + 1)}
            disabled={page >= totalPages}
            className="p-2 rounded-lg border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Social Setup Notice */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <h3 className="font-semibold text-blue-800 dark:text-blue-300 text-sm mb-2 flex items-center gap-2">
          <Share2 size={15} /> Social Media Sync Setup
        </h3>
        <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
          To enable automatic review sharing, add these to your <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">.env</code>:
        </p>
        <div className="mt-2 space-y-1 font-mono text-xs text-blue-700 dark:text-blue-400">
          <div className="flex items-center gap-2"><Globe size={11} /> GOOGLE_BUSINESS_WEBHOOK_URL=https://...</div>
          <div className="flex items-center gap-2"><Facebook size={11} /> FACEBOOK_PAGE_ACCESS_TOKEN=... &amp; FACEBOOK_PAGE_ID=...</div>
          <div className="flex items-center gap-2"><MessageCircle size={11} /> WHATSAPP_BUSINESS_TOKEN=... &amp; WHATSAPP_PHONE_NUMBER_ID=...</div>
          <div className="flex items-center gap-2"><Instagram size={11} /> INSTAGRAM_ACCESS_TOKEN=... &amp; INSTAGRAM_USER_ID=...</div>
        </div>
      </div>
    </div>
  );
}
