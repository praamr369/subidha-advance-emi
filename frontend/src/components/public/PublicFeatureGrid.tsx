import PublicAnimatedCard from "@/components/public/PublicAnimatedCard";

type PublicFeature = {
  title: string;
  description: string;
};

export default function PublicFeatureGrid({
  features,
  className,
}: {
  features: readonly PublicFeature[];
  className?: string;
}) {
  if (features.length === 0) {
    return null;
  }

  return (
    <div className={className ? className : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"}>
      {features.map((feature) => (
        <PublicAnimatedCard key={feature.title}>
          <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
        </PublicAnimatedCard>
      ))}
    </div>
  );
}
