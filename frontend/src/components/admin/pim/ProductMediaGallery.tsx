"use client";
import { useEffect, useState, useRef } from "react";
import { Box, Eye, ImagePlus, Video, Trash2, Star, StarOff, Film, Smartphone } from "lucide-react";
import { pimService, type PimMediaItem, type PimVariant } from "@/services/pim";
import ModelPreviewDialog from "./ModelPreviewDialog";

interface Props {
  productId: number;
  variants?: PimVariant[];
}

type UploadKind = PimMediaItem["kind"];
type UploadTarget = { scope: "ALL_VARIANTS"; variant?: undefined } | { scope: "VARIANT"; variant: PimVariant };

const MB = 1024 * 1024;
const LIMITS: Record<UploadKind, { accept: string; maxBytes: number; label: string }> = {
  IMAGE: { accept: "image/*", maxBytes: 25 * MB, label: "Image" },
  VIDEO: { accept: "video/mp4,video/webm,video/quicktime", maxBytes: 50 * MB, label: "Video" },
  MODEL_3D: { accept: ".glb,model/gltf-binary", maxBytes: 25 * MB, label: "3D model" },
};

function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function ProductMediaGallery({ productId, variants = [] }: Props) {
  const [items, setItems] = useState<PimMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<PimMediaItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iosInputRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<UploadTarget & { kind: UploadKind }>({ scope: "ALL_VARIANTS", kind: "IMAGE" });
  const pendingIosItem = useRef<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await pimService.listMedia({ product: productId });
      setItems(data);
    } catch {
      setError("Failed to load media gallery.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [productId]);

  function triggerUpload(target: UploadTarget, kind: UploadKind) {
    pendingUpload.current = { ...target, kind };
    if (fileInputRef.current) {
      fileInputRef.current.accept = LIMITS[kind].accept;
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function triggerIosAttach(itemId: number) {
    pendingIosItem.current = itemId;
    if (iosInputRef.current) {
      iosInputRef.current.value = "";
      iosInputRef.current.click();
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { kind } = pendingUpload.current;
    const limit = LIMITS[kind];
    if (file.size > limit.maxBytes) {
      setError(`${limit.label} must be under ${limit.maxBytes / MB}MB.`);
      return;
    }
    if (kind === "MODEL_3D" && !file.name.toLowerCase().endsWith(".glb")) {
      setError("3D model must be a .glb file (binary glTF, modelled in metres).");
      return;
    }
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("product", String(productId));
    fd.append("kind", kind);
    fd.append("scope", pendingUpload.current.scope);
    fd.append("file", file);
    if (pendingUpload.current.scope === "VARIANT" && pendingUpload.current.variant) {
      fd.append("variant", String(pendingUpload.current.variant.id));
    }
    try {
      const created = await pimService.uploadMedia(fd);
      setItems((prev) => [...prev, created]);
      if (created.kind === "MODEL_3D") setPreviewItem(created);
    } catch (err) {
      setError(errorText(err, "Upload failed. Please try again."));
    } finally {
      setUploading(false);
    }
  }

  async function onIosFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const itemId = pendingIosItem.current;
    if (!file || itemId === null) return;
    if (!file.name.toLowerCase().endsWith(".usdz")) {
      setError("iPhone model must be a .usdz file.");
      return;
    }
    if (file.size > 25 * MB) {
      setError("iPhone model must be under 25MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const updated = await pimService.attachIosModel(itemId, file);
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch (err) {
      setError(errorText(err, "Could not attach the iPhone model."));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this media item?")) return;
    try {
      await pimService.deleteMedia(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setError("Failed to delete.");
    }
  }

  async function handleSetHero(id: number) {
    try {
      const updated = await pimService.setHeroMedia(id);
      // Hero is per kind: starring a 3D model leaves the hero photo alone.
      setItems((prev) =>
        prev.map((i) => (i.kind === updated.kind ? { ...i, is_hero: i.id === updated.id } : i))
      );
    } catch {
      setError("Failed to set hero.");
    }
  }

  const sharedItems = items.filter((i) => i.scope === "ALL_VARIANTS");
  const variantItems = (v: PimVariant) => items.filter((i) => i.scope === "VARIANT" && i.variant === v.id);
  const cardActions = { onDelete: handleDelete, onSetHero: handleSetHero, onPreview: setPreviewItem, onAttachIos: triggerIosAttach };

  return (
    <section className="rounded-lg border p-5 space-y-5">
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFileSelected} />
      <input ref={iosInputRef} type="file" accept=".usdz,model/vnd.usdz+zip" className="hidden" onChange={onIosFileSelected} />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Media Gallery</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Shared images/videos + per-variant media. Hero image shown as primary in catalog. A 3D model (.glb, real
            size in metres) adds &ldquo;View in your room&rdquo; AR to the product page.
          </p>
        </div>
        {uploading && (
          <span className="text-xs text-blue-600 font-medium animate-pulse">Uploading…</span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      {/* Shared (all-variants) gallery */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shared — All Variants</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => triggerUpload({ scope: "ALL_VARIANTS" }, "IMAGE")}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition disabled:opacity-50"
            >
              <ImagePlus className="h-3.5 w-3.5" /> Add Image
            </button>
            <button
              type="button"
              onClick={() => triggerUpload({ scope: "ALL_VARIANTS" }, "VIDEO")}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition disabled:opacity-50"
            >
              <Film className="h-3.5 w-3.5" /> Add Video
            </button>
            <button
              type="button"
              onClick={() => triggerUpload({ scope: "ALL_VARIANTS" }, "MODEL_3D")}
              disabled={uploading}
              title="Binary glTF (.glb) modelled at real size in metres, up to 25MB"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted transition disabled:opacity-50"
            >
              <Box className="h-3.5 w-3.5" /> Add 3D Model (AR)
            </button>
          </div>
        </div>
        {loading ? (
          <div className="text-xs text-muted-foreground px-2">Loading…</div>
        ) : sharedItems.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
            No shared media yet — add images, a video or a 3D model that apply to all variants.
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {sharedItems.map((item) => (
              <MediaCard key={item.id} item={item} {...cardActions} />
            ))}
          </div>
        )}
      </div>

      {/* Per-variant media */}
      {variants.length > 0 && (
        <div className="space-y-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Per-Variant Media</span>
          <div className="space-y-3">
            {variants.map((v) => {
              const vItems = variantItems(v);
              return (
                <div key={v.id} className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-foreground">{v.sku}</span>
                      {v.variant_label && v.variant_label !== v.sku && (
                        <span className="text-xs text-muted-foreground">— {v.variant_label}</span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => triggerUpload({ scope: "VARIANT", variant: v }, "IMAGE")}
                        disabled={uploading}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted transition disabled:opacity-50"
                      >
                        <ImagePlus className="h-3 w-3" /> Image
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerUpload({ scope: "VARIANT", variant: v }, "VIDEO")}
                        disabled={uploading}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted transition disabled:opacity-50"
                      >
                        <Film className="h-3 w-3" /> Video
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerUpload({ scope: "VARIANT", variant: v }, "MODEL_3D")}
                        disabled={uploading}
                        title="3D model for this size/finish only — overrides the shared model on this variant's page"
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted transition disabled:opacity-50"
                      >
                        <Box className="h-3 w-3" /> 3D
                      </button>
                    </div>
                  </div>
                  {vItems.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {vItems.map((item) => (
                        <MediaCard key={item.id} item={item} {...cardActions} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">No variant-specific media — upload an image, video or 3D model for this SKU.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {previewItem && <ModelPreviewDialog item={previewItem} onClose={() => setPreviewItem(null)} />}
    </section>
  );
}

function MediaCard({
  item,
  onDelete,
  onSetHero,
  onPreview,
  onAttachIos,
}: {
  item: PimMediaItem;
  onDelete: (id: number) => void;
  onSetHero: (id: number) => void;
  onPreview: (item: PimMediaItem) => void;
  onAttachIos: (id: number) => void;
}) {
  const url = item.file_url || item.file;
  const isModel = item.kind === "MODEL_3D";
  return (
    <div className="group relative rounded-lg overflow-hidden border border-border bg-muted/20 aspect-square">
      {item.kind === "IMAGE" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={item.title || "media"} className="h-full w-full object-cover" />
      ) : isModel ? (
        <div className="h-full w-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-indigo-50 to-sky-100 dark:from-indigo-950/60 dark:to-sky-950/60">
          <Box className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
          <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-200">3D · AR</span>
          <span className="text-[9px] text-indigo-700/70 dark:text-indigo-200/70">
            {item.ios_file ? "iPhone: .usdz" : "iPhone: auto"}
          </span>
        </div>
      ) : (
        <div className="h-full w-full flex flex-col items-center justify-center bg-black/80 gap-1">
          <Video className="h-6 w-6 text-white" />
          <span className="text-[10px] text-white/70">Video</span>
          {item.title && <span className="text-[10px] text-white/50 truncate px-1 max-w-full">{item.title}</span>}
        </div>
      )}

      {item.is_hero && (
        <div className="absolute top-1 left-1 rounded-full bg-yellow-400 p-0.5" title={isModel ? "Primary 3D model" : "Hero image"}>
          <Star className="h-3 w-3 text-yellow-900" fill="currentColor" />
        </div>
      )}

      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition flex items-center justify-center gap-1.5">
        {isModel && (
          <>
            <button
              type="button"
              onClick={() => onPreview(item)}
              title="Preview and check real size"
              className="rounded-full bg-white/90 p-1.5 hover:bg-white transition"
            >
              <Eye className="h-3.5 w-3.5 text-slate-900" />
            </button>
            <button
              type="button"
              onClick={() => onAttachIos(item.id)}
              title={item.ios_file ? "Replace iPhone (.usdz) file" : "Attach iPhone (.usdz) file — optional"}
              className="rounded-full bg-white/90 p-1.5 hover:bg-white transition"
            >
              <Smartphone className="h-3.5 w-3.5 text-slate-900" />
            </button>
          </>
        )}
        {item.kind !== "VIDEO" && !item.is_hero && (
          <button
            type="button"
            onClick={() => onSetHero(item.id)}
            title={isModel ? "Use as primary 3D model" : "Set as hero"}
            className="rounded-full bg-yellow-400/90 p-1.5 hover:bg-yellow-400 transition"
          >
            <StarOff className="h-3.5 w-3.5 text-yellow-900" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          title="Delete"
          className="rounded-full bg-red-500/90 p-1.5 hover:bg-red-500 transition"
        >
          <Trash2 className="h-3.5 w-3.5 text-white" />
        </button>
      </div>
    </div>
  );
}
