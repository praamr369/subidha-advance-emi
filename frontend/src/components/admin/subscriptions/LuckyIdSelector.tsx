"use client";

import { useEffect, useMemo, useState } from "react";
import { listAvailableLuckyIds, type LuckyIdRecord } from "@/services/draws";

type LuckyIdSelectorProps = {
  batchId: string;
  value?: number | null;
  disabled?: boolean;
  onSelect: (id: number | null) => void;
};

export default function LuckyIdSelector({ batchId, value = null, disabled, onSelect }: LuckyIdSelectorProps) {
  const [slots, setSlots] = useState<LuckyIdRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetchedForBatchId, setFetchedForBatchId] = useState("");

  useEffect(() => {
    if (!batchId) return;

    let cancelled = false;

    listAvailableLuckyIds(batchId)
      .then((items) => {
        if (cancelled) return;
        setSlots(items);
        setError(null);
        setFetchedForBatchId(batchId);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSlots([]);
        setError(err instanceof Error ? err.message : "Failed to load lucky IDs");
        setFetchedForBatchId(batchId);
      });

    return () => {
      cancelled = true;
    };
  }, [batchId]);

  const visibleSlots = useMemo(() => (batchId ? slots : []), [batchId, slots]);
  const loading = Boolean(batchId) && fetchedForBatchId !== batchId;

  if (!batchId) return null;

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-6 gap-2">
        {visibleSlots.map((slot) => {
          const isActive = slot.id === value;
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => onSelect(slot.id)}
              className={`border rounded px-2 py-1 text-xs ${isActive ? "bg-blue-600 text-white" : "hover:bg-blue-600 hover:text-white"}`}
              disabled={disabled || loading}
            >
              {slot.lucky_number ?? slot.id}
            </button>
          );
        })}
      </div>

      {loading ? <span className="text-xs text-slate-500">Loading lucky IDs...</span> : null}
      {!loading && visibleSlots.length === 0 && !error ? <span className="text-xs text-slate-500">No available lucky IDs in this batch.</span> : null}
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
