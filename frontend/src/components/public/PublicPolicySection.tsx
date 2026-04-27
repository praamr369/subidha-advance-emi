import PublicRuleCard from "@/components/public/PublicRuleCard";

type PublicPolicySectionProps = {
  id: string;
  title: string;
  intro: string;
  cards: readonly { title: string; points: readonly string[] }[];
};

export default function PublicPolicySection({ id, title, intro, cards }: PublicPolicySectionProps) {
  return (
    <section id={id} className="public-surface p-6">
      <details open>
        <summary className="cursor-pointer list-none">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Policy section</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground sm:text-base">{intro}</p>
        </summary>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {cards.map((card) => (
            <PublicRuleCard key={card.title} title={card.title} points={card.points} />
          ))}
        </div>
      </details>
    </section>
  );
}
