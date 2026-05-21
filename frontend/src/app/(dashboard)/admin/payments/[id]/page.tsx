"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import ShareActions from "@/components/communications/ShareActions";
import { ActionStrip, DetailSection } from "@/components/detail";
import {
  ERPDataToolbar,
  ERPEmptyState,
  ERPErrorState,
  ERPLoadingState,
  ERPPageShell,
  ERPStatusBadge,
} from "@/components/erp";
import PaymentReceiptDocument from "@/components/receipts/PaymentReceiptDocument";
import {
  DetailPanel,
  FormSection,
  Timeline,
} from "@/components/ui/operations";
import {
  DetailItem as DetailValue,
} from "@/components/ui/workspace";
import { apiFetch } from "@/lib/api";
import {
  buildAdminBillingRegisterRoute,
  buildAdminReconciliationRoute,
  buildAdminSubscriptionRoute,
} from "@/lib/route-builders";

type PaymentDetailRecord = {
  id: number;
  amount: string;
  method?: string;
  reference_no?: string | null;
  payment_date?: string;
  created_at?: string;
  customer?: number | null;
  customer_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  subscription?: number | null;
  subscription_id?: number | null;
  subscription_status?: string;
  batch_code?: string | null;
  lucky_number?: number | null;
  emi?: number | null;
  emi_id?: number | null;
  emi_month_no?: number | null;
  collected_by?: number | null;
  collected_by_id?: number | null;
  collected_by_username?: string | null;
  verified_by?: number | null;
  verified_by_id?: number | null;
  verified_by_username?: string | null;
  allocation_metadata?: Record<string, unknown> | null;
};

type TimelineEntry = {
  id: number;
  emi_id?: number | null;
  amount?: string;
  entry_type?: string;
  entry_direction?: string;
  allocation_context?: Record<string, unknown>;
  created_at?: string;
};

