import type { ReactNode } from "react";

type DataTableProps = {
  headers: string[];
  rows: ReactNode[][];
};

export default function DataTable({ headers, rows }: DataTableProps) {
  return (
    <div className="table-surface-frame">
      <table className="min-w-full border-collapse bg-card text-sm">
        <thead className="border-b border-border bg-[color-mix(in_oklab,var(--surface-muted)_86%,white_14%)]">
        <tr>
          {headers.map((header) => (
            <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {header}
            </th>
          ))}
        </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`row-${index}`} className="border-b border-border/80">
            {row.map((cell, cellIndex) => (
                <td key={`cell-${index}-${cellIndex}`} className="px-4 py-3 text-foreground">
                  {cell}
                </td>
            ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
