import type { Metadata } from "next";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Lucky Plan",
  description:
    "Review the core public Lucky Plan operating rules around batches, EMI cycles, draws, and future waiver handling.",
};

const rules = [
  "Batches run with fixed lucky-number slots and subscription tracking.",
  "EMI schedules are generated for the plan tenure and collections are posted as recorded transactions.",
  "Lucky draw publication is separate from payment history so already recorded payments remain auditable.",
  "When a winner is confirmed, only eligible future EMI obligations are waived according to the business rules.",
];

export default function LuckyPlanPage() {
  return (
    <PortalPage
      title="Lucky Plan Details"
      subtitle="A practical overview of how the Lucky Plan is structured for product-linked enrollment, monthly payment tracking, and draw transparency."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Lucky Plan" },
      ]}
      actions={[
        { href: ROUTES.public.howItWorks, label: "How It Works", variant: "secondary" },
        { href: ROUTES.public.apply, label: "Apply", variant: "primary" },
      ]}
    >
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <ul className="grid gap-3 text-sm leading-6 text-muted-foreground">
          {rules.map((rule) => (
            <li key={rule} className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              {rule}
            </li>
          ))}
        </ul>
      </section>
    </PortalPage>
  );
}
