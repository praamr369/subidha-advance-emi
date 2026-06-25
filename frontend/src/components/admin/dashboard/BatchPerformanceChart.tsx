type BatchPerformanceChartProps = {
  points: Array<{ label: string; value: number }>;
};

export default function BatchPerformanceChart({ points }: BatchPerformanceChartProps) {
  return (
    <div className="rounded border bg-card p-4">
      <h3 className="mb-2 font-semibold">Batch Performance</h3>
      <ul>
        {points.map((point) => (
          <li key={point.label}>{point.label}: {point.value}</li>
        ))}
      </ul>
    </div>
  );
}
