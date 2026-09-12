"use client";

import { useState } from "react";

import { apiFetch } from "@/lib/api";
import { formatRupee } from "@/lib/utils/currency";

// Mirrors backend customers.services.customer_account_service.build_vendor_payable_posture.
type VendorPayables = {
  vendor_count: number;
  billed: string;
  paid: string;
  payable: string;
  advance: string;
  last_bill_date: string | null;
  last_payment_date: string | null;
};

function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Lazy "Vendor payables" toggle for bill cards/panels — the vendor-side
 * counterpart of the customer position toggle. Fetched only when opened, from
 * the vendor ledger (bill = debit, payment = credit). Renders nothing without a
 * vendor id.
 */
export default function VendorPayablesToggle({ vendorId }: { vendorId: number | null | undefined }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<VendorPayables | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  if (!vendorId) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || data || state === "loading") return;
    setState("loading");
    apiFetch<VendorPayables | null>(`/admin/vendors/${vendorId}/payables/`, { cache: "no-store" })
      .then((payload) => {
        setData(payload);
        setState("idle");
      })
      .catch(() => {
        setData(null);
        setState("error");
      });
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
      >
        {open ? "Hide vendor payables" : "Show vendor payables"}
      </button>
      {open ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">
          {state === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading vendor payables…</p>
          ) : state === "error" || !data ? (
            <p className="text-sm text-muted-foreground">Vendor payables are unavailable right now.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Billed</div>
                <div className="text-sm font-semibold text-foreground">{formatRupee(data.billed)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid</div>
                <div className="text-sm font-semibold text-emerald-600">{formatRupee(data.paid)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Payable (we owe)</div>
                <div
                  className={`text-sm font-semibold ${Number(data.payable) > 0 ? "text-red-600" : "text-foreground"}`}
                >
                  {formatRupee(data.payable)}
                </div>
                {Number(data.advance) > 0 ? (
                  <div className="text-xs text-muted-foreground">Advance with vendor {formatRupee(data.advance)}</div>
                ) : null}
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Last bill / payment</div>
                <div className="text-sm font-semibold text-foreground">
                  {shortDate(data.last_bill_date)} / {shortDate(data.last_payment_date)}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
