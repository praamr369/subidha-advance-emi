"use client";

import { useCallback, useEffect, useState } from "react";

import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import {
  confirmInvoiceDelivery,
  createDeliveryFromInvoice,
  getInvoiceDeliveryReadiness,
  type InvoiceDeliveryReadiness,
  type InvoiceDeliveryStatus,
} from "@/services/billing";

const STATUS_TONE: Record<InvoiceDeliveryStatus, string> = {
  NOT_REQUIRED: "border-border bg-muted/50 text-muted-foreground",
  PENDING_DELIVERY: "border-amber-200 bg-amber-50 text-amber-700",
  PARTIALLY_DELIVERED: "border-sky-200 bg-sky-50 text-sky-700",
  DELIVERED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  RETURNED: "border-indigo-200 bg-indigo-50 text-indigo-700",
  CANCELLED: "border-border bg-muted text-muted-foreground",
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
  invoiceId: number;
  documentNo?: string | null;
};

export default function InvoiceDeliveryPanel({ invoiceId, documentNo }: Props) {
  const [readiness, setReadiness] = useState<InvoiceDeliveryReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "confirm" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await getInvoiceDeliveryReadiness(invoiceId);
      setReadiness(payload);
      setError(null);
    } catch (err) {
      setReadiness(null);
      setError(accountingErrorMessage(err, "Failed to load delivery readiness."));
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runCreate = async () => {
    setBusy("create");
    setActionError(null);
    try {
      await createDeliveryFromInvoice(invoiceId, {});
      await load();
    } catch (err) {
      setActionError(accountingErrorMessage(err, "Could not create delivery for this invoice."));
    } finally {
      setBusy(null);
    }
  };

  const runConfirm = async () => {
    setBusy("confirm");
    setActionError(null);
    try {
      await confirmInvoiceDelivery(invoiceId);
      await load();
    } catch (err) {
      setActionError(accountingErrorMessage(err, "Could not confirm delivery for this invoice."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <WorkspaceSection
      title="Delivery Fulfilment"
      description="Controlled handover tracking. Stock leaves inventory only when delivery is confirmed (subscription) or at posting for retail counter sales — never faked here."
    >
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading delivery readiness…</div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
      ) : !readiness ? (
        <div className="text-sm text-muted-foreground">No delivery information available.</div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                STATUS_TONE[readiness.delivery_status] ?? STATUS_TONE.NOT_REQUIRED
              }`}
            >
              {STATUS_LABEL[readiness.delivery_status] ?? readiness.delivery_status}
            </span>
            {readiness.delivery_display ? (
              <span className="text-sm text-muted-foreground">{readiness.delivery_display}</span>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Workflow" value={readiness.delivery_workflow || readiness.source_type || "—"} />
            <Field label="Stock Status" value={readiness.stock_status || "—"} />
            <Field label="Stock Location" value={readiness.stock_location || "—"} />
            <Field
              label="Delivered / Remaining"
              value={`${readiness.already_delivered_quantity ?? "0"} / ${readiness.remaining_quantity ?? "0"}`}
            />
          </div>

          {readiness.blockers && readiness.blockers.length > 0 ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Delivery blockers</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-rose-700">
                {readiness.blockers.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {readiness.delivery_id ? (
              <a
                href={`${ROUTES.admin.deliveries}?${new URLSearchParams(
                  documentNo ? { invoice: documentNo } : {}
                ).toString()}`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-muted"
              >
                View Delivery
              </a>
            ) : null}

            {readiness.can_create_delivery ? (
              <button
                type="button"
                onClick={runCreate}
                disabled={busy !== null}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-orange-700 px-3 text-xs font-semibold text-white transition hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "create" ? "Creating…" : "Create Delivery"}
              </button>
            ) : null}

            {readiness.can_confirm_delivery ? (
              <button
                type="button"
                onClick={runConfirm}
                disabled={busy !== null}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === "confirm" ? "Confirming…" : "Confirm Delivery"}
              </button>
            ) : null}
          </div>

          {actionError ? <div className="text-xs font-medium text-rose-600">{actionError}</div> : null}
        </div>
      )}
    </WorkspaceSection>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm text-foreground">{value}</div>
    </div>
  );
}
