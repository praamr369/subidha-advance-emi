"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { listAdminVendorProducts } from "@/services/vendor-ops";
import { listVendors } from "@/services/vendors";

type VendorLite = { id: number; display_name?: string; name?: string };

export default function AdminVendorProductsHubPage() {
  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [vendorId, setVendorId] = useState<number | "">("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listVendors()
      .then((payload) => {
        if (!active) return;
        const p = payload as { results?: VendorLite[] } | VendorLite[];
        const list = Array.isArray(p) ? p : p.results || [];
        setVendors(list);
        setLoadingList(false);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(accountingErrorMessage(err, "Failed to load vendors."));
        setLoadingList(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (vendorId === "" || Number.isNaN(Number(vendorId))) {
      setRows([]);
      return;
    }
    let active = true;
    setLoadingProducts(true);
    void listAdminVendorProducts(Number(vendorId))
      .then((payload) => {
        if (!active) return;
        const parsed = payload as { results?: Record<string, unknown>[] };
        setRows(parsed.results ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(accountingErrorMessage(err, "Failed to load products."));
      })
      .finally(() => {
        if (active) setLoadingProducts(false);
      });
    return () => {
      active = false;
    };
  }, [vendorId]);

  return (
    <PortalPage
      title="Vendor catalog hub"
      subtitle="Pick a supplier to review their SKU lines. Maintain lines from each vendor detail page."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor products", href: ROUTES.admin.vendorsProducts }]}
      actions={[{ href: ROUTES.admin.vendors, label: "Vendor register", variant: "secondary" }]}
    >
      {error ? (
        <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="vendor-select" className="text-muted-foreground">
          Vendor:
        </label>
        <select
          id="vendor-select"
          className="h-10 min-w-[220px] rounded border bg-background px-2"
          value={vendorId === "" ? "" : String(vendorId)}
          disabled={loadingList}
          onChange={(e) => {
            const next = e.target.value;
            setVendorId(next ? Number(next) : "");
          }}
        >
          <option value="">{loadingList ? "Loading…" : "Select vendor"}</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.display_name || v.name || `Vendor ${v.id}`}
            </option>
          ))}
        </select>
        {vendorId !== "" ? (
          <Link className="text-primary underline" href={`${ROUTES.admin.vendors}/${vendorId}`}>
            Open vendor workspace
          </Link>
        ) : null}
      </div>

      {vendorId === "" ? (
        <div className="text-sm text-muted-foreground">Select a vendor to show catalog rows.</div>
      ) : loadingProducts ? (
        <div className="text-sm">Loading products…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No catalog lines recorded for this vendor.</div>
      ) : (
        <div className="overflow-auto rounded border text-sm">
          <table className="w-full min-w-[560px] text-left">
            <thead className="bg-muted/60">
              <tr>
                <th className="p-2">Product</th>
                <th className="p-2">SKU</th>
                <th className="p-2">Category</th>
                <th className="p-2">Base quote</th>
                <th className="p-2">Lead (d)</th>
                <th className="p-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-t border-border">
                  <td className="p-2">{String(row.product_name ?? "—")}</td>
                  <td className="p-2">{String(row.vendor_sku ?? "—")}</td>
                  <td className="p-2">{String(row.category_text ?? "—")}</td>
                  <td className="p-2">{String(row.base_quote_price ?? "—")}</td>
                  <td className="p-2">{String(row.lead_time_days ?? "—")}</td>
                  <td className="p-2">{row.active === false ? "No" : "Yes"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortalPage>
  );
}
