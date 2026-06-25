type SubscriptionHistoryItem = {
  id: string;
  batchCode: string;
  status: string;
  startedOn: string;
};

type SubscriptionHistoryProps = {
  subscriptions: SubscriptionHistoryItem[];
};

export default function SubscriptionHistory({ subscriptions }: SubscriptionHistoryProps) {
  return (
    <section className="rounded border bg-card p-4">
      <h3 className="mb-3 text-lg font-semibold">Subscription History</h3>
      <ul className="space-y-2">
        {subscriptions.map((subscription) => (
          <li key={subscription.id} className="rounded border p-2">
            <p>Batch: {subscription.batchCode}</p>
            <p>Status: {subscription.status}</p>
            <p>Started: {subscription.startedOn}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
