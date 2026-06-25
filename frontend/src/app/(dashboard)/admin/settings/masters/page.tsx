import Link from "next/link";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { ADMIN_MASTER_DATA_LANES } from "@/config/admin-enterprise";
import { ROUTES } from "@/lib/routes";

export default function AdminSettingsMastersPage() {
  return (
    <ERPPageShell
      title="Master Data"
      subtitle="Reference data that operational modules reuse instead of duplicating product, inventory, or accounting truth."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Settings", href: ROUTES.admin.settings },
        { label: "Masters" },
      ]}
      actions={[{ href: ROUTES.admin.settings, label: "Settings Home", variant: "secondary" }]}
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm leading-6 text-sky-950">
          Shared master-data direction for the ERP transition is explicit: product category, subcategory, SKU, and unit belong to the canonical product master; inventory extends that master through stock profiles and locations; billing mirrors contract and delivery state; accounting owns books and finance masters separately from EMI payment truth.
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {ADMIN_MASTER_DATA_LANES.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
            >
              <div className="text-base font-semibold text-card-foreground">{item.title}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {item.description}
              </p>
            </Link>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href={ROUTES.admin.settingsImports}
            className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
          >
            <div className="text-base font-semibold text-card-foreground">Import Hub</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Preview and post master-data imports through controlled, auditable operator flows.
            </p>
          </Link>
          <Link
            href={ROUTES.admin.accountingPurchaseBills}
            className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-ring hover:bg-accent/40"
          >
            <div className="text-base font-semibold text-card-foreground">Vendor and purchase operations</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Purchase bills and vendor-facing finance re-use accounting and inventory masters instead of inventing parallel records.
            </p>
          </Link>
        </div>
      </div>
    </ERPPageShell>
  );
}
