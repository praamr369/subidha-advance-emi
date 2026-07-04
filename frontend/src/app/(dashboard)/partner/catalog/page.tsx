"use client";

import CatalogBrowser, { type CatalogCta } from "@/components/catalog/CatalogBrowser";
import ERPPageShell from "@/components/erp/ERPPageShell";
import type { CatalogProduct } from "@/services/catalog";

function buildPartnerCtas(product: CatalogProduct): CatalogCta[] {
  // Partners raise a request on behalf of a linked customer; the admin approves.
  return [
    {
      label: "Create request for customer",
      href: `/partner/subscription-requests/create?product=${product.id}`,
    },
  ];
}

export default function PartnerCatalogPage() {
  return (
    <ERPPageShell
      title="Product Catalog"
      subtitle="Browse admin-approved products and raise a request for one of your customers."
      breadcrumbs={[{ label: "Partner", href: "/partner" }, { label: "Product Catalog" }]}
      actions={[
        { href: "/partner/subscription-requests", label: "My Requests", variant: "secondary" },
        { href: "/partner/customers", label: "My Customers", variant: "secondary" },
      ]}
    >
      <CatalogBrowser
        role="partner"
        buildCtas={buildPartnerCtas}
        helperNote="Browse the approved catalog and create a subscription/purchase request for one of your customers. The admin reviews and approves every partner request."
      />
    </ERPPageShell>
  );
}
