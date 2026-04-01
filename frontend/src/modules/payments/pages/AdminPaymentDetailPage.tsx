"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import {
  getPayment,
  getPaymentTimeline,
  type PaymentRecord,
  type PaymentTimelineResponse,
} from "@/services/payments";
import { normalizeApiError } from "@/services/api/errors";
import { useReversePayment } from "@/modules/payments/hooks/useReversePayment";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unknown error";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function isPaymentReversed(payment: PaymentRecord | null): boolean {
  if (!payment) return false;

  const raw = payment.allocation_metadata;
  if (!raw || typeof raw !== "object") return false;

  const reversal = (raw as Record<string, unknown>).reversal;
  if (!reversal || typeof reversal !== "object") return false;

  return Boolean((reversal as Record<string, unknown>).is_reversed);
}

export default function AdminPaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const paymentId = params?.id;

  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [timelineData, setTimelineData] =
    useState<PaymentTimelineResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [reverseReason, setReverseReason] = useState("");
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [reverseSuccess, setReverseSuccess] = useState<string | null>(null);

  const reverseMutation = useReversePayment();

  const loadPayment = useCallback(async () => {
    if (!paymentId) {
      setErrorMessage("Payment id is missing.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [paymentData, timeline] = await Promise.all([
        getPayment(paymentId),
        getPaymentTimeline(paymentId),
      ]);

      setPayment(paymentData);
      setTimelineData(timeline);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      setPayment(null);
      setTimelineData(null);
    } finally {
      setIsLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    void loadPayment();
  }, [loadPayment]);

  const resolvedPlanType = useMemo(() => {
    return "EMI";
  }, []);

  const reversed = useMemo(() => {
    const timelineFlag = Boolean(timelineData?.flags?.is_reversed);
    return timelineFlag || isPaymentReversed(payment);
  }, [payment, timelineData]);

  const reversalReason = timelineData?.reversal?.reason || "";
  const reversalActor = timelineData?.reversal?.reversed_by_username || "";

  async function handleReverse() {
    if (!paymentId) return;

    const reason = reverseReason.trim();
    setReverseError(null);
    setReverseSuccess(null);

    if (!reason) {
      setReverseError("Reversal reason is required.");
      return;
    }

    try {
      const result = await reverseMutation.mutateAsync({
        paymentId,
        payload: { reason },
      });

      setReverseSuccess(result.detail || "Payment reversed successfully.");
      setReverseReason("");
      await loadPayment();
    } catch (error) {
      const normalized = normalizeApiError(error);
      setReverseError(normalized.message || "Failed to reverse payment.");
    }
  }

  return (
    <PortalPage
      title={payment ? `Payment #${payment.id}` : "Payment Detail"}
      subtitle="Review payment record, collection metadata, and financial investigation timeline."
    >
      {isLoading ? <LoadingBlock label="Loading payment..." /> : null}

      {!isLoading && errorMessage ? (
        <ErrorState
          title="Failed to load payment"
          description={errorMessage}
          onRetry={() => void loadPayment()}
        />
      ) : null}

      {!isLoading && !errorMessage && !payment ? (
        <ErrorState
          title="Payment not found"
          description="The requested payment record could not be found."
        />
      ) : null}

      {!isLoading && !errorMessage && payment ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Payment Overview
                </h2>
                <p className="text-sm text-slate-500">
                  Recorded payment details and linked subscription context.
                </p>
              </div>

              {reversed ? (
                <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                  Reversed
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  Active
                </span>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <p>
                <b>Payment ID:</b> {payment.id}
              </p>
              <p>
                <b>Subscription:</b> {payment.subscription}
              </p>
              <p>
                <b>EMI ID:</b> {payment.emi ?? "-"}
              </p>
              <p>
                <b>EMI Month:</b> {payment.emi_month_no ?? "-"}
              </p>
              <p>
                <b>Customer:</b> {payment.customer_name || "-"}
              </p>
              <p>
                <b>Phone:</b> {payment.customer_phone || "-"}
              </p>
              <p>
                <b>Batch:</b> {payment.batch_code || "-"}
              </p>
              <p>
                <b>Lucky Number:</b> {payment.lucky_number ?? "-"}
              </p>
              <p>
                <b>Amount:</b> {payment.amount}
              </p>
              <p>
                <b>Date:</b> {payment.payment_date}
              </p>
              <p>
                <b>Method:</b> {payment.method}
              </p>
              <p>
                <b>Plan Type:</b> {resolvedPlanType}
              </p>
              <p>
                <b>Reference #:</b> {payment.reference_no || "-"}
              </p>
              <p>
                <b>Recorded At:</b> {formatDateTime(payment.created_at)}
              </p>
              <p>
                <b>Collected by:</b> {payment.collected_by_username || "-"}
              </p>
              <p>
                <b>Verified by:</b> {payment.verified_by_username || "-"}
              </p>
              <p>
                <b>Subscription Status:</b> {payment.subscription_status || "-"}
              </p>
            </div>

            {reversed ? (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <div>
                  <b>Reversal reason:</b> {reversalReason || "-"}
                </div>
                <div className="mt-1">
                  <b>Reversed by:</b> {reversalActor || "-"}
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Controlled Reversal
              </h2>
              <p className="text-sm text-slate-500">
                Reverse only if this payment was recorded incorrectly. This
                action is audited and affects EMI/subscription financial state.
              </p>
            </div>

            {reversed ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                This payment has already been reversed. It cannot be reversed
                again.
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="reverse-reason"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Reversal Reason
                  </label>
                  <textarea
                    id="reverse-reason"
                    rows={4}
                    value={reverseReason}
                    onChange={(e) => setReverseReason(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    placeholder="Explain why this payment must be reversed..."
                    disabled={reverseMutation.isPending}
                  />
                </div>

                {reverseError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {reverseError}
                  </div>
                ) : null}

                {reverseSuccess ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {reverseSuccess}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleReverse()}
                    disabled={reverseMutation.isPending}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {reverseMutation.isPending
                      ? "Reversing..."
                      : "Reverse Payment"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReverseReason("");
                      setReverseError(null);
                      setReverseSuccess(null);
                    }}
                    disabled={reverseMutation.isPending}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Payment Timeline
              </h2>
              <p className="text-sm text-slate-500">
                Unified sequence of ledger activity and audit events for this
                payment.
              </p>
            </div>

            {!timelineData?.timeline || timelineData.timeline.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-500">
                No timeline events available.
              </div>
            ) : (
              <div className="space-y-3">
                {timelineData.timeline.map(
                  (
                    entry: NonNullable<
                      PaymentTimelineResponse["timeline"]
                    >[number],
                    index: number
                  ) => {
                    const payload = entry.payload || {};
                    const kindLabel =
                      entry.kind === "ledger"
                        ? "Ledger"
                        : entry.kind === "reversal_ledger"
                        ? "Reversal Ledger"
                        : "Audit";

                    return (
                      <div
                        key={`${entry.kind}-${index}-${entry.timestamp}`}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div className="text-sm font-semibold text-slate-900">
                            {kindLabel}
                          </div>
                          <div className="text-xs text-slate-500">
                            {formatDateTime(entry.timestamp)}
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                          {entry.kind !== "audit" ? (
                            <>
                              <p>
                                <b>Entry Type:</b>{" "}
                                {String(payload.entry_type ?? "-")}
                              </p>
                              <p>
                                <b>Direction:</b>{" "}
                                {String(payload.entry_direction ?? "-")}
                              </p>
                              <p>
                                <b>Amount:</b> {String(payload.amount ?? "-")}
                              </p>
                              <p>
                                <b>Context:</b>{" "}
                                {payload.allocation_context
                                  ? JSON.stringify(payload.allocation_context)
                                  : "-"}
                              </p>
                            </>
                          ) : (
                            <>
                              <p>
                                <b>Action:</b>{" "}
                                {String(payload.action_type ?? "-")}
                              </p>
                              <p>
                                <b>Actor:</b>{" "}
                                {String(payload.performed_by ?? "-")}
                              </p>
                              <p className="md:col-span-2">
                                <b>Metadata:</b>{" "}
                                {payload.metadata
                                  ? JSON.stringify(payload.metadata)
                                  : "-"}
                              </p>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </section>

          <section className="flex flex-wrap gap-3">
            <Link
              href="/admin/payments"
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back to Payments
            </Link>

            <Link
              href={`/admin/subscriptions/${payment.subscription}`}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              View Subscription
            </Link>
          </section>
        </div>
      ) : null}
    </PortalPage>
  );
}