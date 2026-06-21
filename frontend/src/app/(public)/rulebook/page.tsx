import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";

import CtaBanner from "@/components/public/CtaBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import { PUBLIC_LEGAL_DISCLAIMER_POINTS, RULEBOOK_SECTIONS } from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Rulebook",
  description:
    "Customer-friendly public rulebook covering Lucky Plan structure, monthly draw rules, winner waiver, payment discipline, rent/lease, delivery, and cancellation.",
  path: "/rulebook",
});

export default function RulebookPage() {
  return (
    <PublicPageShell
      title="Lucky Plan Rulebook"
      subtitle="A plain-language guide to how the Lucky Plan works, what the draw rules are, and what customers should expect — before and after enrollment."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Rulebook" },
      ]}
      hero={{
        eyebrow: "Public rules reference",
        badges: ["Lucky Plan", "Draw rules", "Rent / Lease", "Payments", "Delivery"],
      }}
      actions={[
        { label: "View FAQ", href: ROUTES.public.faq, variant: "secondary" },
        { label: "Apply / Enquire", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <div className="rounded-[1.5rem] border border-amber-200/70 bg-amber-50/60 px-5 py-4 text-sm leading-6 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <strong className="font-semibold">This is an explanatory public rulebook.</strong> It is
            written in plain language for customer understanding. Final rights and obligations are
            governed by your approved contract, invoice, receipt, and official business policy
            documents. No winning is guaranteed. Lucky Plan is not gambling.
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {RULEBOOK_SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)]"
          >
            <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
            <ol className="mt-4 space-y-3">
              {section.rules.map((rule, index) => (
                <li key={index} className="flex gap-3">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--primary)_14%,white)] text-[10px] font-bold text-primary"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-muted-foreground">{rule}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <PublicMarketingBanner
        eyebrow="Draw transparency"
        title="How the monthly draw is kept fair"
        description="The commit-then-reveal process means no one can change the draw outcome after commitment. A hash is published first; the reveal comes later and is verifiable against the hash."
        items={[
          { title: "Commitment hash", description: "Published before each draw so the result cannot be retroactively changed." },
          { title: "Reveal publication", description: "The actual draw result is published and can be verified against the earlier commitment." },
          { title: "Masked winner identity", description: "Winner names are masked on public pages to protect privacy while keeping the process auditable." },
        ]}
      />

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Questions about the rules?"
        description="Our branch team can explain any rule in plain language before you enroll."
        actions={[
          { href: ROUTES.public.faq, label: "View FAQ", variant: "secondary" },
          { href: ROUTES.public.contact, label: "Contact store", variant: "secondary" },
          { href: ROUTES.public.luckyPlan, label: "Lucky Plan page", variant: "secondary" },
          { href: ROUTES.public.apply, label: "Apply / Enquire", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
