"use client";

import { useCallback, useEffect, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { DetailPanel } from "@/components/ui/operations";
import { amendmentContractTypeLabel, amendmentTypeLabel, getPartnerAmendment, type AmendmentRecord } from "@/services/amendments";

function safeJson(value?: Record<string, unknown> | null) {
  return JSON.stringify(value && Object.keys(value).length > 0 ? value : {}, null, 2);
}

function sourceLabel(row: AmendmentRecord) {
  return row.contract_type === "RENT_LEASE"
    ? row.rent_lease_contract_number || `Contract #${row.rent_lease_contract ?? "—"}`
    : row.subscription_number || `Subscription #${row.subscription ?? "—"}`;
}

function AuditTimeline({ row }: { row: AmendmentRecord }) {
  if (!row.audit_timeline || row.audit_timeline.length === 0) {
    return <div className="text-sm text-muted-foreground">No timeline events recorded.</div>;
  }
  
  const filteredEvents = row.audit_timeline.filter(
    (item) => !["Accounting bridge posted", "Reconciliation evidence linked"].includes(item.event)
  );

  return (
    <div className="space-y-4">
      {filteredEvents.map((item, idx) => (
        <div key={idx} className="flex gap-4">
          <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
            {item.status === "COMPLETED" ? (
              <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : item.status === "BLOCKED" ? (
              <svg className="h-4 w-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <div className="h-2 w-2 rounded-full bg-primary" />
            )}
          </div>
          <div>
            <div className="font-medium text-sm">{item.event}</div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
              {item.timestamp ? <span>{new Date(item.timestamp).toLocaleString()}</span> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PartnerAmendmentDetail({ id }: { id: number }) {
  const [row, setRow] = useState<AmendmentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRow(await getPartnerAmendment(id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load amendment.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (Number.isFinite(id)) void load(); }, [id, load]);

  return (
    <ERPPageShell eyebrow="Partner amendment" title={row?.amendment_no || `Amendment #${id}`} subtitle="Read-only linked customer amendment request." breadcrumbs={[{ label: "Partner", href: "/partner" }, { label: "Contract Amendments", href: "/partner/contract-amendments" }, { label: row?.amendment_no || `#${id}` }]} statusBadge={{ label: "Read only", tone: "info" }}>
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        {loading ? <ERPLoadingState label="Loading amendment..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load amendment" description={error} onRetry={() => void load()} /> : null}
        {!loading && !error && row ? <>
          <DetailPanel title="Amendment Audit Timeline" description="Read-only timeline of workflow milestones."><AuditTimeline row={row} /></DetailPanel>
          <div className="grid gap-4 lg:grid-cols-2">
            <DetailPanel title="Request summary" description="Linked contract and customer context."><dl className="grid gap-3 text-sm"><div><dt className="text-muted-foreground">Status</dt><dd><ERPStatusBadge status={row.status} /></dd></div><div><dt className="text-muted-foreground">Customer</dt><dd>{row.customer_name || "—"}</dd></div><div><dt className="text-muted-foreground">Contract</dt><dd>{amendmentContractTypeLabel(row.contract_type)} · {sourceLabel(row)}</dd></div><div><dt className="text-muted-foreground">Type</dt><dd>{amendmentTypeLabel(row.amendment_type)}</dd></div></dl></DetailPanel>
            <DetailPanel title="Admin decision" description="Decision record only."><dl className="grid gap-3 text-sm"><div><dt className="text-muted-foreground">Approved by</dt><dd>{row.approved_by_username || "—"}</dd></div><div><dt className="text-muted-foreground">Admin note</dt><dd>{row.admin_note || "—"}</dd></div><div><dt className="text-muted-foreground">Rejection reason</dt><dd>{row.rejection_reason || "—"}</dd></div></dl></DetailPanel>
          </div>
          <DetailPanel title="Reason" description="Submitted reason."><p className="text-sm text-muted-foreground">{row.reason}</p></DetailPanel>
          <div className="grid gap-4 lg:grid-cols-3"><DetailPanel title="Old values" description="Source snapshot."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.old_values || row.previous_values)}</pre></DetailPanel><DetailPanel title="Requested values" description="Requested change."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.requested_values || row.new_values)}</pre></DetailPanel><DetailPanel title="Approved values" description="Admin values."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.approved_values)}</pre></DetailPanel></div>
        </> : null}
      </div>
    </ERPPageShell>
  );
}
