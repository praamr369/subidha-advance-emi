"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { DetailPanel, MetricStrip } from "@/components/ui/operations";
import {
  amendmentContractTypeLabel,
  amendmentTypeLabel,
  listCustomerAmendments,
  type AmendmentRecord,
} from "@/services/amendments";

function dateLabel(value?: string | null) {
  if (!value) return "-";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function sourceLabel(row: AmendmentRecord) {
  return row.contract_type === "RENT_LEASE"
    ? row.rent_lease_contract_number || `Contract #${row.rent_lease_contract ?? "-"}`
    : row.subscription_number || `Subscription #${row.subscription ?? "-"}`;
}

export default function CustomerAmendmentList() {
  const [rows, setRows] = useState<AmendmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await listCustomerAmendments());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load amendment requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <ERPPageShell
      eyebrow="Customer amendments"
      title="My amendment requests"
      subtitle="Track amendment requests submitted for your EMI and rent/lease contracts."
      breadcrumbs={[{ label: "Customer", href: "/customer" }, { label: "Contract Amendments" }]}
      actions={[{ href: "/customer/contract-amendments/new", label: "New request", variant: "primary" }]}
      statusBadge={{ label: "Decision-only", tone: "warning" }}
    >
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        <MetricStrip
          items={[
            { label: "Total", value: String(rows.length) },
            { label: "Pending", value: String(rows.filter((r) => ["REQUESTED", "UNDER_REVIEW"].includes(r.status)).length) },
            { label: "Approved", value: String(rows.filter((r) => r.status === "APPROVED").length) },
            { label: "Rejected", value: String(rows.filter((r) => r.status === "REJECTED").length) },
          ]}
        />
        {loading ? <ERPLoadingState label="Loading amendment requests..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load amendment requests" description={error} onRetry={() => void load()} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No amendment requests" description="No amendment request is recorded for your account yet." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <DetailPanel title="Request register" description="Read-only register of your submitted amendment requests.">
            <div className="grid gap-3">
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/customer/contract-amendments/${row.id}`}
                  className="rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.amendment_no || `AMD-${row.id}`}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {amendmentContractTypeLabel(row.contract_type)} / {sourceLabel(row)}
                      </div>
                    </div>
                    <ERPStatusBadge status={row.status} />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-3">
                    <span>{amendmentTypeLabel(row.amendment_type)}</span>
                    <span>{dateLabel(row.created_at)}</span>
                    <span>{row.requested_by_username || row.requested_role}</span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{row.reason}</p>
                </Link>
              ))}
            </div>
          </DetailPanel>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
