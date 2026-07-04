import Image from "next/image";
import Link from "next/link";

import PublicPageShell from "@/components/public/PublicPageShell";
import PublicSeoJsonLd from "@/components/public/PublicSeoJsonLd";
import { listPublicProducts, type PublicProduct } from "@/lib/public-api";
import { PRODUCT_SEO_CATEGORIES, productsForCategory, type ProductSeoCategory } from "@/lib/product-category-seo";
import { buildFaqJsonLd, buildItemListJsonLd } from "@/lib/public-seo";

function formatPrice(value: string | null | undefined): string | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return `₹${Math.round(numeric).toLocaleString("en-IN")}`;
}

function ProductCard({ product, categoryName }: { product: PublicProduct; categoryName: string }) {
  const price = formatPrice(product.base_price);
  const alt = `${product.name} at Subidha Furniture Asansol`;
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative aspect-[4/3] w-full bg-muted">
        {product.image ? (
          <Image src={product.image} alt={alt} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            {categoryName} at Subidha Furniture
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-base font-semibold text-foreground">{product.name}</h3>
        {price ? <p className="text-sm font-medium text-foreground">{price}</p> : null}
        <p className="mt-auto pt-2 text-xs text-muted-foreground">Visit showroom for latest availability</p>
      </div>
    </li>
  );
}

/**
 * Server-rendered public category page. Uses the existing public products API
 * (finished goods only; no cost/supplier/margin/stock). Renders real product
 * cards when matches exist, a safe fallback otherwise. One H1 (shell), H2
 * sections, visible FAQ + matching JSON-LD, breadcrumb + ItemList JSON-LD.
 */
export default async function ProductCategoryLanding({ category }: { category: ProductSeoCategory }) {
  let matched: PublicProduct[] = [];
  try {
    const { products } = await listPublicProducts();
    matched = productsForCategory(category, products);
  } catch {
    matched = [];
  }

  const related = PRODUCT_SEO_CATEGORIES.filter((entry) => entry.slug !== category.slug);
  const itemListJsonLd =
    matched.length > 0
      ? buildItemListJsonLd(matched.slice(0, 24).map((product) => ({ name: product.name, path: `/products/${product.id}` })))
      : null;

  return (
    <>
      {itemListJsonLd ? <PublicSeoJsonLd payload={itemListJsonLd} /> : null}
      {category.faqs.length > 0 ? <PublicSeoJsonLd payload={buildFaqJsonLd(category.faqs)} /> : null}
      <PublicPageShell
        title={`${category.name} in Asansol — Subidha Furniture`}
        subtitle={`${category.name} at Subidha Furniture, Asansol. Visit our showroom for current designs, availability, and plan options.`}
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Products", href: "/products" },
          { label: `${category.name} in Asansol` },
        ]}
        actions={[
          { label: "Contact showroom", href: "/contact", variant: "primary" },
          { label: "All products", href: "/products", variant: "secondary" },
        ]}
      >
        <div className="flex flex-col gap-10">
          <section className="flex flex-col gap-4 text-base leading-relaxed text-muted-foreground">
            {category.intro.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-foreground">{category.name} at our Asansol showroom</h2>
            {matched.length > 0 ? (
              <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {matched.slice(0, 24).map((product) => (
                  <ProductCard key={product.id} product={product} categoryName={category.name} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-border bg-muted/40 p-5 text-base text-muted-foreground">
                Our {category.name.toLowerCase()} collection is being updated. Visit our showroom or contact us for the
                latest {category.name.toLowerCase()} designs and availability in Asansol.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold text-foreground">Explore more categories</h2>
            <ul className="flex flex-wrap gap-3">
              {related.map((entry) => (
                <li key={entry.slug}>
                  <Link
                    href={`/products/${entry.slug}`}
                    className="inline-flex rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    {entry.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/furniture-store-asansol" className="inline-flex rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted">
                  Furniture store in Asansol
                </Link>
              </li>
            </ul>
          </section>

          {category.faqs.length > 0 ? (
            <section className="flex flex-col gap-4">
              <h2 className="text-xl font-semibold text-foreground">Frequently asked questions</h2>
              <dl className="flex flex-col gap-4">
                {category.faqs.map((faq) => (
                  <div key={faq.question} className="rounded-xl border border-border p-4">
                    <dt className="text-base font-semibold text-foreground">{faq.question}</dt>
                    <dd className="mt-1 text-base leading-relaxed text-muted-foreground">{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </PublicPageShell>
    </>
  );
}
