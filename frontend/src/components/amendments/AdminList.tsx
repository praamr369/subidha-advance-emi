"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel, MetricStrip } from "@/components/ui/operations";
import {
  AMENDMENT_STATUSES,
  amendmentContractTypeLabel,
  amendmentTypeLabel,
  listAdminAmendments,
  type AmendmentRecord,
} from "@/services/amendments";

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed)
    ? value
    : new Date(parsed).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function sourceLabel(row: AmendmentRecord) {
  return row.contract_type === "RENT_LEASE"
    ? row.rent_lease_contract_number || `Contract #${row.rent_lease_contract ?? "—"}`
    : row.subscription_number || `Subscription #${row.subscription ?? "—"}`;
}

export default function AdminAmendmentList({
  status = "",
  contractType = "",
}: {
  status?: string;
  contractType?: string;
}) {
  const [rows, setRows] = useState<AmendmentRecord[]>([]);
  const [statusInput, setStatusInput] = useState(status);
  const [typeInput, setTypeInput] = useState(contractType);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listAdminAmendments({ status: status || undefined, contractType: contractType || undefined }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load amendment register.");
    } finally {
      setLoading(false);
    }
  }, [contractType, status]);

  useEffect(() => {
    setStatusInput(status);
    setTypeInput(contractType);
    void load();
  }, [status, contractType, load]);

  const filterHref = () => {
    const params = new URLSearchParams();
    if (statusInput) params.set("status", statusInput);
    if (typeInput) params.set("contract_type", typeInput);
    const query = params.toString();
    return query ? `/admin/contract-amendments?${query}` : "/admin/contract-amendments";
  };

  return (
    <ERPPageShell
      eyebrow="Admin amendments"
      title="Contract Amendments"
      subtitle="Admin review register for customer and partner amendment requests. Customer and partner requests will appear here after submission."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Contract Amendments" }]}
      statusBadge={{ label: "Decision only", tone: "warning" }}
    >
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card p-4">
          <ActionButton href="/admin/contract-amendments/new" variant="primary">
            Create amendment
          </ActionButton>
          <ActionButton href="/admin/contract-amendments" variant="outline">
            View all statuses
          </ActionButton>
          <ActionButton href="/admin/contract-amendments/recontract-report" variant="outline">
            Open Recontract Report
          </ActionButton>
        </div>
        <MetricStrip
          items={[
            { label: "Total", value: String(rows.length) },
            { label: "Requested", value: String(rows.filter((r) => r.status === "REQUESTED").length) },
            { label: "Under review", value: String(rows.filter((r) => r.status === "UNDER_REVIEW").length) },
            { label: "Approved", value: String(rows.filter((r) => r.status === "APPROVED").length) },
            { label: "Rejected", value: String(rows.filter((r) => r.status === "REJECTED").length) },
            { label: "Cancelled", value: String(rows.filter((r) => r.status === "CANCELLED").length) },
          ]}
        />
        <DetailPanel title="Filters" description="Filter amendment requests without changing source contracts.">
          <div className="grid gap-3 md:grid-cols-[220px_220px_auto]">
            <select
              className="h-11 rounded-xl border border-border bg-background px-3"
              value={statusInput}
              onChange={(event) => setStatusInput(event.target.value)}
            >
              <option value="">All statuses</option>
              {AMENDMENT_STATUSES.map((row) => (
                <option key={row} value={row}>
                  {row}
                </option>
              ))}
            </select>
            <select
              className="h-11 rounded-xl border border-border bg-background px-3"
              value={typeInput}
              onChange={(event) => setTypeInput(event.target.value)}
            >
              <option value="">All contract types</option>
              <option value="EMI_SUBSCRIPTION">EMI Subscription</option>
              <option value="RENT_LEASE">Rent / Lease</option>
            </select>
            <div className="flex flex-wrap gap-2">
              <ActionButton href={filterHref()}>Filter</ActionButton>
              <ActionButton href="/admin/contract-amendments" variant="outline">
                Clear
              </ActionButton>
            </div>
          </div>
        </DetailPanel>
        {loading ? <ERPLoadingState label="Loading amendment register..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load amendments" description={error} onRetry={() => void load()} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <DetailPanel title="No amendments found" description="No amendment requests match the current filters. Create an admin-side request, clear filters, or open the recontract report.">
            <div className="grid gap-3 md:grid-cols-3">
              <Link href="/admin/contract-amendments/new" className="rounded-2xl border border-border bg-muted/20 p-4 transition hover:border-primary/50">
                <div className="text-sm font-semibold text-foreground">Create amendment</div>
                <div className="mt-1 text-xs text-muted-foreground">Admin can create a request on behalf of a customer or partner when backend validation allows it.</div>
              </Link>
              <Link href="/admin/contract-amendments" className="rounded-2xl border border-border bg-muted/20 p-4 transition hover:border-primary/50">
                <div className="text-sm font-semibold text-foreground">View all statuses</div>
                <div className="mt-1 text-xs text-muted-foreground">Clear filters and see requested, under-review, approved, rejected, and cancelled records.</div>
              </Link>
              <Link href="/admin/contract-amendments/recontract-report" className="rounded-2xl border border-border bg-muted/20 p-4 transition hover:border-primary/50">
                <div className="text-sm font-semibold text-foreground">Open Recontract Report</div>
                <div className="mt-1 text-xs text-muted-foreground">Approved product upgrade/downgrade amendments with saved previews will appear there.</div>
              </Link>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              Customer and partner amendment requests will appear here after submission. No fake rows are generated.
            </div>
          </DetailPanel>
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <DetailPanel title="Amendment register" description="Open a request to review, approve, reject, cancel/archive, preview, or execute only evidence-gated safe workflows.">
            <div className="grid gap-3">
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/admin/contract-amendments/${row.id}`}
                  className="rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50"
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.amendment_no || `AMD-${row.id}`}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.customer_name || "Customer"} · {sourceLabel(row)}
                      </div>
                    </div>
                    <ERPStatusBadge status={row.status} />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-5">
                    <span>{amendmentContractTypeLabel(row.contract_type)}</span>
                    <span>{amendmentTypeLabel(row.amendment_type)}</span>
                    <span>{row.workflow_capability?.category ?? "—"}</span>
                    <span>{row.requested_role}</span>
                    <span>{dateLabel(row.created_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </DetailPanel>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
