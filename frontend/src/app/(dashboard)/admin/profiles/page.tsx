"use client";

import Link from "next/link";
import { Users, Truck, UserCheck, GitBranch, BookUser } from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";

const PROFILE_MODULES = [
  {
    label: "Customers",
    description: "Customer register, KYC status, contract context, and operational posture.",
    href: ROUTES.admin.profilesCustomers,
    icon: <Users className="h-5 w-5" />,
    badge: "Identity",
  },
  {
    label: "Partners",
    description: "Partner directory, referral book, subscription links, and commission visibility.",
    href: ROUTES.admin.profilesPartners,
    icon: <UserCheck className="h-5 w-5" />,
    badge: "Identity",
  },
  {
    label: "Vendors",
    description: "Vendor register, contact, GSTIN, and procurement link context.",
    href: ROUTES.admin.profilesVendors,
    icon: <Truck className="h-5 w-5" />,
    badge: "Identity",
  },
  {
    label: "Staff",
    description: "Staff profiles, employment status, branch assignment, and HR workflow context.",
    href: ROUTES.admin.profilesStaff,
    icon: <UserCheck className="h-5 w-5" />,
    badge: "Identity",
  },
  {
    label: "Branches",
    description: "Branch identity, operational status, counter configuration, and governance readiness.",
    href: ROUTES.admin.profilesBranches,
    icon: <GitBranch className="h-5 w-5" />,
    badge: "Identity",
  },
  {
    label: "Party Master",
    description: "Cross-role party directory — customers, partners, vendors, and staff in one view.",
    href: ROUTES.admin.profilesParties,
    icon: <BookUser className="h-5 w-5" />,
    badge: "Identity",
  },
] as const;

export default function ProfilesHubPage() {
  return (
    <ERPPageShell
      eyebrow="Master Identity"
      title="Profiles & Parties"
      subtitle="Canonical identity layer for customers, partners, vendors, staff, branches, and party records. Profile pages show linked operational context without creating financial records."
      helperNote="Profile pages are read-only identity hubs. Payments, invoices, contracts, and financial operations remain in their own explicit module routes."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Profiles & Parties" },
      ]}
      statusBadge={{ label: "Identity Layer", tone: "info" }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROFILE_MODULES.map((mod) => (
          <Link
            key={mod.href}
            href={mod.href}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition hover:border-ring hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground transition group-hover:bg-primary group-hover:text-primary-foreground">
                {mod.icon}
              </span>
              <div>
                <div className="font-semibold text-foreground">{mod.label}</div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{mod.badge}</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{mod.description}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Financial integrity note:</span>
        {" "}Profile pages show linked records only. To collect payments, post invoices, process payroll, or create financial entries — use the Collections, Finance, Sales, or HR module routes.
      </div>
    </ERPPageShell>
  );
}
