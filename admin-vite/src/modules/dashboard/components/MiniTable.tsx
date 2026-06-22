type Column<T> = {
  label: string;
  render: (row: T) => React.ReactNode;
  className?: string;
};

type Props<T> = {
  data: T[];
  columns: Column<T>[];
  keyFn: (row: T) => string | number;
  emptyMessage?: string;
};

export function MiniTable<T>({ data, columns, keyFn, emptyMessage }: Props<T>) {
  if (data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-stone-400">
        {emptyMessage ?? "No data"}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-100">
            {columns.map((col) => (
              <th
                key={col.label}
                className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-stone-400"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={keyFn(row)} className="border-b border-stone-50">
              {columns.map((col) => (
                <td key={col.label} className={col.className ?? "px-3 py-2 text-stone-700"}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
