"use client";

import { useState } from "react";

import ProductPostureCard, {
  normalizeProductPosture,
  type ProductPosture,
} from "@/components/customers/ProductPostureCard";
import { apiFetch } from "@/lib/api";

/**
 * Lazy "Customer position" toggle for list/queue cards (warranty claims,
 * service jobs, …). The per-product posture is fetched only when opened, so a
 * list of N cards does not fire N requests on load. Renders nothing without a
 * customer id (e.g. walk-in / unlinked records).
 */
export default function CustomerPostureToggle({
  customerId,
  label = "Customer position",
}: {
  customerId: number | null | undefined;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [posture, setPosture] = useState<ProductPosture | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  if (!customerId) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || posture || state === "loading") return;
    setState("loading");
    apiFetch<unknown>(`/admin/customers/${customerId}/product-posture/`, { cache: "no-store" })
      .then((data) => {
        setPosture(normalizeProductPosture(data));
        setState("idle");
      })
      .catch(() => {
        setPosture(null);
        setState("error");
      });
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
      >
        {open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
      </button>
      {open ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3">
          {state === "loading" ? (
            <p className="text-sm text-muted-foreground">Loading customer position…</p>
          ) : state === "error" ? (
            <p className="text-sm text-muted-foreground">Customer position is unavailable right now.</p>
          ) : posture ? (
            <ProductPostureCard posture={posture} title="Customer position by product" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
