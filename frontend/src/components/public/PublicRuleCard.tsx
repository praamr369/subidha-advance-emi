type PublicRuleCardProps = {
  title: string;
  points: readonly string[];
};

export default function PublicRuleCard({ title, points }: PublicRuleCardProps) {
  return (
    <article className="public-card p-5">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
        {points.map((point) => (
          <li key={point} className="rounded-lg border border-white/75 bg-white/70 px-3 py-2">
            {point}
          </li>
        ))}
      </ul>
    </article>
  );
}
