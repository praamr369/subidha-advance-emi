type ActiveCustomersCardProps = {
  value: number;
};

export default function ActiveCustomersCard({ value }: ActiveCustomersCardProps) {
  return <div className="rounded border bg-white p-4">Active Customers: {value}</div>;
}
