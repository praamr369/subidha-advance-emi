import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
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

function ProductCard({ product, categoryName, dict }: { product: PublicProduct; categoryName: string; dict: any }) {
  const price = formatPrice(product.base_price);
  const alt = `${product.name} at Subidha Furniture Asansol`;
  const href = `/products/${product.product_code}`;
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:shadow-md">
      <Link href={href} className="absolute inset-0 z-10">
        <span className="sr-only">View {product.name}</span>
      </Link>
      <div className="relative aspect-[4/3] w-full bg-muted overflow-hidden">
        {product.image ? (
          <Image src={product.image} alt={alt} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover transition-transform duration-300 group-hover:scale-105" unoptimized={true} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground p-2 text-center">
            {categoryName} at Subidha Furniture
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5 sm:p-4">
        <h3 className="text-xs sm:text-base font-semibold text-foreground line-clamp-2">{product.name}</h3>
        {price ? <p className="text-xs sm:text-sm font-bold text-foreground">{price}</p> : null}
        <p className="mt-auto pt-1 text-[10px] sm:text-xs text-muted-foreground">{dict.public.ProductCategoryLanding_text2}</p>
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
  const locale = await getPublicLocale();
  const dict = getPublicDictionary(locale);

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
      ? buildItemListJsonLd(matched.slice(0, 24).map((product) => ({ name: product.name, path: `/products/${product.product_code}` })))
      : null;

  return (
    <>
      {itemListJsonLd ? <PublicSeoJsonLd payload={itemListJsonLd} /> : null}
      {category.faqs.length > 0 ? <PublicSeoJsonLd payload={buildFaqJsonLd(category.faqs)} /> : null}
      <PublicPageShell
        title={`${category.name} in Asansol — Subidha Furniture`}
        subtitle={`${category.name} at Subidha Furniture, Asansol. Visit our showroom for current designs, availability, and plan options.`}
        breadcrumbs={[
          { label: dict.public.ProductCategoryLanding_prop3, href: "/" },
          { label: dict.public.ProductCategoryLanding_prop4, href: "/products" },
          { label: `${category.name} in Asansol` },
        ]}
        actions={[
          { label: dict.public.ProductCategoryLanding_prop5, href: "/contact", variant: "primary" },
          { label: dict.public.ProductCategoryLanding_prop6, href: "/products", variant: "secondary" },
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
              <ul className="grid grid-cols-2 gap-2.5 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {matched.slice(0, 24).map((product) => (
                  <ProductCard key={product.id} product={product} categoryName={category.name} dict={dict} />
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
            <h2 className="text-xl font-semibold text-foreground">{dict.public.ProductCategoryLanding_text11}</h2>
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
              <h2 className="text-xl font-semibold text-foreground">{dict.public.ProductCategoryLanding_text13}</h2>
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
