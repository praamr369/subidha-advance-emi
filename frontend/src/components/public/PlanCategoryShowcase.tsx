import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import Link from "next/link";
import { Landmark, Home, Handshake, ShoppingBag } from "lucide-react";

import SectionHeader from "@/components/public/SectionHeader";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";



export default async function PlanCategoryShowcase({ className }: { className?: string }) {
  const locale = await getPublicLocale();
  const dict = getPublicDictionary(locale);

const categories = [
  {
    key: "advance-emi",
    title: dict.public.PlanCategoryShowcase_prop1,
    icon: Landmark,
    summary:
      "Structured monthly EMI for furniture purchase with transparent winner publishing. Winner benefit is future EMI waiver only.",
    forWho: "Best for customers who want ownership with predictable monthly commitments.",
    cta: { href: ROUTES.public.luckyPlan, label: dict.public.PlanCategoryShowcase_prop2 },
  },
  {
    key: "rent",
    title: dict.public.PlanCategoryShowcase_prop3,
    icon: Home,
    summary:
      "Flexible access where you pay for usage over time. Availability and eligibility depend on product readiness and branch workflow.",
    forWho: "Best for customers who want flexibility with shorter commitments.",
    cta: { href: ROUTES.public.rent, label: dict.public.PlanCategoryShowcase_prop4 },
  },
  {
    key: "lease",
    title: dict.public.PlanCategoryShowcase_prop5,
    icon: Handshake,
    summary:
      "Longer-term access with structured documentation and controlled operational steps. Availability depends on product readiness and branch workflow.",
    forWho: "Best for customers and partners who need longer-term, documented access.",
    cta: { href: ROUTES.public.lease, label: dict.public.PlanCategoryShowcase_prop6 },
  },
  {
    key: "direct-sale",
    title: dict.public.PlanCategoryShowcase_prop7,
    icon: ShoppingBag,
    summary:
      "Standard purchase flow with invoice, receipt, delivery controls, and warranty/service terms based on product and policy.",
    forWho: "Best for customers ready for normal purchase against invoice and receipt.",
    cta: { href: ROUTES.public.directSale, label: dict.public.PlanCategoryShowcase_prop8 },
  },
] as const;

  return (
    <section className={cn("public-surface space-y-6 p-6", className)}>
      <SectionHeader
        eyebrow={dict.public.PlanCategoryShowcase_attr9}
        title={dict.public.PlanCategoryShowcase_attr10}
        description={dict.public.PlanCategoryShowcase_attr11}
      >
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={ROUTES.public.apply} className="public-action-primary h-10 !min-h-0">
            Apply / Enquire
          </Link>
          <Link href={ROUTES.public.products} className="public-action-secondary h-10 !min-h-0">
            Browse products
          </Link>
        </div>
      </SectionHeader>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <div key={category.key} className="public-card p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-slate-950/90 text-white shadow-[0_16px_32px_-26px_rgba(15,23,42,0.72)]">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="text-base font-semibold text-foreground">{category.title}</div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{category.summary}</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                <span className="font-semibold text-foreground">{dict.public.PlanCategoryShowcase_text14}</span> {category.forWho}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href={category.cta.href}
                  className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
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

