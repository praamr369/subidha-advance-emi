import { ShieldCheck, Sparkles, Wallet, MapPin } from "lucide-react";

import PublicAnimatedCard from "@/components/public/PublicAnimatedCard";

const points = [
  {
    icon: Wallet,
    title: "Predictable monthly structure",
    description: "Know EMI and tenure expectations before enrollment.",
  },
  {
    icon: ShieldCheck,
    title: "Transparent winner publication",
    description: "Only revealed draw records appear on public winner pages.",
  },
  {
    icon: Sparkles,
    title: "Future EMI waiver only",
    description: "Winner benefit applies only to future dues as per policy.",
  },
  {
    icon: MapPin,
    title: "Asansol branch support",
    description: "Local onboarding and support through Subidha Furniture staff.",
  },
] as const;

export default function PublicTrustStrip() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {points.map((point) => (
        <PublicAnimatedCard key={point.title} className="public-trust-badge p-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/80 bg-slate-900 text-white">
              <point.icon className="h-4 w-4" />
            </span>
            <div className="text-sm font-semibold text-foreground">{point.title}</div>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{point.description}</p>
        </PublicAnimatedCard>
      ))}
    </section>
  );
}
