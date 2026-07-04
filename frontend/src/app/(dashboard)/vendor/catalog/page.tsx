"use client";

import CatalogBrowser from "@/components/catalog/CatalogBrowser";
import ERPPageShell from "@/components/erp/ERPPageShell";

export default function VendorCatalogPage() {
  return (
    <ERPPageShell
      title="Business Catalog"
      subtitle="Product categories the business sources from vendors — see where your supply fits."
      breadcrumbs={[{ label: "Vendor", href: "/vendor" }, { label: "Business Catalog" }]}
      actions={[
        { href: "/vendor/products", label: "My Products", variant: "secondary" },
        { href: "/vendor/quotes", label: "Quote Requests", variant: "secondary" },
      ]}
    >
      <CatalogBrowser
        role="vendor"
        helperNote="These are the product categories the business deals in. Use the category filter to see which lines you can supply, then submit quotes against matching purchase requests."
      />
    </ERPPageShell>
  );
}
