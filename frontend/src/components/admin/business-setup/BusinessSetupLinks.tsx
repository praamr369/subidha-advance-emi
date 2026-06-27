import Link from "next/link";

import { ROUTES } from "@/lib/routes";

const links = [
  { href: ROUTES.admin.settingsBusinessSetup, label: "Business Setup" },
  { href: ROUTES.admin.settingsBusinessSetupProfile, label: "Business Profile" },
  { href: ROUTES.admin.settingsBusinessSetupPrintBranding, label: "Print & PDF Branding" },
  { href: ROUTES.admin.settingsBusinessSetupPublicSite, label: "Public Site" },
  { href: ROUTES.admin.settingsPolicies, label: "Policy Governance" },
  { href: ROUTES.admin.settingsBusinessCompliance, label: "Business Compliance" },
  { href: ROUTES.admin.settingsBusinessSetupBranches, label: "Branches" },
  { href: ROUTES.admin.settingsBusinessSetupFinanceAccounts, label: "Finance Accounts" },
  { href: ROUTES.admin.settingsBusinessSetupCashDesks, label: "Cash Desks" },
  { href: ROUTES.admin.settingsBusinessSetupStaff, label: "Staff & Roles" },
  { href: ROUTES.admin.products, label: "Products" },
  { href: ROUTES.admin.settingsBusinessSetupChartAccounts, label: "Chart Accounts" },
  { href: ROUTES.admin.inventoryReadiness, label: "Inventory readiness" },
  { href: ROUTES.admin.inventoryOpeningStock, label: "Opening stock" },
  { href: ROUTES.admin.accountingSetup, label: "Accounting mappings" },
  { href: ROUTES.admin.accountingBridges, label: "Accounting bridges" },
  { href: ROUTES.admin.accountingBridgeReconciliation, label: "Bridge reconciliation" },
  { href: ROUTES.admin.settingsBusinessSetupDocumentNumbering, label: "Document Numbering" },
  { href: ROUTES.admin.brandData, label: "Brand Data Center" },
  { href: ROUTES.admin.settingsBusinessSetupOpeningBalances, label: "Opening Balances" },
  { href: ROUTES.admin.settingsBusinessSetupReset, label: "Dry Runs & Reset" },
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
