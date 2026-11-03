"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import { ROUTES } from "@/lib/routes";
import {
  PimVariantPublishControlEditor,
} from "@/components/admin/pim/PimVariantPublishControlModal";
import { pimService, type PimProduct } from "@/services/pim";

export default function VariantPublishControlPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;
  const [product, setProduct] = useState<PimProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) return;
    let active = true;
    pimService
      .getProduct(Number(productId))
      .then((p) => {
        if (active) setProduct(p);
      })
      .catch((e) => {
        if (active) setError(e?.message ?? "Failed to load product details.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId]);

  const displayName = product?.name || `Product #${productId}`;
  const code = product?.code;

  return (
    <ERPPageShell
      eyebrow="PIM"
      title={code ? `${code} — Publish & Channel Control` : `${displayName} — Publish Control`}
      subtitle="Configure catalog visibility and commercial channels (SFEMI, Direct Sale, Rent, Lease) for the blueprint and all its variant SKUs."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Products & Blueprints", href: "/admin/products?tab=pim" },
        { label: code ?? `Product #${productId}`, href: `/admin/pim/products/${productId}/edit` },
        { label: "Publish Control" },
      ]}
      actions={[
        { href: "/admin/products?tab=pim", label: "← Back to Products", variant: "secondary" },
        { href: `/admin/pim/products/${productId}/edit`, label: "Open PIM Editor", variant: "secondary" },
      ]}
      statusBadge={{
        label: product?.is_published ? "Live in Catalog" : "Draft (Private)",
        tone: product?.is_published ? "success" : "warning",
      }}
    >
      {loading ? (
        <ERPLoadingState label="Loading product blueprint details…" />
      ) : error && !product ? (
        <ERPErrorState
          title="Product not found"
          description={error}
          onRetry={() => window.location.reload()}
        />
      ) : !productId ? (
        <ERPErrorState title="Invalid Product" description="No valid product ID provided." />
      ) : (
        <PimVariantPublishControlEditor
          productId={productId}
          initialProduct={product}
          isModal={false}
          onSaved={(data) => {
            if (product) {
              setProduct({
                ...product,
                is_published: data.base.is_published,
                base_price: data.base.base_price ?? "",
              });
            }
          }}
        />
      )}
    </ERPPageShell>
  );
}
