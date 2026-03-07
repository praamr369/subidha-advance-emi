type LuckyDrawRecord = {
  drawDate: string;
  batchCode: string;
  outcome: "WON" | "NOT_WON";
};

type LuckyDrawHistoryProps = {
  records: LuckyDrawRecord[];
};

export default function LuckyDrawHistory({ records }: LuckyDrawHistoryProps) {
  return (
    <section className="rounded border bg-white p-4">
      <h3 className="mb-3 text-lg font-semibold">Lucky Draw History</h3>
      <ul className="space-y-2">
        {records.map((record) => (
          <li key={`${record.batchCode}-${record.drawDate}`} className="rounded border p-2">
            <p>Batch: {record.batchCode}</p>
            <p>Date: {record.drawDate}</p>
            <p>Outcome: {record.outcome}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
