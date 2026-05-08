"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import {
  archiveReversalCase,
  closeReversalCase,
  getReversalCaseDetail,
  reconcileReversalCase,
  syncReversalCase,
} from "@/services/reversal-control";

export default function ReversalCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await getReversalCaseDetail(id);
      setRow(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load case");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <PortalPage
      title={`Reversal Case ${String(row?.case_no || "")}`}
      subtitle="Operational reversal case detail, checklist, and controlled actions."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.root },
        { label: "Finance", href: ROUTES.admin.finance },
        { label: "Reversal & Return Control", href: ROUTES.admin.financeReversalControl },
        { label: String(row?.case_no || id) },
      ]}
    >
      {loading ? <LoadingBlock label="Loading reversal case..." /> : null}
      {!loading && error ? <ErrorState title="Unable to load reversal case" description={error} /> : null}
      {!loading && !error && !row ? <EmptyState title="Case not found" description="This case does not exist or is no longer accessible." /> : null}
      {!loading && !error && row ? (
        <div className="space-y-4">
          <div className="rounded border p-3 text-sm">
            <div>Source: {String(row.source_reference || row.source_type || "—")}</div>
            <div>Status: {String(row.status || "—")}</div>
            <div>Reconciliation: {String(row.reconciliation_status || "PENDING")}</div>
            <div>Amount: {String(row.amount || "0.00")}</div>
          </div>
          <div className="rounded border p-3 text-sm">
            <div className="font-medium mb-2">Linked Documents</div>
            <div className="flex gap-2">
              <Link className="rounded border px-2 py-1" href={String(row.source_url || ROUTES.admin.financeReversalControl)}>
                Open Source
              </Link>
              {row.customer_url ? (
                <Link className="rounded border px-2 py-1" href={String(row.customer_url)}>
                  Open Customer
                </Link>
              ) : null}
            </div>
          </div>
          <div className="rounded border p-3 text-sm">
            <div className="font-medium mb-2">Reconciliation Checklist</div>
            <ul className="space-y-1">
              {Array.isArray(row.reconciliation_checklist)
                ? row.reconciliation_checklist.map((item, index) => {
                    const typed = item as Record<string, unknown>;
                    return (
                      <li key={index}>
                        {String(typed.label)} - <span className="font-medium">{String(typed.status)}</span>
                      </li>
                    );
                  })
                : null}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded border px-3 py-2 text-sm" type="button" onClick={() => void syncReversalCase(id).then(load)}>
              Sync From Source
            </button>
            <button className="rounded border px-3 py-2 text-sm" type="button" onClick={() => void reconcileReversalCase(id, "Run reconciliation check from case detail.").then(load)}>
              Run Reconciliation Check
            </button>
            <button className="rounded border px-3 py-2 text-sm" type="button" onClick={() => void closeReversalCase(id, "Operational close after checklist review.").then(load)}>
              Close Case
            </button>
            <button className="rounded border px-3 py-2 text-sm" type="button" onClick={() => void archiveReversalCase(id, "Archive after operational close.").then(load)}>
              Archive Case
            </button>
          </div>
        </div>
      ) : null}
    </PortalPage>
  );
}
