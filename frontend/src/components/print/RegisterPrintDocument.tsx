import type { ReactNode } from "react";

import DocumentHeader from "@/components/print/DocumentHeader";

type RegisterPrintDocumentProps = {
  title: string;
  subtitle?: string;
  reference?: string;
  headers: string[];
  rows: ReactNode[][];
};

export default function RegisterPrintDocument({
  title,
  subtitle,
  reference,
  headers,
  rows,
}: RegisterPrintDocumentProps) {
  return (
    <section className="rounded-3xl border border-border bg-card shadow-sm">
      <div className="space-y-6 p-5 sm:p-6">
        <DocumentHeader title={title} subtitle={subtitle} reference={reference} />
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-muted/60">
              <tr>
                {headers.map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-border">
                  {row.map((cell, cellIndex) => (
                    <td key={`${index}-${cellIndex}`} className="px-4 py-3 text-foreground">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

