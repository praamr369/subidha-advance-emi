import { ShieldCheck, Sparkles, Wallet, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

const points = [
  {
    icon: Wallet,
    title: "Predictable monthly structure",
    description: "Know your EMI and tenure upfront before you join a batch.",
  },
  {
    icon: ShieldCheck,
    title: "Transparent winner publication",
    description: "Winner visibility comes from revealed draw records, not static marketing rows.",
  },
  {
    icon: Sparkles,
    title: "Future EMI waiver for winners",
    description: "Winning waives remaining future EMI only; already-paid EMI stays valid.",
  },
  {
    icon: MapPin,
    title: "Local branch trust",
    description: "Operated by Subidha Furniture in Asansol, West Bengal.",
  },
] as const;

export default function TrustStrip({ className }: { className?: string }) {
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
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-slate-950/90 text-white shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)]">
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
