import Link from "next/link";
import type { ComponentType } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { WorkflowCard } from "@/components/ui/operations";
import { ROUTES } from "@/lib/routes";

type SectionDef = {
  href: string;
  label: string;
  description: string;
  badge?: string;
};

const SECTIONS: SectionDef[] = [
  {
    href: ROUTES.admin.luckyPlanDraws ?? "/admin/lucky-plan/draws",
    label: "Lucky Plan Waiver Events",
    description:
      "Monthly waiver selection events — eligibility snapshot, hash commit/reveal, waiver recipient, and audit records.",
    badge: "Waiver",
  },
  {
    href: ROUTES.admin.luckyPlanBatches ?? "/admin/lucky-plan/batches",
    label: "Eligibility Snapshots",
    description:
      "Frozen eligible customer / Lucky ID snapshots per waiver month. Snapshot hash and commitment hash stored for audit.",
    badge: "Eligibility",
  },
  {
    href: ROUTES.admin.defaulters ?? "/admin/defaulters",
    label: "Ineligible Due to Late Payment",
    description:
      "Customers who paid after monthly cutoff and are ineligible for that month's waiver benefit. Ineligibility logged per plan and month.",
    badge: "Ineligibility",
  },
  {
    href: "/admin/compliance/waiver-accounting",
    label: "Waiver Accounting Review",
    description:
      "CA-mode waiver classification per contract — pre-supply contract adjustment, commercial credit note, GST credit note, or refund voucher.",
    badge: "Accounting",
  },
  {
    href: ROUTES.admin.collections ?? "/admin/collections",
    label: "Refund SLA Register",
    description:
      "Pending and overdue Lucky Plan / contract refunds. SLA: 7 working days from approval. Flags overdue refunds.",
    badge: "Refund SLA",
  },
  {
    href: ROUTES.admin.partnerPaymentRequests ?? "/admin/partner-payment-requests",
    label: "Partner Receipt Requests",
    description:
      "Partners submit receipt requests only. Admin confirms money received and approves. Final receipt generated only after admin approval.",
    badge: "Partner Receipts",
  },
];

export default function RevenueWorkbenchPage() {
  return (
    <ERPPageShell
      eyebrow="Revenue & Waiver"
      title="Revenue Workbench"
      subtitle="Lucky Plan waiver events, eligibility snapshots, ineligibility register, waiver accounting review, refund SLA tracker, and partner receipt requests."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Revenue Workbench" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <ERPSectionShell>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((section) => (
            <Link key={section.href} href={section.href} className="block rounded-xl border border-border bg-background p-4 text-sm transition-colors hover:border-primary hover:bg-primary/5">
              {section.badge && (
                <span className="mb-2 inline-block rounded bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
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
