"use client";

import { useState } from "react";

import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import {
  confirmInvoiceDelivery,
  createDeliveryFromInvoice,
  type BillingInvoice,
  type InvoiceDeliveryStatus,
} from "@/services/billing";

const STATUS_TONE: Record<InvoiceDeliveryStatus, string> = {
  NOT_REQUIRED: "border-slate-200 bg-slate-50 text-muted-foreground",
  PENDING_DELIVERY: "border-amber-200 bg-amber-50 text-amber-700",
  PARTIALLY_DELIVERED: "border-sky-200 bg-sky-50 text-sky-700",
  DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  RETURNED: "border-indigo-200 bg-indigo-50 text-indigo-700",
  CANCELLED: "border-slate-300 bg-slate-100 text-muted-foreground",
  BLOCKED: "border-rose-200 bg-rose-50 text-rose-700",
};

const STATUS_LABEL: Record<InvoiceDeliveryStatus, string> = {
  NOT_REQUIRED: "Not required",
  PENDING_DELIVERY: "Pending delivery",
  PARTIALLY_DELIVERED: "Partially delivered",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
  BLOCKED: "Blocked",
};

type Props = {
  invoice: BillingInvoice;
  onChanged: () => Promise<void> | void;
};

export default function InvoiceDeliveryCell({ invoice, onChanged }: Props) {
  const [busy, setBusy] = useState<"create" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = invoice.delivery_summary;
  if (!summary) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const status = summary.delivery_status;
  const tone = STATUS_TONE[status] ?? STATUS_TONE.NOT_REQUIRED;
  const label = STATUS_LABEL[status] ?? status;
  const blockers = summary.blockers || [];

  const runCreate = async () => {
    setBusy("create");
    setError(null);
    try {
      await createDeliveryFromInvoice(invoice.id, {});
      await onChanged();
    } catch (err) {
      setError(accountingErrorMessage(err, "Could not create delivery for this invoice."));
    } finally {
      setBusy(null);
    }
  };

  const runConfirm = async () => {
    setBusy("confirm");
    setError(null);
    try {
      await confirmInvoiceDelivery(invoice.id);
      await onChanged();
    } catch (err) {
      setError(accountingErrorMessage(err, "Could not confirm delivery for this invoice."));
    } finally {
      setBusy(null);
    }
  };

  const viewDeliveryHref = `${ROUTES.admin.deliveries}?${new URLSearchParams(
    invoice.document_no ? { invoice: invoice.document_no } : { customer: String(invoice.customer || "") }
  ).toString()}`;

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
        title={summary.delivery_display || label}
      >
        {label}
      </span>

      {summary.stock_status ? (
        <span className="text-[11px] text-muted-foreground">Stock: {summary.stock_status}</span>
      ) : null}

      {status === "BLOCKED" && blockers.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-rose-700">
          {blockers.slice(0, 2).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {summary.delivery_id ? (
          <a
            href={viewDeliveryHref}
            className="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2 text-[11px] font-semibold text-foreground transition hover:bg-muted"
          >
            View Delivery
          </a>
        ) : null}

        {summary.can_create_delivery ? (
          <button
            type="button"
            onClick={runCreate}
            disabled={busy !== null}
            className="inline-flex h-7 items-center justify-center rounded-md bg-orange-700 px-2 text-[11px] font-semibold text-white transition hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "create" ? "Creating…" : "Create Delivery"}
          </button>
        ) : null}

        {summary.can_confirm_delivery ? (
          <button
            type="button"
            onClick={runConfirm}
            disabled={busy !== null}
            className="inline-flex h-7 items-center justify-center rounded-md bg-emerald-700 px-2 text-[11px] font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "confirm" ? "Confirming…" : "Confirm Delivery"}
          </button>
        ) : null}
      </div>

      {error ? <span className="text-[11px] font-medium text-rose-600">{error}</span> : null}
    </div>
  );
}
