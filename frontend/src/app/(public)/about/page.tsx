import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Subidha Furniture, Asansol. Our mission: affordable furniture access through structured monthly plans with clear rules and transparent winner publication.",
};

export default function AboutPage() {
  return (
    <PublicPageShell
      title="About Subidha Furniture"
      subtitle="A local business in Asansol, West Bengal, focused on affordable furniture access with structured monthly commitments and transparent Lucky Plan rules."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "About" },
      ]}
      actions={[
        { label: "Browse products", href: ROUTES.public.products, variant: "secondary" },
        { label: "Apply", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <section className="grid gap-6 rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)] lg:grid-cols-2">
        <div className="rounded-[1.8rem] border border-white/75 bg-white/82 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
          <SectionHeader
            eyebrow="Our mission"
            title="Affordable furniture access, handled responsibly"
            description="We help families bring home essential furniture with predictable monthly commitments and practical branch support."
          />
          <p className="mt-5 text-sm leading-7 text-muted-foreground">
            Lucky Plan is operated as a real shop workflow: product selection, subscription creation,
            EMI scheduling, payment posting, and winner publication are treated as separate concerns so customers can
            understand where they stand without guesswork.
          </p>
        </div>

        <div className="rounded-[1.8rem] border border-white/75 bg-white/82 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
          <SectionHeader
            eyebrow="Why we publish"
            title="Transparency builds trust"
            description="The public website is designed to show real published winner signals and honest empty states."
          />
          <p className="mt-5 text-sm leading-7 text-muted-foreground">
            We avoid fake catalog entries, inflated statistics, and invented winners. When a draw is revealed and published,
            it appears in the winner pages. When it is not published yet, the public site shows that directly.
          </p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <SectionHeader
          eyebrow="Values"
          title="What we stand for"
          description="These values shape how the plan is communicated and operated day-to-day."
        />
        <div className="mt-6 grid gap-3 lg:grid-cols-5">
          {[
            { title: "Transparency", description: "Clear rules and published outcomes." },
            { title: "Affordability", description: "Predictable monthly commitments." },
            { title: "Fairness", description: "Verifiable process design for draws." },
            { title: "Customer-first support", description: "Practical guidance from enquiry to enrollment." },
            { title: "Local reliability", description: "Real branch follow-up and accountability." },
          ].map((value) => (
            <div
              key={value.title}
              className="rounded-[1.7rem] border border-white/80 bg-white/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]"
            >
              <div className="text-base font-semibold text-foreground">
                {value.title}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {value.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <CtaBanner
        title="Want to see Lucky Plan in action?"
        description="Browse the live catalogue, read the Lucky Plan rules, and submit an enquiry so the branch can guide you on batches and monthly plan comfort."
        actions={[
          { href: ROUTES.public.products, label: "Products", variant: "secondary" },
          { href: ROUTES.public.apply, label: "Apply", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
