import { useEffect, useState } from "react";

import type { EntityLookupOption } from "@/components/erp/forms/EntityLookupCombobox";
import { ApiError } from "@/lib/api";

export type SettlementLookupEntity = "finance_account" | "payment" | "receipt" | "money_movement";

type UseSettlementLookupPreviewResult = {
  selected: EntityLookupOption | null;
  resolveError: string | null;
  clearError: () => void;
};

export function useSettlementLookupPreview(
  value: string | null,
  resolveFn: (id: number | string) => Promise<EntityLookupOption>
): UseSettlementLookupPreviewResult {
  const [selected, setSelected] = useState<EntityLookupOption | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      if (!value) {
        setSelected(null);
        setResolveError(null);
        return;
      }
      if (selected && String(selected.id) === String(value)) return;
      if (!/^\d+$/.test(String(value))) {
        setResolveError(null);
        return;
      }

      try {
        const option = await resolveFn(value);
        if (cancelled) return;
        setSelected(option);
        setResolveError(null);
      } catch (error) {
        if (cancelled) return;
        setSelected(null);

        const status =
          error instanceof ApiError
            ? error.status
            : typeof error === "object" &&
                error !== null &&
                "status" in error &&
                typeof (error as { status?: unknown }).status === "number"
              ? (error as { status: number }).status
              : undefined;

        if (status === 404) {
          setResolveError("Selected record was not found.");
        } else if (status === 403) {
          setResolveError("You are not allowed to view this record.");
        } else {
          setResolveError("Could not load selected record preview.");
        }
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [value, selected, resolveFn]);

  return {
    selected,
    resolveError,
    clearError: () => setResolveError(null),
  };
}
