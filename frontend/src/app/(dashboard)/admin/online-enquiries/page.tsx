"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
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
    <PortalPage
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
      <section className="mb-6 flex flex-wrap items-end gap-3 rounded border p-4 text-sm">
        <label className="flex flex-col text-xs uppercase text-muted-foreground">
          Status
          <input
            className="mt-1 h-10 min-w-[160px] rounded border px-2 normal-case"
            placeholder="NEW, SOURCING…"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </label>
      </section>

      {error ? <div className="mb-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {loading ? <div className="text-sm text-muted-foreground">Loading enquiries…</div> : null}

      {!loading && rows.length === 0 && !error ? (
        <div className="rounded border border-dashed p-6 text-sm text-muted-foreground">
          No enquiries yet. Public submissions with procurement intent create rows automatically; operational teams can also seed RFQs from CRM leads.
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="overflow-auto rounded border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2">Enquiry</th>
                <th className="p-2">Customer</th>
                <th className="p-2">Location</th>
                <th className="p-2">Product</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="p-2 font-medium">{row.enquiry_no ?? `#${row.id}`}</td>
                  <td className="p-2">{row.customer_name ?? "—"}</td>
                  <td className="p-2 text-xs">
                    {[row.pincode, row.city].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="p-2 text-xs">{row.product_name ?? "—"}</td>
                  <td className="p-2 text-xs">{row.status ?? "—"}</td>
                  <td className="p-2">
                    <Link className="text-primary underline" href={`${ROUTES.admin.onlineEnquiries}/${row.id}`}>
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </PortalPage>
  );
}
