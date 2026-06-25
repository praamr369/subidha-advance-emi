type SubscriptionRow = {
  id: string;
  customerName: string;
  product: string;
  status: string;
};

type SubscriptionTableProps = {
  rows: SubscriptionRow[];
};

export default function SubscriptionTable({ rows }: SubscriptionTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card text-card-foreground">
      <table className="min-w-full border-collapse">
      <thead>
        <tr className="bg-muted/50">
          <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
            Customer
          </th>
          <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
            Product
          </th>
          <th className="border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
            Status
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-border last:border-0">
            <td className="px-3 py-2 text-sm text-foreground">{row.customerName}</td>
            <td className="px-3 py-2 text-sm text-foreground">{row.product}</td>
            <td className="px-3 py-2 text-sm text-foreground">{row.status}</td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  );
}
