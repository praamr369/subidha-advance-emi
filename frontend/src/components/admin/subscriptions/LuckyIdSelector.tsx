"use client";

import { useEffect, useState } from "react";
import { apiFetch, toArray } from "@/lib/api";

type LuckyId = {
  id: number;
  lucky_number?: number;
};

export default function LuckyIdSelector({
  batchId,
  onSelect,
}: {
  batchId: string;
  onSelect: (id: number) => void;
}) {
  const [slots, setSlots] = useState<LuckyId[]>([]);

  useEffect(() => {
    if (!batchId) {
      setSlots([]);
      return;
    }

    apiFetch(`/admin/lucky-ids/available/?batch_id=${encodeURIComponent(batchId)}`)
      .then((data) => setSlots(toArray<LuckyId>(data)))
      .catch(() => setSlots([]));
  }, [batchId]);

  if (!batchId) return null;

  return (
    <div className="grid grid-cols-6 gap-2">
      {slots.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          className="border rounded px-2 py-1 text-xs hover:bg-blue-600 hover:text-white"
        >
          {s.lucky_number ?? s.id}
        </button>
      ))}
    </div>
  );
}