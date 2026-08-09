import { useEffect, useCallback } from "react";
import { UseFormSetValue, UseFormWatch } from "react-hook-form";
import { ProductCreationFormData } from "@/lib/schemas/product-creation";

const STORAGE_KEY = "product-creation-form-draft";
const AUTO_SAVE_DELAY = 1000; // 1 second debounce

export function useFormPersistence(
  watch: UseFormWatch<ProductCreationFormData>,
  setValue: UseFormSetValue<ProductCreationFormData>
) {
  // Load persisted form data on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved) as Partial<ProductCreationFormData>;
        // Restore all fields except image (File type can't be serialized)
        Object.entries(data).forEach(([key, value]) => {
          if (key !== "image") {
            setValue(key as keyof ProductCreationFormData, value);
          }
        });
      } catch {
        // Silently fail if storage is corrupted
      }
    }
  }, [setValue]);

  // Auto-save form state on changes
  useEffect(() => {
    const subscription = watch((data) => {
      // Debounce saves with a timeout
      const timer = setTimeout(() => {
        const toSave = { ...data };
        // Don't persist image field (File type)
        delete (toSave as Partial<ProductCreationFormData>).image;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      }, AUTO_SAVE_DELAY);

      return () => clearTimeout(timer);
    });

    return () => subscription.unsubscribe();
  }, [watch]);

  // Clear persisted data after successful submission
  const clearDraft = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { clearDraft };
}
