"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
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
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor quote requests"
      subtitle="Request quotes without posting procurement, payable, or billing documents."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor quotes", href: ROUTES.admin.vendorsQuotes }]}
      actions={[
        { href: ROUTES.admin.vendorsSourcing, label: "Sourcing hints", variant: "secondary" },
        { href: ROUTES.admin.purchaseOrders, label: "Purchase orders", variant: "primary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {submitBanner ? (
        <div className="rounded-xl border border-emerald-600/35 bg-emerald-600/10 p-4 text-sm text-foreground">
          {submitBanner}
        </div>
      ) : null}
      {listError ? <ERPErrorState title="Unable to load quote requests" description={listError} /> : null}
      {submitError ? <ERPErrorState title="Unable to save quote request" description={submitError} /> : null}

      <ERPSectionShell
        title="Create request"
        description="Draft an RFQ and invite vendors without posting purchase/stock/accounting documents."
      >
        <form className="space-y-3 text-sm" onSubmit={(e) => void submitRequest(e)}>
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
      </ERPSectionShell>

      <ERPSectionShell
        title="Open RFQs"
        description="Monitor open quote requests. Accept/reject decisions are recorded explicitly and do not auto-post procurement documents."
      >
        <ERPDataToolbar
          left={<div className="text-sm text-muted-foreground">Showing {rows.length} RFQs</div>}
          right={
            <Link className="text-sm font-medium text-primary underline" href={ROUTES.admin.vendorsSourcing}>
              Open sourcing workspace
            </Link>
          }
        />
        {listLoading ? <ERPLoadingState label="Loading RFQs..." /> : null}
        {!listLoading && rows.length === 0 ? (
          <ERPEmptyState title="No quote requests yet" description="Create a quote request to start inviting vendors." />
        ) : null}
        {!listLoading && rows.length > 0 ? (
          <div className="space-y-2 text-sm">
            {rows.map((row) => (
              <div
                key={String(row.id)}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div>
                  <Link className="font-semibold text-primary underline" href={`${ROUTES.admin.vendorsQuotes}/${row.id}`}>
                    {String(row.request_no || row.id)}
                  </Link>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(row.quotes as unknown[] | undefined)?.length ?? 0} invites · Product {String(row.product_name || "—")}
                  </div>
                </div>
                <ERPStatusBadge status={String(row.status ?? "—")} />
              </div>
            ))}
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
