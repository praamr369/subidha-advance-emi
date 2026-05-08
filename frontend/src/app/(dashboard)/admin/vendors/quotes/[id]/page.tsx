"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { acceptAdminVendorQuote, getAdminQuoteRequest, rejectAdminVendorQuote } from "@/services/vendor-ops";

type QuoteRow = Record<string, unknown>;

export default function AdminVendorQuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const rfqId = Number(params.id);

  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getAdminQuoteRequest(rfqId);
      setDetail(payload as Record<string, unknown>);
      setError(null);
    } catch (err) {
      setError(accountingErrorMessage(err, "Could not load quote request."));
    } finally {
      setLoading(false);
    }
  }, [rfqId]);

  useEffect(() => {
    void load();
  }, [load]);

  const quotes = (detail?.quotes as QuoteRow[] | undefined) ?? [];

  async function acceptQuote(quoteId: number) {
    setActionNote(null);
    try {
      const res = (await acceptAdminVendorQuote(quoteId)) as Record<string, unknown>;
      await load();
      const hint = typeof res.suggested_purchase_order_url === "string" ? res.suggested_purchase_order_url : "";
      setActionNote(hint ? `Accepted. Procurement handoff suggestion: ${hint}` : "Quote accepted.");
    } catch (err) {
      setError(accountingErrorMessage(err, "Accept failed."));
    }
  }

  async function rejectQuote(quoteId: number) {
    setActionNote(null);
    try {
      await rejectAdminVendorQuote(quoteId);
      await load();
      setActionNote("Quote rejected.");
    } catch (err) {
      setError(accountingErrorMessage(err, "Reject failed."));
    }
  }

  return (
    <PortalPage
      title={String(detail?.request_no || rfqId)}
      subtitle="Compare QUOTED lines; acceptance records the decision without posting ERP documents."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Vendor quotes", href: ROUTES.admin.vendorsQuotes },
        { label: String(detail?.request_no || rfqId) },
      ]}
      actions={[{ href: ROUTES.admin.purchaseOrders, label: "Purchase orders workspace", variant: "primary" }]}
    >
      {error ? (
        <div className="mb-3 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      ) : null}
      {actionNote ? <div className="mb-3 rounded border border-green-700/40 bg-green-700/10 p-3 text-sm">{actionNote}</div> : null}

      {loading ? <div className="text-sm">Loading…</div> : null}

      {!loading && detail ? (
        <div className="space-y-4 text-sm">
          <div className="rounded border p-3">
            <div>Status: {String(detail.status)}</div>
            <div>Product: {String(detail.product_name || "—")}</div>
            <div>
              Location: {String(detail.customer_city || "—")} / {String(detail.customer_pincode || "—")}
            </div>
          </div>

          <div className="rounded border overflow-auto">
            <table className="w-full min-w-[720px] text-left">
              <thead className="bg-muted/70">
                <tr>
                  <th className="p-2">Vendor</th>
                  <th className="p-2">Quoted</th>
                  <th className="p-2">Delivery ₹</th>
                  <th className="p-2">Avail qty</th>
                  <th className="p-2">Lead (d)</th>
                  <th className="p-2">Warranty (mo)</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Notes</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((row) => {
                  const actionable = row.status === "QUOTED";
                  const qId = Number(row.id);
                  return (
                    <tr key={String(row.id)} className="border-t border-border align-top">
                      <td className="p-2">
                        <div className="font-medium">{String(row.vendor_name ?? "—")}</div>
                        <div className="text-xs text-muted-foreground">Vendor #{String(row.vendor)}</div>
                      </td>
                      <td className="p-2">{String(row.quoted_price ?? "—")}</td>
                      <td className="p-2">{String(row.delivery_charge ?? "—")}</td>
                      <td className="p-2">{String(row.available_quantity ?? "—")}</td>
                      <td className="p-2">{String(row.lead_time_days ?? "—")}</td>
                      <td className="p-2">{String(row.warranty_months ?? "—")}</td>
                      <td className="p-2">{String(row.status)}</td>
                      <td className="p-2 max-w-[200px] text-xs">{String(row.quality_note || "—")}</td>
                      <td className="p-2 space-y-1">
                        <button
                          type="button"
                          disabled={!actionable || detail.status === "CLOSED"}
                          className="block w-full rounded border px-2 py-1 disabled:opacity-40"
                          onClick={() => void acceptQuote(qId)}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={!actionable || detail.status === "CLOSED"}
                          className="block w-full rounded border px-2 py-1 disabled:opacity-40"
                          onClick={() => void rejectQuote(qId)}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {quotes.length === 0 ? <div className="p-3 text-muted-foreground text-sm">No vendor rows assigned.</div> : null}
          </div>

          <Link href={ROUTES.admin.vendorsQuotes} className="text-primary underline text-sm">
            Back to RFQ registry
          </Link>
        </div>
      ) : null}
    </PortalPage>
  );
}
