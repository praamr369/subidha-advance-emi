type LedgerEntry = {
  id: string;
  postedAt: string;
  amount: number;
  mode: string;
};

type PaymentLedgerProps = {
  entries: LedgerEntry[];
};

export default function PaymentLedger({ entries }: PaymentLedgerProps) {
  return (
    <section className="rounded border bg-card p-4">
      <h3 className="mb-3 text-lg font-semibold">Payment Ledger</h3>
      <div className="space-y-2">
        {entries.map((entry) => (
          <article key={entry.id} className="rounded border p-2">
            <p>Date: {entry.postedAt}</p>
            <p>Amount: ₹ {entry.amount}</p>
            <p>Mode: {entry.mode}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
