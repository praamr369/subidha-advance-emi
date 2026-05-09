"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import {
  createDraftPurchaseOrderForOnlineEnquiry,
  getOnlineEnquiry,
  requestQuotesForOnlineEnquiry,
  selectVendorQuoteForOnlineEnquiry,
  suggestVendorsForOnlineEnquiry,
} from "@/services/online-enquiries";

function sourcingHref(enquiry: Record<string, unknown>): string {
  const p = new URLSearchParams();
  const pincode = String(enquiry.pincode ?? "").trim();
  const city = String(enquiry.city ?? "").trim();
  const district = String(enquiry.district ?? "").trim();
  const state = String(enquiry.state ?? "").trim();
  const productName = String(enquiry.product_name ?? "").trim();
  const categoryText = String(enquiry.category_text ?? "").trim();
  const material = String(enquiry.material ?? "").trim();
  const qty = String(enquiry.quantity ?? "").trim();
  const budget = String(enquiry.budget_amount ?? "").trim();
  const pid = enquiry.product != null ? String(enquiry.product) : "";
  if (pincode) p.set("prefill_pincode", pincode);
  if (city) p.set("prefill_city", city);
  if (district) p.set("prefill_district", district);
  if (state) p.set("prefill_state", state);
  if (pid) p.set("prefill_product_id", pid);
  if (productName) p.set("prefill_product_name", productName);
  if (categoryText) p.set("prefill_category_text", categoryText);
  if (material) p.set("prefill_material", material);
  if (qty) p.set("prefill_quantity", qty);
  if (budget) p.set("prefill_budget_amount", budget);
  const qs = p.toString();
  return qs ? `${ROUTES.admin.vendorsSourcing}?${qs}` : ROUTES.admin.vendorsSourcing;
}

