"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
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
    <PortalPage
      title="Products"
      subtitle="Publish reusable catalog lines quoted on RFQs."
      breadcrumbs={[{ label: "Vendor", href: ROUTES.vendor.dashboard }, { label: "Products" }]}
    >
      {error ? <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      <section className="mb-6 rounded border p-3 text-sm space-y-2">
        <div className="font-medium">Add product</div>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => void onSubmit(e)}>
          <input className="h-10 min-w-[140px] rounded border px-2" placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="h-10 w-24 rounded border px-2" placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
          <input className="h-10 w-32 rounded border px-2" placeholder="Category" value={categoryText} onChange={(e) => setCategoryText(e.target.value)} />
          <input className="h-10 w-24 rounded border px-2" placeholder="Base price" value={price} onChange={(e) => setPrice(e.target.value)} />
          <input className="h-10 w-24 rounded border px-2" placeholder="Lead days" value={leadDays} onChange={(e) => setLeadDays(e.target.value)} />
          <button className="h-10 rounded border px-4 disabled:opacity-50" type="submit" disabled={submitting}>
            Save
          </button>
        </form>
      </section>

      {loading ? <div className="text-sm text-muted-foreground">Loading catalog…</div> : null}
      {!loading && rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Empty catalog.&nbsp;
          <Link href={ROUTES.vendor.quotes} className="underline text-primary">
            Review quote requests instead
          </Link>
          .
        </div>
      ) : null}

      <div className="space-y-2 text-sm">
        {rows.map((row) => (
          <div key={String(row.id)} className="rounded border p-3">
            <div className="font-medium">{String(row.product_name)}</div>
            <div className="text-xs text-muted-foreground">
              SKU {String(row.vendor_sku || "—")} · {String(row.base_quote_price || "—")} · lead {String(row.lead_time_days ?? "—")}
            </div>
          </div>
        ))}
      </div>
    </PortalPage>
  );
}
