"use client";
import { Controller, useFormContext } from "react-hook-form";
import { ProductCreationFormData } from "@/lib/schemas/product-creation";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { Upload, X } from "lucide-react";
import { useEffect, useState } from "react";

export default function ImageTab() {
  const { control, formState: { errors }, watch } = useFormContext<ProductCreationFormData>();
  const selectedImage = watch("image");
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!selectedImage) {
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(selectedImage);
    setPreview(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [selectedImage]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const event = new Event("change", { bubbles: true });
      Object.defineProperty(event, "target", {
        writable: false,
        value: { files: [file] },
      });
      document.getElementById("product-image")?.dispatchEvent(event);
    }
  };

  return (
    <div className="space-y-6">
      <ERPSectionShell
        title="Product Image"
        description="Professional product photo for customer portals and reports."
      >
        <Controller
          name="image"
          control={control}
          render={({ field }) => (
            <div>
              {preview ? (
                <div className="relative overflow-hidden rounded-xl border border-border bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Product preview"
                    className="h-80 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => field.onChange(null)}
                    className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white transition hover:bg-black/70"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50"
                  }`}
                  onClick={() => document.getElementById("product-image")?.click()}
                >
                  <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-foreground">Click or drag image to upload</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    JPG, PNG, WEBP up to 5MB
                  </p>
                  {errors.image && (
                    <p className="mt-2 text-xs text-destructive">{errors.image.message}</p>
                  )}
                </div>
              )}
              <input
                id="product-image"
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => field.onChange(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>
          )}
        />
      </ERPSectionShell>

      <ERPSectionShell
        title="Image Requirements"
        description="Guidelines for best results."
      >
        <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-2 text-sm">
          <p className="text-muted-foreground">
            • <strong>Format:</strong> JPG, PNG, or WEBP (avoid GIF and BMP)
          </p>
          <p className="text-muted-foreground">
            • <strong>Size:</strong> Up to 5 MB
          </p>
          <p className="text-muted-foreground">
            • <strong>Recommended:</strong> 1200×1200 pixels minimum (square aspect ratio)
          </p>
          <p className="text-muted-foreground">
            • <strong>Quality:</strong> High-contrast, well-lit product photograph
          </p>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Optional"
        description="Images can be added later if not available now."
      >
        <p className="text-sm text-muted-foreground">
          You can upload or change the product image anytime from the product detail page.
        </p>
      </ERPSectionShell>
    </div>
  );
}
