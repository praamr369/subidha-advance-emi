"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { listVendorQuotes } from "@/services/vendor-ops";

export default function VendorQuotesPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listVendorQuotes()
      .then((payload) => {
        if (!active) return;
        const parsed = payload as { results?: Record<string, unknown>[] };
        setRows(parsed.results ?? []);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setRows([]);
        setError(accountingErrorMessage(err, "Could not fetch quote invitations."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <ERPPageShell
      title="Quote requests"
      subtitle="RFQs where your vendor was invited."
      breadcrumbs={[{ label: "Vendor", href: ROUTES.vendor.dashboard }, { label: "Quotes" }]}
    >
      <ERPSectionShell
        title="Invitation register"
        description="Respond to RFQs only through quote submission. Purchase documents and payments remain posted by the admin procurement/accounting flows."
      >
        {loading ? <ERPLoadingState label="Loading quote invitations..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load quote invitations" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState
            title="No invitations"
            description="No invitations right now. Maintain your catalog so admins can qualify you faster."
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="space-y-2 text-sm">
            {rows.map((row) => (
              <div
                key={String(row.id)}
                className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link className="font-semibold text-primary underline" href={`/vendor/quotes/${row.id}`}>
                      {String(row.request_no || row.id)}
                    </Link>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Product: {String(row.product_name || "—")}
                    </div>
                  </div>
                  <ERPStatusBadge status={String(row.status ?? "—")} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {!loading && !error ? (
          <div className="text-xs text-muted-foreground">
            Tip:{" "}
            <Link href={ROUTES.vendor.products} className="underline text-primary">
              maintain your catalog
            </Link>{" "}
            so procurement can invite you faster.
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
