type SubscriptionSummaryProps = {
  totalEmi: number;
  paidEmi: number;
  overdueEmi: number;
};

export default function SubscriptionSummary({ totalEmi, paidEmi, overdueEmi }: SubscriptionSummaryProps) {
  return (
    <section className="grid gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-[var(--surface-muted)] px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">Total EMI</div>
        <div className="mt-1 text-sm font-semibold text-foreground">{totalEmi}</div>
      </div>
      <div className="rounded-lg border border-border bg-[var(--surface-muted)] px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">Paid EMI</div>
        <div className="mt-1 text-sm font-semibold text-foreground">{paidEmi}</div>
      </div>
      <div className="rounded-lg border border-border bg-[var(--surface-muted)] px-3 py-2">
        <div className="text-xs font-medium text-muted-foreground">Overdue EMI</div>
        <div className="mt-1 text-sm font-semibold text-foreground">{overdueEmi}</div>
      </div>
    </section>
  );
}
