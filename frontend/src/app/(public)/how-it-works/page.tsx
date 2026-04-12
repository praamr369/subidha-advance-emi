import type { Metadata } from "next";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "Follow the practical Lucky Plan journey from product enquiry through enrollment, payments, and published draws.",
};

const steps = [
  "Browse products and submit an enquiry through the public Apply flow.",
  "The branch aligns product choice, batch availability, and plan suitability.",
  "Enrollment creates a subscription with a scheduled EMI timeline and linked lucky number.",
  "Monthly payments are posted as recorded transactions rather than silent edits.",
  "Revealed draws publish winner results, and eligible future waivers are handled in the business workflow.",
];

export default function HowItWorksPage() {
  return (
    <PortalPage
      title="How It Works"
      subtitle="The Lucky Plan journey is structured to keep product choice, payment posting, and draw publication understandable."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "How It Works" },
      ]}
      actions={[
        { href: ROUTES.public.products, label: "Browse Products", variant: "secondary" },
        { href: ROUTES.public.apply, label: "Apply", variant: "primary" },
      ]}
      helperNote="Public flow visibility is intentionally simple: product interest, onboarding, recorded payments, and published draw outcomes."
      helperTone="info"
    >
      <section className="surface-panel-elevated rounded-2xl border border-border bg-card p-6 shadow-sm">
        <ol className="grid gap-3 text-sm leading-6 text-muted-foreground">
          {steps.map((step, index) => (
            <li key={step} className="rounded-xl border border-border bg-muted/30 px-4 py-3">
              <span className="font-medium text-foreground">{index + 1}. </span>
              {step}
            </li>
          ))}
        </ol>
      </section>
    </PortalPage>
  );
}
