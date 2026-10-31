"use client";

import { useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { ExternalLink, Globe, QrCode as QrIcon } from "lucide-react";

export interface QRLabelItem {
  productName: string;
  productCode: string;
  sku?: string;
  qrValue: string;
  publicUrl?: string;
  unitOfMeasure?: string;
}

interface Props {
  item: QRLabelItem;
  onClose: () => void;
}

export default function QRLabelPrintModal({ item, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);
  const [encodeMode, setEncodeMode] = useState<"url" | "sku">("url");

  const origin = typeof window !== "undefined" && window.location.origin
    ? window.location.origin
    : "https://subidhafurnitureasansol.com";

  const publicUrl = useMemo(() => {
    if (item.publicUrl && item.publicUrl.startsWith("http")) {
      return item.publicUrl;
    }
    const code = item.productCode || item.sku || "";
    if (!code) return item.qrValue;
    const base = `${origin}/products/${encodeURIComponent(code)}`;
    return item.sku && item.sku !== item.productCode
      ? `${base}?sku=${encodeURIComponent(item.sku)}`
      : base;
  }, [item, origin]);

  const activeQrValue = encodeMode === "url" ? publicUrl : (item.sku || item.productCode || item.qrValue);

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=400,height=500");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Label — ${escapeHtml(item.productCode)}</title>
          <style>
            @page { size: 4in 3in; margin: 0; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Courier New', monospace; background: #fff; color: #000; }
            .label { width: 4in; height: 3in; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 12px; border: 1px solid #000; }
            .qr { display: flex; align-items: center; justify-content: center; }
            .name { font-size: 13px; font-weight: bold; text-align: center; max-width: 3.5in; word-break: break-word; line-height: 1.2; }
            .code { font-size: 11px; font-weight: bold; letter-spacing: 0.05em; }
            .sku { font-size: 10px; color: #222; font-family: monospace; }
            .hint { font-size: 8.5px; color: #555; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
            .uom { font-size: 9px; color: #666; border-top: 1px dashed #ccc; padding-top: 3px; width: 100%; text-align: center; margin-top: 2px; }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="qr">${content.querySelector("svg")?.outerHTML ?? ""}</div>
            <div class="name">${escapeHtml(item.productName)}</div>
            <div class="code">${escapeHtml(item.productCode)}${item.sku ? ` · ${escapeHtml(item.sku)}` : ""}</div>
            ${item.unitOfMeasure ? `<div class="uom">Unit: ${escapeHtml(item.unitOfMeasure)}</div>` : ""}
            <div class="hint">${encodeMode === "url" ? "Scan with phone for full specs, price &amp; 3D AR" : "Warehouse SKU Label"}</div>
            <div class="sku">${escapeHtml(encodeMode === "url" ? (item.sku || item.productCode) : activeQrValue)}</div>
          </div>
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    win.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <QrIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Product QR Label</h2>
              <p className="text-xs text-muted-foreground">Compatible with customer phone scans and admin POS billing</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* QR Mode Switcher */}
        <div className="px-6 pt-4 pb-1">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setEncodeMode("url")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 transition-all ${
                encodeMode === "url"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Globe className="h-3.5 w-3.5 text-primary" />
              <span>Public Webpage (Recommended)</span>
            </button>
            <button
              type="button"
              onClick={() => setEncodeMode("sku")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 transition-all ${
                encodeMode === "sku"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <QrIcon className="h-3.5 w-3.5" />
              <span>Raw SKU Only</span>
            </button>
          </div>
        </div>

        {/* Label preview — 4×3 inch warehouse label at screen scale */}
        <div className="flex flex-col items-center gap-3 p-6 pt-3">
          <div
            ref={printRef}
            className="flex w-[290px] flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-white p-4 shadow-sm"
          >
            <QRCode
              value={activeQrValue}
              size={135}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
            <p className="text-center text-[12.5px] font-bold text-black leading-tight max-w-[250px]">
              {item.productName}
            </p>
            <p className="text-center text-[11px] font-semibold tracking-wide text-black">
              {item.productCode}{item.sku ? ` · ${item.sku}` : ""}
            </p>
            {item.unitOfMeasure && (
              <p className="text-[9px] text-gray-500 border-t border-gray-200 pt-1 w-full text-center">
                Unit: {item.unitOfMeasure}
              </p>
            )}
            <p className="text-[8.5px] text-gray-600 font-semibold tracking-tight uppercase text-center">
              {encodeMode === "url" ? "Scan to view specs, price & 3D AR" : "Warehouse SKU"}
            </p>
            <p className="text-[8.5px] text-gray-400 font-mono break-all text-center max-w-[260px] line-clamp-1">
              {encodeMode === "url" ? (item.sku || item.productCode) : activeQrValue}
            </p>
          </div>

          {encodeMode === "url" && (
            <div className="w-full max-w-[340px] rounded-xl border border-border/80 bg-muted/40 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span className="font-semibold text-foreground">Scanned Destination:</span>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Test webpage <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="mt-1 font-mono text-[10.5px] text-muted-foreground break-all line-clamp-2">
                {publicUrl}
              </p>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground text-center max-w-[280px]">
            4×3 inch label. Compatible with Zebra, TSC, and standard laser/inkjet printers.
          </p>
        </div>

        <div className="flex items-center gap-3 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            Print Label
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}