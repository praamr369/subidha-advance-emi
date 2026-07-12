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
import { listAccessories, type AccessoryRow } from "@/services/inventory";

export default function AccessoriesPage() {
  const [rows, setRows] = useState<AccessoryRow[]>([]);
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
        const payload = await listAccessories({ q: search, page, page_size: PAGE_SIZE });
        if (cancelled) return;
        setRows(payload.results ?? []);
        setTotal(payload.count ?? 0);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load accessories.");
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
      title="Accessories"
      subtitle="Accessory items that can be linked (free or chargeable) to finished goods."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Accessories" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Total Accessories", value: loading ? "—" : total, tone: "info" },
      ]}
      actions={[
        { href: ROUTES.admin.inventoryFinishedGoods, label: "← Finished Goods", variant: "secondary" },
      ]}
    >
      <ERPSectionShell title="Search">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, code, SKU…"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">
            Search
          </button>
          {search && (
            <button type="button" onClick={() => { setQ(""); setSearch(""); setPage(1); }} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted/50">
              Clear
            </button>
          )}
        </form>
      </ERPSectionShell>

      <ERPSectionShell title="Accessories Register">
        {loading ? <ERPLoadingState label="Loading accessories…" /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState
            title="No accessories found"
            description="Create products and set their inventory profile type to Accessory."
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-left">Name</th>
                  <th className="pb-2 text-left">Code</th>
                  <th className="pb-2 text-left">SKU</th>
                  <th className="pb-2 text-left">UoM</th>
                  <th className="pb-2 text-right">Unit Cost</th>
                  <th className="pb-2 text-right">Linked FGs</th>
                  <th className="pb-2 text-left">Tracking</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2 font-medium">{row.product_name}</td>
                    <td className="py-2 text-muted-foreground">{row.product_code}</td>
                    <td className="py-2 text-muted-foreground">{row.sku ?? "—"}</td>
                    <td className="py-2">{row.unit_of_measure}</td>
                    <td className="py-2 text-right">₹{row.standard_unit_cost}</td>
                    <td className="py-2 text-right">
                      <span className={`font-semibold ${row.linked_fg_count > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
                        {row.linked_fg_count}
                      </span>
                    </td>
                    <td className="py-2">
                      <ERPStatusBadge status={row.stock_tracking_status} label={row.stock_tracking_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && numPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {page} of {numPages} ({total} total)</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/50">Prev</button>
              <button disabled={page >= numPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/50">Next</button>
            </div>
          </div>
        ) : null}
      </ERPSectionShell>

      <ERPSectionShell title="Guidance">
        <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground space-y-1">
          <p>1. Go to <Link href={ROUTES.admin.productsCreate} className="underline">Products → Create</Link> and add the accessory as a product.</p>
          <p>2. Open the product, click <strong>Prepare Inventory Profile</strong> and set the type to <strong>Accessory</strong>.</p>
          <p>3. Once profiled, link it to any finished good from the <Link href={ROUTES.admin.inventoryFinishedGoods} className="underline">Finished Goods → Profile → Accessories tab</Link>.</p>
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
