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
    <table className="min-w-full border-collapse rounded border bg-white">
      <thead>
        <tr>
          <th className="border p-2 text-left">Customer</th>
          <th className="border p-2 text-left">Product</th>
          <th className="border p-2 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className="border p-2">{row.customerName}</td>
            <td className="border p-2">{row.product}</td>
            <td className="border p-2">{row.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
