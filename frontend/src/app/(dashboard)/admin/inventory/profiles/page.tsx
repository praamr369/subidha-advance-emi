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
import { listInventoryProfiles, type InventoryProfileRow } from "@/services/inventory";

export default function InventoryProfilesPage() {
  const [rows, setRows] = useState<InventoryProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await listInventoryProfiles();
        if (cancelled) return;
        setRows(payload.results || []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load inventory profiles.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ERPPageShell
      title="Inventory Profiles"
      subtitle="Product catalog entries become stock-trackable only after profile preparation."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Profiles" },
      ]}
    >
      <ERPSectionShell
        title="Guidance"
        description="Stock quantity is read-only here. Use Opening Stock, Goods Receipt, Stock Adjustment, Sale/Delivery, Return, or Manufacturing Receipt workflows to change real stock."
      >
        <div className="rounded-xl border border-border bg-[var(--surface-muted)] px-4 py-3 text-sm text-muted-foreground">
          Profiles control only stock-facing fields like default location, reorder controls, and delivery bridge participation. Catalog identity stays on Product.
        </div>
      </ERPSectionShell>

      <ERPSectionShell title="Profile Register" description="Inventory profiles that enable stock tracking per product.">
        {loading ? <ERPLoadingState label="Loading inventory profiles..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load profiles" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No inventory profiles yet" description="Prepare inventory profiles from Product Detail." />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="grid gap-3">
            {rows.map((row) => (
              <Link
                key={row.id}
                href={`${ROUTES.admin.inventoryProfiles}/${row.id}`}
                className="group rounded-xl border border-border bg-card px-4 py-4 transition hover:bg-muted/30 hover:border-ring"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {row.product_name}{" "}
                      <span className="text-muted-foreground">({row.product_code})</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Inventory ID: {row.inventory_code || "—"} · SKU: {row.sku || "—"}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <ERPStatusBadge status={row.stock_tracking_status || undefined} label={row.stock_tracking_status || "—"} />
                  </div>
                </div>
                <div className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition group-hover:text-foreground">
                  Open profile
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
