"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
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
  const selectedVendorId = vendorId === "" || Number.isNaN(Number(vendorId)) ? null : Number(vendorId);
  const visibleRows = selectedVendorId == null ? [] : rows;

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
    if (selectedVendorId == null) {
      return;
    }
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setLoadingProducts(true);
    });
    void listAdminVendorProducts(selectedVendorId)
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
  }, [selectedVendorId]);

  return (
    <ERPPageShell
      title="Vendor catalog hub"
      subtitle="Pick a supplier to review their SKU lines. Maintain lines from each vendor detail page."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor products", href: ROUTES.admin.vendorsProducts }]}
      actions={[{ href: ROUTES.admin.vendors, label: "Vendor register", variant: "secondary" }]}
    >
      {error ? <ERPErrorState title="Unable to load vendor catalog" description={error} /> : null}

      <ERPDataToolbar
        left={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="vendor-select" className="text-muted-foreground">
              Vendor:
            </label>
            <select
              id="vendor-select"
              className="h-10 min-w-[220px] rounded-xl border border-border bg-background px-3 text-sm"
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
          </div>
        }
        right={
          vendorId !== "" ? (
            <Link className="text-sm font-medium text-primary underline" href={`${ROUTES.admin.vendors}/${vendorId}`}>
              Open vendor workspace
            </Link>
          ) : null
        }
      />

      <ERPSectionShell
        title="Catalog lines"
        description="Vendor-specific quoted SKU lines used for purchasing and RFQ workflows. Pricing and contract logic remains unchanged."
      >
        {loadingList ? <ERPLoadingState label="Loading vendor list..." /> : null}

        {!loadingList && selectedVendorId == null ? (
          <ERPEmptyState
            title="Select a vendor"
            description="Pick a vendor to display their catalog rows."
          />
        ) : null}

        {selectedVendorId != null && loadingProducts ? <ERPLoadingState label="Loading products..." /> : null}

        {selectedVendorId != null && !loadingProducts && visibleRows.length === 0 ? (
          <ERPEmptyState
            title="No catalog lines"
            description="No catalog lines recorded for this vendor."
          />
        ) : null}

        {selectedVendorId != null && !loadingProducts && visibleRows.length > 0 ? (
          <div className="overflow-auto rounded-2xl border border-border bg-card text-sm">
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
                {visibleRows.map((row) => (
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
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
