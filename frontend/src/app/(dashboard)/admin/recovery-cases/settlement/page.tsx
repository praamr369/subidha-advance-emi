"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { getSettlementDetails, requestSettlement, approveSettlement, SettlementDetails } from "@/services/settlement";

export default function SettlementPage() {
  const [caseId, setCaseId] = useState("");
  const [settlement, setSettlement] = useState<SettlementDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"view" | "request" | "approve">("view");
  const [busy, setBusy] = useState(false);

  // Request form
  const [requestNotes, setRequestNotes] = useState("");
  const [requestMsg, setRequestMsg] = useState<string | null>(null);

  // Approve form
  const [settlementType, setSettlementType] = useState<"FULL" | "PARTIAL">("PARTIAL");
  const [settledAmount, setSettledAmount] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [approveMsg, setApproveMsg] = useState<string | null>(null);

  const loadSettlement = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSettlementDetails(Number(caseId));
      setSettlement(data);
      setTab("view");
    } catch (err) {
      setError("Failed to load settlement details.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  const handleRequestSettlement = async () => {
    if (!caseId || !requestNotes.trim()) {
      setRequestMsg("Please enter settlement notes.");
      return;
    }
    setBusy(true);
    setRequestMsg(null);
    try {
      const res = await requestSettlement(Number(caseId), requestNotes);
      setRequestMsg("Settlement request submitted successfully.");
      setRequestNotes("");
      void loadSettlement();
      setTab("view");
    } catch (err) {
      setRequestMsg("Failed to request settlement.");
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleApproveSettlement = async () => {
    if (!caseId || !settledAmount) {
      setApproveMsg("Please enter settled amount.");
      return;
    }
    setBusy(true);
    setApproveMsg(null);
    try {
      const res = await approveSettlement(
        Number(caseId),
        settlementType,
        Number(settledAmount),
        approvalNotes
      );
      setApproveMsg("Settlement approved successfully.");
      setSettledAmount("");
      setApprovalNotes("");
      void loadSettlement();
      setTab("view");
    } catch (err) {
      setApproveMsg("Failed to approve settlement.");
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ERPPageShell
      eyebrow="Collections"
      title="Recovery Case Settlement"
      subtitle="Request and approve settlements for overdue recovery cases."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Collections", href: "#" },
        { label: "Settlement" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {/* Case Lookup */}
      <div className="rounded-xl border border-border p-4 mb-6">
        <div className="text-sm font-semibold mb-3">Find Recovery Case</div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="number"
            placeholder="Enter case ID…"
            value={caseId}
            onChange={e => setCaseId(e.target.value)}
            className="h-9 rounded-xl border border-border bg-background px-3 text-sm flex-1 min-w-[150px]"
          />
          <button
            onClick={() => void loadSettlement()}
            disabled={!caseId || loading}
            className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load Case"}
          </button>
        </div>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">{error}</div>}

      {settlement && (
        <div>
          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-border">
            <button
              onClick={() => setTab("view")}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "view" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
            >
              Details
            </button>
            {!settlement.settlement_approved && (
              <>
                {!settlement.settlement_requested && (
                  <button
                    onClick={() => setTab("request")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "request" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                  >
                    Request Settlement
                  </button>
                )}
                {settlement.settlement_requested && (
                  <button
                    onClick={() => setTab("approve")}
                    className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === "approve" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                  >
                    Approve Settlement
                  </button>
                )}
              </>
            )}
          </div>

          {/* Details Tab */}
          {tab === "view" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/40 rounded-xl p-3">
                  <div className="text-xs text-muted-foreground font-semibold">Customer</div>
                  <div className="text-lg font-semibold mt-1">{settlement.customer_name}</div>
                </div>
                <div className="bg-muted/40 rounded-xl p-3">
                  <div className="text-xs text-muted-foreground font-semibold">Subscription</div>
                  <div className="text-lg font-semibold mt-1">#{settlement.subscription_id}</div>
                </div>
                <div className="bg-muted/40 rounded-xl p-3">
                  <div className="text-xs text-muted-foreground font-semibold">Overdue Amount</div>
                  <div className="text-lg font-semibold mt-1 text-red-600">₹{Number(settlement.overdue_amount).toLocaleString()}</div>
                </div>
                <div className="bg-muted/40 rounded-xl p-3">
                  <div className="text-xs text-muted-foreground font-semibold">Overdue EMIs</div>
                  <div className="text-lg font-semibold mt-1">{settlement.overdue_emis}</div>
                </div>
              </div>

              <div className="bg-muted/40 rounded-xl p-3">
                <div className="text-xs text-muted-foreground font-semibold mb-2">Recovery Stage</div>
                <div className="text-lg font-semibold">{settlement.stage}</div>
              </div>

              {/* Settlement Status */}
              <div className="border border-border rounded-xl p-4">
                <div className="text-sm font-semibold mb-3">Settlement Status</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Request Status:</span>
                    <span className="font-medium">
                      {settlement.settlement_requested ? (
                        <span className="text-green-600">✓ Requested on {new Date(settlement.settlement_requested_at!).toLocaleDateString()}</span>
                      ) : (
                        <span className="text-muted-foreground">Not yet requested</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Requested By:</span>
                    <span className="font-medium">{settlement.settlement_requested_by || "—"}</span>
                  </div>
                  {settlement.settlement_notes && (
                    <div>
                      <span className="text-muted-foreground">Notes:</span>
                      <div className="bg-background rounded p-2 mt-1 text-xs">{settlement.settlement_notes}</div>
                    </div>
                  )}

                  <hr className="my-3" />

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approval Status:</span>
                    <span className="font-medium">
                      {settlement.settlement_approved ? (
                        <span className="text-green-600">✓ Approved on {new Date(settlement.settlement_approved_at!).toLocaleDateString()}</span>
                      ) : (
                        <span className="text-muted-foreground">Not yet approved</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approved By:</span>
                    <span className="font-medium">{settlement.settlement_approved_by || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type:</span>
                    <span className="font-medium">{settlement.settlement_type || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Settled Amount:</span>
                    <span className="font-medium">₹{Number(settlement.settled_amount).toLocaleString()}</span>
                  </div>
                  {settlement.settlement_approval_notes && (
                    <div>
                      <span className="text-muted-foreground">Approval Notes:</span>
                      <div className="bg-background rounded p-2 mt-1 text-xs">{settlement.settlement_approval_notes}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Request Settlement Tab */}
          {tab === "request" && !settlement.settlement_requested && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
                <div className="font-semibold mb-1">Submit Settlement Request</div>
                <div className="text-muted-foreground">Field staff initiates the settlement request with notes about customer's hardship or negotiation.</div>
              </div>

              <div>
                <label htmlFor="f-settlement-notes" className="block text-sm font-semibold mb-2">Settlement Notes *</label>
                <textarea id="f-settlement-notes"
                  value={requestNotes}
                  onChange={e => setRequestNotes(e.target.value)}
                  rows={4}
                  placeholder="Explain the rationale for settlement: customer's financial situation, willingness to pay, etc."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
                />
              </div>

              {requestMsg && (
                <div className={`text-sm rounded-xl p-3 ${requestMsg.includes("Failed") ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                  {requestMsg}
                </div>
              )}

              <button
                onClick={() => void handleRequestSettlement()}
                disabled={busy || !requestNotes.trim()}
                className="w-full h-9 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Submitting…" : "Submit Settlement Request"}
              </button>
            </div>
          )}

          {/* Approve Settlement Tab */}
          {tab === "approve" && settlement.settlement_requested && !settlement.settlement_approved && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
                <div className="font-semibold mb-1">Approve Settlement</div>
                <div className="text-muted-foreground">Manager approves the settlement with final amount and approval notes.</div>
              </div>

              <div>
                <label htmlFor="f-settlement-type-setsettlementtype-e-targ" className="block text-sm font-semibold mb-2">Settlement Type *</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="FULL"
                      checked={settlementType === "FULL"}
                      onChange={e => setSettlementType(e.target.value as "FULL" | "PARTIAL")}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Full Settlement (100% of overdue)</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="PARTIAL"
                      checked={settlementType === "PARTIAL"}
                      onChange={e => setSettlementType(e.target.value as "FULL" | "PARTIAL")}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Partial Settlement</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Settled Amount (₹) *</label>
                <input id="f-settlement-type-setsettlementtype-e-targ"
                  type="number"
                  value={settledAmount}
                  onChange={e => setSettledAmount(e.target.value)}
                  placeholder={`Max: ₹${Number(settlement.overdue_amount).toLocaleString()}`}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                />
                <div className="text-xs text-muted-foreground mt-1">
                  Overdue: ₹{Number(settlement.overdue_amount).toLocaleString()}
                </div>
              </div>

              <div>
                <label htmlFor="f-approval-notes" className="block text-sm font-semibold mb-2">Approval Notes</label>
                <textarea id="f-approval-notes"
                  value={approvalNotes}
                  onChange={e => setApprovalNotes(e.target.value)}
                  rows={3}
                  placeholder="Manager's decision: why this amount, special circumstances, etc."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none"
                />
              </div>

              {approveMsg && (
                <div className={`text-sm rounded-xl p-3 ${approveMsg.includes("Failed") ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                  {approveMsg}
                </div>
              )}

              <button
                onClick={() => void handleApproveSettlement()}
                disabled={busy || !settledAmount}
                className="w-full h-9 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Approving…" : "Approve Settlement"}
              </button>
            </div>
          )}
        </div>
      )}
    </ERPPageShell>
  );
}
