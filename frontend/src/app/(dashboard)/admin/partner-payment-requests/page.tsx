"use client";

import { useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  approveAdminCollectionRequest,
  getAdminPartnerPaymentRequests,
  rejectAdminCollectionRequest,
} from "@/services/phase5-control";

type PartnerPaymentRow = {
  id: number;
  partner_name?: string;
  customer_name?: string;
  subscription_number?: string;
  amount?: string;
  payment_method?: string;
  payment_date?: string;
  reference_no?: string;
  created_at?: string;
};

type ActionModal = {
  id: number;
  action: "approve" | "reject";
  partnerName: string;
  amount: string;
};

export default function AdminPartnerPaymentRequestsPage() {
  const [rows, setRows] = useState<PartnerPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const response = (await getAdminPartnerPaymentRequests()) as { results?: PartnerPaymentRow[] };
      setRows(response.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load partner payment requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadRequests(); }, []);

  function openModal(row: PartnerPaymentRow, action: "approve" | "reject") {
    setModal({ id: row.id, action, partnerName: row.partner_name ?? "—", amount: row.amount ?? "0.00" });
    setNote("");
    setActionError(null);
  }

  function closeModal() {
    setModal(null);
    setNote("");
    setActionError(null);
  }

  async function submitAction() {
    if (!modal) return;
    setSubmitting(true);
    setActionError(null);
    try {
      if (modal.action === "approve") {
        await approveAdminCollectionRequest(modal.id, note);
      } else {
        await rejectAdminCollectionRequest(modal.id, note);
      }
      setSuccessMsg(`Request #${modal.id} ${modal.action === "approve" ? "approved" : "rejected"} successfully.`);
      setRows((prev) => prev.filter((r) => r.id !== modal.id));
      closeModal();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to ${modal.action} request.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Partners"
      title="Partner Payment Requests"
      subtitle="SUBMITTED collection requests from partners awaiting admin approval. Approving a request posts the payment and EMI record — this action cannot be undone."
      helperNote="Approving a request posts a real payment and EMI record. Rejecting returns it to the partner for correction. No financial changes happen from reject."
      helperTone="warning"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM & Requests", href: ROUTES.admin.requestsHub },
        { label: "Partner Payment Requests" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {successMsg ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {successMsg}
          <button
            type="button"
            className="ml-3 underline text-emerald-700 hover:no-underline"
            onClick={() => setSuccessMsg(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {loading ? <LoadingBlock label="Loading partner payment requests..." /> : null}
      {error ? <ErrorState title="Queue unavailable" description={error} /> : null}

      {!loading && !error ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Partner</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Subscription</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Payment date</th>
                <th className="px-3 py-2">Ref#</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-muted-foreground" colSpan={8}>
                    No pending partner payment requests.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{row.partner_name || "—"}</td>
                    <td className="px-3 py-2">{row.customer_name || "—"}</td>
                    <td className="px-3 py-2 font-mono">{row.subscription_number || "—"}</td>
                    <td className="px-3 py-2 font-medium">₹{row.amount || "0.00"}</td>
                    <td className="px-3 py-2">{row.payment_method || "—"}</td>
                    <td className="px-3 py-2">{row.payment_date || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.reference_no || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openModal(row, "approve")}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => openModal(row, "reject")}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h2 className="text-base font-semibold text-foreground">
              {modal.action === "approve" ? "Approve" : "Reject"} Payment Request
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Partner: <span className="font-medium text-foreground">{modal.partnerName}</span>
              {" · "}Amount: <span className="font-medium text-foreground">₹{modal.amount}</span>
            </p>
            {modal.action === "approve" ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Approving will post a real payment and EMI record. This cannot be undone.
              </div>
            ) : null}
            <label className="mt-4 block text-sm font-medium text-foreground">
              {modal.action === "approve" ? "Note (optional)" : "Rejection reason (optional)"}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={modal.action === "approve" ? "Add a note..." : "Reason for rejection..."}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
            {actionError ? (
              <p className="mt-2 text-xs text-red-600">{actionError}</p>
            ) : null}
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
