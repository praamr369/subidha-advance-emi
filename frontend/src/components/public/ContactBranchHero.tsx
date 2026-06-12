import Link from "next/link";
import { ArrowRight, MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react";

import GeneratedMarketingVisual from "@/components/public/GeneratedMarketingVisual";
import type { ResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { PUBLIC_MARKETING_ASSETS } from "@/lib/public-marketing-assets";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

type ContactBranchHeroProps = {
  profile: ResolvedPublicBusinessProfile;
};

const proofPoints = [
  {
    icon: Phone,
    title: "Phone-first support",
    description: "Use contact details for product, plan, document, delivery, or branch visit guidance.",
  },
  {
    icon: MessageCircle,
    title: "Enquiry handoff",
    description: "Messages create public lead context only; staff review remains required.",
  },
  {
    icon: ShieldCheck,
    title: "No public financial posting",
    description: "Contact actions do not create subscriptions, payments, receipts, deposits, or accounting records.",
  },
] as const;

export default function ContactBranchHero({ profile }: ContactBranchHeroProps) {
  const phoneHref = profile.support_phone ? `tel:${profile.support_phone.replace(/\s+/g, "")}` : null;

  return (
    <section className="public-hero relative overflow-hidden p-5 sm:p-7 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(214,170,94,0.22),transparent_32%),radial-gradient(circle_at_16%_84%,rgba(112,72,42,0.14),transparent_34%)]" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_78%,transparent)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Contact and branch support
          </div>

          <div className="space-y-4">
            <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Contact {profile.resolved_display_name}
            </h1>
            <p className="max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
              Call, message, or visit for product guidance, Lucky Plan clarity, rent/lease suitability, direct-sale questions, documents, and delivery support.
            </p>
            <div className="public-card-sm max-w-3xl px-4 py-3 text-sm leading-6 text-muted-foreground">
              <strong className="font-semibold text-foreground">Important:</strong> Contact and message actions are support handoffs only. Final product allocation, plan approval, payment, receipt, deposit, and delivery records stay inside authenticated branch workflows.
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {phoneHref ? (
              <Link href={phoneHref} className="public-action-primary gap-2">
                Call branch
                <Phone className="h-4 w-4" />
              </Link>
            ) : null}
            {profile.resolved_whatsapp_link ? (
              <Link href={profile.resolved_whatsapp_link} className="public-action-secondary" target="_blank" rel="noopener noreferrer">
                WhatsApp
              </Link>
            ) : null}
            <Link href={ROUTES.public.apply} className={cn("gap-2", phoneHref ? "public-action-secondary" : "public-action-primary")}>
              Apply / Enquire
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="relative">
          <GeneratedMarketingVisual asset={PUBLIC_MARKETING_ASSETS.showroomPremiumInterior} className="min-h-[22rem] lg:min-h-[30rem]" />
          <div className="pointer-events-none absolute -left-3 top-8 hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Branch help</div>
            <div className="mt-1 text-sm font-semibold text-foreground">Plan guidance</div>
          </div>
          <div className="pointer-events-none absolute -right-3 bottom-8 hidden rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_84%,transparent)] px-4 py-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.74)] backdrop-blur md:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Visit support</div>
            <div className="mt-1 text-sm font-semibold text-foreground">Asansol branch</div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-6 grid gap-3 md:grid-cols-3">
        {proofPoints.map((point, index) => (
          <article
            key={point.title}
            className={cn(
              "public-card-sm public-card-animated px-4 py-4",
              index === 1 && "md:translate-y-3",
              index === 2 && "md:translate-y-1"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_14%,var(--surface-card-elevated)_86%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
                <point.icon className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold text-foreground">{point.title}</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{point.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
