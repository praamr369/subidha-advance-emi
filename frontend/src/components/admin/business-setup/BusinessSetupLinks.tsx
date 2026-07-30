import Link from "next/link";

import { ROUTES } from "@/lib/routes";

const links = [
  { href: ROUTES.admin.settingsBusinessSetup, label: "Business Setup" },
  { href: ROUTES.admin.settingsBusinessSetupProfile, label: "Unified Business & Brand" },
  { href: ROUTES.admin.settingsBusinessSetupPrintBranding, label: "Print & PDF Branding" },
  { href: ROUTES.admin.settingsBusinessSetupEmailSmtp, label: "Email (SMTP / OTP)" },
  { href: ROUTES.admin.settingsCompliancePolicies, label: "Compliance & Policies" },
  { href: ROUTES.admin.settingsBusinessSetupBranchesDesks, label: "Branches & Desks" },
  { href: ROUTES.admin.settingsBusinessSetupStaff, label: "Staff & Roles" },
  { href: ROUTES.admin.products, label: "Products" },
  { href: ROUTES.admin.inventoryReadiness, label: "Inventory readiness" },
  { href: ROUTES.admin.inventoryOpeningStock, label: "Opening stock" },
  { href: ROUTES.admin.accountingSetup, label: "Accounting Workbench" },
  { href: ROUTES.admin.settingsBusinessSetupDocumentNumbering, label: "Document Numbering" },
  { href: ROUTES.admin.settingsBusinessSetupDataMigration, label: "Data Migration & Balances" },
  { href: ROUTES.admin.settingsBusinessSetupReset, label: "Dry Runs & Reset" },
];

export default function BusinessSetupLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={`${link.label}-${link.href}`}
          href={link.href}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-ring hover:text-foreground"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
