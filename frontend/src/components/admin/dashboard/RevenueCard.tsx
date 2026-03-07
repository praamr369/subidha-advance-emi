type RevenueCardProps = {
  value: number;
};

export default function RevenueCard({ value }: RevenueCardProps) {
  return <div className="rounded border bg-white p-4">Revenue: ₹ {value}</div>;
}
