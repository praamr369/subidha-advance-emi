"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { DetailPanel } from "@/components/ui/operations";
import { amendmentContractTypeLabel, amendmentTypeLabel, getCustomerAmendment, type AmendmentRecord } from "@/services/amendments";

function safeJson(value?: Record<string, unknown> | null) {
  return JSON.stringify(value && Object.keys(value).length > 0 ? value : {}, null, 2);
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
        <div key={step} className={`rounded-2xl border p-3 text-sm ${step === status ? "border-primary bg-primary/10" : "border-border bg-muted/20"}`}>
          <div className="font-semibold">{step.replace(/_/g, " ")}</div>
          <div className="mt-1 text-xs text-muted-foreground">{step === status ? "Current state" : "Workflow step"}</div>
        </div>
      ))}
    </div>
  );
}

export default function CustomerAmendmentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [row, setRow] = useState<AmendmentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRow(await getCustomerAmendment(id));
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

  return (
    <ERPPageShell eyebrow="Customer amendment" title={row?.amendment_no || `Amendment #${id}`} subtitle="Read-only amendment request status and admin decision evidence." breadcrumbs={[{ label: "Customer", href: "/customer" }, { label: "Contract Amendments", href: "/customer/contract-amendments" }, { label: row?.amendment_no || `#${id}` }]} statusBadge={{ label: "Read only", tone: "info" }}>
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        {loading ? <ERPLoadingState label="Loading amendment..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load amendment" description={error} onRetry={() => void load()} /> : null}
        {!loading && !error && row ? (
          <>
            <DetailPanel title="Status timeline" description="No implementation step exists in this phase."><Timeline status={row.status} /></DetailPanel>
            <div className="grid gap-4 lg:grid-cols-2">
              <DetailPanel title="Request summary" description="Source contract and requester context.">
                <dl className="grid gap-3 text-sm">
                  <div><dt className="text-muted-foreground">Status</dt><dd><ERPStatusBadge status={row.status} /></dd></div>
                  <div><dt className="text-muted-foreground">Contract</dt><dd>{amendmentContractTypeLabel(row.contract_type)} · {sourceLabel(row)}</dd></div>
                  <div><dt className="text-muted-foreground">Type</dt><dd>{amendmentTypeLabel(row.amendment_type)}</dd></div>
                  <div><dt className="text-muted-foreground">Requested</dt><dd>{dateLabel(row.created_at)}</dd></div>
                </dl>
              </DetailPanel>
              <DetailPanel title="Admin decision" description="Approval/rejection record only.">
                <dl className="grid gap-3 text-sm">
                  <div><dt className="text-muted-foreground">Approved by</dt><dd>{row.approved_by_username || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Approved at</dt><dd>{dateLabel(row.approved_at)}</dd></div>
                  <div><dt className="text-muted-foreground">Admin note</dt><dd>{row.admin_note || "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Rejection reason</dt><dd>{row.rejection_reason || "—"}</dd></div>
                </dl>
              </DetailPanel>
            </div>
            <DetailPanel title="Reason" description="Submitted reason."><p className="text-sm text-muted-foreground">{row.reason}</p></DetailPanel>
            <div className="grid gap-4 lg:grid-cols-3">
              <DetailPanel title="Old values" description="Source snapshot."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.old_values || row.previous_values)}</pre></DetailPanel>
              <DetailPanel title="Requested values" description="Requested correction/change."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.requested_values || row.new_values)}</pre></DetailPanel>
              <DetailPanel title="Approved values" description="Admin decision values."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.approved_values)}</pre></DetailPanel>
            </div>
            <DetailPanel title="Implementation values" description="Empty until later implementation phases."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.implemented_values)}</pre></DetailPanel>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
