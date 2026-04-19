import Link from "next/link";
import { Landmark, Home, Handshake } from "lucide-react";

import SectionHeader from "@/components/public/SectionHeader";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const categories = [
  {
    key: "advance-emi",
    title: "Advance EMI (Lucky Plan)",
    icon: Landmark,
    summary:
      "Structured monthly EMI for furniture purchase with transparent winner publishing. Winner benefit is future EMI waiver only.",
    forWho: "Best for customers who want ownership with predictable monthly commitments.",
    cta: { href: ROUTES.public.luckyPlan, label: "Understand Lucky Plan" },
  },
  {
    key: "rent",
    title: "Rent",
    icon: Home,
    summary:
      "Flexible access where you pay for usage over time. Availability and eligibility depend on product readiness and branch workflow.",
    forWho: "Best for customers who want flexibility with shorter commitments.",
    cta: { href: ROUTES.public.contact, label: "Ask about rent" },
  },
  {
    key: "lease",
    title: "Lease",
    icon: Handshake,
    summary:
      "Longer-term access with structured documentation and controlled operational steps. Availability depends on product readiness and branch workflow.",
    forWho: "Best for customers and partners who need longer-term, documented access.",
    cta: { href: ROUTES.public.contact, label: "Ask about lease" },
  },
] as const;

export default function PlanCategoryShowcase({ className }: { className?: string }) {
  return (
    <section className={cn("public-surface space-y-6 p-6", className)}>
      <SectionHeader
        eyebrow="Plan categories"
        title="Advance EMI, Rent, and Lease"
        description="The public site explains plan categories clearly. Availability depends on the product and branch readiness."
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={ROUTES.public.apply}
            className="inline-flex h-10 items-center rounded-xl border border-slate-950/10 bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5"
          >
            Apply / Enquire
          </Link>
          <Link
            href={ROUTES.public.products}
            className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
          >
            Browse products
          </Link>
        </div>
      </SectionHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <div key={category.key} className="public-card p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-slate-950/90 text-white shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)]">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="text-base font-semibold text-foreground">{category.title}</div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{category.summary}</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                <span className="font-semibold text-foreground">For:</span> {category.forWho}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={category.cta.href}
                  className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
                >
                  {category.cta.label}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

