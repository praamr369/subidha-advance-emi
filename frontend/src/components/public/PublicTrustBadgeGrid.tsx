type PublicTrustBadgeGridProps = {
  items: readonly { title: string; description: string }[];
};

export default function PublicTrustBadgeGrid({ items }: PublicTrustBadgeGridProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <article key={item.title} className="public-card p-4">
          <div className="text-sm font-semibold text-foreground">{item.title}</div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
        </article>
      ))}
    </section>
  );
}
