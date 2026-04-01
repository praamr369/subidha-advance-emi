export type CsvColumn<T> = {
  key: keyof T | string;
  header: string;
  format?: (row: T) => string | number | null | undefined;
};

function escapeCsv(value: string): string {
  if (/[,"\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Client-side export from currently loaded rows.
// This does not pull additional server pages or hidden datasets.
export function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): void {
  const headerRow = columns.map((column) => escapeCsv(column.header)).join(",");

  const bodyRows = rows.map((row) => {
    const values = columns.map((column) => {
      const value = column.format
        ? column.format(row)
        : (row as Record<string, unknown>)[String(column.key)];
      return escapeCsv(String(value ?? ""));
    });

    return values.join(",");
  });

  const csv = [headerRow, ...bodyRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
