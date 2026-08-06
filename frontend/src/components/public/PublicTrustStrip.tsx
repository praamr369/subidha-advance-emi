import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { ShieldCheck, Sparkles, Wallet, MapPin } from "lucide-react";

import PublicAnimatedCard from "@/components/public/PublicAnimatedCard";

export default async function PublicTrustStrip() {
  const locale = await getPublicLocale();
  const dict = getPublicDictionary(locale);
    const points = [
      {
        icon: Wallet,
        title: dict.public.PublicTrustStrip_prop1,
        description: dict.public.PublicTrustStrip_prop2,
      },
      {
        icon: ShieldCheck,
        title: dict.public.PublicTrustStrip_prop3,
        description: dict.public.PublicTrustStrip_prop4,
      },
      {
        icon: Sparkles,
        title: dict.public.PublicTrustStrip_prop5,
        description: dict.public.PublicTrustStrip_prop6,
      },
      {
        icon: MapPin,
        title: dict.public.PublicTrustStrip_prop7,
        description: dict.public.PublicTrustStrip_prop8,
      },
    ] as const;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {points.map((point) => (
        <PublicAnimatedCard key={point.title} className="public-trust-badge p-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_18%,var(--surface-card-elevated)_82%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
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
