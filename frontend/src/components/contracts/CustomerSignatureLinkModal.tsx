"use client";

import React, { useEffect, useState } from "react";
import QRCode from "react-qr-code";

import SignatureCanvas from "@/components/forms/SignatureCanvas";
import { formatDocumentDateTime } from "@/lib/documents/formatters";
import {
  getAdminContractSigningLink,
  submitPublicContractSignature,
  type AdminContractSigningLink,
} from "@/services/contract-signing";

interface CustomerSignatureLinkModalProps {
  subscriptionId: number;
  isOpen: boolean;
  onClose: () => void;
  onSignatureUpdated?: () => void;
}

export default function CustomerSignatureLinkModal({
  subscriptionId,
  isOpen,
  onClose,
  onSignatureUpdated,
}: CustomerSignatureLinkModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminContractSigningLink | null>(null);
  const [copied, setCopied] = useState(false);

  // Counter signing state
  const [showCounterSign, setShowCounterSign] = useState(false);
  const [counterFile, setCounterFile] = useState<File | null>(null);
  const [counterDataUrl, setCounterDataUrl] = useState<string | null>(null);
  const [submittingCounter, setSubmittingCounter] = useState(false);
  const [counterError, setCounterError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !subscriptionId) return;

    let mounted = true;
    setLoading(true);
    setError(null);
    setCopied(false);
    setShowCounterSign(false);

    getAdminContractSigningLink(subscriptionId)
      .then((res) => {
        if (!mounted) return;
        setData(res);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load contract signing link.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, subscriptionId]);

  if (!isOpen) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const fullUrl = data?.signing_path
    ? `${origin}${data.signing_path}`
    : data?.signing_url || "";

  const handleCopy = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const cleanPhone = (data?.customer_phone || "").replace(/\D/g, "");
  const whatsappPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  const whatsappMessage = `Dear ${data?.customer_name || "Customer"},\n\nAs a registered customer of Subidha Furniture, your ${data?.plan_type || "contract"} (${data?.contract_ref}) for ${data?.product_name || "your order"} is ready for digital signature on our webapp.\n\nPlease open this secure link on your smartphone to review and sign:\n${fullUrl}\n\nOnce signed, your contract will be securely saved in your Subidha customer account.\n\nThank you,\nSubidha Furniture, Asansol`;

  const whatsappHref = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`;

  const supportPhone = data?.support_phone || "+91 94764 90946";
  const emailSubject = `Subidha Furniture Webapp — Digital Signature Required for Contract ${data?.contract_ref}`;
  const emailBody = `Dear ${data?.customer_name || "Customer"},\n\nAs a registered customer of Subidha Furniture, your ${data?.plan_type || "contract"} (${data?.contract_ref}) for ${data?.product_name || "your order"} has been prepared and is ready for your digital signature.\n\nPlease click the secure link below to review the contract terms and sign digitally:\n\n${fullUrl}\n\nAfter signing, your agreement will be immediately accessible in your Subidha Webapp account under "My Contracts".\n\nWarm regards,\nSubidha Furniture, Asansol\nPhone: ${supportPhone}`;

  const emailHref = `mailto:${data?.customer_email || ""}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  const smsHref = `sms:${cleanPhone}?body=${encodeURIComponent(`Subidha Furniture: Dear registered customer, please review and sign your contract ${data?.contract_ref} on our webapp at ${fullUrl}`)}`;

  const handleCounterSubmit = async () => {
    if (!data?.token) return;
    if (!counterFile && !counterDataUrl) {
      setCounterError("Please draw customer signature first.");
      return;
    }

    setSubmittingCounter(true);
    setCounterError(null);

    try {
      await submitPublicContractSignature(data.token, {
        signature_data: counterDataUrl || undefined,
        signature_image: counterFile || undefined,
        customer_name_confirmation: data.customer_name,
      });

      // Refresh link state
      const refreshed = await getAdminContractSigningLink(subscriptionId);
      setData(refreshed);
      setShowCounterSign(false);
      onSignatureUpdated?.();
    } catch (err) {
      setCounterError(err instanceof Error ? err.message : "Failed to record signature.");
    } finally {
      setSubmittingCounter(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-base font-bold text-foreground">
              Customer Mobile Signature Link
            </h3>
            <p className="text-xs text-muted-foreground">
              Send direct signing link to customer via WhatsApp, Gmail, or SMS
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-2">Generating secure signing link...</p>
          </div>
        ) : error ? (
          <div className="my-4 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
            {error}
          </div>
        ) : data ? (
          <div className="mt-4 space-y-4">
            {/* Status Banner */}
            {data.has_signature ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                <div className="font-bold flex items-center gap-1.5">
                  <span className="text-emerald-700 font-black">✓</span>
                  <span>Customer Signature is Already Attached</span>
                </div>
                {data.signed_at ? (
                  <div className="mt-1 text-[11px] text-emerald-700">
                    Recorded on: {formatDocumentDateTime(data.signed_at)}
                  </div>
                ) : null}
                {data.signature_url ? (
                  <div className="mt-2 flex h-16 w-48 items-center justify-center rounded-lg border border-emerald-200 bg-white p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={data.signature_url}
                      alt="Signature"
                      className="max-h-14 max-w-full object-contain"
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <strong>Signature Pending:</strong> Customer has not signed this contract yet. Share the link below to collect their signature.
              </div>
            )}

            {/* Recipient Details */}
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs">
              <div>
                <span className="text-muted-foreground">Customer:</span>
                <div className="font-semibold text-foreground">{data.customer_name}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Contract Ref:</span>
                <div className="font-semibold text-foreground">{data.contract_ref}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Phone:</span>
                <div className="font-semibold text-foreground">{data.customer_phone || "Not set"}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span>
                <div className="font-semibold text-foreground">{data.customer_email || "Not set"}</div>
              </div>
            </div>

            {/* Link Copy Box */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Secure Signing URL</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={fullUrl}
                  className="flex-1 rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs font-mono text-foreground"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground shadow-sm transition hover:opacity-95"
                >
                  {copied ? "✓ Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Direct Send Action Buttons */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-2">Send Directly:</div>
              <div className="grid grid-cols-3 gap-2">
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50/80 p-2.5 text-center transition hover:bg-emerald-100"
                >
                  <span className="text-lg">💬</span>
                  <span className="text-xs font-bold text-emerald-900">WhatsApp</span>
                </a>

                <a
                  href={emailHref}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-col items-center justify-center gap-1 rounded-xl border border-sky-300 bg-sky-50/80 p-2.5 text-center transition hover:bg-sky-100"
                >
                  <span className="text-lg">📧</span>
                  <span className="text-xs font-bold text-sky-900">Gmail / Email</span>
                </a>

                <a
                  href={smsHref}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl border border-amber-300 bg-amber-50/80 p-2.5 text-center transition hover:bg-amber-100"
                >
                  <span className="text-lg">📱</span>
                  <span className="text-xs font-bold text-amber-900">SMS</span>
                </a>
              </div>
            </div>

            {/* Scan QR Code or Counter Tablet Signing */}
            <div className="flex flex-wrap items-center justify-between border-t border-border pt-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-white p-1">
                  <QRCode value={fullUrl} size={40} />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  <div className="font-semibold text-foreground">Scan with Phone</div>
                  Point phone camera at screen to open.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCounterSign(!showCounterSign)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <span>✍</span>
                <span>{showCounterSign ? "Hide Pad" : "Sign on Counter Now"}</span>
              </button>
            </div>

            {/* Inline Counter Signing Pad */}
            {showCounterSign ? (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Customer Signature Pad (Counter Mode)
                </div>
                <SignatureCanvas
                  height={130}
                  label="Draw signature with touch or mouse"
                  onChange={(file, dataUrl) => {
                    setCounterFile(file);
                    setCounterDataUrl(dataUrl);
                    setCounterError(null);
                  }}
                />
                {counterError ? (
                  <div className="text-xs text-destructive">{counterError}</div>
                ) : null}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCounterSubmit}
                    disabled={submittingCounter || (!counterFile && !counterDataUrl)}
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {submittingCounter ? "Saving..." : "Save Signature"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Modal Close Footer */}
        <div className="mt-5 border-t border-border pt-3 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export { CustomerSignatureLinkModal };

