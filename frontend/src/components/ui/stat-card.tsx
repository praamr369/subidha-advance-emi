type StatCardProps = {
  label: string;
  value: number | string;
};

export default function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-xl border p-6 shadow-sm bg-white">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-semibold mt-2">{value}</p>
    </div>
  );
}