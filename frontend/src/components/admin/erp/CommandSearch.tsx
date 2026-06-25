"use client";

import { useMemo, useState } from "react";

import { LinkedRecordCard } from "@/components/admin/erp/LinkedRecordCard";
import { searchAdminGlobal, type AdminGlobalSearchResult } from "@/services/admin-erp";

export function CommandSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminGlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

  async function runSearch() {
    if (!canSearch) return;
    setLoading(true);
    try {
      const response = await searchAdminGlobal(query.trim());
      setResults(response.results);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold text-foreground">Command Search</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Search customer, subscription, lucky ID, invoice, receipt, direct sale, product, partner, and lead records.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by phone, number, SKU, invoice..."
          className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => void runSearch()}
          disabled={!canSearch || loading}
          className="rounded-xl border border-amber-900/20 bg-amber-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>
      <div className="mt-4 grid gap-2">
        {results.map((item) => (
          <LinkedRecordCard
            key={`${item.type}-${item.title}-${item.deep_link}`}
            title={`${item.title} (${item.type})`}
            subtitle={item.subtitle}
            status={item.status}
            href={item.deep_link}
          />
        ))}
      </div>
    </section>
  );
}
