import type { ReactNode } from "react";

import DocumentHeader from "@/components/print/DocumentHeader";
import { PrintFooter, PrintNote } from "@/components/print/DocumentPrimitives";

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
    <section className="receipt-document print-doc-shell rounded-[1.6rem] border border-slate-300">
      <div className="space-y-3.5 p-4 sm:p-5">
        <DocumentHeader
          title={title}
          subtitle={subtitle}
          reference={reference}
          metaRows={[
            { label: "Scope", value: reference || "Current filter" },
            { label: "Rows", value: String(rows.length) },
          ]}
        />
        <div className="print-doc-section overflow-x-auto rounded-xl border border-slate-300 bg-white">
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
                <tr key={index} className="border-t border-slate-200 even:bg-slate-50/40">
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

        <PrintNote>{footerNote}</PrintNote>
        <PrintFooter leftText="Prepared from posted register rows" />
      </div>
    </section>
  );
}
