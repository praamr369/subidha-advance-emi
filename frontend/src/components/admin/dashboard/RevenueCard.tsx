type RevenueCardProps = {
  value: number;
};

export default function RevenueCard({ value }: RevenueCardProps) {
  return <div className="rounded border bg-card p-4">Revenue: ₹ {value}</div>;
}
