"use client";

import { MessageCircle } from "lucide-react";
import { documentCopyLabels, type DocumentCopyLabel } from "@/lib/documents/document-theme";

export type PrintDocumentFormat = "A4" | "THERMAL_80MM";

export function PrintToolbar({
  copyLabel,
  onCopyLabelChange,
  backHref,
  onWhatsAppShare,
  format = "A4",
  onFormatChange,
}: {
  copyLabel: DocumentCopyLabel;
  onCopyLabelChange: (value: DocumentCopyLabel) => void;
  backHref?: string;
  onWhatsAppShare?: () => void;
  format?: PrintDocumentFormat;
  onFormatChange?: (format: PrintDocumentFormat) => void;
}) {
  return (
    <div className="print-toolbar fixed inset-x-0 top-0 z-[1100] border-b border-border bg-background/95 px-4 py-3 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Document Preview</div>
          <div className="text-xs text-muted-foreground">
            {format === "THERMAL_80MM"
              ? "Previewing 80mm thermal receipt roll. Print directly to your POS counter printer."
              : "Use Print to save as PDF from your browser or send via WhatsApp."}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {backHref ? (
            <a href={backHref} className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted">
              Back
            </a>
          ) : null}
          {onFormatChange ? (
            <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              Layout
              <select
                value={format}
                onChange={(event) => onFormatChange(event.target.value as PrintDocumentFormat)}
                className="h-10 rounded-xl border border-border bg-card px-2.5 text-xs font-semibold text-foreground"
              >
                <option value="A4">A4 Standard</option>
                <option value="THERMAL_80MM">80mm POS Slip</option>
              </select>
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Copy
            <select
              value={copyLabel}
              onChange={(event) => onCopyLabelChange(event.target.value as DocumentCopyLabel)}
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground"
            >
              {documentCopyLabels.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {onWhatsAppShare ? (
            <button
              type="button"
              onClick={onWhatsAppShare}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 hover:bg-[#25D366]/20 px-3.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300 transition cursor-pointer"
              title="Send document link to customer on WhatsApp"
            >
              <MessageCircle className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>Send WhatsApp</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center rounded-xl bg-amber-900 px-4 text-sm font-semibold text-white hover:bg-amber-950"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
