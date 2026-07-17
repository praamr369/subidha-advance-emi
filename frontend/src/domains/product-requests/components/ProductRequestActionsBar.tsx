"use client";

import { useState } from "react";
import Link from "next/link";
import { decideAdminProductRequest, cancelAdminProductRequest } from "@/services/product-requests";
import type { ProductRequestRecord } from "@/services/product-requests";

interface ProductRequestActionsBarProps {
  request: ProductRequestRecord;
  onStatusChange?: (updated: ProductRequestRecord) => void;
  showInline?: boolean;
}

export default function ProductRequestActionsBar({
  request,
  onStatusChange,
  showInline = false,
}: ProductRequestActionsBarProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubmitted = request.status === "SUBMITTED";
  const isApproved = request.status === "APPROVED";

  async function quickApprove() {
    setLoading(true);
    setError(null);
    try {
      const updated = await decideAdminProductRequest(request.id, {
        decision: "APPROVE",
        review_note: "Quick approved from queue",
      });
      onStatusChange?.(updated as ProductRequestRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    } finally {
      setLoading(false);
    }
  }

  async function quickReject() {
    if (!confirm("Reject this product request? This cannot be undone.")) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await decideAdminProductRequest(request.id, {
        decision: "REJECT",
        review_note: "Rejected from queue",
      });
      onStatusChange?.(updated as ProductRequestRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejection failed");
    } finally {
      setLoading(false);
    }
  }

  async function quickCancel() {
    if (!confirm("Cancel this product request? This cannot be undone.")) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await cancelAdminProductRequest(request.id, "Cancelled from queue");
      onStatusChange?.(updated as ProductRequestRecord);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancellation failed");
    } finally {
      setLoading(false);
    }
  }

  if (!isSubmitted && !isApproved) {
    return null;
  }

  if (showInline && isSubmitted) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          onClick={quickApprove}
          disabled={loading}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "..." : "✓ Approve"}
        </button>
        <button
          onClick={quickReject}
          disabled={loading}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "..." : "✕ Reject"}
        </button>
        <Link
          href={`/admin/requests/product-requests/${request.id}`}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          → Review
        </Link>
      </div>
    );
  }

  if (isApproved) {
    return (
      <div className="flex flex-wrap gap-2">
        {request.approved_subscription_id ? (
          <Link
            href={`/admin/subscriptions/${request.approved_subscription_id}`}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            → Subscription #{request.approved_subscription_id}
          </Link>
        ) : null}
        {request.approved_direct_sale_id ? (
          <Link
            href={`/admin/billing/direct-sales/${request.approved_direct_sale_id}`}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            → Sale #{request.approved_direct_sale_id}
          </Link>
        ) : null}
      </div>
    );
  }

  return null;
}
