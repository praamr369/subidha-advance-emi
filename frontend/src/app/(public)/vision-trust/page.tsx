import type { Metadata } from "next";

import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Vision & Trust",
  description:
    "See how the public Lucky Plan site emphasizes winner publication, auditability, and real public conversion paths.",
};

export default function VisionTrustPage() {
  return (
    <PublicPageShell
      title="Vision & Trust"
      subtitle="Trust comes from live product visibility, real enquiry capture, and winner publication sourced from revealed draw records."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Vision & Trust" },
      ]}
      actions={[
        { label: "View winners", href: ROUTES.public.winners, variant: "secondary" },
        { label: "Apply", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <section className="public-surface p-6">
        <SectionHeader
          eyebrow="Principles"
          title="Built for real operations"
          description="SUBIDHA CORE is a real money-handling system. The public experience focuses on clarity, transparency, and safe next steps."
        />
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {[
            {
              title: "No fake marketing signals",
              description:
                "Public pages show real catalogue, real stats (when available), and honest empty states when data is missing.",
            },
            {
              title: "Transparency without leaking private data",
              description:
                "Winner visibility is sourced from revealed draw records with privacy-safe display labels, not internal ledgers.",
            },
            {
              title: "Conversion paths that map to workflows",
              description:
                "Apply/Enquire captures product context so branch follow-up can map directly to onboarding and subscription workflows.",
            },
          ].map((item) => (
            <div key={item.title} className="public-card p-5">
              <div className="text-base font-semibold text-foreground">{item.title}</div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>
    </PublicPageShell>
  );
}
