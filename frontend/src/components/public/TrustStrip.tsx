import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { ShieldCheck, Sparkles, Wallet, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

export default async function TrustStrip({ className }: { className?: string }) {
  const locale = await getPublicLocale();
  const dict = getPublicDictionary(locale);
    const points = [
      {
        icon: Wallet,
        title: dict.public.TrustStrip_prop1,
        description: dict.public.TrustStrip_prop2,
      },
      {
        icon: ShieldCheck,
        title: dict.public.TrustStrip_prop3,
        description: dict.public.TrustStrip_prop4,
      },
      {
        icon: Sparkles,
        title: dict.public.TrustStrip_prop5,
        description: dict.public.TrustStrip_prop6,
      },
      {
        icon: MapPin,
        title: dict.public.TrustStrip_prop7,
        description: dict.public.TrustStrip_prop8,
      },
    ] as const;

  return (
    <section
      className={cn(
        "public-surface grid gap-3 p-6 sm:grid-cols-2 xl:grid-cols-4",
        className
      )}
    >
      {points.map((point) => (
        <div
          key={point.title}
          className="public-card p-5"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-slate-950/90 text-white shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)]">
              <point.icon className="h-5 w-5" />
            </span>
            <div className="text-sm font-semibold text-foreground">
              {point.title}
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {point.description}
          </p>
        </div>
      ))}
    </section>
  );
}
