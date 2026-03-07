"use client";

import { useEffect, useState } from "react";
import { apiFetch, toArray } from "@/lib/api";

type Batch = {
  id: number;
  batch_code?: string;
};

export default function BatchSelector({
  productId,
  onSelect,
}: {
  productId: string;
  onSelect: (id: number) => void;
}) {
  const [batches, setBatches] = useState<Batch[]>([]);

  useEffect(() => {
    if (!productId) {
      setBatches([]);
      return;
    }

    apiFetch(`/admin/batches/by_product/?product_id=${encodeURIComponent(productId)}`)
      .then((data) => setBatches(toArray<Batch>(data)))
      .catch(() => setBatches([]));
  }, [productId]);

  if (!productId) return null;

  return (
    <select
      className="rounded-md border px-3 py-2 text-sm w-full"
      onChange={(e) => onSelect(Number(e.target.value))}
      defaultValue=""
    >
      <option value="">Select batch</option>
      {batches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.batch_code || `Batch #${b.id}`}
        </option>
      ))}
    </select>
  );
}