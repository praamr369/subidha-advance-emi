"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  Printer,
  QrCode,
  RefreshCw,
  Share2,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";

import { formatRupee } from "@/lib/utils/currency";
import { getPublicBusinessProfile, type PublicBusinessProfile } from "@/services/public";
import { subidhaDocumentTheme } from "@/lib/documents/document-theme";
import {
  buildClientDirectWhatsAppUrl,
  normalizePhone,
} from "@/services/whatsapp";
import { openWhatsAppDirectModal } from "@/components/whatsapp/WhatsAppDirectSenderModal";

export type UpiQrPreset = {
  label: string;
  amount: number | string;
  description?: string;
  defaultNote?: string;
};

export interface DynamicUpiQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  referenceNo?: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: number | null;
  defaultAmount?: number | string;
  presets?: UpiQrPreset[];
  sourceType?: "DIRECT_SALE" | "SUBSCRIPTION" | "EMI" | "CUSTOM";
  sourceId?: number | string;
}

export default function DynamicUpiQrModal({
  isOpen,
  onClose,
  title,
  subtitle,
  referenceNo = "",
  customerName = "",
  customerPhone = "",
  customerId = null,
  defaultAmount = 0,
  presets = [],
  sourceType = "DIRECT_SALE",
  sourceId,
}: DynamicUpiQrModalProps) {
  const [profile, setProfile] = useState<PublicBusinessProfile | null>(null);
  const [amountInput, setAmountInput] = useState<string>("");
  const [noteInput, setNoteInput] = useState<string>("");
  const [phoneInput, setPhoneInput] = useState<string>("");
  const [nameInput, setNameInput] = useState<string>("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedQrUrl, setCopiedQrUrl] = useState(false);
  const [copiedUpiId, setCopiedUpiId] = useState(false);

  const qrContainerRef = useRef<HTMLDivElement>(null);

  // Initialize values when opened
  useEffect(() => {
    if (!isOpen) return;

    // Set initial amount from default or first preset
    const initialAmt =
      defaultAmount !== undefined && defaultAmount !== null && Number(defaultAmount) > 0
        ? String(defaultAmount)
        : presets.length > 0 && Number(presets[0].amount) > 0
        ? String(presets[0].amount)
        : "";

    setAmountInput(initialAmt);
    setPhoneInput(customerPhone || "");
    setNameInput(customerName || "");

    const initialPreset =
      presets.find((p) => Number(p.amount) === Number(initialAmt)) || presets[0];

    const defaultNote =
      initialPreset?.defaultNote ||
      (sourceType === "DIRECT_SALE"
        ? `Invoice ${referenceNo}`.trim()
        : sourceType === "SUBSCRIPTION"
        ? `SFEMI ${referenceNo}`.trim()
        : `Payment ${referenceNo}`.trim());
    setNoteInput(defaultNote);

    getPublicBusinessProfile()
      .then((data) => {
        if (data) setProfile(data);
      })
      .catch(() => {});
  }, [isOpen, defaultAmount, presets, customerPhone, customerName, referenceNo, sourceType]);

  // Fallback to configured or standard Subidha UPI
  const resolvedUpiId =
    (profile?.upi_id || "").trim() ||
    (subidhaDocumentTheme.upiId || "").trim() ||
    "subidha@upi";

  const resolvedMerchantName =
    (profile?.merchant_name || profile?.display_name || "").trim() ||
    subidhaDocumentTheme.businessName ||
    "Subidha Furniture";

  const numAmount = useMemo(() => {
    const clean = String(amountInput).replace(/[^0-9.]/g, "");
    const n = parseFloat(clean);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amountInput]);

  // NPCI Standard UPI URI (with exact price & merchant encoded)
  const upiUri = useMemo(() => {
    const params = new URLSearchParams();
    params.set("pa", resolvedUpiId);
    params.set("pn", resolvedMerchantName);
    if (numAmount > 0) {
      params.set("am", numAmount.toFixed(2));
    }
    params.set("cu", "INR");
    if (noteInput.trim()) {
      params.set("tn", noteInput.trim());
    }
    return `upi://pay?${params.toString()}`;
  }, [resolvedUpiId, resolvedMerchantName, numAmount, noteInput]);

  // Free Public QR Code API Image URL (Quick, reliable, CORS-friendly cloud QR generator)
  const freeApiQrUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(
      upiUri
    )}`;
  }, [upiUri]);

  // Pre-composed WhatsApp message for direct customer delivery
  const whatsappMessageText = useMemo(() => {
    const custName = nameInput.trim() || "Customer";
    const refText = referenceNo.trim() ? ` · Ref: ${referenceNo.trim()}` : "";
    const noteText = noteInput.trim() ? `\n📝 Purpose: ${noteInput.trim()}` : "";

    return (
      `नमस्ते / Dear ${custName},\n\n` +
      `Here is your UPI payment request from *${resolvedMerchantName}*${refText}:\n\n` +
      `💰 *Amount Payable: ${formatRupee(numAmount)}*\n` +
      `💳 *UPI ID:* \`${resolvedUpiId}\`${noteText}\n\n` +
      `👉 *1-Click Pay on Mobile (GPay / PhonePe / Paytm / BHIM):*\n` +
      `${upiUri}\n\n` +
      `📱 *Or View / Scan QR Code Image:*\n` +
      `${freeApiQrUrl}\n\n` +
      `Thank you for choosing ${resolvedMerchantName}!`
    );
  }, [nameInput, referenceNo, resolvedMerchantName, numAmount, resolvedUpiId, noteInput, upiUri, freeApiQrUrl]);

  // Direct WhatsApp Web / Mobile Link
  const directWhatsAppLink = useMemo(() => {
    return buildClientDirectWhatsAppUrl({
      phone: phoneInput,
      text: whatsappMessageText,
      target: "app",
    });
  }, [phoneInput, whatsappMessageText]);

  function handleCopy(text: string, setCopied: (v: boolean) => void) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleQuickAdd(addAmt: number) {
    const current = numAmount;
    setAmountInput(String(current + addAmt));
  }

  // Download QR code image as PNG using client-side Canvas
  function handleDownloadQr() {
    const svgElement = qrContainerRef.current?.querySelector("svg");
    if (!svgElement) return;

    try {
      const svgXml = new XMLSerializer().serializeToString(svgElement);
      const svgDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgXml)}`;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const padding = 32;
        canvas.width = img.width + padding * 2;
        canvas.height = img.height + padding * 2 + 70; // extra space for text

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // White background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Border card
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 2;
        ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

        // Draw QR
        ctx.drawImage(img, padding, padding);

        // Text below QR
        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
          `Pay ${formatRupee(numAmount)}`,
          canvas.width / 2,
          img.height + padding + 28
        );

        ctx.font = "normal 12px monospace";
        ctx.fillStyle = "#64748b";
        ctx.fillText(resolvedUpiId, canvas.width / 2, img.height + padding + 48);

        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        const safeRef = (referenceNo || "payment").replace(/[^a-zA-Z0-9_-]/g, "_");
        downloadLink.download = `UPI-QR-${safeRef}-${Math.round(numAmount)}.png`;
        downloadLink.href = pngUrl;
        downloadLink.click();
      };
      img.src = svgDataUri;
    } catch {
      // Fallback: Open free API QR in new tab for direct saving
      window.open(freeApiQrUrl, "_blank");
    }
  }

  // Print counter slip
  function handlePrintSlip() {
    const printWindow = window.open("", "_blank", "width=420,height=600");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>UPI Payment QR - ${referenceNo || "Counter"}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              margin: 0;
              padding: 16px;
              color: #111;
              text-align: center;
            }
            .card {
              border: 1.5px dashed #999;
              border-radius: 12px;
              padding: 16px;
              max-width: 320px;
              margin: 0 auto;
            }
            h2 { margin: 0 0 4px; font-size: 16px; font-weight: 800; text-transform: uppercase; }
            p { margin: 2px 0; font-size: 12px; color: #555; }
            .amt-box {
              background: #f8fafc;
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              padding: 8px;
              margin: 12px 0;
            }
            .amt { font-size: 24px; font-weight: 900; color: #0f172a; margin: 0; }
            .qr-wrap { margin: 12px auto; display: inline-block; padding: 8px; background: #fff; border: 1px solid #eee; border-radius: 8px; }
            .qr-wrap img { width: 180px; height: 180px; display: block; }
            .upi { font-family: monospace; font-size: 11px; font-weight: 700; color: #334155; margin-top: 6px; }
            .note { font-size: 11px; color: #64748b; margin-top: 4px; }
            .apps { font-size: 10px; color: #888; margin-top: 12px; border-top: 1px dashed #ccc; padding-top: 8px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>${resolvedMerchantName}</h2>
            <p>${referenceNo ? `Invoice / Ref: ${referenceNo}` : "Counter Payment"}</p>
            <div class="amt-box">
              <p style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Amount Payable</p>
              <div class="amt">${formatRupee(numAmount)}</div>
            </div>
            <div class="qr-wrap">
              <img src="${freeApiQrUrl}" alt="UPI QR" />
            </div>
            <div class="upi">UPI ID: ${resolvedUpiId}</div>
            ${noteInput ? `<div class="note">Note: ${noteInput}</div>` : ""}
            <div class="apps">Works with GPay · PhonePe · Paytm · BHIM · Cred · Any UPI App</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  // Open Subidha's full-featured WhatsApp sender modal
  function handleOpenWhatsAppHub() {
    openWhatsAppDirectModal({
      phone: phoneInput || "",
      name: nameInput || "",
      customerId: customerId,
      eventType: "CUSTOM",
      text: whatsappMessageText,
      amount: numAmount > 0 ? numAmount : undefined,
      ref: referenceNo || undefined,
      sourceModel: sourceType === "DIRECT_SALE" ? "DirectSale" : "Subscription",
      sourceId: sourceId ? String(sourceId) : undefined,
    });
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/80 bg-card/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <QrCode className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">
                  {title || "Dynamic UPI Payment QR"}
                </h3>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  Direct Price Written
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {subtitle ||
                  (referenceNo
                    ? `${resolvedMerchantName} · Reference: ${referenceNo}`
                    : resolvedMerchantName)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Top Presets & Amount Controls */}
          <div className="space-y-3 rounded-2xl border border-border/80 bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Select Price Preset or Setup Manual Price
              </span>
              {referenceNo && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {referenceNo}
                </span>
              )}
            </div>

            {/* Presets Chips */}
            {presets.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {presets.map((p, idx) => {
                    const amtVal = Number(p.amount) || 0;
                    const isSelected = numAmount === amtVal && amtVal > 0;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setAmountInput(String(amtVal));
                          if (p.defaultNote) {
                            setNoteInput(p.defaultNote);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer border ${
                          isSelected
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                            : "bg-background text-foreground border-border hover:bg-muted hover:border-border/80"
                        }`}
                      >
                        <span>{p.label}</span>
                        <span className={isSelected ? "text-indigo-100" : "text-emerald-600 dark:text-emerald-400 font-mono"}>
                          {formatRupee(amtVal)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {presets.find((p) => Number(p.amount) === numAmount && numAmount > 0)?.description && (
                  <div className="text-[11px] text-indigo-800 dark:text-indigo-300 bg-indigo-50/80 dark:bg-indigo-950/60 px-3 py-1 rounded-lg border border-indigo-200/60 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-indigo-500 shrink-0" />
                    <span>{presets.find((p) => Number(p.amount) === numAmount)?.description}</span>
                  </div>
                )}
              </div>
            )}

            {/* Manual Price Input & Quick Adjusters */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                  Payable Amount (₹) · Written in QR
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="Enter custom amount..."
                    className="w-full rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-base font-bold font-mono text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                  Payment Purpose / Note
                </label>
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="e.g. Invoice INV-001 or EMI Deposit"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Quick Increment Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-muted-foreground font-medium mr-1">
                Quick Add:
              </span>
              {[100, 500, 1000, 2000, 5000].map((add) => (
                <button
                  key={add}
                  type="button"
                  onClick={() => handleQuickAdd(add)}
                  className="rounded-lg border border-border bg-card px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted transition"
                >
                  +{add}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmountInput("")}
                className="rounded-lg border border-rose-200 bg-rose-50/50 px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 transition ml-auto"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Central QR Display & Details Grid */}
          <div className="grid gap-6 sm:grid-cols-12 items-center">
            {/* Left/Center: QR Card */}
            <div className="sm:col-span-6 flex flex-col items-center justify-center">
              <div
                ref={qrContainerRef}
                className="relative flex flex-col items-center rounded-2xl border-2 border-indigo-500/20 bg-gradient-to-b from-white to-slate-50 p-5 shadow-lg dark:from-slate-900 dark:to-slate-950"
              >
                {/* Brand & Price Header */}
                <div className="text-center mb-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    {resolvedMerchantName}
                  </div>
                  <div className="mt-0.5 text-2xl font-black font-mono text-slate-900 dark:text-white">
                    {formatRupee(numAmount)}
                  </div>
                  <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                    ✓ Price locked in QR
                  </span>
                </div>

                {/* QR Code Container */}
                <div className="rounded-xl bg-white p-3 shadow-inner border border-slate-200 dark:border-slate-800">
                  <QRCode
                    value={upiUri}
                    size={170}
                    level="M"
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  />
                </div>

                {/* UPI ID Strip */}
                <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-700 dark:text-slate-300">
                  <span>{resolvedUpiId}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(resolvedUpiId, setCopiedUpiId)}
                    className="text-muted-foreground hover:text-foreground transition ml-1"
                    title="Copy UPI ID"
                  >
                    {copiedUpiId ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>

                {/* UPI Apps Strip */}
                <div className="mt-2 text-[9px] text-slate-600 dark:text-slate-400 font-semibold tracking-wide">
                  GPay · PhonePe · Paytm · BHIM · Any UPI
                </div>
              </div>
            </div>

            {/* Right: Sharing & Delivery Actions */}
            <div className="sm:col-span-6 space-y-4">
              {/* Customer recipient details */}
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                  Send to Customer
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-muted-foreground block">Customer Name</label>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Customer name"
                      className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block">Phone Number</label>
                    <input
                      type="text"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="10-digit mobile"
                      className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Primary Actions: Send on WhatsApp */}
              <div className="space-y-2">
                {/* 1-Click WhatsApp Direct Open */}
                <a
                  href={directWhatsAppLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white shadow transition"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Send via WhatsApp (Direct {phoneInput ? `to ${phoneInput}` : ""})</span>
                  <ExternalLink className="h-3 w-3 ml-1 opacity-70" />
                </a>

                {/* Open in Subidha WhatsApp Modal (with attachments & history) */}
                <button
                  type="button"
                  onClick={handleOpenWhatsAppHub}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50 px-4 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 transition cursor-pointer"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>Customize in WhatsApp Sender Hub</span>
                </button>
              </div>

              {/* Utility Actions: Copy Link, Download, Print */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleCopy(upiUri, setCopiedLink)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted px-3 py-2 font-medium text-foreground transition cursor-pointer"
                >
                  {copiedLink ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>{copiedLink ? "Link Copied!" : "Copy UPI Link"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted px-3 py-2 font-medium text-foreground transition cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Download PNG</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintSlip}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted px-3 py-2 font-medium text-foreground transition cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Print POS Slip</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopy(freeApiQrUrl, setCopiedQrUrl)}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted px-3 py-2 font-medium text-foreground transition cursor-pointer"
                  title="Copy free cloud-hosted QR image URL"
                >
                  {copiedQrUrl ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span>{copiedQrUrl ? "URL Copied!" : "Copy QR Image URL"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Free Cloud QR API Information Strip */}
          <div className="rounded-xl border border-indigo-200/60 bg-indigo-50/40 dark:bg-indigo-950/20 dark:border-indigo-800/40 p-3 text-xs text-indigo-950 dark:text-indigo-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <span className="font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
                🌐 Free Public QR API Integration
              </span>
              <p className="text-[11px] text-muted-foreground">
                Cloud-hosted live QR image link pre-filled with ₹{numAmount.toFixed(2)}. Instantly viewable by customers on WhatsApp, SMS, or any browser.
              </p>
            </div>
            <a
              href={freeApiQrUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition"
            >
              <span>Test / View QR Link</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border/80 bg-muted/20 px-6 py-3 text-xs text-muted-foreground">
          <span>
            Standard NPCI UPI Specification · Encoded: <code className="font-mono text-[10px]">cu=INR&am={numAmount.toFixed(2)}</code>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-card px-3 py-1 font-semibold text-foreground hover:bg-muted transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