type AuditEntry = {
  id: number;
  action_type?: string;
  performed_by?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

type TimelineEvent = {
  kind: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
};

type PaymentTimelineResponse = {
  payment: PaymentDetailRecord;
  flags?: {
    is_reversed?: boolean;
  };
  reversal?: Record<string, unknown>;
  ledger_entries?: TimelineEntry[];
  reversal_ledger_entries?: TimelineEntry[];
  audit_logs?: AuditEntry[];
  timeline?: TimelineEvent[];
};

type ReversePaymentResponse = {
  detail?: string;
  payment?: PaymentDetailRecord;
  emi?: {
    id: number;
    status?: string | null;
    amount?: string;
    paid_amount?: string;
    outstanding_amount?: string;
  };
  subscription?: {
    id: number;
    status?: string | null;
  };
};

function money(value: string | number | null | undefined): string {
  const parsed = Number(value);
  return `₹${(Number.isFinite(parsed) ? parsed : 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load payment detail.";
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (typeof value === "number") return value;
  if (value === null) return null;
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | null | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (value === null) return null;
  return undefined;
}

function normalizePaymentDetail(
  row: Record<string, unknown> | null | undefined
): PaymentDetailRecord | null {
  if (!row) return null;

  const subscriptionId =
    asNumber(row.subscription) ?? asNumber(row.subscription_id) ?? null;
  const customerId = asNumber(row.customer) ?? asNumber(row.customer_id) ?? null;
  const emiId = asNumber(row.emi) ?? asNumber(row.emi_id) ?? null;

  return {
    id: Number(row.id ?? 0),
    amount: String(row.amount ?? "0.00"),
    method: asString(row.method),
    reference_no: asNullableString(row.reference_no),
    payment_date: asString(row.payment_date),
    created_at: asString(row.created_at),
    customer: customerId,
    customer_id: customerId,
    customer_name: asString(row.customer_name),
    customer_phone: asString(row.customer_phone),
    subscription: subscriptionId,
    subscription_id: subscriptionId,
    subscription_status: asString(row.subscription_status),
    batch_code: asNullableString(row.batch_code),
    lucky_number: asNullableNumber(row.lucky_number),
    emi: emiId,
    emi_id: emiId,
    emi_month_no: asNullableNumber(row.emi_month_no),
    collected_by:
      asNumber(row.collected_by) ?? asNumber(row.collected_by_id) ?? null,
    collected_by_id:
      asNumber(row.collected_by) ?? asNumber(row.collected_by_id) ?? null,
    collected_by_username: asNullableString(row.collected_by_username),
    verified_by:
      asNumber(row.verified_by) ?? asNumber(row.verified_by_id) ?? null,
    verified_by_id:
      asNumber(row.verified_by) ?? asNumber(row.verified_by_id) ?? null,
    verified_by_username: asNullableString(row.verified_by_username),
    allocation_metadata: asObject(row.allocation_metadata) ?? null,
  };
}

function normalizeTimelineEntry(row: Record<string, unknown>): TimelineEntry {
  return {
    id: Number(row.id ?? 0),
    emi_id: asNullableNumber(row.emi_id),
    amount: typeof row.amount === "string" ? row.amount : undefined,
    entry_type: asString(row.entry_type),
    entry_direction: asString(row.entry_direction),
    allocation_context: asObject(row.allocation_context) ?? undefined,
    created_at: asString(row.created_at),
  };
}

function normalizeAuditEntry(row: Record<string, unknown>): AuditEntry {
  return {
    id: Number(row.id ?? 0),
    action_type: asString(row.action_type),
    performed_by: asNullableString(row.performed_by),
    metadata: asObject(row.metadata) ?? undefined,
    created_at: asString(row.created_at),
  };
}

function normalizeTimelineEvent(row: Record<string, unknown>): TimelineEvent {
  return {
    kind: asString(row.kind) || "event",
    timestamp: asString(row.timestamp),
    payload: asObject(row.payload) ?? undefined,
  };
}

function normalizeTimelinePayload(
  payload: Record<string, unknown>
): PaymentTimelineResponse {
  const ledgerEntries = Array.isArray(payload.ledger_entries)
    ? payload.ledger_entries.map((item) =>
        normalizeTimelineEntry(item as Record<string, unknown>)
      )
    : [];

  const reversalLedgerEntries = Array.isArray(payload.reversal_ledger_entries)
    ? payload.reversal_ledger_entries.map((item) =>
        normalizeTimelineEntry(item as Record<string, unknown>)
      )
    : [];

  const auditLogs = Array.isArray(payload.audit_logs)
    ? payload.audit_logs.map((item) =>
        normalizeAuditEntry(item as Record<string, unknown>)
      )
    : [];

  const timeline = Array.isArray(payload.timeline)
    ? payload.timeline.map((item) =>
        normalizeTimelineEvent(item as Record<string, unknown>)
      )
    : [];

  return {
    payment: normalizePaymentDetail(asObject(payload.payment)) || {
      id: 0,
      amount: "0.00",
    },
    flags: asObject(payload.flags) ?? undefined,
    reversal: asObject(payload.reversal) ?? undefined,
    ledger_entries: ledgerEntries,
    reversal_ledger_entries: reversalLedgerEntries,
    audit_logs: auditLogs,
    timeline,
  };
}

function metadataLines(
  metadata: Record<string, unknown> | null | undefined
): Array<{ key: string; value: string }> {
  if (!metadata) return [];
  return Object.entries(metadata).map(([key, value]) => ({
    key,
    value: toStructuredDisplayValue(value),
  }));
}

function toStructuredDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.trim() || "—";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";

  if (Array.isArray(value)) {
    const primitiveValues = value
      .filter((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")
      .map((item) => String(item))
      .filter((item) => item.trim())
      .slice(0, 3);

    if (primitiveValues.length > 0) return primitiveValues.join(", ");
    return value.length > 0 ? `${value.length} item(s) recorded` : "No items";
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length > 0 ? `Structured metadata (${keys.length} fields)` : "Structured metadata";
  }

  return "—";
}

function timelinePayloadRows(
  payload: Record<string, unknown> | undefined
): Array<{ label: string; value: string }> {
  if (!payload) return [];

  return Object.entries(payload)
    .map(([key, value]) => ({
      label: key.replaceAll("_", " "),
      value: toStructuredDisplayValue(value),
    }))
    .filter((row) => row.value !== "—")
    .slice(0, 10);
}

export default function AdminPaymentDetailRoutePage() {
  const params = useParams<{ id: string }>();
  const paymentId = params?.id;

  const [payment, setPayment] = useState<PaymentDetailRecord | null>(null);
  const [timelineData, setTimelineData] = useState<PaymentTimelineResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reverseReason, setReverseReason] = useState("");
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [reverseSuccess, setReverseSuccess] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!paymentId) return;

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [paymentPayload, timelinePayload] = await Promise.all([
          apiFetch<Record<string, unknown>>(`/admin/payments/${paymentId}/`),
          apiFetch<Record<string, unknown>>(`/admin/payments/${paymentId}/timeline/`),
        ]);

        setPayment(normalizePaymentDetail(paymentPayload));
        setTimelineData(normalizeTimelinePayload(timelinePayload));
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setPayment(null);
          setTimelineData(null);
        }
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [paymentId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const resolvedPayment = timelineData?.payment || payment;
  const isReversed = Boolean(timelineData?.flags?.is_reversed);
  const reversalMetadata = timelineData?.reversal ?? {};
  const reversalLines = metadataLines(reversalMetadata);
  const statusLabel = isReversed ? "REVERSED" : "ACTIVE";
  const statusToneClassName = isReversed
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
  const receiptReference =
    resolvedPayment?.reference_no || (resolvedPayment ? `AUTO-${resolvedPayment.id}` : "—");
  const subscriptionLabel = resolvedPayment?.subscription
    ? `SUB-${resolvedPayment.subscription}`
    : "—";
  const emiContext =
    resolvedPayment?.emi !== null && resolvedPayment?.emi !== undefined
      ? `#${resolvedPayment.emi}${
          resolvedPayment.emi_month_no !== null &&
          resolvedPayment.emi_month_no !== undefined
            ? ` · Month ${resolvedPayment.emi_month_no}`
            : ""
        }`
      : "Not linked to a single EMI row";

  const actionLinks = useMemo(() => {
    const links: Array<{
      href: string;
      label: string;
      variant?: "primary" | "secondary" | "ghost" | "danger";
    }> = [
      {
        href: "/admin/payments",
        label: "Back to Register",
        variant: "secondary",
      },
    ];

    if (resolvedPayment?.subscription) {
      links.push({
        href: buildAdminSubscriptionRoute(resolvedPayment.subscription),
        label: "Open Subscription",
        variant: "primary",
      });
      links.push({
        href: `/admin/billing/contracts?subscription=${resolvedPayment.subscription}`,
        label: "Billing Contract",
        variant: "secondary",
      });
      links.push({
        href: buildAdminBillingRegisterRoute({
          subscription: resolvedPayment.subscription,
          payment: paymentId,
        }),
        label: "Billing Register",
        variant: "secondary",
      });
      links.push({
        href: `/admin/billing/receipts?payment=${paymentId}`,
        label: "Receipts",
        variant: "secondary",
      });
    }

    links.push({
      href: `/admin/finance/commissions?payment=${paymentId}${
        resolvedPayment?.subscription
          ? `&subscription=${resolvedPayment.subscription}`
          : ""
      }`,
      label: "Open Commissions",
      variant: "secondary",
    });

    links.push({
      href: buildAdminReconciliationRoute({
        view: "payments",
        payment: paymentId,
        subscription: resolvedPayment?.subscription ?? undefined,
      }),
      label: "Open Reconciliation",
      variant: "secondary",
    });

    return links;
  }, [paymentId, resolvedPayment?.subscription]);

  async function handleReverse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentId || isReversed) return;

    const reason = reverseReason.trim();
    if (!reason) {
      setReverseError("Reversal reason is required.");
      return;
    }

    const confirmed = window.confirm(
      `Reverse payment #${paymentId}? This will create a reversal audit trail and update linked ledger state.`
    );
    if (!confirmed) return;

    setReversing(true);
    setReverseError(null);
    setReverseSuccess(null);

    try {
      const payload = await apiFetch<ReversePaymentResponse>(
        `/admin/payments/${paymentId}/reverse/`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        }
      );

      setReverseSuccess(payload.detail || "Payment reversed successfully.");
      setReverseReason("");
      await loadPage("refresh");
    } catch (err) {
      setReverseError(toErrorMessage(err));
    } finally {
      setReversing(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <ERPPageShell
      className="receipt-print-page"
      title={`Payment #${paymentId ?? "—"}`}
      subtitle="Inspect payment facts, linked contract context, reversal state, and the full ledger/audit timeline."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Payments", href: "/admin/payments" },
        { label: `Payment #${paymentId ?? "—"}` },
      ]}
      actions={actionLinks}
      stats={[
        {
          label: "Amount",
          value: money(resolvedPayment?.amount),
          tone: "success",
        },
        {
          label: "State",
          value: isReversed ? "Reversed" : "Active",
          tone: isReversed ? "warning" : "success",
        },
        {
          label: "Subscription",
          value: resolvedPayment?.subscription
            ? `SUB-${resolvedPayment.subscription}`
            : "—",
        },
        {
          label: "EMI",
          value:
            resolvedPayment?.emi !== null && resolvedPayment?.emi !== undefined
              ? String(resolvedPayment.emi)
              : "—",
        },
      ]}
      statusBadge={{
        label: isReversed ? "Reversed Record" : "Active Record",
        tone: isReversed ? "warning" : "success",
      }}
    >
      <div className="space-y-6">
        <ERPDataToolbar
          className="receipt-print-hide"
          left={
            <p className="text-sm text-muted-foreground">
              Use Print / Save PDF for a clean payment proof copy. Reversal, ledger, and timeline sections stay
              screen-only.
            </p>
          }
          right={
            <>
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={refreshing || loading}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>

              <button
                type="button"
                onClick={handlePrint}
                disabled={loading || Boolean(error) || !resolvedPayment}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Print / Save PDF
              </button>

              {resolvedPayment ? (
                <ShareActions
                  title="EMI Collection Receipt"
                  message={`Receipt Ref: ${receiptReference}\nAmount: ${money(resolvedPayment.amount)}`}
                  whatsappPhone={resolvedPayment.customer_phone || null}
                  label="Share"
                />
              ) : null}
            </>
          }
        />

        {loading ? <ERPLoadingState label="Loading payment detail..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load payment detail"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !resolvedPayment ? (
          <ERPEmptyState
            title="Payment not available"
            description="The requested payment record could not be loaded."
          />
        ) : null}

        {!loading && !error && resolvedPayment ? (
          <>
            <PaymentReceiptDocument
              audienceLabel="Admin-visible payment proof sourced from the live payment detail record."
              documentTitle="EMI Collection Receipt"
              receiptReference={receiptReference}
              paymentId={resolvedPayment.id}
              statusLabel={statusLabel}
              statusToneClassName={statusToneClassName}
              statusNote={
                isReversed ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    This payment has been reversed. Use the printed copy only as historical proof alongside the recorded reversal trail.
                  </div>
                ) : undefined
              }
              partyFields={[
                {
                  label: "Customer",
                  value:
                    resolvedPayment.customer_name ||
                    (resolvedPayment.customer
                      ? `Customer #${resolvedPayment.customer}`
                      : "—"),
                  emphasize: true,
                },
                { label: "Phone", value: resolvedPayment.customer_phone || "—" },
                { label: "Subscription", value: subscriptionLabel, emphasize: true },
                { label: "Subscription Status", value: resolvedPayment.subscription_status || "—" },
              ]}
              referenceFields={[
                { label: "Receipt Reference", value: receiptReference, emphasize: true },
                { label: "Payment Date", value: formatDate(resolvedPayment.payment_date) },
                { label: "Method", value: resolvedPayment.method || "—" },
                { label: "EMI Context", value: emiContext },
              ]}
              summaryFields={[
                {
                  label: "Paid On",
                  value: formatDateTime(
                    resolvedPayment.created_at || resolvedPayment.payment_date
                  ),
                  emphasize: true,
                },
                {
                  label: "Amount",
                  value: money(resolvedPayment.amount),
                  emphasize: true,
                },
                {
                  label: "Collector",
                  value: resolvedPayment.collected_by_username || "—",
                },
                {
                  label: "Verifier",
                  value: resolvedPayment.verified_by_username || "—",
                },
              ]}
              detailFields={[
                { label: "Receipt Status", value: statusLabel },
                { label: "Batch", value: resolvedPayment.batch_code || "—" },
                {
                  label: "Lucky Number",
                  value:
                    resolvedPayment.lucky_number !== null &&
                    resolvedPayment.lucky_number !== undefined
                      ? String(resolvedPayment.lucky_number)
                      : "—",
                },
                {
                  label: "Reference Number",
                  value: resolvedPayment.reference_no || "—",
                },
              ]}
              footerNote="Use browser print to keep a paper copy or save this receipt as PDF. This view is sourced from the admin payment detail record."
            />

            <section className="receipt-print-hide grid gap-6 xl:grid-cols-2">
              <DetailPanel
                title="Payment Overview"
                description="Primary payment facts used for finance review and audit confirmation."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue label="Payment ID" value={`#${resolvedPayment.id}`} />
                  <DetailValue
                    label="Amount"
                    value={money(resolvedPayment.amount)}
                  />
                  <DetailValue
                    label="Status"
                    value={
                      <ERPStatusBadge
                        status={isReversed ? "REVERSED" : "ACTIVE"}
                        label={isReversed ? "Reversed" : "Active"}
                      />
                    }
                  />
                  <DetailValue
                    label="Method"
                    value={resolvedPayment.method || "—"}
                  />
                  <DetailValue
                    label="Reference"
                    value={resolvedPayment.reference_no || "—"}
                  />
                  <DetailValue
                    label="Payment Date"
                    value={formatDate(resolvedPayment.payment_date)}
                  />
                  <DetailValue
                    label="Created At"
                    value={formatDateTime(resolvedPayment.created_at)}
                  />
                  <DetailValue
                    label="Collected By"
                    value={resolvedPayment.collected_by_username || "—"}
                  />
                  <DetailValue
                    label="Verified By"
                    value={resolvedPayment.verified_by_username || "—"}
                  />
                </div>
              </DetailPanel>

              <DetailPanel
                title="Contract Context"
                description="Linked customer, subscription, batch, lucky, and EMI context for this payment."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailValue
                    label="Customer"
                    value={
                      resolvedPayment.customer_name ||
                      (resolvedPayment.customer
                        ? `Customer #${resolvedPayment.customer}`
                        : "—")
                    }
                  />
                  <DetailValue
                    label="Customer Phone"
                    value={resolvedPayment.customer_phone || "—"}
                  />
                  <DetailValue
                    label="Subscription"
                    value={
                      resolvedPayment.subscription
                        ? `SUB-${resolvedPayment.subscription}`
                        : "—"
                    }
                  />
                  <DetailValue
                    label="Subscription Status"
                    value={
                      resolvedPayment.subscription_status ? (
                        <ERPStatusBadge status={resolvedPayment.subscription_status} />
                      ) : (
                        "—"
                      )
                    }
                  />
                  <DetailValue
                    label="Batch"
                    value={resolvedPayment.batch_code || "—"}
                  />
                  <DetailValue
                    label="Lucky Number"
                    value={
                      resolvedPayment.lucky_number !== null &&
                      resolvedPayment.lucky_number !== undefined
                        ? String(resolvedPayment.lucky_number)
                        : "—"
                    }
                  />
                  <DetailValue
                    label="EMI ID"
                    value={
                      resolvedPayment.emi !== null &&
                      resolvedPayment.emi !== undefined
                        ? String(resolvedPayment.emi)
                        : "—"
                    }
                  />
                  <DetailValue
                    label="Advance EMI Month"
                    value={
                      resolvedPayment.emi_month_no !== null &&
                      resolvedPayment.emi_month_no !== undefined
                        ? String(resolvedPayment.emi_month_no)
                        : "—"
                    }
                  />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {resolvedPayment.subscription ? (
                    <Link
                      href={buildAdminSubscriptionRoute(resolvedPayment.subscription)}
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    >
                      Open Subscription
                    </Link>
                  ) : null}

                  {resolvedPayment.customer ? (
                    <Link
                      href={`/admin/customers/${resolvedPayment.customer}`}
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                    >
                      Open Customer
                    </Link>
                  ) : null}
                </div>
              </DetailPanel>
            </section>

            <FormSection
              className="receipt-print-hide"
              title="Reversal Control"
              description="Payments are immutable financial records. Reversal is explicit, audited, and requires a reason."
            >
              {isReversed ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    This payment has already been reversed. Reversal is no longer available.
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {reversalLines.length > 0 ? (
                      reversalLines.map((item) => (
                        <DetailValue
                          key={item.key}
                          label={item.key.replaceAll("_", " ")}
                          value={item.value}
                        />
                      ))
                    ) : (
                      <DetailValue
                        label="Reversal Metadata"
                        value="Reversal metadata is available but empty."
                      />
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleReverse} className="space-y-4">
                  <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-foreground">
                    Reverse only when the payment was posted incorrectly or requires formal rollback. This action will create ledger and audit trail entries.
                  </div>

                  {reverseError ? (
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {reverseError}
                    </div>
                  ) : null}

                  {reverseSuccess ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      {reverseSuccess}
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="reverse-reason"
                      className="mb-2 block text-sm font-medium text-foreground"
                    >
                      Reversal reason
                    </label>
                    <textarea
                      id="reverse-reason"
                      value={reverseReason}
                      onChange={(event) => setReverseReason(event.target.value)}
                      rows={4}
                      placeholder="Enter the operational reason for reversing this payment."
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-ring"
                      disabled={reversing}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={reversing}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-destructive/30 bg-destructive px-4 text-sm font-medium text-destructive-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {reversing ? "Reversing..." : "Reverse Payment"}
                  </button>
                </form>
              )}
            </FormSection>

            <section className="receipt-print-hide grid gap-6 xl:grid-cols-2">
              <DetailPanel
                title="Ledger Entries"
                description="Direct ledger entries linked to this payment."
              >
                {(timelineData?.ledger_entries?.length ?? 0) === 0 ? (
                  <ERPEmptyState
                    title="No direct ledger entries"
                    description="No direct payment-linked ledger rows were returned."
                  />
                ) : (
                  <Timeline title="Payment Ledger Events">
                    {timelineData?.ledger_entries?.map((entry) => (
                      <div
                        key={`ledger-${entry.id}`}
                        className="rounded-xl border border-border bg-muted/40 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              {entry.entry_type || "Ledger Entry"} #{entry.id}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {entry.entry_direction || "—"} · EMI{" "}
                              {entry.emi_id ?? "—"} · {formatDateTime(entry.created_at)}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-foreground">
                            {money(entry.amount)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </Timeline>
                )}
              </DetailPanel>

              <DetailPanel
                title="Reversal Ledger Entries"
                description="Ledger rows created as part of reversal processing."
              >
                {(timelineData?.reversal_ledger_entries?.length ?? 0) === 0 ? (
                  <ERPEmptyState
                    title="No reversal ledger entries"
                    description="No reversal ledger rows are present for this payment."
                  />
                ) : (
                  <Timeline title="Reversal Ledger Events">
                    {timelineData?.reversal_ledger_entries?.map((entry) => (
                      <div
                        key={`reversal-ledger-${entry.id}`}
                        className="rounded-xl border border-border bg-muted/40 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="font-medium text-foreground">
                              {entry.entry_type || "Reversal Entry"} #{entry.id}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {entry.entry_direction || "—"} · EMI{" "}
                              {entry.emi_id ?? "—"} · {formatDateTime(entry.created_at)}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-foreground">
                            {money(entry.amount)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </Timeline>
                )}
              </DetailPanel>
            </section>

            <DetailPanel
              className="receipt-print-hide"
              title="Audit & Timeline"
              description="Chronological audit and finance event trail for this payment."
            >
              {(timelineData?.timeline?.length ?? 0) === 0 &&
              (timelineData?.audit_logs?.length ?? 0) === 0 ? (
                <ERPEmptyState
                  title="No timeline events"
                  description="No audit or timeline events were returned for this payment."
                />
              ) : (
                <Timeline title="Chronological Timeline">
                  {timelineData?.timeline?.map((entry, index) => (
                    <div
                      key={`timeline-${index}-${entry.kind}`}
                      className="rounded-xl border border-border bg-muted/40 p-4"
                    >
                      <div className="font-medium text-foreground">
                        {entry.kind.replaceAll("_", " ")}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {formatDateTime(entry.timestamp)}
                      </div>

                      {entry.payload
                        ? (() => {
                            const payloadRows = timelinePayloadRows(entry.payload);
                            if (payloadRows.length === 0) {
                              return (
                                <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                                  Structured timeline metadata recorded for this event.
                                </div>
                              );
                            }

                            return (
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {payloadRows.map((row) => (
                                  <DetailValue
                                    key={`${entry.kind}-${row.label}`}
                                    label={row.label}
                                    value={row.value}
                                  />
                                ))}
                              </div>
                            );
                          })()
                        : null}
                    </div>
                  ))}

                  {(timelineData?.timeline?.length ?? 0) === 0 &&
                    timelineData?.audit_logs?.map((log) => (
                      <div
                        key={`audit-${log.id}`}
                        className="rounded-xl border border-border bg-muted/40 p-4"
                      >
                        <div className="font-medium text-foreground">
                          {log.action_type || "Audit Event"}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {log.performed_by || "Unknown actor"} ·{" "}
                          {formatDateTime(log.created_at)}
                        </div>
                      </div>
                    ))}
                </Timeline>
              )}
            </DetailPanel>

            <DetailSection
              className="receipt-print-hide"
              title="Next Step"
              description="Use the route that matches the finance review or proof workflow."
            >
              <ActionStrip>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center rounded-md border border-border bg-foreground px-3 py-2 text-sm font-medium text-background shadow-sm transition hover:opacity-90"
                >
                  Print / Save PDF
                </button>

                <Link
                  href="/admin/payments"
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Back to Register
                </Link>

                {resolvedPayment.subscription ? (
                  <Link
                    href={buildAdminSubscriptionRoute(resolvedPayment.subscription)}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Open Subscription
                  </Link>
                ) : null}
              </ActionStrip>
            </DetailSection>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
