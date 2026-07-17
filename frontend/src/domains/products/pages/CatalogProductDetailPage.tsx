"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Box, CheckCircle2, ShieldCheck, Tag } from "lucide-react";
import { getCatalogProduct, type CatalogRole } from "@/services/catalog";
import { resolveApiMediaUrl } from "@/lib/media";

import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import { SelfServicePageShell } from "@/components/layout/page-shells";

export default function CatalogProductDetailPage({
  role,
  id,
  backHref,
}: {
  role: CatalogRole;
  id: string;
  backHref: string;
}) {
  const { data: product, isLoading, error } = useQuery({
    queryKey: ["catalogProduct", role, id],
    queryFn: () => getCatalogProduct(role, id),
  });

  if (isLoading) return <ERPLoadingState />;
  if (error || !product) {
    return <ERPErrorState title="Product not found" description="This product may have been removed or is unavailable." />;
  }

  const imgUrl = resolveApiMediaUrl(product.image ?? null);
  const basePrice = Number(product.base_price).toLocaleString("en-IN");
  const specs = (product.base_specs as Record<string, string>) || {};

  return (
    <SelfServicePageShell>
      <div className="flex flex-col space-y-6">
        {/* Back navigation */}
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to catalog
          </Link>
        </div>

        {/* Product Header / Image */}
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-1/2 lg:w-1/3 shrink-0">
            <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              {imgUrl ? (
                <Image
                  src={imgUrl}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted/40">
                  <Box className="size-16 text-muted-foreground/40" />
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Tag className="size-3" />
                {product.category || "Uncategorized"}
                {product.subcategory ? ` / ${product.subcategory}` : ""}
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">{product.name}</h1>
              <p className="mt-1 font-mono text-xs text-muted-foreground tracking-wider">CODE: {product.product_code}</p>
            </div>

            <div className="text-4xl font-black text-foreground">
              ₹{basePrice}
            </div>

            {product.description && (
              <div className="prose prose-sm dark:prose-invert">
                <p>{product.description}</p>
              </div>
            )}

            {/* Request Actions */}
            <div className="pt-4 border-t border-border">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">Start a Request</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {product.flags?.emi && (
                  <Link
                    href={`/${role}/product-requests/create?product=${product.id}&type=ADVANCE_EMI`}
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90"
                  >
                    Advance EMI Plan
                  </Link>
                )}
                {product.flags?.rent && (
                  <Link
                    href={`/${role}/product-requests/create?product=${product.id}&type=RENT`}
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary/20"
                  >
                    Rent Product
                  </Link>
                )}
                {product.flags?.lease && (
                  <Link
                    href={`/${role}/product-requests/create?product=${product.id}&type=LEASE`}
                    className="flex items-center justify-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary/20"
                  >
                    Lease Product
                  </Link>
                )}
                {product.flags?.direct_sale && (
                  <Link
                    href={`/${role}/product-requests/create?product=${product.id}&type=DIRECT_SALE`}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Direct Purchase
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Product Details & Specifications */}
        <div className="grid md:grid-cols-2 gap-6 pt-8 border-t border-border">
          {/* Specs */}
          {Object.keys(specs).length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-foreground">Specifications</h3>
              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {Object.entries(specs).map(([key, value]) => (
                      <tr key={key} className="divide-x divide-border">
                        <td className="bg-muted/30 px-4 py-3 font-semibold text-muted-foreground w-1/3">
                          {key}
                        </td>
                        <td className="px-4 py-3 text-foreground font-medium">
                          {value as string}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Warranty & Policies */}
          {product.warranty_enabled && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-foreground">Warranty & Protection</h3>
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="size-5 text-emerald-500 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-foreground">Manufacturing Defect Warranty</h4>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {product.warranty_months_manufacturing} months coverage
                    </p>
                  </div>
                </div>
                
                {(product.warranty_months_structural as number) > 0 && (
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="size-5 text-emerald-500 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-foreground">Structural Warranty</h4>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {product.warranty_months_structural} months coverage
                      </p>
                    </div>
                  </div>
                )}
                
                {(product.warranty_months_extended_max as number) > 0 && (
                  <div className="flex items-start gap-3 pt-4 border-t border-border">
                    <ShieldCheck className="size-5 text-amber-500 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-foreground">Extended Protection Available</h4>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Add up to {product.warranty_months_extended_max} extra months for {product.extended_warranty_cost_percentage}% of product value.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </SelfServicePageShell>
  );
}
