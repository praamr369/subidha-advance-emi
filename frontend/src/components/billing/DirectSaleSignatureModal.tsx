"use client";

import React, { useEffect, useState, useRef } from "react";
import QRCode from "react-qr-code";
import { useRouter } from "next/navigation";

import SignatureCanvas from "@/components/forms/SignatureCanvas";
import { formatDocumentMoney } from "@/lib/documents/formatters";
import {
  getDirectSaleSigningLink,
  signDirectSale,
  recallDirectSaleSignature,
  type DirectSaleSigningPayload,
} from "@/services/billing";

interface DirectSaleSignatureModalProps {
  saleId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSignatureSaved?: () => void;
  initialRole?: "CUSTOMER" | "AUTHORIZED" | "BOTH";
  initialTab?: "phone" | "desktop";
}

export default function DirectSaleSignatureModal({
  saleId,
  isOpen,
  onClose,
  onSignatureSaved,
  initialRole,
  initialTab,
}: DirectSaleSignatureModalProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DirectSaleSigningPayload | null>(null);
  const [copied, setCopied] = useState(false);

  // Active tab: "phone" (QR) vs "desktop" (on-screen canvas)
  const [activeTab, setActiveTab] = useState<"phone" | "desktop">(initialTab || "phone");

  // Phone tab role target: "CUSTOMER" (default for mobile) vs "AUTHORIZED"
  const [phoneRole, setPhoneRole] = useState<"CUSTOMER" | "AUTHORIZED">(
    initialRole === "AUTHORIZED" ? "AUTHORIZED" : "CUSTOMER"
  );

  // Desktop counter signing state
  const [desktopSignerType, setDesktopSignerType] = useState<"AUTHORIZED" | "CUSTOMER" | "BOTH">(
    initialRole || "CUSTOMER"
  );
  const [desktopDataUrl, setDesktopDataUrl] = useState<string | null>(null);
  const [submittingDesktop, setSubmittingDesktop] = useState(false);
  const [desktopError, setDesktopError] = useState<string | null>(null);

  // Recall / history state
  const [recalling, setRecalling] = useState(false);
  const [recallSuccess, setRecallSuccess] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Polling ref to stop polling when unmounted or closed
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Reset tab & roles if props change
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
    if (initialRole) {
      setDesktopSignerType(initialRole);
      setPhoneRole(initialRole === "AUTHORIZED" ? "AUTHORIZED" : "CUSTOMER");
    }
  }, [initialTab, initialRole]);

  // Initial fetch
  useEffect(() => {
    if (!isOpen || !saleId) return;

    let mounted = true;
    setLoading(true);
    setError(null);
    setCopied(false);
    setDesktopError(null);
    setDesktopDataUrl(null);
    setRecallSuccess(null);

    getDirectSaleSigningLink(saleId)
      .then((res) => {
        if (!mounted) return;
        setData(res);

        // Smart preset if initialRole not passed explicitly
        if (!initialRole) {
          if (res.customer_signed && !res.authorized_signed) {
            setDesktopSignerType("AUTHORIZED");
            setPhoneRole("AUTHORIZED");
          } else if (res.authorized_signed && !res.customer_signed) {
            setDesktopSignerType("CUSTOMER");
            setPhoneRole("CUSTOMER");
          }
        }
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
  }, [isOpen, saleId, initialRole]);

  // Live polling for phone signatures every 2.5 seconds
  useEffect(() => {
    if (!isOpen || !saleId) return;

    pollIntervalRef.current = setInterval(async () => {
      try {
        const refreshed = await getDirectSaleSigningLink(saleId);
        setData((prev) => {
          if (
            refreshed &&
            prev &&
            ((!prev.authorized_signed && refreshed.authorized_signed) ||
              (!prev.customer_signed && refreshed.customer_signed))
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

  const customerUrl = data?.customer_signing_path
    ? `${origin}${data.customer_signing_path}`
    : data?.signing_path
    ? `${origin}${data.signing_path}${data.signing_path.includes("?") ? "&" : "?"}role=customer`
    : "";

  const authorizedUrl = data?.authorized_signing_path
    ? `${origin}${data.authorized_signing_path}`
    : data?.signing_path
    ? `${origin}${data.signing_path}${data.signing_path.includes("?") ? "&" : "?"}role=authorized`
    : "";

  const activePhoneUrl = phoneRole === "AUTHORIZED" ? authorizedUrl : customerUrl;

  const handleCopy = async () => {
    if (!activePhoneUrl) return;
    try {
      await navigator.clipboard.writeText(activePhoneUrl);
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
    setRecallSuccess(null);

    try {
      const updated = await signDirectSale(saleId, {
        signature_data: desktopDataUrl,
        signer_type: desktopSignerType,
        signer_name:
          desktopSignerType === "AUTHORIZED"
            ? "Subidha Furniture"
            : data?.customer_name || "Customer",
      });
      setData(updated);
      setDesktopDataUrl(null);
      onSignatureSaved?.();
    } catch (err) {
      setDesktopError(err instanceof Error ? err.message : "Failed to save counter signature.");
    } finally {
      setSubmittingDesktop(false);
    }
  };

  const handleRecallAction = async (
    action: "assign_to_customer" | "copy_to_customer" | "swap" | "restore_from_history",
    historyIndex?: number,
    targetRole?: "CUSTOMER" | "AUTHORIZED"
  ) => {
    if (!saleId) return;
    setRecalling(true);
    setDesktopError(null);
    setRecallSuccess(null);

    try {
      const updated = await recallDirectSaleSignature(saleId, {
        action,
        history_index: historyIndex,
        target_role: targetRole,
      });
      setData(updated);
      setRecallSuccess(
        action === "assign_to_customer"
          ? "Assigned signature to Customer. Store signature is now ready to sign!"
          : action === "swap"
          ? "Customer and Store signatures swapped successfully."
          : action === "copy_to_customer"
          ? "Copied signature to Customer acceptance successfully."
          : `Restored signature to ${targetRole || "Customer"} successfully.`
      );
      onSignatureSaved?.();
    } catch (err) {
      setDesktopError(err instanceof Error ? err.message : "Failed to recall signature.");
    } finally {
      setRecalling(false);
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
  const whatsappMessage = `Dear ${data?.customer_name || "Customer"},\n\nYour Subidha Furniture invoice (${data?.billing_invoice_no || `#${saleId}`}) is ready for customer signature.\n\nPlease open this link on your smartphone to review and sign:\n${customerUrl}\n\nThank you,\nSubidha Furniture, Asansol`;
  const whatsappHref = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappMessage)}`;

  const bothSigned = Boolean(data?.authorized_signed && data?.customer_signed);
  const storeOnlySigned = Boolean(data?.authorized_signed && !data?.customer_signed);
  const customerOnlySigned = Boolean(data?.customer_signed && !data?.authorized_signed);

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs font-sans">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#d9c39c] bg-[#fffdfa] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
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
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700 cursor-pointer"
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
                <span className="text-stone-400 block text-[10px] uppercase">Signatures</span>
                <span
                  className={`inline-block font-bold rounded px-1.5 py-0.5 text-[10px] ${
                    bothSigned
                      ? "bg-emerald-100 text-emerald-800"
                      : data.customer_signed || data.authorized_signed
                      ? "bg-blue-100 text-blue-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {bothSigned
                    ? "✓ Both Signed"
                    : data.customer_signed
                    ? "Customer Signed"
                    : data.authorized_signed
                    ? "Store Signed"
                    : "Pending Signatures"}
                </span>
              </div>
            </div>
          )}

          {/* Mode Tabs */}
          <div className="grid grid-cols-2 rounded-xl border border-stone-200 bg-stone-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("phone")}
              className={`rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                activeTab === "phone"
                  ? "bg-white text-[#5e3818] shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              📱 Sign with Phone (QR / WhatsApp)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("desktop")}
              className={`rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                activeTab === "desktop"
                  ? "bg-white text-[#5e3818] shadow-xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              ✍️ Counter / Desktop Sign
            </button>
          </div>

          {/* Recall / Recovery Banner if customer signature is missing while store signature exists */}
          {storeOnlySigned && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-base">⚠️</span>
                <div>
                  <strong className="block font-bold">Customer signature not yet assigned:</strong>
                  <span>
                    Store signature is recorded, but Customer signature is empty. If the customer drew their
                    signature and it was saved as Store / Authorized, you can recall and assign it to Customer:
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={recalling}
                  onClick={() => handleRecallAction("assign_to_customer")}
                  className="rounded-lg bg-amber-700 px-3 py-1 text-xs font-bold text-white hover:bg-amber-800 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {recalling ? "Recalling…" : "↩️ Assign to Customer Signature"}
                </button>
                <button
                  type="button"
                  disabled={recalling}
                  onClick={() => handleRecallAction("swap")}
                  className="rounded-lg border border-amber-600 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
                >
                  🔄 Swap Roles
                </button>
              </div>
            </div>
          )}

          {recallSuccess && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-900 flex items-center gap-1.5">
              <span>✓</span>
              <span>{recallSuccess}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-stone-500">Generating secure signing link…</div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>
          ) : activeTab === "phone" ? (
            /* Phone Tab (QR Code + WhatsApp + Live Polling) */
            <div className="space-y-4">
              {/* Target Role Selector for Phone */}
              <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-2">
                <span className="text-[11px] font-bold text-stone-700 uppercase tracking-wide">
                  Phone QR Target:
                </span>
                <div className="inline-flex rounded-lg border border-stone-300 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setPhoneRole("CUSTOMER")}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      phoneRole === "CUSTOMER"
                        ? "bg-[#8a5a22] text-white shadow-2xs"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    👤 Customer Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhoneRole("AUTHORIZED")}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                      phoneRole === "AUTHORIZED"
                        ? "bg-[#8a5a22] text-white shadow-2xs"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    🏬 Store / Owner
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#d9c39c] bg-white p-5 text-center">
                <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-md">
                  <QRCode value={activePhoneUrl || ""} size={150} level="M" />
                </div>
                <p className="mt-3 text-xs font-semibold text-stone-800">
                  {phoneRole === "CUSTOMER"
                    ? "Scan to sign as Customer / Receiver"
                    : "Scan to sign as Store / Owner"}
                </p>
                <p className="text-[11px] text-stone-500 max-w-xs mt-0.5">
                  Touch signing pad opens immediately on phone. Signature auto-syncs to this invoice.
                </p>
              </div>

              {/* Share & Copy Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 shadow-2xs cursor-pointer"
                >
                  {copied ? "✓ Copied Link" : "📋 Copy Link"}
                </button>

                {cleanPhone && phoneRole === "CUSTOMER" ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 shadow-2xs cursor-pointer"
                  >
                    💬 Send to Customer WhatsApp
                  </a>
                ) : null}
              </div>

              {/* Live Status Indicators for Both Parties */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div
                  className={`rounded-xl border p-2.5 ${
                    data?.customer_signed
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-amber-200 bg-amber-50/70 text-amber-900"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        data?.customer_signed ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                      }`}
                    />
                    <span>Customer Signature</span>
                  </div>
                  <span className="text-[10px] block mt-0.5 text-stone-600">
                    {data?.customer_signed ? "✓ Synced & Recorded" : "Waiting for signature…"}
                  </span>
                </div>

                <div
                  className={`rounded-xl border p-2.5 ${
                    data?.authorized_signed
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : "border-stone-200 bg-stone-50 text-stone-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        data?.authorized_signed ? "bg-emerald-500" : "bg-stone-400"
                      }`}
                    />
                    <span>Store Signature</span>
                  </div>
                  <span className="text-[10px] block mt-0.5 text-stone-600">
                    {data?.authorized_signed ? "✓ Recorded" : "Pending counter sign"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop Tab (Counter Sign Directly on Screen) */
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-700 mb-1">
                  Select Role to Sign:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    ["CUSTOMER", "Customer / Receiver"],
                    ["AUTHORIZED", "Store / Owner"],
                    ["BOTH", "Both Roles"],
                  ].map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDesktopSignerType(val as any)}
                      className={`rounded-lg py-1 px-2 text-[11px] font-medium border transition cursor-pointer ${
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
                  <span className="text-[11px] font-semibold text-stone-700">
                    Draw signature for{" "}
                    <strong>
                      {desktopSignerType === "AUTHORIZED"
                        ? "Store / Owner"
                        : desktopSignerType === "CUSTOMER"
                        ? `Customer (${data?.customer_name || "Customer"})`
                        : "Both Parties"}
                    </strong>
                    :
                  </span>
                </div>
                <div className="rounded-xl border-2 border-dashed border-[#d9c39c] bg-[#fffdfa] p-1.5">
                  <SignatureCanvas
                    height={140}
                    onChange={(_file, url) => setDesktopDataUrl(url)}
                    label={`${desktopSignerType} Digital Signature`}
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
                className="w-full rounded-xl bg-[#8a5a22] py-2 text-xs font-bold text-white shadow-xs hover:bg-[#6f4e27] disabled:opacity-50 cursor-pointer"
              >
                {submittingDesktop ? "Saving Signature…" : `Save ${desktopSignerType === "AUTHORIZED" ? "Store" : "Customer"} Signature`}
              </button>
            </div>
          )}

          {/* Captured Signatures Preview */}
          {(data?.authorized_signature || data?.customer_signature) && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                  Captured Invoice Signatures:
                </span>
                {data.signature_history && data.signature_history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHistory(!showHistory)}
                    className="text-[10px] font-semibold text-[#8a5a22] hover:underline cursor-pointer"
                  >
                    {showHistory ? "Hide History" : `Audit History (${data.signature_history.length})`}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-stone-200 bg-white p-2 text-center">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-stone-500 block mb-1">
                    Customer / Receiver
                  </span>
                  {data.customer_signature ? (
                    <>
                      <img
                        src={data.customer_signature}
                        alt="Customer Signature"
                        className="h-10 mx-auto object-contain"
                      />
                      <span className="text-[9px] text-emerald-700 font-semibold block mt-1">✓ Recorded</span>
                    </>
                  ) : (
                    <div className="py-2 text-[10px] text-amber-700 italic">Not signed yet</div>
                  )}
                </div>

                <div className="rounded-lg border border-stone-200 bg-white p-2 text-center">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-stone-500 block mb-1">
                    For Subidha Furniture
                  </span>
                  {data.authorized_signature ? (
                    <>
                      <img
                        src={data.authorized_signature}
                        alt="Authorized Signature"
                        className="h-10 mx-auto object-contain"
                      />
                      <span className="text-[9px] text-emerald-700 font-semibold block mt-1">✓ Recorded</span>
                    </>
                  ) : (
                    <div className="py-2 text-[10px] text-amber-700 italic">Not signed yet</div>
                  )}
                </div>
              </div>

              {/* History list for recall */}
              {showHistory && data.signature_history && data.signature_history.length > 0 && (
                <div className="mt-2 border-t border-stone-200 pt-2 space-y-1.5">
                  <span className="text-[10px] font-bold text-stone-600 block">
                    Signature Audit Trail (Click to Restore):
                  </span>
                  {data.signature_history.map((hist, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-1.5 text-[10px]"
                    >
                      <div>
                        <strong>{hist.signer_type}</strong> - {hist.signer_name || "Signer"}
                        <span className="text-stone-400 block text-[9px]">{hist.signed_at}</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={recalling}
                          onClick={() => handleRecallAction("restore_from_history", hist.index, "CUSTOMER")}
                          className="rounded border border-stone-300 bg-stone-50 px-1.5 py-0.5 text-[9px] font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50 cursor-pointer"
                        >
                          As Customer
                        </button>
                        <button
                          type="button"
                          disabled={recalling}
                          onClick={() => handleRecallAction("restore_from_history", hist.index, "AUTHORIZED")}
                          className="rounded border border-stone-300 bg-stone-50 px-1.5 py-0.5 text-[9px] font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-50 cursor-pointer"
                        >
                          As Store
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[#ebdcc4] bg-[#faf3e8] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleGoToPrint}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#6f4e27] px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-[#5e3818] cursor-pointer"
          >
            🖨️ View &amp; Print Invoice
          </button>
        </div>
      </div>
    </div>
  );
}
