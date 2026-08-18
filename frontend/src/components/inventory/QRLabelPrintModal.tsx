"use client";

import { useRef } from "react";
import QRCode from "react-qr-code";

export interface QRLabelItem {
  productName: string;
  productCode: string;
  sku?: string;
  qrValue: string;
  unitOfMeasure?: string;
}

interface Props {
  item: QRLabelItem;
  onClose: () => void;
}

export default function QRLabelPrintModal({ item, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=400,height=500");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Label — ${item.productCode}</title>
          <style>
            @page { size: 4in 3in; margin: 0; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Courier New', monospace; background: #fff; color: #000; }
            .label { width: 4in; height: 3in; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 12px; border: 1px solid #000; }
            .qr { display: flex; align-items: center; justify-content: center; }
            .name { font-size: 14px; font-weight: bold; text-align: center; max-width: 3.5in; word-break: break-word; }
            .code { font-size: 11px; font-weight: bold; letter-spacing: 0.05em; }
            .sku { font-size: 10px; color: #444; }
            .uom { font-size: 9px; color: #666; border-top: 1px dashed #ccc; padding-top: 4px; width: 100%; text-align: center; margin-top: 4px; }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="qr">${content.querySelector("svg")?.outerHTML ?? ""}</div>
            <div class="name">${escapeHtml(item.productName)}</div>
            <div class="code">${escapeHtml(item.productCode)}${item.sku ? ` · ${escapeHtml(item.sku)}` : ""}</div>
            ${item.unitOfMeasure ? `<div class="uom">Unit: ${escapeHtml(item.unitOfMeasure)}</div>` : ""}
            <div class="sku">${escapeHtml(item.qrValue)}</div>
          </div>
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    win.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">QR Code Label</h2>
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

        {/* Label preview — 4×3 inch warehouse label at screen scale */}
        <div className="flex flex-col items-center gap-4 p-6">
          <div
            ref={printRef}
            className="flex w-[280px] flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-white p-4 shadow-sm"
          >
            <QRCode
              value={item.qrValue}
              size={140}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
            <p className="text-center text-[13px] font-bold text-black leading-tight max-w-[240px]">
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
            <p className="text-[9px] text-gray-400 font-mono break-all text-center">
              {item.qrValue}
            </p>
          </div>

          <p className="text-xs text-muted-foreground text-center max-w-[240px]">
            4×3 inch warehouse label. Compatible with Zebra, TSC, and standard laser/inkjet printers.
          </p>
        </div>

        <div className="flex items-center gap-3 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
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
