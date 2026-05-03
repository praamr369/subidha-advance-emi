"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import PageHeader from "@/components/ui/PageHeader";
import { ROUTES } from "@/lib/routes";
import { getInventoryReadiness } from "@/services/inventory-ops";

export default function InventoryReadinessPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getInventoryReadiness()
      .then((payload) => {
        if (!mounted) return;
        setData(payload as Record<string, unknown>);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load readiness.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const warnings = (data?.warnings as { code?: string; message?: string }[]) || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory readiness"
        description="Read-only ATP, opening-stock, and stock-need signals before fulfilling subscriptions or retail deliveries."
      />
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryWorkspace}>
          Inventory workspace
        </Link>
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryStockNeeds}>
          Stock needs
        </Link>
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
      {error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      ) : null}

      {data?.module_not_configured ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          Inventory evaluation module is not configured on this deployment. Verify migrations and API connectivity.
        </div>
      ) : null}

      {!loading && data && !data.module_not_configured ? (
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs font-medium uppercase text-muted-foreground">Inventory ready</div>
            <div className="mt-2 text-2xl font-semibold">{String(data.inventory_ready)}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs font-medium uppercase text-muted-foreground">Tracked SKUs</div>
            <div className="mt-2 text-2xl font-semibold">{String(data.active_tracked_stock_items ?? "—")}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-xs font-medium uppercase text-muted-foreground">Open stock needs</div>
            <div className="mt-2 text-2xl font-semibold">{String(data.stock_needs_open ?? "—")}</div>
          </div>
        </section>
      ) : null}

      {warnings.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="text-sm font-semibold text-foreground">Warnings</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {warnings.map((w) => (
              <li key={`${w.code}-${w.message}`}>
                <span className="font-medium text-foreground">{w.code}</span>: {w.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
