"use client";

import { useEffect, useState } from "react";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { accountingErrorMessage } from "@/components/accounting/shared";
import { ROUTES } from "@/lib/routes";
import { listVendorPurchaseOrders } from "@/services/vendor-ops";

export default function VendorOrdersPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void listVendorPurchaseOrders()
      .then((payload) => {
        if (!active) return;
        setRows((payload.results as Record<string, unknown>[]) || []);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setRows([]);
        setError(accountingErrorMessage(err, "Unable to load purchase orders."));
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
      title="Purchase orders"
      subtitle="Vendor-scoped purchase order visibility."
      breadcrumbs={[{ label: "Vendor", href: ROUTES.vendor.dashboard }, { label: "Purchase orders" }]}
    >
      <ERPSectionShell title="Order register" description="Orders remain controlled by the admin procurement workflow. This view is visibility-only for your vendor account.">
        {loading ? <ERPLoadingState label="Loading purchase orders..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load purchase orders" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState
            title="No purchase orders"
            description="Approved purchase orders will appear here when procurement issues them to your vendor account."
          />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-auto rounded-2xl border border-border/70 bg-[var(--surface-card-elevated)] text-sm shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <table className="w-full min-w-[720px] text-left">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3">PO</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Expected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="p-3 font-medium">{String(row.po_no ?? "—")}</td>
                    <td className="p-3">
                      <ERPStatusBadge status={String(row.status ?? "—")} />
                    </td>
                    <td className="p-3 text-muted-foreground">{String(row.expected_date || "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
