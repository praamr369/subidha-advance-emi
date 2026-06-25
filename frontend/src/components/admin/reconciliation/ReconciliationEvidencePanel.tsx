"use client";

import ERPAuditNote from "@/components/erp/ERPAuditNote";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import type { ReconciliationEvidence, ReconciliationResolution } from "@/types/reconciliation";

function EvidenceRow({ row }: { row: ReconciliationEvidence }) {
  return (
    <div className="rounded-xl border border-border/70 bg-[var(--surface-card-elevated)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{row.label || row.evidence_type}</div>
        <div className="text-xs text-muted-foreground">{row.evidence_type}</div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {row.object_id ? `Object: ${row.object_id}` : "Object: —"}{" "}
        {row.status ? `• Status: ${row.status}` : ""}
      </div>
      {row.metadata && Object.keys(row.metadata).length ? (
        <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
          {JSON.stringify(row.metadata, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export function ReconciliationResolutionTimeline({ rows }: { rows: ReconciliationResolution[] }) {
  if (!rows.length) {
    return <ERPEmptyState title="No resolution history" description="No manual actions recorded yet." />;
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <ERPAuditNote
          key={row.id}
          title={`${row.action}${row.resolved_by_username ? ` — ${row.resolved_by_username}` : ""}`}
        >
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{row.created_at}</div>
            <div>{row.note}</div>
            {row.before_status || row.after_status ? (
              <div className="text-xs text-muted-foreground">
                Status: {row.before_status || "—"} → {row.after_status || "—"}
              </div>
            ) : null}
          </div>
        </ERPAuditNote>
      ))}
    </div>
  );
}

export default function ReconciliationEvidencePanel({
  evidence,
  resolutions,
}: {
  evidence: ReconciliationEvidence[];
  resolutions: ReconciliationResolution[];
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="text-sm font-semibold">Evidence</div>
        {evidence.length ? evidence.map((row) => <EvidenceRow key={row.id} row={row} />) : <ERPEmptyState title="No evidence" />}
      </div>

      <div className="space-y-3">
        <div className="text-sm font-semibold">Resolution History</div>
        <ReconciliationResolutionTimeline rows={resolutions} />
      </div>
    </div>
  );
}
