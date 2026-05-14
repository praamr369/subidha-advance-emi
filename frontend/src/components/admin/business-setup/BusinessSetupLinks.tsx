import Link from "next/link";

import { ROUTES } from "@/lib/routes";

const links = [
  { href: "/admin/settings/business-setup", label: "Overview" },
  { href: "/admin/settings/business-setup/profile", label: "Business Profile" },
  { href: "/admin/settings/business-setup/public-site", label: "Public Site" },
  { href: "/admin/settings/policies", label: "Policy Governance" },
  { href: "/admin/settings/business-compliance", label: "Business Compliance" },
  { href: "/admin/settings/business-setup/branches", label: "Branches" },
  { href: "/admin/settings/business-setup/finance-accounts", label: "Accounting Setup" },
  { href: "/admin/settings/business-setup/cash-desks", label: "Counters" },
  { href: "/admin/settings/business-setup/staff", label: "Staff & Roles" },
  { href: "/admin/settings/business-setup/chart-accounts", label: "Chart Accounts" },
  { href: ROUTES.admin.inventoryReadiness, label: "Inventory readiness" },
  { href: ROUTES.admin.inventoryStockNeeds, label: "Stock needs" },
  { href: "/admin/accounting/setup", label: "Accounting mappings" },
  { href: "/admin/settings/business-setup/document-numbering", label: "Document Numbering" },
  { href: ROUTES.admin.brandData, label: "Brand Data Center" },
  { href: "/admin/settings/business-setup/checklist", label: "Checklist" },
  { href: ROUTES.admin.settingsBusinessSetupDryRuns, label: "Dry runs" },
  { href: ROUTES.admin.settingsBusinessSetupReset, label: "Reset / Backup / Restore" },
];

export default function BusinessSetupLinks() {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-ring hover:text-foreground"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
