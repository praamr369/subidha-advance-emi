import { useEffect, useRef, useState } from "react";

import { lookupPincode, type PincodeOption } from "@/services/smart-fields";
import { useDebounce } from "@/hooks/useDebounce";

export type PincodeAutofillState = {
  status: "idle" | "loading" | "found" | "multiple" | "not_found" | "error";
  options: PincodeOption[];
  primary: PincodeOption | null;
};

const PINCODE_RE = /^\d{6}$/;

/**
 * Debounced pincode -> location resolver. When a valid 6-digit pincode is typed,
 * it fetches options from the offline smart-fields service and (optionally) invokes
 * `onResolve` with the primary match so the caller can auto-fill bound fields.
 * When several locations share a pincode, status becomes "multiple" and the caller
 * can render `options` as a chooser.
 */
export function usePincodeAutofill(
  pincode: string,
  onResolve?: (option: PincodeOption) => void
): PincodeAutofillState {
  const debounced = useDebounce((pincode || "").trim(), 350);
  const [state, setState] = useState<PincodeAutofillState>({
    status: "idle",
    options: [],
    primary: null,
  });
  // Avoid re-firing onResolve for a pincode we already auto-filled.
  const lastResolved = useRef<string>("");

  useEffect(() => {
    if (!PINCODE_RE.test(debounced)) {
      setState({ status: "idle", options: [], primary: null });
      lastResolved.current = "";
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, status: "loading" }));

    lookupPincode(debounced)
      .then((result) => {
        if (cancelled) return;
        const options = result.options ?? [];
        if (options.length === 0) {
          setState({ status: "not_found", options: [], primary: null });
          return;
        }
        const primary = result.primary ?? options[0];
        setState({
          status: options.length > 1 ? "multiple" : "found",
          options,
          primary,
        });
        if (onResolve && primary && lastResolved.current !== debounced) {
          lastResolved.current = debounced;
          onResolve(primary);
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", options: [], primary: null });
      });

    return () => {
      cancelled = true;
    };
    // onResolve is intentionally excluded; callers pass a stable handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return state;
}
