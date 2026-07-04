"use client";

import CatalogBrowser, { type CatalogCta } from "@/components/catalog/CatalogBrowser";
import ERPPageShell from "@/components/erp/ERPPageShell";
import type { CatalogProduct } from "@/services/catalog";

function buildCustomerCtas(product: CatalogProduct): CatalogCta[] {
  const ctas: CatalogCta[] = [];
  if (product.flags.emi) {
    ctas.push({
      label: "Request EMI plan",
      href: `/customer/subscription-requests/create?product=${product.id}`,
    });
  }
  // Rent / lease / direct-sale / generic purchase all route through a support
  // enquiry so the admin can convert it into the right contract type.
  ctas.push({
    label: product.flags.emi ? "Purchase request" : "Request this product",
    href: `/customer/support/new?product=${product.id}`,
    variant: product.flags.emi ? "secondary" : "primary",
  });
  return ctas;
}

export default function CustomerCatalogPage() {
  return (
    <ERPPageShell
      title="Product Catalog"
      subtitle="Browse admin-approved products for EMI, rent, lease, direct sale, or a purchase request."
      breadcrumbs={[{ label: "Customer", href: "/customer" }, { label: "Product Catalog" }]}
      actions={[
        { href: "/customer/subscription-requests", label: "My Requests", variant: "secondary" },
        { href: "/customer/direct-sales", label: "Direct Sales", variant: "secondary" },
      ]}
    >
      <CatalogBrowser
        role="customer"
        buildCtas={buildCustomerCtas}
        helperNote="These are products the admin has approved for sale. Pick a product and raise an EMI, rent, lease, direct-sale, or purchase request — the admin reviews and approves each request."
      />
    </ERPPageShell>
  );
}
