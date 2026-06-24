"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  approveGrowthRequest,
  listGrowthRequests,
  rejectGrowthRequest,
  type GrowthRequest,
} from "@/services/growth";

function statusBadge(s: string) {
  if (s === "APPROVED") return "bg-green-100 text-green-800 border border-green-200";
  if (s === "SUBMITTED" || s === "UNDER_REVIEW") return "bg-blue-100 text-blue-700 border border-blue-200";
  if (s === "DRAFT") return "bg-amber-100 text-amber-700 border border-amber-200";
  if (s === "REJECTED" || s === "CANCELLED") return "bg-red-100 text-red-700 border border-red-200";
  if (s === "CONVERTED") return "bg-purple-100 text-purple-700 border border-purple-200";
  return "bg-muted text-muted-foreground border border-border";
}

function priorityBadge(p: string) {
  if (p === "URGENT") return "bg-red-100 text-red-700 border border-red-200";
  if (p === "HIGH") return "bg-orange-100 text-orange-700 border border-orange-200";
  if (p === "NORMAL") return "bg-blue-50 text-blue-700 border border-blue-100";
  return "bg-muted text-muted-foreground border border-border";
}

const ACTIONABLE_STATUSES = new Set(["SUBMITTED", "UNDER_REVIEW"]);

type ActionModal = {
  id: number;
  action: "approve" | "reject";
  requestNumber: string;
  requestType: string;
};

export default function GrowthRequestsPage() {
  const [requests, setRequests] = useState<GrowthRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await listGrowthRequests({});
      setRequests(r.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load growth requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openModal(req: GrowthRequest, action: "approve" | "reject") {
    setModal({
      id: req.id,
      action,
      requestNumber: req.request_number,
      requestType: req.request_type,
    });
    setReason("");
    setActionError(null);
  }

  function closeModal() {
    setModal(null);
    setReason("");
    setActionError(null);
  }

  async function submitAction() {
    if (!modal) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const updated =
        modal.action === "approve"
          ? await approveGrowthRequest(modal.id, reason)
          : await rejectGrowthRequest(modal.id, reason);
      setRequests((prev) => prev.map((r) => (r.id === modal.id ? updated : r)));
      setSuccessMsg(
        `${modal.requestNumber} ${modal.action === "approve" ? "approved" : "rejected"}.`
      );
      closeModal();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : `Failed to ${modal.action} request.`);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <ERPLoadingState />;
  if (error) return <ERPErrorState message={error} />;

  return (
    <ERPPageShell
      title="Growth Requests"
      subtitle="Customer renewal, upgrade, exchange, and plan conversion requests. Approve or reject submitted requests."
      actions={[{ href: ROUTES.admin.growth, label: "Growth Hub", variant: "secondary" }]}
    >
      {successMsg ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {successMsg}
          <button
            type="button"
            className="ml-3 text-emerald-700 underline hover:no-underline"
            onClick={() => setSuccessMsg(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {requests.length === 0 ? (
        <ERPEmptyState
          title="No growth requests"
          description="No customer growth requests have been submitted yet."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Request #</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Priority</th>
                <th className="px-4 py-3 text-left font-medium">Approval Req.</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{r.request_number}</td>
                  <td className="px-4 py-3 text-xs">{r.customer_id}</td>
                  <td className="px-4 py-3 text-xs">{r.request_type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusBadge(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${priorityBadge(r.priority)}`}
                    >
                      {r.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">{r.approval_required ? "Yes" : "No"}</td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {ACTIONABLE_STATUSES.has(r.status) ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openModal(r, "approve")}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => openModal(r, "reject")}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {r.status === "APPROVED"
                          ? "Approved"
                          : r.status === "REJECTED"
                          ? "Rejected"
                          : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-base font-semibold text-foreground">
              {modal.action === "approve" ? "Approve" : "Reject"} Growth Request
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{modal.requestNumber}</span>
              {" · "}
              {modal.requestType.replace(/_/g, " ")}
            </p>
            <label className="mt-4 block text-sm font-medium text-foreground">
              {modal.action === "approve" ? "Reason / note (optional)" : "Rejection reason"}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={
                modal.action === "approve" ? "Add a note..." : "Reason for rejection..."
              }
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            {actionError ? <p className="mt-2 text-xs text-red-600">{actionError}</p> : null}
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitAction()}
                disabled={submitting}
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                  modal.action === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {submitting
                  ? modal.action === "approve"
                    ? "Approving..."
                    : "Rejecting..."
                  : modal.action === "approve"
                  ? "Confirm Approve"
                  : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
