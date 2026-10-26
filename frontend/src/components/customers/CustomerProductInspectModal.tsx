"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { Camera, ExternalLink, Eye, Package, ShieldCheck, Tag, X, Box } from "lucide-react";

import { getCatalogProduct, type CatalogProduct } from "@/services/catalog";
import { resolveApiMediaUrl } from "@/lib/media";
import ProductMediaGallery, { buildCatalogProductMediaItems } from "@/components/public/ProductMediaGallery";
import ProductARViewer from "@/components/public/ProductARViewer";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { cn } from "@/lib/utils";

export interface CustomerProductInspectModalProps {
  productId?: number | string | null;
  productName?: string | null;
  productImage?: string | null;
  productCode?: string | null;
  open: boolean;
  onClose: () => void;
}

export function CustomerProductInspectModal({
  productId,
  productName,
  productImage,
  productCode,
  open,
  onClose,
}: CustomerProductInspectModalProps) {
  const numericId = productId ? Number(productId) : null;

  const { data: product, isLoading, error } = useQuery<CatalogProduct>({
    queryKey: ["catalogProduct", "customer", numericId],
    queryFn: () => getCatalogProduct("customer", numericId!),
    enabled: Boolean(open && numericId),
    staleTime: 5 * 60 * 1000,
  });

  if (!open) return null;

  const displayName = product?.name || productName || `Product #${productId || ""}`;
  const initialImg = resolveApiMediaUrl(productImage ?? null);
  const resolvedMainImg = resolveApiMediaUrl(product?.image ?? null) || initialImg;
  const specs = (product?.base_specs as Record<string, string>) || {};
  const galleryItems = product ? buildCatalogProductMediaItems(product) : [];

  // Fallback single-item gallery if product hasn't loaded full media yet but image is provided
  const fallbackGalleryItems = resolvedMainImg
    ? [
        {
          id: "initial-photo",
          type: "image" as const,
          url: resolvedMainImg,
          title: displayName,
          isHero: true,
        },
      ]
    : [];

  const itemsToRender = galleryItems.length > 0 ? galleryItems : fallbackGalleryItems;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-muted/30">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
              <Camera className="size-3.5" />
              <span>Product Inspection & Gallery</span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-foreground truncate mt-0.5">
              {displayName}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-xl p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {isLoading ? (
            <div className="py-12">
              <ERPLoadingState label="Loading product gallery and specifications…" />
            </div>
          ) : null}

          {/* Media gallery */}
          {itemsToRender.length > 0 ? (
            <div className="rounded-2xl overflow-hidden border border-border bg-background p-2">
              <ProductMediaGallery
                items={itemsToRender}
                productName={displayName}
                category={product?.category}
                subcategory={product?.subcategory}
                badge={product?.category || "Ordered Product"}
                aspectRatio={4 / 3}
              />
            </div>
          ) : !isLoading ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center bg-muted/20">
              <Package className="size-10 text-muted-foreground/40 mb-2" />
              <div className="text-sm font-semibold text-foreground">{displayName}</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                No gallery photos uploaded for this product yet.
              </p>
            </div>
          ) : null}

          {/* 3D AR Model Preview if available */}
          {product?.ar_model ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wide text-foreground">
                <Box className="size-4 text-primary" />
                <span>3D / Augmented Reality Room View</span>
              </div>
              <ProductARViewer
                model={product.ar_model}
                productName={product.name}
                poster={resolvedMainImg}
              />
            </div>
          ) : null}

          {/* Product Badges / Meta */}
          <div className="flex flex-wrap items-center gap-2">
            {product?.brand_name ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/80 px-2.5 py-1 text-xs font-semibold text-secondary-foreground">
                <Tag className="size-3" />
                {product.brand_name}
              </span>
            ) : null}
            {product?.category ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {product.category}
              </span>
            ) : null}
            {product?.product_code || productCode ? (
              <span className="rounded-full border border-border px-2.5 py-1 text-xs font-mono text-muted-foreground">
                Code: {product?.product_code || productCode}
              </span>
            ) : null}
            {product?.sku ? (
              <span className="rounded-full border border-border px-2.5 py-1 text-xs font-mono text-muted-foreground">
                SKU: {String(product.sku)}
              </span>
            ) : null}
          </div>

          {/* Description */}
          {product?.description ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Product Description
              </h3>
              <p className="text-xs sm:text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                {product.description}
              </p>
            </div>
          ) : null}

          {/* Base Specifications */}
          {Object.keys(specs).length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Product Specifications
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {Object.entries(specs).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 border border-border/40"
                  >
                    <span className="font-medium text-muted-foreground truncate">{key}</span>
                    <span className="font-semibold text-foreground text-right">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Warranty Info if configured */}
          {product?.warranty_enabled ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 text-xs text-emerald-900 dark:text-emerald-200">
              <div className="flex items-center gap-2 font-bold mb-1">
                <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                <span>Warranty Coverage</span>
              </div>
              <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
                Manufacturing: {product.warranty_months_manufacturing || 12} months · Structural:{" "}
                {product.warranty_months_structural || 36} months
              </p>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Detailed catalog specifications could not be loaded. Primary photo and product details are shown above.
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3.5 bg-muted/20">
          {numericId ? (
            <Link
              href={`/customer/catalog/${numericId}`}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-95 transition active:scale-95"
            >
              <ExternalLink className="size-3.5" />
              <span>Open in Full Catalog Page</span>
            </Link>
          ) : <div />}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export interface CustomerProductLinkProps {
  productId?: number | string | null;
  productName?: string | null;
  productImage?: string | null;
  productCode?: string | null;
  showThumbnail?: boolean;
  thumbnailSize?: "sm" | "md" | "lg";
  showInspectButton?: boolean;
  inspectButtonLabel?: string;
  className?: string;
  badge?: string;
  subtext?: string;
}

export function CustomerProductLink({
  productId,
  productName,
  productImage,
  productCode,
  showThumbnail = true,
  thumbnailSize = "md",
  showInspectButton = true,
  inspectButtonLabel = "Inspect Gallery",
  className,
  badge,
  subtext,
}: CustomerProductLinkProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const resolvedImg = resolveApiMediaUrl(productImage ?? null);
  const numericId = productId ? Number(productId) : null;

  const sizeClasses = {
    sm: "size-8 rounded-lg",
    md: "size-11 rounded-xl",
    lg: "size-14 rounded-2xl",
  };

  const handleOpenInspect = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setModalOpen(true);
  };

  return (
    <>
      <div className={cn("inline-flex items-center gap-2.5 max-w-full", className)}>
        {/* Optional Thumbnail */}
        {showThumbnail ? (
          <button
            type="button"
            onClick={handleOpenInspect}
            title={numericId ? "Click to inspect product photos & description" : displayName(productName, productId)}
            className={cn(
              "relative shrink-0 overflow-hidden border border-border bg-muted flex items-center justify-center transition hover:border-primary/50 group focus:outline-none focus:ring-2 focus:ring-primary/40",
              sizeClasses[thumbnailSize]
            )}
          >
            {resolvedImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolvedImg}
                alt={productName || "Product photo"}
                className="size-full object-cover transition duration-200 group-hover:scale-110"
              />
            ) : (
              <Package className="size-4 text-muted-foreground/60 transition group-hover:text-primary" />
            )}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
              <Eye className="size-3.5" />
            </div>
          </button>
        ) : null}

        {/* Product title & inspect button */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleOpenInspect}
              className="text-left font-bold text-foreground hover:text-primary transition underline-offset-2 hover:underline truncate text-xs sm:text-sm focus:outline-none"
              title="Click to inspect product photos & specs"
            >
              {displayName(productName, productId)}
            </button>
            {badge ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                {badge}
              </span>
            ) : null}
          </div>

          {subtext || productCode ? (
            <div className="text-[11px] font-mono text-muted-foreground truncate">
              {subtext || (productCode ? `Code: ${productCode}` : null)}
            </div>
          ) : null}

          {/* Quick Action Button */}
          {showInspectButton && numericId ? (
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenInspect}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition"
              >
                <Camera className="size-3" />
                <span>{inspectButtonLabel}</span>
              </button>
              <span className="text-muted-foreground/40 text-[10px]">·</span>
              <Link
                href={`/customer/catalog/${numericId}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition"
              >
                <ExternalLink className="size-2.5" />
                <span>Catalog</span>
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {/* Inspect Modal */}
      <CustomerProductInspectModal
        productId={numericId}
        productName={productName}
        productImage={productImage}
        productCode={productCode}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

function displayName(name?: string | null, id?: number | string | null): string {
  if (typeof name === "string" && name.trim()) return name.trim();
  if (id) return `Product #${id}`;
  return "Product Item";
}

export default CustomerProductLink;
