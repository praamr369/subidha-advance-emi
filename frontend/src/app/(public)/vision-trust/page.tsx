import type { Metadata } from "next";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Vision & Trust",
  description:
    "See how the public Lucky Plan site emphasizes winner publication, auditability, and real public conversion paths.",
};

export default function VisionTrustPage() {
  return (
    <PortalPage
      title="Vision & Trust"
      subtitle="The public site should help customers verify the business and move into a real next step without marketing-only dead ends."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Vision & Trust" },
      ]}
      actions={[
        { href: ROUTES.public.winners, label: "View Winners", variant: "secondary" },
        { href: ROUTES.public.apply, label: "Apply", variant: "primary" },
      ]}
    >
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm leading-7 text-muted-foreground">
          Trust on the public site comes from live product visibility, real
          application capture, and winner publication sourced from revealed draw
          records. The platform keeps payment history, draw execution, and
          customer role access separate so public trust signals do not depend on
          decorative placeholder content.
        </p>
      </section>
    </PortalPage>
  );
}
