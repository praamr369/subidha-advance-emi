"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Ruler, X } from "lucide-react";

import { formatModelSize, loadModelViewer, type ModelViewerElement } from "@/lib/model-viewer";
import type { PimMediaItem } from "@/services/pim";

// Furniture lives between a footstool and a wardrobe. Anything outside this
// band was almost certainly exported in centimetres/inches instead of metres,
// which would show customers a doll-house or a building in AR.
const MIN_PLAUSIBLE_M = 0.05;
const MAX_PLAUSIBLE_M = 4;

export default function ModelPreviewDialog({ item, onClose }: { item: PimMediaItem; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [dims, setDims] = useState<{ x: number; y: number; z: number } | null>(null);
  const viewerRef = useRef<ModelViewerElement | null>(null);

  useEffect(() => {
    loadModelViewer().then(() => setReady(true), () => setLoadError(true));
  }, []);

  useEffect(() => {
    const el = viewerRef.current;
    if (!ready || !el) return;
    const onLoad = () => setDims(el.getDimensions?.() ?? null);
    const onError = () => setLoadError(true);
    el.addEventListener("load", onLoad);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("load", onLoad);
      el.removeEventListener("error", onError);
    };
  }, [ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const largest = dims ? Math.max(dims.x, dims.y, dims.z) : null;
  const scaleLooksWrong = largest !== null && (largest < MIN_PLAUSIBLE_M || largest > MAX_PLAUSIBLE_M);
  const src = item.file_url || item.file;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="3D model preview"
      onClick={onClose}
    >
      <div className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">3D model preview</h3>
            <p className="text-xs text-muted-foreground">
              {item.variant_sku ? `Variant ${item.variant_sku}` : "Shared — all variants"}
              {" · "}
              {item.ios_file ? "iPhone: custom .usdz attached" : "iPhone: converted on the device"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 hover:bg-muted" aria-label="Close preview">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative aspect-[4/3] w-full bg-muted/40">
          {loadError ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-600">
              The model could not be loaded. Re-export it as a binary glTF (.glb) and upload again.
            </div>
          ) : ready ? (
            <model-viewer
              ref={viewerRef}
              src={src}
              alt="3D model preview"
              camera-controls
              shadow-intensity="1"
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="space-y-2 px-4 py-3 text-xs">
          {dims && (
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
              Size customers will see in their room: {formatModelSize(dims)}
            </p>
          )}
          {scaleLooksWrong ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This size doesn&apos;t look like furniture. The file was probably exported in centimetres or inches.
              Re-export it in metres before customers see it.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Check this matches the real product. AR shows the model at exactly this size.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
