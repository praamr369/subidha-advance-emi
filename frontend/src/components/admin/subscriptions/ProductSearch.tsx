"use client";

import { useState } from "react";
import { apiFetch, toArray } from "@/lib/api";

type Product = {
  id: number;
  name: string;
};

export default function ProductSearch({
  onSelect,
}: {
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);

  async function search(q: string) {
    setQuery(q);

    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    const data = await apiFetch(`/admin/products/search/?q=${encodeURIComponent(trimmed)}`);
    setResults(toArray<Product>(data));
  }

  return (
    <div className="space-y-1">
      <input
        className="rounded-md border px-3 py-2 text-sm w-full"
        placeholder="Search product"
        value={query}
        onChange={(e) => search(e.target.value)}
      />

      {results.length > 0 ? (
        <div className="border rounded bg-white shadow max-h-40 overflow-auto">
          {results.map((p) => (
            <div
              key={p.id}
              className="px-3 py-2 hover:bg-slate-100 cursor-pointer text-sm"
              onClick={() => {
                onSelect(p.id);
                setQuery(p.name);
                setResults([]);
              }}
            >
              {p.name}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}