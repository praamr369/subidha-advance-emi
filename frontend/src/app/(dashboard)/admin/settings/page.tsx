import Link from "next/link";
import type { ReactNode } from "react";
import {
  Building2,
  LockKeyhole,
  ScrollText,
  Settings2,
  ShieldCheck,
  Upload,
  UserCog,
  Wallet,
} from "lucide-react";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";

const sections = [
  {
    title: "Access and users",
    description: "Internal user lifecycle, role posture, and least-privilege admin controls.",
    href: ROUTES.admin.settingsUsers,
    icon: <UserCog className="h-5 w-5" />,
  },
  {
    title: "Business settings",
    description: "Operational control surfaces for delivery gating, support posture, and audit readiness.",
    href: ROUTES.admin.settingsBusiness,
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    title: "Masters",
    description: "Product, inventory, vendor, and accounting master references used across operations.",
    href: ROUTES.admin.settingsMasters,
    icon: <Settings2 className="h-5 w-5" />,
  },
  {
    title: "Imports",
    description: "Preview, validate, and post master-data imports without bypassing audit-friendly flows.",
    href: ROUTES.admin.settingsImports,
    icon: <Upload className="h-5 w-5" />,
  },
  {
    title: "Finance configuration",
    description: "Accounting periods, posting locks, reconciliation guardrails, and export controls.",
    href: ROUTES.admin.settingsFinance,
    icon: <Wallet className="h-5 w-5" />,
  },
];

const controls = [
  {
    title: "Role governance",
    description: "Role boundaries, least-privilege access, and admin policy controls.",
    href: "/admin/settings/roles",
    icon: <ShieldCheck className="h-5 w-5" />,
  },
  {
    title: "Financial control policy",
    description: "Receipt controls, reversal-only correction flow, and reconciliation guardrails.",
    href: buildAdminReconciliationRoute(),
    icon: <Wallet className="h-5 w-5" />,
  },
  {
    title: "Audit readiness",
    description: "Immutable traceability for payment, draw, batch, billing, and access changes.",
    href: "/admin/audit-logs",
    icon: <ScrollText className="h-5 w-5" />,
  },
  {
    title: "Session policy",
    description: "Authentication expiry, route protection, and restricted admin surface exposure.",
    href: "/admin/settings/roles",
    icon: <LockKeyhole className="h-5 w-5" />,
  },
];

function SettingsCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
    >
      <div className="inline-flex rounded-xl border border-border bg-muted p-2.5">
        {icon}
      </div>
      <div className="mt-4 text-base font-semibold text-card-foreground">{title}</div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </Link>
  );
}

export default function AdminSettingsPage() {
  return (
    <PortalPage
      title="Admin Settings"
      subtitle="Governance, business setup, master data, imports, and finance controls organized for daily operations."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings" },
      ]}
      stats={[
        { label: "Primary Sections", value: String(sections.length), tone: "info" },
        { label: "Control Surfaces", value: String(controls.length), tone: "info" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <SettingsCard key={section.title} {...section} />
          ))}
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          {controls.map((control) => (
            <SettingsCard key={control.title} {...control} />
          ))}
        </section>
      </div>
    </PortalPage>
  );
}