export default function AdminOnlineEnquiryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params?.id);
  const [row, setRow] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<unknown[]>([]);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [vendorCsv, setVendorCsv] = useState("");
  const [rqBusy, setRqBusy] = useState(false);
  const [quotePickId, setQuotePickId] = useState("");
  const [sqBusy, setSqBusy] = useState(false);

  const [invItemId, setInvItemId] = useState("");
  const [poQty, setPoQty] = useState("1.000");
  const [unitCost, setUnitCost] = useState("");
  const [poConfirm, setPoConfirm] = useState(false);
  const [poBusy, setPoBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!Number.isFinite(id) || id < 1) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await getOnlineEnquiry(id);
      setRow(payload as Record<string, unknown>);
    } catch (err) {
      setError(accountingErrorMessage(err, "Could not load enquiry."));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sourcingLink = useMemo(() => (row ? sourcingHref(row) : ROUTES.admin.vendorsSourcing), [row]);

  const quoteRequests = (row?.quote_requests as unknown[] | undefined) ?? [];

  async function runSuggest() {
    setBanner(null);
    setSuggestBusy(true);
    try {
      const res = (await suggestVendorsForOnlineEnquiry(id)) as { results?: unknown[] };
      setSuggestions(Array.isArray(res.results) ? res.results : []);
      await refresh();
    } catch (err) {
      setError(accountingErrorMessage(err, "Suggestion failed."));
    } finally {
      setSuggestBusy(false);
    }
  }

  async function runRequestQuotes() {
    const vendor_ids = vendorCsv
      .split(/[,;\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (vendor_ids.length === 0) {
      setError("Enter at least one numeric vendor id separated by commas.");
      return;
    }
    setBanner(null);
    setRqBusy(true);
    try {
      await requestQuotesForOnlineEnquiry(id, { vendor_ids, send_to_vendors: true });
      setBanner("Vendor quote request issued.");
      setVendorCsv("");
      await refresh();
    } catch (err) {
      setError(accountingErrorMessage(err, "Could not request vendor quotes."));
    } finally {
      setRqBusy(false);
    }
  }

  async function runSelectQuote() {
    const qid = Number(quotePickId);
    if (!Number.isFinite(qid) || qid < 1) {
      setError("Enter a valid vendor quote id (QUOTED row).");
      return;
    }
    setBanner(null);
    setSqBusy(true);
    try {
      await selectVendorQuoteForOnlineEnquiry(id, { vendor_quote_id: qid });
      setBanner("Vendor quote accepted for this enquiry.");
      setQuotePickId("");
      await refresh();
    } catch (err) {
      setError(accountingErrorMessage(err, "Unable to select vendor quote."));
    } finally {
      setSqBusy(false);
    }
  }

  async function runDraftPo() {
    const itemId = Number(invItemId);
    const cost = unitCost.trim();
    if (!poConfirm) {
      setError("Check confirm to create an inventory draft PO.");
      return;
    }
    if (!Number.isFinite(itemId) || itemId < 1 || !cost) {
      setError("Inventory item id and unit cost are required.");
      return;
    }
    setBanner(null);
    setPoBusy(true);
    try {
      await createDraftPurchaseOrderForOnlineEnquiry(id, {
        confirm: true,
        inventory_item_id: itemId,
        quantity: poQty.trim() || "1.000",
        unit_cost: cost,
      });
      setBanner("Draft purchase order recorded — still requires normal procurement posting separately.");
      await refresh();
    } catch (err) {
      setError(accountingErrorMessage(err, "Draft PO creation failed."));
    } finally {
      setPoBusy(false);
    }
  }

  if (!Number.isFinite(id) || id < 1) {
    return (
      <PortalPage title="Invalid enquiry" breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }]}>
        <div className="text-sm text-destructive">Missing enquiry id.</div>
      </PortalPage>
    );
  }

  return (
    <PortalPage
      title={String(row?.enquiry_no ?? `Enquiry #${id}`)}
      subtitle="Connect enquiry geography + SKU cues to supplier RFQs — procurement stays admin-controlled."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Online enquiries", href: ROUTES.admin.onlineEnquiries },
        { label: String(row?.enquiry_no ?? id), href: `${ROUTES.admin.onlineEnquiries}/${id}` },
      ]}
      actions={[
        { href: ROUTES.admin.vendorsQuotes, label: "Quote registry", variant: "secondary" },
        { href: ROUTES.admin.purchaseOrders, label: "Purchase orders", variant: "secondary" },
      ]}
    >
      {banner ? <div className="mb-3 rounded border border-emerald-600/40 bg-emerald-600/10 p-3 text-sm">{banner}</div> : null}
      {error ? <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}

      {!loading && row ? (
        <div className="space-y-6 text-sm">
          <section className="rounded border p-4">
            <h2 className="mb-2 text-base font-medium">Customer & fulfilment cues</h2>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <span className="text-xs uppercase text-muted-foreground">Customer</span>
                <div>{String(row.customer_name ?? "—")}</div>
                <div className="text-xs text-muted-foreground">{String(row.phone ?? "")}</div>
              </div>
              <div>
                <span className="text-xs uppercase text-muted-foreground">Status</span>
                <div>{String(row.status ?? "—")}</div>
              </div>
              <div className="md:col-span-2">
                <span className="text-xs uppercase text-muted-foreground">Delivery geography</span>
                <div className="text-xs">
                  {[row.pincode, row.city, row.district, row.state].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="md:col-span-2">
                <span className="text-xs uppercase text-muted-foreground">Product cues</span>
                <div>{String(row.product_name ?? "—")}</div>
                <div className="text-xs text-muted-foreground">
                  Category {String(row.category_text ?? "—")} · Material {String(row.material ?? "—")} · Qty {String(row.quantity ?? "—")}
                </div>
              </div>
              <div className="md:col-span-2">
                <span className="text-xs uppercase text-muted-foreground">Delivery address (internal)</span>
                <div className="text-xs whitespace-pre-wrap">{String(row.delivery_address ?? "") || "—"}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link className="h-9 rounded border px-3 text-xs leading-9 underline" href={sourcingLink}>
                Open sourcing (prefilled)
              </Link>
            </div>
          </section>

          <section className="rounded border p-4">
            <h2 className="mb-2 text-base font-medium">Inline supplier ranking</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Runs the same Phase 4 scoring engine against this enquiry’s geography + SKU filters (updates status to SOURCING when new).
            </p>
            <button
              type="button"
              className="h-10 rounded border bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
              disabled={suggestBusy}
              onClick={() => void runSuggest()}
            >
              {suggestBusy ? "Ranking…" : "Suggest vendors"}
            </button>
            {suggestions.length ? (
              <div className="mt-3 max-h-52 overflow-auto rounded border bg-muted/20 p-2 text-xs">
                {(suggestions as Array<{ vendor_name?: string; overall_score?: string }>).map((s, idx) => (
                  <div key={idx} className="border-b border-border py-1 last:border-0">
                    {String(s.vendor_name ?? "")} · score {String(s.overall_score ?? "—")}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs text-muted-foreground">No cached ranking yet — run suggest vendors.</div>
            )}
          </section>

          <section className="rounded border p-4">
            <h2 className="mb-2 text-base font-medium">Request vendor quotes</h2>
            <div className="flex flex-wrap gap-2">
              <input
                className="h-10 min-w-[240px] flex-1 rounded border px-2"
                placeholder="Vendor IDs comma-separated"
                value={vendorCsv}
                onChange={(e) => setVendorCsv(e.target.value)}
              />
              <button
                type="button"
                className="h-10 rounded border px-4 disabled:opacity-50"
                disabled={rqBusy}
                onClick={() => void runRequestQuotes()}
              >
                {rqBusy ? "Saving…" : "Request quotes"}
              </button>
            </div>
          </section>

          <section className="rounded border p-4">
            <h2 className="mb-2 text-base font-medium">Quote requests & vendor responses</h2>
            {quoteRequests.length === 0 ? (
              <div className="text-xs text-muted-foreground">No RFQs linked yet.</div>
            ) : (
              <div className="space-y-3">
                {(quoteRequests as Array<{ id?: number; request_no?: string; status?: string; quotes?: unknown[] }>).map((qr) => (
                  <div key={String(qr.id)} className="rounded border border-border p-3">
                    <div className="font-medium">
                      {String(qr.request_no ?? qr.id)} · {String(qr.status ?? "")}
                    </div>
                    <ul className="mt-2 grid gap-1 text-xs md:grid-cols-2">
                      {((qr.quotes ?? []) as Array<{ id?: number; vendor?: number; status?: string; quoted_price?: string }>).map((q) => (
                        <li key={String(q.id)} className="rounded bg-muted/30 px-2 py-1">
                          Quote #{q.id} · vendor {q.vendor} · {q.status} · {q.quoted_price ?? "—"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded border p-4">
            <h2 className="mb-2 text-base font-medium">Select vendor quote</h2>
            <p className="mb-2 text-xs text-muted-foreground">Requires a QUOTED vendor row belonging to this enquiry’s RFQ.</p>
            <div className="flex flex-wrap gap-2">
              <input
                className="h-10 w-40 rounded border px-2"
                placeholder="Vendor quote ID"
                value={quotePickId}
                onChange={(e) => setQuotePickId(e.target.value)}
              />
              <button type="button" className="h-10 rounded border px-4 disabled:opacity-50" disabled={sqBusy} onClick={() => void runSelectQuote()}>
                {sqBusy ? "Saving…" : "Accept quote"}
              </button>
            </div>
          </section>

          <section className="rounded border p-4">
            <h2 className="mb-2 text-base font-medium">Draft purchase order (explicit confirm)</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Creates inventory PurchaseOrder in DRAFT only — no GRN, payable voucher, or payment automation.
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              <input className="h-10 rounded border px-2" placeholder="Inventory item ID" value={invItemId} onChange={(e) => setInvItemId(e.target.value)} />
              <input className="h-10 rounded border px-2" placeholder="Quantity" value={poQty} onChange={(e) => setPoQty(e.target.value)} />
              <input className="h-10 rounded border px-2" placeholder="Unit cost" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={poConfirm} onChange={(e) => setPoConfirm(e.target.checked)} />I confirm creation of a draft PO only
            </label>
            <button type="button" className="mt-3 h-10 rounded border px-4 disabled:opacity-50" disabled={poBusy} onClick={() => void runDraftPo()}>
              {poBusy ? "Creating…" : "Create draft PO"}
            </button>
          </section>
        </div>
      ) : null}
    </PortalPage>
  );
}
