import type { ReactNode } from "react";

type DataTableProps = {
  headers: string[];
  rows: ReactNode[][];
};

export default function DataTable({ headers, rows }: DataTableProps) {
  return (
    <table className="min-w-full border-collapse rounded border bg-white">
      <thead>
        <tr>
          {headers.map((header) => (
            <th key={header} className="border p-2 text-left">{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`row-${index}`}>
            {row.map((cell, cellIndex) => (
              <td key={`cell-${index}-${cellIndex}`} className="border p-2">{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
