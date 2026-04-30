import PortalPage from "@/components/ui/PortalPage";
import Link from "next/link";

const rolePolicies = [
  {
    role: "ADMIN",
    access: "Full operational control over customer, batch, subscription, payment, draw, and governance modules.",
    restrictions: "No hard delete of financial data. Reversal and audit-only correction path.",
  },
  {
    role: "CASHIER",
    access: "Payment collection workflows, receipt generation, and limited payment visibility.",
    restrictions: "Cannot modify winner logic, batch state, or reconciliation sign-off.",
  },
  {
    role: "PARTNER",
    access: "Portfolio visibility for assigned subscriptions and commission-related read scopes.",
    restrictions: "No access to admin governance or direct ledger override paths.",
  },
  {
    role: "CUSTOMER",
    access: "Self-service contract, EMI schedule, payment status, and winner outcome visibility.",
    restrictions: "No access to internal controls or other customer records.",
  },
];

export default function RoleSettingsPage() {
  return (
    <PortalPage
      title="Role and permission model"
      subtitle="Recommended enterprise policy map for least-privilege control and financial audit safety."
      breadcrumbs={[
        { href: "/admin", label: "Admin" },
        { href: "/admin/settings", label: "Settings" },
        { label: "Roles" },
      ]}
    >
      <section className="grid gap-4">
        <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">
            Live capability matrix is managed from{" "}
            <Link href="/admin/settings/roles-permissions" className="font-medium text-foreground underline">
              Roles & Capabilities
            </Link>.
          </div>
        </article>
        {rolePolicies.map((policy) => (
          <article key={policy.role} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {policy.role}
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="text-sm font-semibold text-foreground">Access scope</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{policy.access}</p>
              </div>
              <div className="rounded-xl border border-border bg-background p-4">
                <div className="text-sm font-semibold text-foreground">Restrictions</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{policy.restrictions}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </PortalPage>
  );
}
