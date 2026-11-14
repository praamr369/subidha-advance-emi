"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import {
  Check,
  Copy,
  ExternalLink,
  QrCode,
  Smartphone,
  X,
  ShieldCheck,
  AlertCircle,
  CreditCard,
  Repeat,
  Loader2,
} from "lucide-react";

import { formatRupee } from "@/lib/utils/currency";
import { getPublicBusinessProfile, type PublicBusinessProfile } from "@/services/public";
import {
  reportCustomerDirectUpiPayment,
  initiateCustomerOnlinePayment,
} from "@/services/customer";

export interface UpiPayDialogProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number | string;
  sequenceNo?: number | string;
  subscriptionNumber?: string;
  productName?: string;
  dueDate?: string;
  sourceType?: "EMI" | "SUBSCRIPTION" | "DIRECT_SALE";
  sourceId?: number | string;
  onPaymentReported?: (refNo: string) => void;
}

export default function UpiPayDialog({
  isOpen,
  onClose,
  amount,
  sequenceNo,
  subscriptionNumber,
  productName,
  dueDate,
  sourceType = "EMI",
  sourceId,
  onPaymentReported,
}: UpiPayDialogProps) {
  const [profile, setProfile] = useState<PublicBusinessProfile | null>(null);
  const [copied, setCopied] = useState(false);
  const [utrNumber, setUtrNumber] = useState("");
  const [payerUpiId, setPayerUpiId] = useState("");
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const [submittedUtr, setSubmittedUtr] = useState(false);
  const [utrError, setUtrError] = useState<string | null>(null);
  const [reportedTxId, setReportedTxId] = useState<string | null>(null);

  const [initiatingOnline, setInitiatingOnline] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);

  const isGatewayEnabled = Boolean(profile?.is_gateway_enabled);
  const isAutopayEnabled = Boolean(profile?.is_autopay_enabled);

  const [viewMode, setViewMode] = useState<"intent" | "qr" | "online">("intent");

  useEffect(() => {
    if (!isOpen) return;
    setSubmittedUtr(false);
    setUtrNumber("");
    setPayerUpiId("");
    setUtrError(null);
    setReportedTxId(null);
    setOnlineError(null);
    setViewMode("intent");

    getPublicBusinessProfile()
      .then((data) => {
        setProfile(data);
      })
      .catch(() => {});
  }, [isOpen]);

  const numAmount = useMemo(() => {
    const n = Number(amount);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amount]);

  // Fallback to configured or standard Subidha UPI
  const resolvedUpiId = (profile?.upi_id || "").trim() || "subidha@upi";
  const resolvedMerchantName =
    (profile?.merchant_name || profile?.display_name || "").trim() || "Subidha Core";

  const transactionNote = useMemo(() => {
    const parts = [sourceType === "DIRECT_SALE" ? "SALE" : "EMI"];
    if (sequenceNo != null) parts.push(`#${sequenceNo}`);
    if (subscriptionNumber) parts.push(subscriptionNumber);
    return parts.join(" ");
  }, [sequenceNo, subscriptionNumber, sourceType]);

  // NPCI standard UPI Payment URI
  const upiUri = useMemo(() => {
    const params = new URLSearchParams();
    params.set("pa", resolvedUpiId);
    params.set("pn", resolvedMerchantName);
    params.set("am", numAmount.toFixed(2));
    params.set("cu", "INR");
    params.set("tn", transactionNote);
    return `upi://pay?${params.toString()}`;
  }, [resolvedUpiId, resolvedMerchantName, numAmount, transactionNote]);

  function handleCopyUpi() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(resolvedUpiId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleUtrSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanUtr = utrNumber.trim();
    if (!cleanUtr) return;

    setSubmittingUtr(true);
    setUtrError(null);

    try {
      const res = await reportCustomerDirectUpiPayment({
        amount: numAmount,
        utr_number: cleanUtr,
        source_type: sourceType,
        source_id: sourceId,
        payer_upi_id: payerUpiId.trim() || undefined,
        notes: `Paid ${formatRupee(numAmount)} for ${transactionNote}`,
      });

      setSubmittedUtr(true);
      setReportedTxId(res.transaction_id);
      onPaymentReported?.(cleanUtr);
    } catch (err) {
      setUtrError(
        err instanceof Error ? err.message : "Failed to record payment UTR. Please try again."
      );
    } finally {
      setSubmittingUtr(false);
    }
  }

  async function handleInitiateOnline(isAutopay: boolean) {
    setInitiatingOnline(true);
    setOnlineError(null);

    try {
      const res = await initiateCustomerOnlinePayment({
        amount: numAmount,
        source_type: sourceType,
        source_id: sourceId,
        payment_type: isAutopay ? "AUTOPAY_MANDATE" : "STANDARD",
      });

      if (res.checkout_url) {
        window.location.href = res.checkout_url;
      } else {
        setOnlineError(res.error || "Unable to reach PhonePe gateway.");
      }
    } catch (err) {
      setOnlineError(
        err instanceof Error ? err.message : "Failed to initiate online transaction."
      );
    } finally {
      setInitiatingOnline(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 bg-muted/40 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Pay via UPI / Autopay
              </h3>
              <p className="text-xs text-muted-foreground">{resolvedMerchantName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="max-h-[80vh] overflow-y-auto p-5 space-y-4">
          {/* Amount Card */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Amount Payable
            </span>
            <div className="mt-1 text-3xl font-extrabold text-foreground">
              {formatRupee(numAmount)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {transactionNote} {productName ? `· ${productName}` : ""}
            </div>
            {dueDate ? (
              <div className="mt-1 text-[11px] text-muted-foreground">
                Due: {dueDate}
              </div>
            ) : null}
          </div>

          {/* Mode Switcher */}
          <div
            className={`grid gap-1.5 rounded-xl bg-muted/60 p-1 text-xs font-medium ${
              isGatewayEnabled ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <button
              type="button"
              onClick={() => setViewMode("intent")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
                viewMode === "intent"
                  ? "bg-card text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              1-Click UPI App
            </button>
            <button
              type="button"
              onClick={() => setViewMode("qr")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
                viewMode === "qr"
                  ? "bg-card text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <QrCode className="h-3.5 w-3.5" />
              Scan QR
            </button>
            {isGatewayEnabled ? (
              <button
                type="button"
                onClick={() => setViewMode("online")}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition ${
                  viewMode === "online"
                    ? "bg-card text-foreground shadow-sm font-semibold text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CreditCard className="h-3.5 w-3.5" />
                PhonePe / PG
              </button>
            ) : null}
          </div>

          {/* Mode 1: 1-Click UPI Intent */}
          {viewMode === "intent" ? (
            <div className="space-y-3 pt-1">
              <a
                href={numAmount > 0 ? upiUri : undefined}
                onClick={(e) => {
                  if (numAmount <= 0) e.preventDefault();
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.99] ${
                  numAmount <= 0 ? "opacity-50 cursor-not-allowed pointer-events-none" : ""
                }`}
              >
                <span>Open in UPI App (GPay / PhonePe / Paytm)</span>
                <ExternalLink className="h-4 w-4" />
              </a>

              <p className="text-center text-[11px] text-muted-foreground">
                Tapping opens your installed UPI apps with merchant details pre-filled.
              </p>
            </div>
          ) : viewMode === "qr" ? (
            /* Mode 2: Dynamic QR Code */
            <div className="flex flex-col items-center justify-center py-2 space-y-3">
              <div className="rounded-2xl border-2 border-border bg-white p-3.5 shadow-sm">
                <QRCode value={upiUri} size={180} level="M" />
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Scan with Google Pay, PhonePe, Paytm, BHIM, or any UPI app.
              </p>
            </div>
          ) : (
            /* Mode 3: Online Gateway / PhonePe AutoPay */
            <div className="space-y-3 pt-1">
              {onlineError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{onlineError}</span>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleInitiateOnline(false)}
                disabled={initiatingOnline || numAmount <= 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 active:scale-[0.99] disabled:opacity-50"
              >
                {initiatingOnline ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                <span>Instant Checkout via PhonePe PG</span>
              </button>

              {isAutopayEnabled ? (
                <button
                  type="button"
                  onClick={() => void handleInitiateOnline(true)}
                  disabled={initiatingOnline || numAmount <= 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-purple-600 bg-purple-50 px-4 py-2.5 text-xs font-semibold text-purple-900 transition hover:bg-purple-100 disabled:opacity-50"
                >
                  <Repeat className="h-3.5 w-3.5 text-purple-700" />
                  <span>Setup Monthly UPI AutoPay Mandate</span>
                </button>
              ) : null}

              <p className="text-center text-[11px] text-muted-foreground">
                Secured by PhonePe Payment Gateway. Supports UPI, Netbanking, Cards & AutoPay.
              </p>
            </div>
          )}

          {/* Merchant UPI ID display with Copy */}
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Direct Merchant UPI ID
                </span>
                <p className="font-mono text-sm font-semibold text-foreground">
                  {resolvedUpiId}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyUpi}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-600">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Payment Acknowledgment / UTR Submission */}
          <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
            {submittedUtr ? (
              <div className="flex items-start gap-2.5 text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold">Payment Details Submitted!</p>
                  <p className="mt-0.5 text-muted-foreground">
                    Reference UTR <span className="font-mono font-semibold">{utrNumber}</span> has been noted (Ref: {reportedTxId || "OK"}). Store staff will reconcile and issue your receipt shortly.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleUtrSubmit} className="space-y-2">
                <label className="block text-xs font-medium text-foreground">
                  Already paid? Enter 12-digit UPI Ref / UTR:
                </label>
                {utrError ? (
                  <p className="text-[11px] text-red-600">{utrError}</p>
                ) : null}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={utrNumber}
                    onChange={(e) => setUtrNumber(e.target.value)}
                    placeholder="e.g. 4312XXXXXXXX"
                    maxLength={20}
                    className="h-9 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary"
                  />
                  <button
                    type="submit"
                    disabled={!utrNumber.trim() || submittingUtr}
                    className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                  >
                    {submittingUtr ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    <span>Submit UTR</span>
                  </button>
                </div>
                <div className="pt-1">
                  <input
                    type="text"
                    value={payerUpiId}
                    onChange={(e) => setPayerUpiId(e.target.value)}
                    placeholder="Your UPI ID (optional, e.g. you@upi)"
                    className="h-7 w-full rounded-md border border-border/80 bg-background px-2.5 text-[11px] outline-none focus:border-primary"
                  />
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-muted/40 px-5 py-3 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Direct & Safe UPI Payments directly to Subidha merchant account</span>
          </div>
        </div>
      </div>
    </div>
  );
}
