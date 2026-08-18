"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GitBranch, ExternalLink } from "lucide-react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import PimProductForm from "@/components/admin/pim/PimProductForm";
import { pimService, type PimProduct } from "@/services/pim";
import { ROUTES } from "@/lib/routes";

export default function PimEditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<PimProduct | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params?.id) return;
    pimService.getProduct(Number(params.id))
      .then(setProduct)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params?.id]);

  if (!params?.id) return null;
  if (loading) return <ERPLoadingState label="Loading…" />;

  const isVariantSku = Boolean(product?.parent_id);

  // Variant SKU: show redirect notice, not the full base product editor
  if (isVariantSku && product) {
    return (
      <ERPPageShell
        eyebrow="PIM"
        title="Variant SKU"
        subtitle="This is a variant SKU — it is managed under its base product."
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "PIM Products", href: "/admin/pim/products" },
          { label: product.parent_code ?? `Product #${product.parent_id}`, href: `/admin/pim/products/${product.parent_id}/edit` },
          { label: product.code },
        ]}
        statusBadge={{ label: "Variant SKU", tone: "warning" as const }}
      >
        <div className="max-w-2xl space-y-6">

          {/* Identity banner */}
          <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-900/10 dark:border-violet-800 px-5 py-4">
            <div className="flex items-start gap-3">
              <GitBranch className="h-5 w-5 text-violet-600 mt-0.5 shrink-0" />
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-semibold text-foreground">{product.code}</span>
                  <span className="text-[10px] font-semibold text-violet-700 bg-violet-100 border border-violet-200 rounded-full px-2 py-0.5">
                    Variant SKU
                  </span>
                  <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${product.is_published ? "bg-green-100 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                    {product.is_published ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{product.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This SKU is a variant of{" "}
                  <span className="font-mono font-semibold text-foreground">{product.parent_code}</span>
                  {product.parent_name && <> ({product.parent_name})</>}.
                  Variant attributes, pricing, and stock are managed from the base product&apos;s SKU Variants section.
                </p>
              </div>
            </div>
          </div>

          {/* Primary action: go to base product */}
          <div className="rounded-xl border bg-card px-5 py-5 space-y-4">
            <h3 className="font-semibold">Manage via Base Product</h3>
            <p className="text-sm text-muted-foreground">
              Open the base product to edit this variant&apos;s attributes, price, barcode, and stock level.
              The base product editor shows all variants in its <strong>SKU Variants</strong> section where you can
              set unique prices for each size/material/colour combination.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Link
                href={`/admin/pim/products/${product.parent_id}/edit`}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <ExternalLink className="h-4 w-4" />
                Open Base Product — {product.parent_code}
              </Link>
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" /> Go back
              </button>
            </div>
          </div>

          {/* Quick price/stock read-only card */}
          <div className="rounded-xl border bg-card px-5 py-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Current Price</div>
              <div className="font-semibold text-lg">₹{Number(product.base_price).toLocaleString("en-IN")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Category</div>
              <div className="font-medium">{product.category_name}</div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            To detach this product from its parent, contact your ERP administrator.
            Variant SKUs share the base product&apos;s category, attribute schema, and description by default.
          </p>
        </div>
      </ERPPageShell>
    );
  }

  // Base product (no parent) — full editor
  return (
    <ERPPageShell
      eyebrow="Product Information Manager"
      title="Edit Base Product"
      subtitle="Manage base product details, category attributes, and all SKU variants under this product umbrella."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "PIM Products", href: "/admin/pim/products" },
        { label: `Product #${params.id}` },
      ]}
      statusBadge={{ label: "PIM", tone: "info" as const }}
    >
      <PimProductForm productId={Number(params.id)} />
    </ERPPageShell>
  );
}
