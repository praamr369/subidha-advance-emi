"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { createVendorProduct, listVendorProducts } from "@/services/vendor-ops";

export default function VendorProductsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [categoryText, setCategoryText] = useState("");
  const [price, setPrice] = useState("");
  const [leadDays, setLeadDays] = useState("");

  function reload() {
    setLoading(true);
    void listVendorProducts()
      .then((p) => {
        const parsed = p as { results?: Record<string, unknown>[] };
        setRows(parsed.results ?? []);
        setError(null);
      })
      .catch((err) => setError(accountingErrorMessage(err, "Could not load products.")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await createVendorProduct({
        product_name: name.trim(),
        vendor_sku: sku.trim(),
        category_text: categoryText.trim(),
        base_quote_price: price.trim() || "0.00",
        lead_time_days: leadDays.trim() ? Number(leadDays.trim()) : 0,
        min_order_qty: "1.000",
        active: true,
      });
      setName("");
      setSku("");
      setCategoryText("");
      setPrice("");
      setLeadDays("");
      reload();
    } catch (err) {
      setError(accountingErrorMessage(err, "Unable to publish catalog line."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ERPPageShell
      title="Products"
      subtitle="Publish reusable catalog lines quoted on RFQs."
      breadcrumbs={[{ label: "Vendor", href: ROUTES.vendor.dashboard }, { label: "Products" }]}
    >
      {error ? <ERPErrorState title="Unable to load vendor products" description={error} /> : null}

      <ERPSectionShell
        title="Add catalog line"
        description="Publish reusable vendor-specific catalog lines used for quoting. This does not change any contract pricing rules."
      >
        <ERPDataToolbar
          left={
            <form className="flex flex-wrap gap-2" onSubmit={(e) => void onSubmit(e)}>
              <input
                className="h-10 min-w-[160px] rounded-xl border border-border bg-background px-3 text-sm"
                placeholder="Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="h-10 w-28 rounded-xl border border-border bg-background px-3 text-sm"
                placeholder="SKU"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
              />
              <input
                className="h-10 w-40 rounded-xl border border-border bg-background px-3 text-sm"
                placeholder="Category"
                value={categoryText}
                onChange={(e) => setCategoryText(e.target.value)}
              />
              <input
                className="h-10 w-28 rounded-xl border border-border bg-background px-3 text-sm"
                placeholder="Base price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <input
                className="h-10 w-28 rounded-xl border border-border bg-background px-3 text-sm"
                placeholder="Lead days"
                value={leadDays}
                onChange={(e) => setLeadDays(e.target.value)}
              />
              <button
                className="h-10 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
                type="submit"
                disabled={submitting}
              >
                Save
              </button>
            </form>
          }
          right={
            <Link href={ROUTES.vendor.quotes} className="text-sm font-medium text-primary underline">
              Review quote requests
            </Link>
          }
        />
      </ERPSectionShell>

      <ERPSectionShell title="Catalog register" description="Your published vendor catalog lines.">
        {loading ? <ERPLoadingState label="Loading catalog..." /> : null}

        {!loading && rows.length === 0 ? (
          <ERPEmptyState title="Empty catalog" description="No vendor product lines have been published yet." />
        ) : null}

        {rows.length > 0 ? (
          <div className="space-y-2 text-sm">
            {rows.map((row) => (
              <div key={String(row.id)} className="rounded-2xl border border-border/70 bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_var(--hairline-shine)]">
                <div className="font-medium">{String(row.product_name)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  SKU {String(row.vendor_sku || "—")} · {String(row.base_quote_price || "—")} · lead{" "}
                  {String(row.lead_time_days ?? "—")}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
