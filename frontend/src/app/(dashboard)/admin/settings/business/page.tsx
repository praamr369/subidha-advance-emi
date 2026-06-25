import Link from "next/link";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";

const items = [
  {
    title: "Delivery control",
    description: "Review fulfillment state because EMI billing activation remains delivery-gated.",
    href: ROUTES.admin.deliveries,
  },
  {
    title: "Reminder operations",
    description: "Manage follow-up queues for EMI and retail due reminders without weakening payment controls.",
    href: ROUTES.admin.reminders,
  },
  {
    title: "Support requests",
    description: "Operational escalations and customer issues that affect onboarding or post-delivery servicing.",
    href: ROUTES.admin.supportRequests,
  },
  {
    title: "Audit logs",
    description: "Review immutable evidence for payment, delivery, billing, and admin actions.",
    href: ROUTES.admin.auditLogs,
  },
];

export default function AdminSettingsBusinessPage() {
  return (
    <ERPPageShell
      eyebrow="Settings & Governance"
      title="Business Settings"
      subtitle="Operational control surfaces that affect day-to-day shop execution without changing Lucky Plan financial truth."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Business" },
      ]}
      actions={[{ href: ROUTES.admin.settings, label: "Settings Home", variant: "secondary" }]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
          >
            <div className="text-base font-semibold text-card-foreground">{item.title}</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
          </Link>
        ))}
      </div>
    </ERPPageShell>
  );
}
