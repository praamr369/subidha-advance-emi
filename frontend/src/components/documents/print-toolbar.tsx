"use client";

import { documentCopyLabels, type DocumentCopyLabel } from "@/lib/documents/document-theme";

export function PrintToolbar({
  copyLabel,
  onCopyLabelChange,
  backHref,
}: {
  copyLabel: DocumentCopyLabel;
  onCopyLabelChange: (value: DocumentCopyLabel) => void;
  backHref?: string;
}) {
  return (
    <div className="print-toolbar fixed inset-x-0 top-0 z-[1100] border-b border-border bg-background/95 px-4 py-3 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">Document Preview</div>
          <div className="text-xs text-muted-foreground">Use Print to save as PDF from your browser.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {backHref ? (
            <a href={backHref} className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted">
              Back
            </a>
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
