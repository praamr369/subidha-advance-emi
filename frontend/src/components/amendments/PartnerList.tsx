"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { DetailPanel } from "@/components/ui/operations";
import {
  amendmentContractTypeLabel,
  amendmentTypeLabel,
  listPartnerAmendments,
  type AmendmentRecord,
} from "@/services/amendments";

export default function PartnerAmendmentList() {
  const [rows, setRows] = useState<AmendmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await listPartnerAmendments());
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
      eyebrow="Partner amendments"
      title="Customer amendment requests"
      subtitle="Partner-scoped amendment register."
      breadcrumbs={[{ label: "Partner", href: "/partner" }, { label: "Amendments" }]}
      actions={[{ href: "/partner/contract-amendments/new", label: "New request", variant: "primary" }]}
      statusBadge={{ label: "Partner scope", tone: "info" }}
    >
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        {loading ? <ERPLoadingState label="Loading amendment requests..." /> : null}
        {!loading && error ? (
          <ERPErrorState title="Unable to load amendments" description={error} onRetry={() => void load()} />
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No amendment requests" description="No linked amendment requests are available." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <DetailPanel title="Amendment register" description="Only linked customer contract requests are shown.">
            <div className="grid gap-3">
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/partner/contract-amendments/${row.id}`}
                  className="rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
                >
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.amendment_no || `AMD-${row.id}`}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.customer_name || "Customer"} · {amendmentContractTypeLabel(row.contract_type)}
                      </div>
                    </div>
                    <ERPStatusBadge status={row.status} />
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    {amendmentTypeLabel(row.amendment_type)} · {row.reason}
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
