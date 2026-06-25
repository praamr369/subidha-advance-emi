"use client";

import { useState } from "react";
import { apiFetch, toArray } from "@/lib/api";

type Customer = {
  id: number;
  name?: string;
  phone?: string;
  user?: { name?: string; phone?: string };
};

export default function CustomerSearch({
  onSelect,
}: {
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);

  async function search(q: string) {
    setQuery(q);

    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    const data = await apiFetch(`/admin/customers/search/?q=${encodeURIComponent(trimmed)}`);
    setResults(toArray<Customer>(data));
  }

  return (
    <div className="space-y-1">
      <input
        className="rounded-md border px-3 py-2 text-sm w-full"
        placeholder="Search customer name or phone"
        value={query}
        onChange={(e) => search(e.target.value)}
      />

      {results.length > 0 ? (
        <div className="border rounded bg-card shadow max-h-40 overflow-auto">
          {results.map((c) => (
            <div
              key={c.id}
              className="px-3 py-2 hover:bg-muted cursor-pointer text-sm"
              onClick={() => {
                onSelect(c.id);
                setQuery(c.user?.name || c.name || "");
                setResults([]);
              }}
            >
              {(c.user?.name || c.name || "Customer")} — {c.user?.phone || c.phone || "-"}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}