"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { createAdminQuoteRequest, listAdminQuoteRequests } from "@/services/vendor-ops";
import { listVendors } from "@/services/vendors";

type VendorLite = { id: number; display_name?: string; name?: string };

const SOURCE_OPTIONS = ["MANUAL", "CUSTOMER_ENQUIRY", "DIRECT_SALE_ORDER", "ONLINE_ORDER"] as const;

export default function AdminVendorQuotesPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [vendors, setVendors] = useState<VendorLite[]>([]);
  const [selectedVendorIds, setSelectedVendorIds] = useState<Record<number, boolean>>({});

  const [sourceType, setSourceType] = useState<string>("MANUAL");
  const [productName, setProductName] = useState("");
  const [categoryText, setCategoryText] = useState("");
  const [quantity, setQuantity] = useState("1.000");
  const [customerId, setCustomerId] = useState("");
  const [pincode, setPincode] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [sendToVendors, setSendToVendors] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitBanner, setSubmitBanner] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("prefill_vendor");
    if (!raw?.trim()) return;
    const id = Number(raw);
    if (!Number.isFinite(id) || id < 1) return;
    setSelectedVendorIds((prev) => ({ ...prev, [id]: true }));
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      listAdminQuoteRequests(),
      listVendors(),
    ])
      .then(([qPayload, vPayload]) => {
        if (!active) return;
        const q = qPayload as { results?: Record<string, unknown>[] };
        setRows(q.results ?? []);

        const vListRaw = vPayload as { results?: VendorLite[] } | VendorLite[];
        setVendors(Array.isArray(vListRaw) ? vListRaw : vListRaw.results ?? []);

        setListError(null);
      })
      .catch((err) => {
        if (!active) return;
        setListError(accountingErrorMessage(err, "Could not load quote requests."));
      })
      .finally(() => {
        if (active) setListLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function submitRequest(ev: React.FormEvent) {
    ev.preventDefault();
    const vendor_ids = vendors.filter((v) => selectedVendorIds[v.id]).map((v) => v.id);
    if (vendor_ids.length === 0) {
      setSubmitError("Pick at least one vendor.");
      return;
    }

    const payload: Record<string, unknown> = {
      source_type: sourceType,
      product_name: productName.trim(),
      category_text: categoryText.trim(),
      quantity,
      vendor_ids,
      send_to_vendors: sendToVendors,
      customer_pincode: pincode.trim(),
      customer_city: city.trim(),
      customer_district: district.trim(),
      customer_state: state.trim(),
    };
    const cid = customerId.trim();
    if (cid) payload.customer = Number(cid);

    setSubmitting(true);
    setSubmitError(null);
    setSubmitBanner(null);
    try {
      await createAdminQuoteRequest(payload);
      setSubmitBanner("Quote request recorded.");
      const refreshed = (await listAdminQuoteRequests()) as { results?: Record<string, unknown>[] };
      setRows(refreshed.results ?? []);
      setSelectedVendorIds({});
    } catch (err) {
      setSubmitError(accountingErrorMessage(err, "Failed to save quote request."));
    } finally {
      setSubmitting(false);
    }
  }

  function toggleVendor(id: number) {
    setSelectedVendorIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <PortalPage
      title="Vendor quote requests"
      subtitle="Request quotes without posting procurement, payable, or billing documents."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor quotes", href: ROUTES.admin.vendorsQuotes }]}
      actions={[
        { href: ROUTES.admin.vendorsSourcing, label: "Sourcing hints", variant: "secondary" },
        { href: ROUTES.admin.purchaseOrders, label: "Purchase orders", variant: "primary" },
      ]}
    >
      {submitBanner ? <div className="mb-3 rounded border border-green-600/40 bg-green-600/10 p-3 text-sm">{submitBanner}</div> : null}
      {listError ? <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{listError}</div> : null}
      {submitError ? (
        <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{submitError}</div>
      ) : null}

      <section className="mb-8 rounded border p-4 text-sm">
        <h2 className="mb-2 text-base font-medium">Create request</h2>
        <form className="space-y-3" onSubmit={(e) => void submitRequest(e)}>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col text-xs uppercase text-muted-foreground">
              Source
              <select className="h-10 min-w-[140px] rounded border bg-background px-2 normal-case" value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-xs uppercase text-muted-foreground">
              Customer ID (optional)
              <input className="h-10 w-32 rounded border px-2 normal-case" value={customerId} onChange={(e) => setCustomerId(e.target.value)} />
            </label>
            <label className="flex flex-col text-xs uppercase text-muted-foreground">
              Product name
              <input className="h-10 min-w-[160px] rounded border px-2 normal-case" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="SKU label" />
            </label>
            <label className="flex flex-col text-xs uppercase text-muted-foreground">
              Category text
              <input className="h-10 w-36 rounded border px-2 normal-case" value={categoryText} onChange={(e) => setCategoryText(e.target.value)} />
            </label>
            <label className="flex flex-col text-xs uppercase text-muted-foreground">
              Quantity
              <input className="h-10 w-28 rounded border px-2 normal-case" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
          </div>

          <div className="grid gap-2 md:grid-cols-4">
            <input className="h-10 rounded border px-2" placeholder="Pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} />
            <input className="h-10 rounded border px-2" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <input className="h-10 rounded border px-2" placeholder="District" value={district} onChange={(e) => setDistrict(e.target.value)} />
            <input className="h-10 rounded border px-2" placeholder="State" value={state} onChange={(e) => setState(e.target.value)} />
          </div>

          <div>
            <div className="mb-2 text-xs uppercase text-muted-foreground">Invite vendors</div>
            <div className="max-h-52 space-y-1 overflow-auto rounded border p-2">
              {vendors.length === 0 ? <span className="text-muted-foreground">No vendors in register.</span> : null}
              {vendors.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={!!selectedVendorIds[v.id]} onChange={() => toggleVendor(v.id)} />
                  <span>{v.display_name || v.name || `#${v.id}`}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={sendToVendors} onChange={(e) => setSendToVendors(e.target.checked)} />
            Send to vendors immediately (otherwise stays draft)
          </label>

          <button className="h-10 rounded border bg-primary px-4 text-primary-foreground disabled:opacity-50" disabled={submitting || vendors.length === 0} type="submit">
            {submitting ? "Saving…" : "Create request"}
          </button>
        </form>
      </section>

      <section className="rounded border p-4 text-sm">
        <h2 className="mb-2 text-base font-medium">Open RFQs</h2>
        {listLoading ? <div>Loading…</div> : null}
        {!listLoading && rows.length === 0 ? (
          <div className="text-muted-foreground">No quote requests yet.</div>
        ) : (
          <div className="space-y-1">
            {rows.map((row) => (
              <div key={String(row.id)} className="flex flex-wrap justify-between gap-2 border-b border-border py-2 last:border-0">
                <div>
                  <Link className="font-medium text-primary underline" href={`${ROUTES.admin.vendorsQuotes}/${row.id}`}>
                    {String(row.request_no || row.id)}
                  </Link>
                  <div className="text-muted-foreground text-xs">
                    Status {String(row.status)} · {(row.quotes as unknown[] | undefined)?.length ?? 0} invites
                  </div>
                </div>
                <div className="text-xs">{String(row.product_name || "—")}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </PortalPage>
  );
}
