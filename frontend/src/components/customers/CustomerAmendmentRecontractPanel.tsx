"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FileText, ShieldCheck } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import StatusBadge from "@/components/ui/status-badge";
import {
  amendmentContractTypeLabel,
  amendmentTypeLabel,
  listAdminAmendments,
  listAdminProductRecontractReport,
  type AmendmentRecord,
  type ProductRecontractReportRow,
} from "@/services/amendments";
import {
  buildAdminContractAmendmentRoute,
  buildAdminProductRecontractAddendumPrintRoute,
  buildAdminRecontractReportRoute,
} from "@/lib/route-builders";

const ACTIVE_AMENDMENT_STATUSES = new Set(["REQUESTED", "UNDER_REVIEW", "APPROVED"]);

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function evidenceLabel(value?: string | null): string {
  return value ? value.replaceAll("_", " ") : "Not exposed";
}

function evidenceStatus(value?: string | null): string {
  return value || "MISSING";
}

function recontractForAmendment(
  amendment: AmendmentRecord,
  recontractRows: ProductRecontractReportRow[],
): ProductRecontractReportRow | null {
  return recontractRows.find((row) => row.amendment_id === amendment.id) ?? null;
}

function latestCreatedAt(row: AmendmentRecord): number {
  return Date.parse(row.created_at || row.updated_at || "") || 0;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Could not load amendment/recontract activity.";
}

export default function CustomerAmendmentRecontractPanel({
  customerId: explicitCustomerId,
}: {
  customerId?: number | string | null;
}) {
  const params = useParams<{ id?: string }>();
  const customerId = explicitCustomerId ?? params?.id;
  const [amendments, setAmendments] = useState<AmendmentRecord[]>([]);
  const [recontractRows, setRecontractRows] = useState<ProductRecontractReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadActivity() {
      if (!customerId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [amendmentRows, recontractReportRows] = await Promise.all([
          listAdminAmendments({ customer: customerId }),
          listAdminProductRecontractReport({ customer: String(customerId) }),
        ]);

        if (!active) return;
        const numericCustomerId = Number(customerId);
        setAmendments(
          amendmentRows
            .filter((row) => Number(row.customer) === numericCustomerId)
            .sort((a, b) => latestCreatedAt(b) - latestCreatedAt(a)),
        );
        setRecontractRows(
          recontractReportRows
            .filter((row) => Number(row.customer_id) === numericCustomerId)
            .sort((a, b) => (Date.parse(b.created_at || "") || 0) - (Date.parse(a.created_at || "") || 0)),
        );
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(toErrorMessage(err));
        setAmendments([]);
        setRecontractRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadActivity();
    return () => {
      active = false;
    };
  }, [customerId]);

  const activeCount = useMemo(
    () => amendments.filter((row) => ACTIVE_AMENDMENT_STATUSES.has(row.status)).length,
    [amendments],
  );
  const latestAmendment = amendments[0] ?? null;
  const latestRecontract = latestAmendment
    ? recontractForAmendment(latestAmendment, recontractRows)
    : recontractRows[0] ?? null;
  const visibleAmendments = amendments.slice(0, 6);

  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldCheck className="h-4 w-4 text-blue-700" />
            Contract Amendments &amp; Recontracts
          </div>
          <p className="text-sm text-muted-foreground">
            Read-only amendment and product recontract visibility for this Customer 360 profile.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={activeCount > 0 ? "OPEN" : "CLEAR"} label={`${activeCount} active`} />
          {latestAmendment ? <StatusBadge status={latestAmendment.status} /> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={buildAdminRecontractReportRoute({ customer: String(customerId ?? "") })}
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          Recontract report
        </Link>
      </div>

      {loading ? <div className="mt-4"><LoadingBlock label="Loading amendment and recontract activity..." /></div> : null}

      {!loading && error ? (
        <div className="mt-4">
          <ErrorState
            title="Could not load amendment/recontract activity"
            description={`${error} Customer profile remains available.`}
          />
        </div>
      ) : null}

      {!loading && !error && amendments.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No amendment or recontract activity"
            description="No amendment or recontract activity for this customer."
            tone="info"
          />
        </div>
      ) : null}

      {!loading && !error && amendments.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active amendments</div>
              <div className="mt-1 text-lg font-semibold text-foreground">{activeCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Latest status</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{latestAmendment?.status ?? "—"}</div>
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Executed recontracts</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {recontractRows.filter((row) => row.executed).length}
              </div>
            </div>
          </div>

          {visibleAmendments.map((amendment) => {
            const recontract = recontractForAmendment(amendment, recontractRows);
            const preview = amendment.latest_product_recontract_preview;
            const executed = Boolean(recontract?.executed || preview?.executed);
            const executedAt = recontract?.executed_at ?? preview?.executed_at ?? null;
            const accountingStatus = recontract?.accounting_posting_status ?? (preview?.accounting_bridge_posting_id && preview?.journal_entry_id ? "POSTED" : "MISSING");
            const reconciliationStatus = recontract?.reconciliation_bridge_status ?? (preview?.reconciliation_item_id && preview?.reconciliation_run_id && (preview?.reconciliation_evidence_ids?.length ?? 0) > 0 ? "LINKED" : "MISSING");
            const customerConsent = recontract?.customer_consent_status ?? preview?.customer_consent_status ?? null;
            const adminApproval = recontract?.admin_approval_status ?? preview?.admin_approval_status ?? null;

            return (
              <div key={amendment.id} className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {amendment.amendment_no || `Amendment #${amendment.id}`}
                      </span>
                      <StatusBadge status={amendment.status} />
                      {recontract || preview ? <StatusBadge status={executed ? "EXECUTED" : "NOT_EXECUTED"} /> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {amendmentTypeLabel(amendment.amendment_type)} · {amendmentContractTypeLabel(amendment.contract_type)} · Requested by {amendment.requested_role}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Reference {amendment.subscription_number || amendment.rent_lease_contract_number || amendment.subscription || amendment.rent_lease_contract || "—"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={buildAdminContractAmendmentRoute(amendment.id)}
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
                    >
                      Open amendment detail
                    </Link>
                    {executed ? (
                      <Link
                        href={buildAdminProductRecontractAddendumPrintRoute(amendment.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900 transition hover:bg-blue-100"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Recontract addendum / print
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Customer consent</div>
                    <div className="mt-1 text-xs font-medium text-foreground">{evidenceLabel(customerConsent)}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Admin approval</div>
                    <div className="mt-1 text-xs font-medium text-foreground">{evidenceLabel(adminApproval)}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Accounting evidence</div>
                    <div className="mt-1 text-xs font-medium text-foreground">{evidenceStatus(accountingStatus)}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reconciliation evidence</div>
                    <div className="mt-1 text-xs font-medium text-foreground">{evidenceStatus(reconciliationStatus)}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Executed at</div>
                    <div className="mt-1 text-xs font-medium text-foreground">{formatDateTime(executedAt)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
