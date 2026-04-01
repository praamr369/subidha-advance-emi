import type { Metadata } from "next";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "About",
  description:
    "Understand how Subidha Furniture positions the Lucky Plan around product access, auditability, and draw transparency.",
};

export default function AboutPage() {
  return (
    <PortalPage
      title="About Subidha Furniture"
      subtitle="Retail-focused Lucky Plan operations built around product ownership, payment traceability, and published draw outcomes."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "About" },
      ]}
      actions={[
        { href: ROUTES.public.products, label: "Browse Products", variant: "secondary" },
        { href: ROUTES.public.apply, label: "Apply", variant: "primary" },
      ]}
    >
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm leading-7 text-muted-foreground">
          Subidha Furniture, Asansol, operates the Lucky Plan as a
          finance-conscious retail workflow. Product selection, subscription
          tracking, payment posting, and winner publication are treated as
          separate operational concerns so customers can understand where they
          stand without relying on guesswork.
        </p>
      </section>
    </PortalPage>
  );
}
