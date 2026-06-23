"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { listOnlineEnquiries } from "@/services/online-enquiries";

type Row = {
  id: number;
  enquiry_no?: string;
  customer_name?: string;
  status?: string;
  pincode?: string;
  city?: string;
  product_name?: string;
  created_at?: string;
};

export default function AdminOnlineEnquiriesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setLoading(true);
    });
    void listOnlineEnquiries({ status: statusFilter || undefined })
      .then((payload) => {
        if (!active) return;
        const p = payload as { results?: Row[] };
        setRows(Array.isArray(p.results) ? p.results : []);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(accountingErrorMessage(err, "Could not load online enquiries."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [statusFilter]);

  return (
    <ERPPageShell
      title="Online purchase enquiries"
      subtitle="Customer intents for fulfilment sourcing — no automatic procurement or payments."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Online enquiries", href: ROUTES.admin.onlineEnquiries }]}
      actions={[
        { href: ROUTES.admin.vendorsSourcing, label: "Online sourcing workspace", variant: "primary" },
        { href: ROUTES.admin.vendorsQuotes, label: "Vendor quotes", variant: "secondary" },
      ]}
      stats={[
        { label: "Loaded rows", value: String(rows.length), tone: loading ? "info" : rows.length === 0 ? "warning" : "info" },
        { label: "Filter", value: statusFilter.trim() || "all", tone: "info" },
      ]}
    >
      <ERPSectionShell
        title="Enquiry register"
        description="Review customer intents and route into controlled sourcing workflows. Procurement and posting remain explicitly admin-owned."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex w-full max-w-sm flex-col text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Status filter
            <input
              className="mt-2 h-10 rounded-2xl border border-border/70 bg-background px-3 text-sm font-normal tracking-normal text-foreground shadow-[inset_0_1px_0_var(--hairline-shine)] outline-none transition focus:border-ring"
              placeholder="NEW, SOURCING…"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
          </label>
        </div>

        {loading ? <ERPLoadingState label="Loading enquiries..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load online enquiries" description={error} /> : null}

        {!loading && !error ? (
          rows.length === 0 ? (
            <ERPEmptyState
              title="No enquiries yet"
              description="Public submissions with procurement intent create rows automatically; operational teams can also seed RFQs from CRM leads."
            />
          ) : (
            <div className="overflow-auto rounded-[1.25rem] border border-border/70 bg-[var(--surface-card-elevated)] shadow-[inset_0_1px_0_var(--hairline-shine)]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-[color-mix(in_oklab,var(--surface-muted)_55%,transparent)] text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Enquiry</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border/70">
                      <td className="px-4 py-3 font-medium text-foreground">{row.enquiry_no ?? `#${row.id}`}</td>
                      <td className="px-4 py-3">{row.customer_name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {[row.pincode, row.city].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">{row.product_name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{row.status ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          className="inline-flex h-9 items-center rounded-xl border border-border bg-[var(--surface-strong)] px-3 text-sm font-semibold shadow-[inset_0_1px_0_var(--hairline-shine)] transition hover:border-[var(--surface-border-strong)] hover:bg-[color-mix(in_oklab,var(--surface-strong)_76%,var(--surface-muted)_24%)]"
                          href={`${ROUTES.admin.onlineEnquiries}/${row.id}`}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
