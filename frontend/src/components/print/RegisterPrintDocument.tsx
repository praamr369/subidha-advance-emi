import type { ReactNode } from "react";

import {
  DocumentFooter,
  DocumentHeader,
  DocumentShell,
  PrintablePaper,
} from "@/components/documents";

type RegisterPrintDocumentProps = {
  title: string;
  subtitle?: string;
  reference?: string;
  headers: string[];
  rows: ReactNode[][];
  footerNote?: string;
};

export default function RegisterPrintDocument({
  title,
  subtitle,
  reference,
  headers,
  rows,
  footerNote = "This register is generated from posted records in the selected reporting scope for business filing.",
}: RegisterPrintDocumentProps) {
  return (
    <PrintablePaper>
      <DocumentShell>
        <DocumentHeader
          title={title}
          subtitle={subtitle}
          metaFields={[
            { label: "Scope", value: reference || "Current filter" },
            { label: "Rows", value: String(rows.length) },
          ]}
        />
        <div className="print-doc-section overflow-x-auto rounded-xl border border-border bg-card">
          <table className="min-w-full border-collapse text-[11px] leading-[1.45]">
            <thead className="print-doc-accent">
              <tr>
                {headers.map((header) => (
                  <th
                    key={header}
                    className="px-3 py-2 text-left text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-600"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-border even:bg-slate-50/40">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`${index}-${cellIndex}`}
                      className="px-3 py-2.5 align-top text-slate-900 break-words"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="print-doc-note print-doc-section rounded-xl border border-border bg-card px-3.5 py-3 text-[13px] leading-5 text-slate-700">
          {footerNote}
        </div>
        <DocumentFooter leftText="Prepared from posted register rows" />
      </DocumentShell>
    </PrintablePaper>
  );
}
