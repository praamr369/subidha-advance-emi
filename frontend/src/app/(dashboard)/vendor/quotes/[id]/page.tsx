"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPAuditNote from "@/components/erp/ERPAuditNote";
import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
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
    <ERPPageShell
      title={String(detail?.request_no || pk)}
      subtitle="Submit commercial terms — this remains outside accounting until procurement approves downstream documents."
      breadcrumbs={[
        { label: "Vendor", href: ROUTES.vendor.dashboard },
        { label: "Quotes", href: ROUTES.vendor.quotes },
        { label: String(detail?.request_no || pk) },
      ]}
    >
      {error ? <ERPErrorState title="Unable to load RFQ" description={error} /> : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-600/35 bg-emerald-600/10 p-4 text-sm text-foreground">
          {notice}
        </div>
      ) : null}

      {loading ? <ERPLoadingState label="Loading RFQ..." /> : null}

      {!loading && detail ? (
        <div className="grid gap-4 md:grid-cols-2">
          <ERPSectionShell
            title="Buyer context"
            description="RFQ details provided by procurement. Quoting does not post purchase/ledger documents."
            actions={<ERPStatusBadge status={String(detail.status ?? "—")} />}
          >
            <ERPDetailGrid
              columns={2}
              items={[
                { label: "RFQ status", value: String(detail.status ?? "—") },
                { label: "Product", value: String(detail.product_name || "—") },
                {
                  label: "Geography",
                  value: `${String(detail.customer_city || "—")} / PIN ${String(detail.customer_pincode || "—")}`,
                },
                { label: "Qty requested", value: String(detail.quantity ?? "—") },
              ]}
            />
          </ERPSectionShell>

          <ERPSectionShell
            title="Your quote"
            description="Only one row belongs to your vendor portal account."
            actions={<ERPStatusBadge status={String(myQuoteRow.status || "UNKNOWN")} />}
          >
            <ERPAuditNote tone={editable ? "info" : "warning"}>
              {editable
                ? "Procurement will review and approve downstream documents explicitly. This submission does not post any purchase, stock, or accounting entries."
                : "Portal editing is blocked for drafts you did not receive or RFQs already closed."}
            </ERPAuditNote>
            <form className="space-y-3 text-sm" onSubmit={(e) => void submit(e)}>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Quote price ₹
                  <input
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 normal-case"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    disabled={!editable}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Available qty
                  <input
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 normal-case"
                    value={availQty}
                    onChange={(e) => setAvailQty(e.target.value)}
                    disabled={!editable}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Lead days
                  <input
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 normal-case"
                    value={lead}
                    onChange={(e) => setLead(e.target.value)}
                    disabled={!editable}
                  />
                </label>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Warranty mo
                  <input
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 normal-case"
                    value={warranty}
                    onChange={(e) => setWarranty(e.target.value)}
                    disabled={!editable}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <input type="checkbox" checked={deliveryYes} onChange={(e) => setDeliveryYes(e.target.checked)} disabled={!editable} /> Delivery offered
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Delivery charge ₹
                <input
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 normal-case"
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                  disabled={!editable}
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
                <textarea
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 normal-case"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={!editable}
                />
              </label>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Valid until
                <input
                  type="date"
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 normal-case"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  disabled={!editable}
                />
              </label>
              <button
                className="h-10 w-full rounded-xl border bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40"
                type="submit"
                disabled={busy || !editable}
              >
                {busy ? "Saving…" : "Submit / update quote"}
              </button>
            </form>
          </ERPSectionShell>
        </div>
      ) : null}

      {!loading ? (
        <div>
          <Link href={ROUTES.vendor.quotes} className="text-primary underline text-sm">
            Back to invitations
          </Link>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
