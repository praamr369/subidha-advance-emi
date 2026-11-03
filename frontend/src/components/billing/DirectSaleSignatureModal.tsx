"use client";

import React, { useEffect, useState, useRef } from "react";
import QRCode from "react-qr-code";
import { useRouter } from "next/navigation";

import SignatureCanvas from "@/components/forms/SignatureCanvas";
import { formatDocumentMoney } from "@/lib/documents/formatters";
import {
  getDirectSaleSigningLink,
  signDirectSale,
  type DirectSaleSigningPayload,
} from "@/services/billing";

interface DirectSaleSignatureModalProps {
  saleId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSignatureSaved?: () => void;
}

export default function DirectSaleSignatureModal({
  saleId,
  isOpen,
  onClose,
  onSignatureSaved,
}: DirectSaleSignatureModalProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DirectSaleSigningPayload | null>(null);
  const [copied, setCopied] = useState(false);

  // Active tab: "phone" (QR) vs "desktop" (on-screen canvas)
  const [activeTab, setActiveTab] = useState<"phone" | "desktop">("phone");

  // Desktop counter signing state
  const [desktopSignerType, setDesktopSignerType] = useState<"AUTHORIZED" | "CUSTOMER" | "BOTH">("AUTHORIZED");
  const [desktopDataUrl, setDesktopDataUrl] = useState<string | null>(null);
  const [submittingDesktop, setSubmittingDesktop] = useState(false);
  const [desktopError, setDesktopError] = useState<string | null>(null);

  // Polling ref to stop polling when unmounted or closed
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initial fetch
  useEffect(() => {
    if (!isOpen || !saleId) return;

    let mounted = true;
    setLoading(true);
    setError(null);
    setCopied(false);
    setDesktopError(null);
    setDesktopDataUrl(null);

    getDirectSaleSigningLink(saleId)
      .then((res) => {
        if (!mounted) return;
        setData(res);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load signing link.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, saleId]);

  // Live polling for phone signatures every 2.5 seconds
  useEffect(() => {
    if (!isOpen || !saleId) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const refreshed = await getDirectSaleSigningLink(saleId);
        setData((prev) => {
          // If a new signature arrived
          if (
            refreshed &&
            prev &&
            (!prev.authorized_signed && refreshed.authorized_signed ||
              !prev.customer_signed && refreshed.customer_signed)
          ) {
            onSignatureSaved?.();
          }
          return refreshed;
        });
      } catch {
        // Silently ignore background poll errors
      }
    }, 2500);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isOpen, saleId, onSignatureSaved]);

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
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDesktopSubmit = async () => {
    if (!saleId) return;
    if (!desktopDataUrl) {
      setDesktopError("Please draw signature on the canvas first.");
      return;
    }

    setSubmittingDesktop(true);
    setDesktopError(null);

    try {
      const updated = await signDirectSale(saleId, {
        signature_data: desktopDataUrl,
        signer_type: desktopSignerType,
        signer_name: desktopSignerType === "AUTHORIZED" ? "Subidha Furniture" : data?.customer_name || "Customer",
      });
      setData(updated);
      onSignatureSaved?.();
    } catch (err) {
      setDesktopError(err instanceof Error ? err.message : "Failed to save counter signature.");
    } finally {
      setSubmittingDesktop(false);
    }
  };

  const handleGoToPrint = () => {
    if (saleId) {
      router.push(`/admin/billing/direct-sale/${saleId}/print`);
      onClose();
    }
  };

  const cleanPhone = (data?.customer_phone || "").replace(/\D/g, "");
  const whatsappPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const whatsappMessage = `Dear ${data?.customer_name || "Customer"},\n\nYour Subidha Furniture invoice (${data?.billing_invoice_no || `#${saleId}`}) is ready for digital signature.\n\nPlease open this link on your phone to review and sign:\n${fullUrl}\n\nThank you,\nSubidha Furniture, Asansol`;
  const whatsappHref = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`;

  const hasAnySignature = Boolean(data?.authorized_signed || data?.customer_signed);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs font-sans">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#d9c39c] bg-[#fffdfa] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#ebdcc4] bg-[#faf3e8] px-5 py-3.5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a5a22]">
              Digital Signature Workflow
            </span>
            <h2 className="text-base font-black text-[#5e3818]">
              Sign Invoice {data?.billing_invoice_no || (saleId ? `#${saleId}` : "")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-5 space-y-4 text-xs text-stone-700">
          {/* Quick Invoice Stats */}
          {data && (
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#e8d7c0] bg-white p-3 shadow-2xs">
              <div>
                <span className="text-stone-400 block text-[10px] uppercase">Customer</span>
                <strong className="text-stone-900 truncate block text-xs">{data.customer_name}</strong>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase">Total Amount</span>
                <strong className="text-stone-900 block text-xs">{formatDocumentMoney(data.grand_total)}</strong>
              </div>
              <div>
                <span className="text-stone-400 block text-[10px] uppercase">Status</span>
                <span
                  className={`inline-block font-bold rounded px-1.5 py-0.5 text-[10px] ${
                    hasAnySignature ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {hasAnySignature ? "Signed" : "Pending Signature"}
                </span>
              </div>
            </div>
          )}

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 rounded-xl border border-stone-200 bg-stone-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("phone")}
              className={`rounded-lg py-1.5 text-xs font-bold transition ${
                activeTab === "phone"
                  ? "bg-white text-[#5e3818] shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              📱 Sign with Phone (QR)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("desktop")}
              className={`rounded-lg py-1.5 text-xs font-bold transition ${
                activeTab === "desktop"
                  ? "bg-white text-[#5e3818] shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              ✍️ Counter / Desktop Sign
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-stone-500">Generating secure signing link…</div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
          ) : activeTab === "phone" ? (
            /* Phone Tab (QR Code + Live Polling) */
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#d9c39c] bg-white p-5 text-center">
                <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-md">
                  <QRCode value={fullUrl} size={150} level="M" />
                </div>
                <p className="mt-3 text-xs font-semibold text-stone-800">
                  Scan QR code with your phone camera
                </p>
                <p className="text-[11px] text-stone-500 max-w-xs mt-0.5">
                  Opens touch signing pad immediately on your smartphone screen.
                </p>
              </div>

              {/* Share & Copy Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 shadow-2xs"
                >
                  {copied ? "✓ Copied Link" : "📋 Copy Link"}
                </button>

                {cleanPhone ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 shadow-2xs"
                  >
                    💬 Send to Customer WhatsApp
                  </a>
                ) : null}
              </div>

              {/* Live Status Indicator */}
              <div
                className={`rounded-xl border p-3 text-xs flex items-center justify-between ${
                  hasAnySignature
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-amber-200 bg-amber-50/70 text-amber-900"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      hasAnySignature ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                    }`}
                  />
                  <span>
                    {hasAnySignature
                      ? "✓ Signature received and synced!"
                      : "Waiting for phone signature… (Auto-sync active)"}
                  </span>
                </div>
                {hasAnySignature && (
                  <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide">
                    Ready to print
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* Desktop Tab (Counter Sign Directly on Screen) */
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-700 mb-1">
                  Select Role:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    ["AUTHORIZED", "Store / Owner"],
                    ["CUSTOMER", "Customer"],
                    ["BOTH", "Both Roles"],
                  ].map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDesktopSignerType(val as any)}
                      className={`rounded-lg py-1 px-2 text-[11px] font-medium border transition ${
                        desktopSignerType === val
                          ? "border-[#8a5a22] bg-[#fbf5ea] text-[#5e3818] font-bold"
                          : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-stone-700">Draw signature on screen:</span>
                </div>
                <div className="rounded-xl border-2 border-dashed border-[#d9c39c] bg-[#fffdfa] p-1.5">
                  <SignatureCanvas
                    height={140}
                    onChange={(_file, url) => setDesktopDataUrl(url)}
                    label="Counter Digital Signature"
                  />
                </div>
              </div>

              {desktopError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {desktopError}
                </div>
              )}

              <button
                type="button"
                onClick={handleDesktopSubmit}
                disabled={submittingDesktop || !desktopDataUrl}
                className="w-full rounded-xl bg-[#8a5a22] py-2 text-xs font-bold text-white shadow-xs hover:bg-[#6f4e27] disabled:opacity-50"
              >
                {submittingDesktop ? "Saving Signature…" : "Save Counter Signature"}
              </button>
            </div>
          )}

          {/* Signature Preview Thumbnail if captured */}
          {(data?.authorized_signature || data?.customer_signature) && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                Captured Signatures:
              </span>
              <div className="flex gap-4">
                {data.authorized_signature && (
                  <div className="text-center">
                    <img
                      src={data.authorized_signature}
                      alt="Authorized Signature"
                      className="h-10 border border-stone-200 bg-white rounded p-1 object-contain"
                    />
                    <span className="text-[9px] text-stone-500 block mt-0.5">Authorized Signatory</span>
                  </div>
                )}
                {data.customer_signature && (
                  <div className="text-center">
                    <img
                      src={data.customer_signature}
                      alt="Customer Signature"
                      className="h-10 border border-stone-200 bg-white rounded p-1 object-contain"
                    />
                    <span className="text-[9px] text-stone-500 block mt-0.5">Customer / Receiver</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[#ebdcc4] bg-[#faf3e8] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleGoToPrint}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#6f4e27] px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-[#5e3818]"
          >
            🖨️ Save &amp; Print Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

