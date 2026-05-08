"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { getVendorQuoteRequest, submitVendorQuote } from "@/services/vendor-ops";

export default function VendorQuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const pk = Number(params.id);

  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [price, setPrice] = useState("");
  const [availQty, setAvailQty] = useState("");
  const [lead, setLead] = useState("");
  const [warranty, setWarranty] = useState("");
  const [deliveryYes, setDeliveryYes] = useState(false);
  const [deliveryCharge, setDeliveryCharge] = useState("");
  const [note, setNote] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getVendorQuoteRequest(pk);
      setDetail(payload as Record<string, unknown>);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "You may not access this RFQ."));
    } finally {
      setLoading(false);
    }
  }, [pk]);

  useEffect(() => {
    void load();
  }, [load]);

  const myQuoteRow = (((detail?.quotes as Record<string, unknown>[] | undefined) ?? [])[0] ?? {}) as Record<string, unknown>;
  const editable = detail && detail.status !== "CLOSED" && detail.status !== "CANCELLED" && detail.status !== "DRAFT";

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editable) return;
    setBusy(true);
    setNotice(null);
    try {
      await submitVendorQuote(pk, {
        quoted_price: price.trim() || "0.00",
        available_quantity: availQty.trim() || "0",
        lead_time_days: lead.trim() ? Number(lead.trim()) : 0,
        warranty_months: warranty.trim() ? Number(warranty.trim()) : 0,
        delivery_available: deliveryYes,
        delivery_charge: deliveryCharge.trim() || "0",
        quality_note: note.trim(),
        valid_until: validUntil.trim() || null,
      });
      await load();
      setNotice("Quote submitted.");
    } catch (err) {
      setError(accountingErrorMessage(err, "Unable to publish quote."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalPage
      title={String(detail?.request_no || pk)}
      subtitle="Submit commercial terms — this remains outside accounting until procurement approves downstream documents."
      breadcrumbs={[
        { label: "Vendor", href: ROUTES.vendor.dashboard },
        { label: "Quotes", href: ROUTES.vendor.quotes },
        { label: String(detail?.request_no || pk) },
      ]}
    >
      {error ? (
        <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}
      {notice ? <div className="mb-3 rounded border border-green-700/40 bg-green-700/10 p-3 text-sm">{notice}</div> : null}

      {loading ? <div className="text-sm">Loading RFQ…</div> : null}

      {!loading && detail ? (
        <div className="grid gap-4 text-sm md:grid-cols-2">
          <div className="rounded border p-3 space-y-1">
            <div className="font-medium">Buyer context</div>
            <div>Status RFQ: {String(detail.status)}</div>
            <div>Product: {String(detail.product_name || "—")}</div>
            <div>
              Geography: {String(detail.customer_city || "—")} / PIN {String(detail.customer_pincode || "—")}
            </div>
            <div>Qty requested: {String(detail.quantity)}</div>
          </div>

          <div className="rounded border p-3 space-y-2">
            <div className="font-medium">Your quote row ({String(myQuoteRow.status || "UNKNOWN")})</div>
            <div className="text-muted-foreground text-xs">Only one row belongs to your vendor portal account.</div>
            <form className="space-y-2" onSubmit={(e) => void submit(e)}>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs uppercase text-muted-foreground">
                  Quote price ₹
                  <input className="mt-1 h-9 w-full rounded border px-2 normal-case" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!editable} />
                </label>
                <label className="text-xs uppercase text-muted-foreground">
                  Available qty
                  <input className="mt-1 h-9 w-full rounded border px-2 normal-case" value={availQty} onChange={(e) => setAvailQty(e.target.value)} disabled={!editable} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs uppercase text-muted-foreground">
                  Lead days
                  <input className="mt-1 h-9 w-full rounded border px-2 normal-case" value={lead} onChange={(e) => setLead(e.target.value)} disabled={!editable} />
                </label>
                <label className="text-xs uppercase text-muted-foreground">
                  Warranty mo
                  <input className="mt-1 h-9 w-full rounded border px-2 normal-case" value={warranty} onChange={(e) => setWarranty(e.target.value)} disabled={!editable} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={deliveryYes} onChange={(e) => setDeliveryYes(e.target.checked)} disabled={!editable} /> Delivery offered
              </label>
              <label className="text-xs uppercase text-muted-foreground">
                Delivery charge ₹
                <input className="mt-1 h-9 w-full rounded border px-2 normal-case" value={deliveryCharge} onChange={(e) => setDeliveryCharge(e.target.value)} disabled={!editable} />
              </label>
              <label className="text-xs uppercase text-muted-foreground">
                Notes
                <textarea className="mt-1 w-full rounded border px-2 py-1 normal-case" rows={3} value={note} onChange={(e) => setNote(e.target.value)} disabled={!editable} />
              </label>
              <label className="text-xs uppercase text-muted-foreground">
                Valid until
                <input type="date" className="mt-1 h-9 w-full rounded border px-2 normal-case" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={!editable} />
              </label>
              <button className="h-10 w-full rounded border bg-primary px-4 text-primary-foreground disabled:opacity-40" type="submit" disabled={busy || !editable}>
                {busy ? "Saving…" : "Submit / update quote"}
              </button>
              {!editable ? <div className="text-destructive text-xs">Portal editing is blocked for drafts you did not receive or RFQs already closed.</div> : null}
            </form>
          </div>
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-6">
          <Link href={ROUTES.vendor.quotes} className="text-primary underline text-sm">
            Back to invitations
          </Link>
        </div>
      ) : null}
    </PortalPage>
  );
}
