type ActiveCustomersCardProps = {
  value: number;
};

export default function ActiveCustomersCard({ value }: ActiveCustomersCardProps) {
  return <div className="rounded border bg-card p-4">Active Customers: {value}</div>;
}
