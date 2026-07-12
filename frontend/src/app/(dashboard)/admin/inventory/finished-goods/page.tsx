"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { listFinishedGoods, type FinishedGoodRow } from "@/services/inventory";

export default function FinishedGoodsPage() {
  const [rows, setRows] = useState<FinishedGoodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const payload = await listFinishedGoods({ q: search, page, page_size: PAGE_SIZE });
        if (cancelled) return;
        setRows(payload.results ?? []);
        setTotal(payload.count ?? 0);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load finished goods.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [search, page]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(q);
  }

  const numPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Finished Goods"
      subtitle="Products manufactured or purchased for direct sale or subscription — each can carry linked accessories and services."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Finished Goods" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Total", value: loading ? "—" : total, tone: "info" },
        { label: "Shown", value: loading ? "—" : rows.length, tone: "default" },
      ]}
      actions={[
        { href: ROUTES.admin.inventoryRawMaterials, label: "Raw Materials", variant: "secondary" },
        { href: ROUTES.admin.inventoryAccessories, label: "Accessories", variant: "secondary" },
        { href: ROUTES.admin.inventoryServiceCatalog, label: "Services", variant: "secondary" },
      ]}
    >
      {/* Search */}
      <ERPSectionShell title="Search">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, code, SKU…"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setQ(""); setSearch(""); setPage(1); }}
              className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted/50"
            >
              Clear
            </button>
          )}
        </form>
      </ERPSectionShell>

      {/* List */}
      <ERPSectionShell title="Finished Goods Register" description="Click any row to open the full profile with accessories, services, and BOM.">
        {loading ? <ERPLoadingState label="Loading finished goods…" /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState
            title="No finished goods found"
            description="Create products with stock type 'Finished Good' and prepare their inventory profiles."
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="grid gap-3">
            {rows.map((row) => (
              <Link
                key={row.id}
                href={`${ROUTES.admin.inventoryFinishedGoods}/${row.id}`}
                className="group rounded-xl border border-border bg-card px-4 py-4 transition hover:bg-muted/30 hover:border-ring"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {row.product_name}{" "}
                      <span className="text-muted-foreground font-normal">({row.product_code})</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      SKU: {row.sku ?? "—"} · UoM: {row.unit_of_measure} · Cost: ₹{row.standard_unit_cost}
                    </div>
                    {row.category ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {row.category}{row.subcategory ? ` › ${row.subcategory}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <ERPStatusBadge status={row.stock_tracking_status} label={row.stock_tracking_status} />
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className={`font-medium ${row.accessory_count > 0 ? "text-blue-600 dark:text-blue-400" : ""}`}>
                    {row.accessory_count} accessor{row.accessory_count === 1 ? "y" : "ies"}
                  </span>
                  <span className={`font-medium ${row.service_count > 0 ? "text-purple-600 dark:text-purple-400" : ""}`}>
                    {row.service_count} service{row.service_count === 1 ? "" : "s"}
                  </span>
                  {row.has_bom ? (
                    <span className="font-medium text-green-600 dark:text-green-400">BOM active</span>
                  ) : (
                    <span>No active BOM</span>
                  )}
                  <span className="ml-auto font-semibold uppercase tracking-[0.12em] transition group-hover:text-foreground">
                    Open profile →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : null}

        {/* Pagination */}
        {!loading && numPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {page} of {numPages} ({total} total)</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/50"
              >
                Prev
              </button>
              <button
                disabled={page >= numPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
