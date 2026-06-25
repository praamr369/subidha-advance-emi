import Link from "next/link";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

type SectionDef = {
  href: string;
  label: string;
  description: string;
  badge?: string;
  warningBadge?: boolean;
};

const SECTIONS: SectionDef[] = [
  {
    href: ROUTES.admin.settingsLegalControls ?? "/admin/settings/legal-controls",
    label: "GST Status & Invoice Mode",
    description:
      "Current GST registration mode, blocked document types, and invoice mode (NON_GST_BILL vs GST_TAX_INVOICE). Block GST collection when unregistered.",
    badge: "GST Status",
    warningBadge: true,
  },
  {
    href: ROUTES.admin.billing ?? "/admin/billing",
    label: "Non-GST Bills",
    description:
      "Retail bills, sale bills, money receipts, plan receipts, and security deposit receipts issued while business is GST-unregistered.",
    badge: "Non-GST",
  },
  {
    href: ROUTES.admin.complianceKyc ?? "/admin/compliance/tax-readiness",
    label: "GST Readiness",
    description:
      "Product HSN/SAC, party tax profiles, turnover thresholds, and GST registration readiness checks. Prepare before registration threshold is reached.",
    badge: "GST Readiness",
  },
  {
    href: "/admin/compliance/waiver-accounting",
    label: "Commercial Waivers",
    description:
      "Commercial waiver notes and commercial credit notes for Lucky Plan — issued per CA-approved treatment based on delivery and invoice status.",
    badge: "Waivers",
  },
  {
    href: ROUTES.admin.billing ?? "/admin/billing/credit-notes",
    label: "Credit Notes",
    description:
      "Commercial credit notes (non-GST) and GST credit notes (only when CA-approved and GST registered). Linked to waiver accounting classification.",
    badge: "Credit Notes",
  },
  {
    href: ROUTES.admin.collections ?? "/admin/collections",
    label: "Refund Payables",
    description:
      "Pending refunds to customers — Lucky Plan cancellation, rent/lease deposit returns, advance refunds. SLA: 7 working days.",
    badge: "Refunds",
  },
  {
    href: ROUTES.admin.accounting ?? "/admin/accounting",
    label: "Deposit Liabilities",
    description:
      "Security deposit liability register — refundable deposits held until return inspection is approved and deductions are settled.",
    badge: "Deposits",
  },
  {
    href: ROUTES.admin.defaulters ?? "/admin/defaulters",
    label: "Late Payment Charges",
    description:
      "Late payment charge register — configured policy, applied charges, admin waivers with audit trail. Use 'Late Payment Charge' wording only.",
    badge: "Late Charges",
  },
];

export default function FinanceControlPage() {
  return (
    <ERPPageShell
      eyebrow="Finance"
      title="Finance Control"
      subtitle="GST status, non-GST bills, GST readiness, commercial waivers, credit notes, refund payables, deposit liabilities, and late payment charges."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Finance Control" },
      ]}
    >
      <ERPSectionShell>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="block rounded-xl border border-border bg-background p-4 text-sm transition-colors hover:border-primary hover:bg-primary/5"
            >
              {section.badge && (
                <span className={`mb-2 inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${section.warningBadge ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>
                  {section.badge}
                </span>
              )}
              <div className="font-semibold text-foreground">{section.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">{section.description}</div>
            </Link>
          ))}
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
