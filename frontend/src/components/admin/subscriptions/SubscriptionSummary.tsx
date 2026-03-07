type SubscriptionSummaryProps = {
  totalEmi: number;
  paidEmi: number;
  overdueEmi: number;
};

export default function SubscriptionSummary({ totalEmi, paidEmi, overdueEmi }: SubscriptionSummaryProps) {
  return (
    <section className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-3">
      <div>Total EMI: {totalEmi}</div>
      <div>Paid EMI: {paidEmi}</div>
      <div>Overdue EMI: {overdueEmi}</div>
    </section>
  );
}
