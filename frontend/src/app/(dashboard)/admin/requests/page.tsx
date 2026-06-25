import Link from "next/link";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

const REQUEST_GROUPS = [
  {
    title: "Public & Customer Enquiries",
    description: "Inbound requests from public forms or customer-facing channels. Request intake only.",
    items: [
      {
        label: "Online Enquiries",
        description:
          "Public purchase or service enquiries submitted through the website. No procurement or payment posting from this page.",
        href: ROUTES.admin.onlineEnquiries,
        badge: "Request intake",
      },
      {
        label: "Support Requests",
        description:
          "Customer-submitted support and dispute intake with receipt and subscription context. Service execution remains in Service Desk.",
        href: ROUTES.admin.supportRequests,
        badge: "Request intake",
      },
    ],
  },
  {
    title: "Subscription & Contract Requests",
    description: "Controlled approval queues for subscription requests. No auto-conversion to contract.",
    items: [
      {
        label: "Subscription Requests",
        description:
          "Customer and partner EMI subscription intake awaiting admin approval. Approval follows the existing backend workflow — no silent contract or payment creation.",
        href: ROUTES.admin.subscriptionRequests,
        badge: "Controlled approval queue",
      },
    ],
  },
  {
    title: "Partner Requests",
    description: "Partner-submitted request queues. Approval or review does not auto-post commissions or payouts.",
    items: [
      {
        label: "Partner Payment Requests",
        description:
          "Partner-submitted payment report intake. Review context links to Collection Workspace. No financial posting from this page.",
        href: ROUTES.admin.partnerPaymentRequests,
        badge: "Request intake",
      },
      {
        label: "Partner Collection Requests",
        description:
          "Controlled approval queue for partner field collection reports. Approve or reject request status only.",
        href: ROUTES.admin.partnersCollectionRequests,
        badge: "Controlled approval queue",
      },
    ],
  },
  {
    title: "CRM Queues",
    description: "Lead and follow-up queues. Non-financial next steps only.",
    items: [
      {
        label: "CRM Workspace",
        description: "Lead, pipeline, follow-up, KYC, and customer intelligence in one workspace.",
        href: ROUTES.admin.crmWorkspace,
        badge: "Request intake",
      },
      {
        label: "Leads",
        description: "Lead register and enquiry conversion workflow.",
        href: ROUTES.admin.crmLeads,
        badge: "Request intake",
      },
      {
        label: "KYC Queue",
        description: "Pending customer KYC verification queue. No financial actions from this queue.",
        href: ROUTES.admin.crmKyc,
        badge: "Request intake",
      },
    ],
  },
];

export default function AdminRequestsHubPage() {
  return (
    <ERPPageShell
      eyebrow="CRM & Requests"
      title="Requests Hub"
      subtitle="Unified view of all inbound request queues: public enquiries, support intake, subscription requests, and partner requests."
      helperNote="No financial posting from this page. This hub links to existing request queues — each queue owns its own intake and review workflow. Service execution remains in Delivery & Service."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Requests Hub" },
      ]}
      actions={[
        { href: ROUTES.admin.crmWorkspace, label: "CRM Workspace", variant: "primary" },
        { href: ROUTES.admin.serviceDesk, label: "Service Desk", variant: "secondary" },
      ]}
      statusBadge={{ label: "No financial posting from this page", tone: "info" }}
      headerMode="erp"
    >
      <div className="space-y-8">
        {REQUEST_GROUPS.map((group) => (
          <ERPSectionShell
            key={group.title}
            title={group.title}
            description={group.description}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex flex-col gap-2 rounded-2xl border border-border bg-card px-4 py-4 transition hover:bg-muted/30 hover:border-ring"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-foreground group-hover:text-primary">
                      {item.label}
                    </span>
                    <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </Link>
              ))}
            </div>
          </ERPSectionShell>
        ))}

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Linked source record:</strong> Each request type links back to its source module — customers, subscriptions, partners, or deliveries. Financial, stock, and accounting workflows remain in their own controlled modules and are not triggered from this page.
        </div>
      </div>
    </ERPPageShell>
  );
}
