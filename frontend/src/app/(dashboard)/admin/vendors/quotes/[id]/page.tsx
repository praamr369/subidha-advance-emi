"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import {
  acceptAdminVendorQuote,
  getAdminQuoteRequest,
  rejectAdminVendorQuote,
  type AcceptQuoteResponse,
  type QuoteRequest,
} from "@/services/vendor-ops";

export default function AdminVendorQuoteDetailPage() {
  const params = useParams<{ id: string }>();
  const rfqId = Number(params.id);

  const [detail, setDetail] = useState<QuoteRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getAdminQuoteRequest(rfqId);
      setDetail(payload);
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

  async function acceptQuote(quoteId: number) {
    setActionNote(null);
    try {
      const res: AcceptQuoteResponse = await acceptAdminVendorQuote(quoteId);
      await load();
      const hint = res.suggested_purchase_order_url ?? "";
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

  const quotes = detail?.quotes ?? [];

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title={detail?.request_no ?? String(rfqId)}
      subtitle="Compare QUOTED lines; acceptance records the decision without posting ERP documents."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Vendor quotes", href: ROUTES.admin.vendorsQuotes },
        { label: detail?.request_no ?? String(rfqId) },
      ]}
      actions={[{ href: ROUTES.admin.purchaseOrders, label: "Purchase orders workspace", variant: "primary" }]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      {error ? <ERPErrorState title="Unable to load quote request" description={error} /> : null}
      {actionNote ? (
        <div className="rounded-xl border border-emerald-600/35 bg-emerald-600/10 p-4 text-sm text-foreground">
          {actionNote}
        </div>
      ) : null}

      {loading ? <ERPLoadingState label="Loading quote request..." /> : null}

      {!loading && detail ? (
        <div className="space-y-4">
          <ERPSectionShell
            title="RFQ context"
            description="Acceptance records the decision only; procurement documents are posted through explicit purchase workflows."
            actions={<ERPStatusBadge status={detail.status} />}
          >
            <ERPDetailGrid
              columns={3}
              items={[
                { label: "RFQ status", value: detail.status },
                { label: "Product", value: detail.product_name || "—" },
                {
                  label: "Location",
                  value: `${detail.customer_city || "—"} / ${detail.customer_pincode || "—"}`,
                },
              ]}
            />
          </ERPSectionShell>

          <ERPSectionShell title="Quote lines" description="Only QUOTED rows can be accepted/rejected.">
            <div className="overflow-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-3">Vendor</th>
                    <th className="p-3">Quoted</th>
                    <th className="p-3">Delivery ₹</th>
                    <th className="p-3">Avail qty</th>
                    <th className="p-3">Lead (d)</th>
                    <th className="p-3">Warranty (mo)</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Notes</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {quotes.map((row) => {
                    const actionable = row.status === "QUOTED";
                    const closed = detail.status === "CLOSED";
                    return (
                      <tr key={row.id} className="border-t border-border align-top">
                        <td className="p-3">
                          <div className="font-medium">{row.vendor_name ?? `Vendor #${row.vendor}`}</div>
                          <div className="text-xs text-muted-foreground">#{row.vendor}</div>
                        </td>
                        <td className="p-3 tabular-nums">{row.quoted_price}</td>
                        <td className="p-3 tabular-nums">{row.delivery_charge}</td>
                        <td className="p-3 tabular-nums">{row.available_quantity}</td>
                        <td className="p-3 tabular-nums">{row.lead_time_days}</td>
                        <td className="p-3 tabular-nums">{row.warranty_months}</td>
                        <td className="p-3">
                          <ERPStatusBadge status={row.status} />
                        </td>
                        <td className="p-3 max-w-[240px] text-xs text-muted-foreground">
                          {row.quality_note || "—"}
                        </td>
                        <td className="p-3 space-y-2">
                          <button
                            type="button"
                            disabled={!actionable || closed}
                            className="block w-full rounded-xl border border-border px-3 py-2 text-xs font-semibold transition hover:bg-muted disabled:opacity-40"
                            onClick={() => void acceptQuote(row.id)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            disabled={!actionable || closed}
                            className="block w-full rounded-xl border border-border px-3 py-2 text-xs font-semibold transition hover:bg-muted disabled:opacity-40"
                            onClick={() => void rejectQuote(row.id)}
                          >
                            Reject
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {quotes.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No vendor rows assigned.</div>
              ) : null}
            </div>
            <div className="text-sm">
              <Link href={ROUTES.admin.vendorsQuotes} className="text-primary underline">
                Back to RFQ registry
              </Link>
            </div>
          </ERPSectionShell>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
