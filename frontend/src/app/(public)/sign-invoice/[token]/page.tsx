"use client";

import Link from "next/link";
import React, { useEffect, useState, use } from "react";

import SignatureCanvas from "@/components/forms/SignatureCanvas";
import { formatDocumentDateTime, formatDocumentMoney } from "@/lib/documents/formatters";
import {
  getPublicDirectSaleSigningSummary,
  submitPublicDirectSaleSignature,
  type DirectSaleSigningPayload,
} from "@/services/billing";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function PublicDirectSaleSignPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const rawToken = resolvedParams?.token || "";
  const token = rawToken ? decodeURIComponent(rawToken) : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sale, setSale] = useState<DirectSaleSigningPayload | null>(null);

  const [signerType, setSignerType] = useState<"AUTHORIZED" | "CUSTOMER">("AUTHORIZED");
  const [signerName, setSignerName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!token) {
      setError("No invoice signing token provided.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    getPublicDirectSaleSigningSummary(token)
      .then((data) => {
        if (!mounted) return;
        setSale(data);
        if (data.customer_name) {
          setSignerName(data.customer_name);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load invoice details.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  const handleSignatureCanvasChange = (_file: File | null, dataUrl: string | null) => {
    setSignatureDataUrl(dataUrl);
    setSubmitError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signatureDataUrl) {
      setSubmitError("Please draw your signature in the box before submitting.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await submitPublicDirectSaleSignature(token, {
        signature_data: signatureDataUrl,
        signer_type: signerType,
        signer_name:
          signerName.trim() ||
          (signerType === "AUTHORIZED" ? "Subidha Furniture" : sale?.customer_name || "Customer"),
      });
      setIsSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit signature. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#8a5a22] border-t-transparent" />
          <p className="text-sm font-medium text-stone-600">Loading invoice details…</p>
        </div>
      </div>
    );
  }

  if (error || !sale) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-lg">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 text-xl font-bold">
            !
          </div>
          <h2 className="mt-3 text-lg font-bold text-stone-900">Unable to Open Invoice</h2>
          <p className="mt-2 text-sm text-stone-600">{error || "Invoice not found or link has expired."}</p>
          <div className="mt-6 border-t border-stone-200 pt-4 text-xs text-stone-500">
            For assistance, contact Subidha Furniture Showroom.
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 p-4 font-sans">
        <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl font-black text-stone-900">Signature Submitted!</h2>
          <p className="mt-2 text-sm text-stone-600">
            Digital signature for Invoice <strong className="text-stone-900">{sale.billing_invoice_no}</strong> has
            been securely saved and synced to the billing counter.
          </p>

          <div className="my-5 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-stone-500">Invoice No:</span>
              <span className="font-mono font-bold text-stone-900">{sale.billing_invoice_no}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Customer:</span>
              <span className="font-semibold text-stone-900">{sale.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Signed Role:</span>
              <span className="font-semibold text-[#8a5a22]">
                {signerType === "AUTHORIZED" ? "Authorized Signatory (Store)" : "Customer / Receiver"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Grand Total:</span>
              <span className="font-bold text-stone-900">{formatDocumentMoney(sale.grand_total)}</span>
            </div>
          </div>

          <p className="text-xs text-stone-500">
            You can now return to the desktop counter to print or save the document. You may safely close this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 px-3 py-6 font-sans text-stone-900">
      <div className="mx-auto max-w-lg space-y-4">
        {/* Brand Header */}
        <div className="rounded-2xl border border-[#d9c39c] bg-[#fffaf0] p-4 shadow-sm text-center">
          <div className="inline-block rounded-lg bg-[#8a5a22] px-3 py-1 text-xs font-black uppercase tracking-wider text-white">
            Subidha Furniture
          </div>
          <h1 className="mt-2 text-base font-black text-[#5e3818]">Showroom Invoice Digital Signing</h1>
          <p className="text-xs text-[#8a5a22]">Touchscreen Signature Pad</p>
        </div>

        {/* Invoice Summary Card */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Invoice Number</div>
              <div className="font-mono text-sm font-bold text-stone-900">{sale.billing_invoice_no}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Date</div>
              <div className="text-xs font-semibold text-stone-800">{sale.sale_date}</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-stone-500 block text-[11px]">Billed To:</span>
              <strong className="text-stone-900 font-semibold">{sale.customer_name}</strong>
              {sale.customer_phone && <p className="text-stone-500 text-[10px]">{sale.customer_phone}</p>}
            </div>
            <div className="text-right">
              <span className="text-stone-500 block text-[11px]">Grand Total:</span>
              <strong className="text-base font-black text-stone-900">
                {formatDocumentMoney(sale.grand_total)}
              </strong>
            </div>
          </div>

          {/* Line items preview (if available) */}
          {sale.lines && sale.lines.length > 0 && (
            <div className="mt-3 border-t border-stone-100 pt-2 text-[11px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">Items:</div>
              <div className="space-y-1">
                {sale.lines.map((ln, idx) => (
                  <div key={ln.id || idx} className="flex justify-between text-stone-700">
                    <span className="truncate pr-2">{ln.description}</span>
                    <span className="font-mono font-medium shrink-0">{formatDocumentMoney(ln.line_total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Existing Signature Notice if already signed */}
        {sale.has_signature && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <strong>Note:</strong> A signature has already been recorded for this invoice. Submitting below will update
            the signature.
          </div>
        )}

        {/* Signature Capture Form */}
        <form onSubmit={handleSubmit} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5">
              Select Signature Role:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSignerType("AUTHORIZED")}
                className={`rounded-xl border p-2.5 text-xs font-semibold transition ${
                  signerType === "AUTHORIZED"
                    ? "border-[#8a5a22] bg-[#fbf5ea] text-[#5e3818] shadow-xs"
                    : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                Store / Owner Sign
                <span className="block text-[10px] font-normal text-[#8a5a22] mt-0.5">
                  (For Subidha Furniture)
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSignerType("CUSTOMER")}
                className={`rounded-xl border p-2.5 text-xs font-semibold transition ${
                  signerType === "CUSTOMER"
                    ? "border-[#8a5a22] bg-[#fbf5ea] text-[#5e3818] shadow-xs"
                    : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                Customer Sign
                <span className="block text-[10px] font-normal text-[#8a5a22] mt-0.5">
                  (Customer / Receiver)
                </span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Signer Name (Optional):
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder={signerType === "AUTHORIZED" ? "Subidha Furniture" : sale.customer_name}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-[#8a5a22] focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Sign with your finger on the screen:
              </label>
            </div>

            <div className="rounded-xl border-2 border-dashed border-[#d9c39c] bg-[#fffdf9] p-2">
              <SignatureCanvas
                height={180}
                onChange={handleSignatureCanvasChange}
                label="Touchscreen Digital Signature"
              />
            </div>
          </div>

          {submitError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !signatureDataUrl}
            className="w-full rounded-xl bg-[#6f4e27] py-3 text-sm font-bold text-white shadow-md transition hover:bg-[#5e3818] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving Signature…" : "Save & Sync Signature"}
          </button>
        </form>
      </div>
    </div>
  );
}

