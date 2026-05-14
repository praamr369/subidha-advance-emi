import Link from "next/link";
import { Building2, LockKeyhole, ScrollText, ShieldCheck, UserPlus, Users, Wallet } from "lucide-react";

import PageHeader from "@/components/ui/PageHeader";

const controls = [
  {
    title: "Business setup",
    description:
      "Configure business profile, branches, finance accounts, cash desks, staff setup, and go-live readiness.",
    href: "/admin/settings/business-setup",
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    title: "Internal user list",
    description:
      "View internally created ADMIN and CASHIER accounts used for controlled business operations.",
    href: "/admin/settings/users",
    icon: <Users className="h-5 w-5" />,
  },
  {
    title: "Create internal user",
    description:
      "Create ADMIN and CASHIER accounts internally. Public registration remains limited to customer and partner roles.",
    href: "/admin/settings/users/create",
    icon: <UserPlus className="h-5 w-5" />,
  },
  {
    title: "Role governance",
    description:
      "Role boundaries, least-privilege access, and admin policy controls.",
    href: "/admin/settings/roles-permissions",
    icon: <ShieldCheck className="h-5 w-5" />,
  },
  {
    title: "Financial control policy",
    description:
      "Receipt controls, reversal-only correction flow, and reconciliation guardrails.",
    href: "/admin/reconciliation",
    icon: <Wallet className="h-5 w-5" />,
  },
  {
    title: "Audit readiness",
    description:
      "Immutable traceability for payment, draw, batch, and access changes.",
    href: "/admin/audit-logs",
    icon: <ScrollText className="h-5 w-5" />,
  },
  {
    title: "Session policy",
    description:
      "Authentication expiry, route protection, and restricted admin surface exposure.",
    href: "/admin/settings/roles-permissions",
    icon: <LockKeyhole className="h-5 w-5" />,
  },
  {
    title: "Policy governance",
    description:
      "Draft, publish, archive, and legal-review workflows for public legal and policy pages.",
    href: "/admin/settings/policies",
    icon: <ScrollText className="h-5 w-5" />,
  },
  {
    title: "Business compliance",
    description:
      "Admin-only compliance document register with public-safe disclosure controls.",
    href: "/admin/settings/business-compliance",
    icon: <ShieldCheck className="h-5 w-5" />,
  },
];

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Governance settings"
        description="Operational guardrails for access, finance, auditability, and internal control."
      />

      <section className="grid gap-5 md:grid-cols-2">
        {controls.map((control) => (
          <Link
            href={control.href}
            key={control.title}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
          >
            <div className="inline-flex rounded-xl border border-border bg-muted p-2.5">
              {control.icon}
            </div>
            <div className="mt-4 text-base font-semibold text-card-foreground">
              {control.title}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {control.description}
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
}
