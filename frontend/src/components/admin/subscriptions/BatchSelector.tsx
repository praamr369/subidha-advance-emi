"use client";

import { useEffect, useMemo, useState } from "react";
import { listBatchesByProduct, type BatchRecord } from "@/services/batches";

type BatchSelectorProps = {
  productId: string;
  value?: number | null;
  disabled?: boolean;
  onSelect: (id: number | null) => void;
};

export default function BatchSelector({ productId, value = null, disabled, onSelect }: BatchSelectorProps) {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetchedForProductId, setFetchedForProductId] = useState("");

  useEffect(() => {
    if (!productId) return;

    let cancelled = false;

    listBatchesByProduct(productId)
      .then((items) => {
        if (cancelled) return;
        setBatches(items);
        setError(null);
        setFetchedForProductId(productId);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBatches([]);
        setError(err instanceof Error ? err.message : "Failed to load batches");
        setFetchedForProductId(productId);
      });

    return () => {
      cancelled = true;
    };
  }, [productId]);

  const options = useMemo(() => (productId ? batches : []), [productId, batches]);
  const loading = Boolean(productId) && fetchedForProductId !== productId;

  if (!productId) return null;

  return (
    <div className="grid gap-1">
      <select
        className="rounded-md border px-3 py-2 text-sm w-full"
        onChange={(event) => {
          const next = event.target.value ? Number(event.target.value) : null;
          onSelect(next);
        }}
        value={value ?? ""}
        disabled={disabled || loading}
      >
        <option value="">{loading ? "Loading batches..." : "Select batch"}</option>
        {options.map((batch) => (
          <option key={batch.id} value={batch.id}>
            {batch.batch_code || `Batch #${batch.id}`}
          </option>
        ))}
      </select>
      {!loading && options.length === 0 && !error ? <span className="text-xs text-muted-foreground">No batch available for this product.</span> : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
