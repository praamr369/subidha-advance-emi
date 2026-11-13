"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { X, ExternalLink, Layers, Sparkles, CheckCircle2, Puzzle, Factory, Wrench, Box } from "lucide-react";
import dynamic from "next/dynamic";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { pimService, type PimProduct } from "@/services/pim";

const PimProductForm = dynamic(() => import("./PimProductForm"), {
  loading: () => <ERPLoadingState label="Loading product editor…" />,
  ssr: false,
});

interface PimQuickEditModalProps {
  productId: number;
  initialProduct?: PimProduct | null;
  onClose: () => void;
  onSaved?: (product: PimProduct) => void;
}

export default function PimQuickEditModal({
  productId,
  initialProduct,
  onClose,
  onSaved,
}: PimQuickEditModalProps) {
  const [product, setProduct] = useState<PimProduct | null>(initialProduct || null);
  const [loading, setLoading] = useState<boolean>(!initialProduct);

  useEffect(() => {
    let active = true;
    pimService
      .getProduct(productId)
      .then((p) => {
        if (active) setProduct(p);
      })
      .catch((err) => {
        console.warn("Could not load product details for quick edit header", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId]);

  // Lock body scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Keyboard shortcut: Escape closes modal (unless captured by child modal)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const displayName = product?.name || initialProduct?.name || `Product #${productId}`;
  const code = product?.code || initialProduct?.code;
  const isPublished = product?.is_published ?? initialProduct?.is_published;
  const productType = product?.product_type || initialProduct?.product_type || "FINISHED_GOOD";
  const categoryPath = [
    product?.category_name || initialProduct?.category_name,
    product?.subcategory_name || initialProduct?.subcategory_name,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-quick-edit-title"
    >
      <div
        className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3.5 bg-muted/40 shrink-0 flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0 shadow-2xs">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary border border-primary/20">
                  <Sparkles className="h-3 w-3" /> Quick Edit Pop-up Window
                </span>
                {code && (
                  <span className="font-mono text-xs font-bold bg-muted px-2 py-0.5 rounded border text-foreground">
                    {code}
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isPublished
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                  }`}
                >
                  {isPublished ? "Published (Live)" : "Draft (Private)"}
                </span>
                {productType === "ACCESSORY" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 rounded-full px-2 py-0.5">
                    <Puzzle className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                    Accessory
                  </span>
                )}
                {productType === "RAW_MATERIAL" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 rounded-full px-2 py-0.5">
                    <Factory className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    Raw Material
                  </span>
                )}
                {productType === "SERVICE" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800 rounded-full px-2 py-0.5">
                    <Wrench className="h-3 w-3 text-teal-600 dark:text-teal-400" />
                    Service
                  </span>
                )}
                {productType === "FINISHED_GOOD" && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 rounded-full px-2 py-0.5">
                    <Box className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                    Finished Good
                  </span>
                )}
              </div>
              <h2
                id="modal-quick-edit-title"
                className="text-base sm:text-lg font-bold text-foreground truncate mt-0.5"
              >
                {displayName}
              </h2>
              {categoryPath && (
                <p className="text-xs text-muted-foreground truncate">{categoryPath}</p>
              )}
            </div>
          </div>

          {/* Action buttons on header: Full Page Window option + Close */}
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/admin/pim/products/${productId}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors shadow-2xs"
              title="Open full page editor window in a new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Full Page Window
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close Pop-up Window"
              title="Close Pop-up Window (Esc)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto flex-1 p-5 sm:p-6">
          {loading ? (
            <ERPLoadingState label="Loading product blueprint details…" />
          ) : (
            <PimProductForm
              productId={productId}
              variant="drawer"
              onCancel={onClose}
              onSaved={(savedProd) => {
                setProduct(savedProd);
                onSaved?.(savedProd);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

