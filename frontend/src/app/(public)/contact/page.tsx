import type { Metadata } from "next";
import Link from "next/link";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Find the practical public contact routes for product enquiries, Lucky Plan applications, and customer login.",
};

export default function ContactPage() {
  return (
    <PortalPage
      title="Contact & Branch Follow-up"
      subtitle="Use the practical contact route that matches where you are in the Lucky Plan journey."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Contact" },
      ]}
      actions={[
        { href: ROUTES.public.apply, label: "Apply Now", variant: "primary" },
        { href: ROUTES.public.products, label: "Browse Products", variant: "secondary" },
      ]}
    >
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Visit the branch</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Subidha Furniture
            <br />
            Asansol, West Bengal
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            For in-person product browsing, enrollment assistance, and Lucky Plan
            clarification, visit the branch with your product preference and
            phone number.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">New enquiries</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            If you are exploring products or want EMI guidance, use the real
            application form so the branch receives your contact and product
            context.
          </p>
          <Link
            href={ROUTES.public.apply}
            className="mt-4 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
          >
            Open Apply Form
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Existing customers</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Existing customers should use their account to check subscriptions,
            payments, and support guidance instead of relying on a public
            placeholder contact flow.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={ROUTES.public.login}
              className="inline-flex h-10 items-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Login
            </Link>
            <Link
              href={ROUTES.public.register}
              className="inline-flex h-10 items-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              Register
            </Link>
          </div>
        </div>
      </section>
    </PortalPage>
  );
}
