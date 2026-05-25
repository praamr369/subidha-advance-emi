"use client";

import { useEffect, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel } from "@/components/ui/operations";
import {
  amendmentContractTypeLabel,
  amendmentTypeLabel,
  approveAdminAmendment,
  getAdminAmendment,
  rejectAdminAmendment,
  reviewAdminAmendment,
  type AmendmentRecord,
} from "@/services/amendments";

function safeJson(value?: Record<string, unknown> | null) {
  return JSON.stringify(value && Object.keys(value).length > 0 ? value : {}, null, 2);
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Approved values must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function sourceLabel(row: AmendmentRecord) {
  return row.contract_type === "RENT_LEASE"
    ? row.rent_lease_contract_number || `Contract #${row.rent_lease_contract ?? "—"}`
    : row.subscription_number || `Subscription #${row.subscription ?? "—"}`;
}

function Timeline({ status }: { status: string }) {
  return (
    <div className="grid gap-2 md:grid-cols-4">
      {["REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED"].map((step) => (
        <div
          key={step}
          className={`rounded-2xl border p-3 text-sm ${
            step === status ? "border-primary bg-primary/10" : "border-border bg-muted/20"
          }`}
        >
          <div className="font-semibold">{step.replace(/_/g, " ")}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {step === status ? "Current state" : "Workflow step"}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminAmendmentDetail({ id }: { id: number }) {
  const [row, setRow] = useState<AmendmentRecord | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [approvedJson, setApprovedJson] = useState("{}\n");
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const next = await getAdminAmendment(id);
      setRow(next);
      setAdminNote(next.admin_note || "");
      setApprovedJson(
        safeJson(
          next.approved_values && Object.keys(next.approved_values).length > 0
            ? next.approved_values
            : next.requested_values || next.new_values
        )
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load amendment.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (Number.isFinite(id)) void load();
  }, [id]);

  async function run(action: "review" | "approve" | "reject") {
    setBusy(action);
    setError(null);
    try {
      if (action === "review") {
        setRow(await reviewAdminAmendment(id, adminNote));
      }
      if (action === "approve") {
        setRow(await approveAdminAmendment(id, { approved_values: parseJsonObject(approvedJson), admin_note: adminNote }));
      }
      if (action === "reject") {
        if (!rejectionReason.trim()) throw new Error("Rejection reason is required.");
        setRow(await rejectAdminAmendment(id, { rejection_reason: rejectionReason.trim(), admin_note: adminNote }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Admin amendment review"
      title={row?.amendment_no || `Amendment #${id}`}
      subtitle="Review, approve, or reject only. No implementation action is available."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Contract Amendments", href: "/admin/contract-amendments" },
        { label: row?.amendment_no || `#${id}` },
      ]}
      statusBadge={{ label: "Decision only", tone: "warning" }}
    >
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        {loading ? <ERPLoadingState label="Loading amendment..." /> : null}
        {!loading && error ? <ERPErrorState title="Amendment action failed" description={error} onRetry={() => void load()} /> : null}
        {!loading && row ? (
          <>
            <DetailPanel title="Status timeline" description="Workflow stops at admin decision in this phase.">
              <Timeline status={row.status} />
            </DetailPanel>
            <div className="grid gap-4 lg:grid-cols-2">
              <DetailPanel title="Request summary" description="Requester and contract context.">
                <dl className="grid gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <ERPStatusBadge status={row.status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Customer</dt>
                    <dd>{row.customer_name || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Contract</dt>
                    <dd>
                      {amendmentContractTypeLabel(row.contract_type)} · {sourceLabel(row)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd>{amendmentTypeLabel(row.amendment_type)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Requester</dt>
                    <dd>
                      {row.requested_by_username || row.requested_role} · {row.requested_role}
                    </dd>
                  </div>
                </dl>
              </DetailPanel>
              <DetailPanel title="Request reason" description="Submitted reason.">
                <p className="text-sm text-muted-foreground">{row.reason}</p>
              </DetailPanel>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <DetailPanel title="Old values" description="Source snapshot.">
                <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">
                  {safeJson(row.old_values || row.previous_values)}
                </pre>
              </DetailPanel>
              <DetailPanel title="Requested values" description="Requested change.">
                <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">
                  {safeJson(row.requested_values || row.new_values)}
                </pre>
              </DetailPanel>
              <DetailPanel title="Approved values" description="Decision values.">
                <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">
                  {safeJson(row.approved_values)}
                </pre>
              </DetailPanel>
            </div>
            <DetailPanel title="Admin decision controls" description="Review, approve, or reject only.">
              <label className="block text-sm font-medium">
                Admin note
                <textarea
                  className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm"
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                />
              </label>
              <label className="mt-4 block text-sm font-medium">
                Approved decision values JSON
                <textarea
                  className="mt-2 min-h-32 w-full rounded-xl border border-border bg-background p-3 font-mono text-sm"
                  value={approvedJson}
                  onChange={(event) => setApprovedJson(event.target.value)}
                />
              </label>
              <label className="mt-4 block text-sm font-medium">
                Rejection reason
                <input
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                  placeholder="Required for rejection"
                />
              </label>
              <div className="mt-4 flex flex-wrap gap-3">
                <ActionButton onClick={() => void run("review")} disabled={Boolean(busy) || row.status !== "REQUESTED"}>
                  {busy === "review" ? "Reviewing..." : "Mark under review"}
                </ActionButton>
                <ActionButton
                  onClick={() => void run("approve")}
                  disabled={Boolean(busy) || !["REQUESTED", "UNDER_REVIEW"].includes(row.status)}
                >
                  {busy === "approve" ? "Approving..." : "Approve decision"}
                </ActionButton>
                <ActionButton
                  variant="outline"
                  onClick={() => void run("reject")}
                  disabled={Boolean(busy) || !["REQUESTED", "UNDER_REVIEW"].includes(row.status)}
                >
                  {busy === "reject" ? "Rejecting..." : "Reject decision"}
                </ActionButton>
              </div>
            </DetailPanel>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
